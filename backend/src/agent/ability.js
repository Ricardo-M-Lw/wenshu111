// 问数智能体 · 五维能力模型
// ---------------------------------------------------------------------------
// 用真实学习数据算出五个维度（0-100），供「我的 → 能力雷达图」使用：
//   概念理解 / 运算能力 / 几何直观 / 推理迁移 / 学习韧性
// 每个维度都带一句「为什么是这个分」，避免变成一个看不懂的分数。
// ---------------------------------------------------------------------------

const { learningSessions, knowledgePoints, gamification } = require('../models/mockData');
const memory = require('./memory');

const DIMENSIONS = [
  { key: 'concept', name: '概念理解', icon: '📘', color: '#667EEA', desc: '能不能用自己的话把定义讲清楚' },
  { key: 'compute', name: '运算能力', icon: '🧮', color: '#EE5A6F', desc: '数值计算与符号处理稳不稳' },
  { key: 'geometry', name: '几何直观', icon: '📐', color: '#2BA4A0', desc: '看图、画图、把关系搬到图上' },
  { key: 'reasoning', name: '推理迁移', icon: '🧠', color: '#F5A623', desc: '换一道没见过的题还做得出来吗' },
  { key: 'grit', name: '学习韧性', icon: '🌱', color: '#7C6CF5', desc: '遇到卡点会不会继续试' }
];

const GEOMETRY_KP = ['kp2', 'kp3'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// 知识点进度：与 dashboard 口径一致 —— 已完成的会话算 100%，否则按最新会话的已完成步骤数折算
function progressOf(kpId, sessions) {
  const kpSessions = sessions
    .filter(item => item.knowledgePointId === kpId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (kpSessions.some(item => item.status === 'completed')) return 100;
  const latest = kpSessions[0];
  if (!latest) return 0;
  const total = latest.totalSteps || 5;
  return Math.round(((latest.currentStep || 0) / total) * 100);
}
function mean(list) {
  if (!list.length) return 0;
  return list.reduce((sum, item) => sum + item, 0) / list.length;
}

function buildAbility(user) {
  const userId = user ? user.id : 'anonymous';
  const sessions = learningSessions.filter(item => item.userId === userId);
  const profile = memory.getProfile(userId);
  const gam = gamification[userId] || gamification.u1 || {};

  const quizCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);
  const quizTotal = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);
  const hints = sessions.reduce((sum, item) => sum + (item.hintCount || 0), 0);
  const corrections = sessions.reduce((sum, item) => sum + (item.correctionCount || 0), 0);
  const errorSignals = sessions.reduce((sum, item) => sum + (item.errorTypes || []).length, 0);

  const quizRate = quizTotal ? (quizCorrect / quizTotal) * 100 : 0;
  const progressList = knowledgePoints.map(kp => progressOf(kp.id, sessions));
  const avgProgress = mean(progressList);
  const geoProgress = mean(knowledgePoints
    .filter(kp => GEOMETRY_KP.indexOf(kp.id) !== -1)
    .map(kp => progressOf(kp.id, sessions)));
  const hintLoad = clamp((hints / Math.max(sessions.length, 1)) * 18, 0, 70); // 平均每次会话用提示越多，扣得越多
  const fixRate = (corrections + errorSignals)
    ? (corrections / (corrections + errorSignals)) * 100
    : 100;
  const streak = gam.streakDays || 0;

  const scores = {
    concept: clamp(avgProgress * 0.72 + (100 - hintLoad) * 0.28, 5, 100),
    compute: clamp(quizRate * 0.82 + avgProgress * 0.18, 5, 100),
    geometry: clamp(geoProgress * 0.85 + quizRate * 0.15, 5, 100),
    reasoning: clamp(fixRate * 0.45 + quizRate * 0.35 + avgProgress * 0.20, 5, 100),
    grit: clamp(Math.min(streak * 13, 100) * 0.45 + fixRate * 0.35 + (100 - hintLoad) * 0.20, 5, 100)
  };

  const notes = {
    concept: '三个知识点平均掌握 ' + Math.round(avgProgress) + '%，平均每次讲题用提示 '
      + (sessions.length ? (hints / sessions.length).toFixed(1) : 0) + ' 次。',
    compute: '标准题正确率 ' + Math.round(quizRate) + '%（' + quizCorrect + '/' + quizTotal + ' 道）。',
    geometry: '几何类知识点（内角和、勾股定理）平均掌握 ' + Math.round(geoProgress) + '%。',
    reasoning: '主动订正 ' + corrections + ' 次，待处理错因 ' + errorSignals + ' 处，订正率 ' + Math.round(fixRate) + '%。',
    grit: '连续学习 ' + streak + ' 天，累计完成 ' + sessions.length + ' 次学习。'
  };

  const dimensions = DIMENSIONS.map(item => Object.assign({}, item, {
    score: scores[item.key],
    note: notes[item.key]
  }));

  const sorted = dimensions.slice().sort((a, b) => b.score - a.score);
  const overall = Math.round(mean(dimensions.map(item => item.score)));

  return {
    dimensions,
    overall,
    strongest: sorted[0],
    weakest: sorted[sorted.length - 1],
    summary: '整体能力值 ' + overall + '，最强是「' + sorted[0].name + '」，'
      + '最需要补的是「' + sorted[sorted.length - 1].name + '」。',
    advice: '下一步优先补「' + sorted[sorted.length - 1].name + '」：' + sorted[sorted.length - 1].desc + '。'
  };
}

module.exports = { DIMENSIONS, buildAbility };