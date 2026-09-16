// 问数智能体 · 学习档案
// ---------------------------------------------------------------------------
// 两类「自动生成」的数据：
//   buildStudyReport()  学习报告 —— 概览 / 三段闭环（讲题启发·动手练会·归因改对）/ 错因 / 建议
//   buildErrorBook()    错题记录 —— 按错因聚合，带最近几次的具体作答明细与订正动作
// 数据来源：models 里的学习记录 + 智能体对话过程中实时记下的错题 + 学生画像。
// 注意：这里只输出「错因 + 学生当时的答案 + 建议」，永远不输出正确答案。
// ---------------------------------------------------------------------------

const {
  learningSessions, knowledgePoints, errorTypes, gamification
} = require('../models/mockData');
const { lessons } = require('../models/lessons');
const memory = require('./memory');

// 智能体对话中实时产生的错题（内存态，与项目整体「演示数据不落库」口径一致）
const liveErrors = new Map();

function recordError(userId, entry) {
  const id = String(userId || 'anonymous');
  if (!liveErrors.has(id)) liveErrors.set(id, []);
  const list = liveErrors.get(id);
  list.push(Object.assign({ at: Date.now() }, entry || {}));
  if (list.length > 60) liveErrors.splice(0, list.length - 60);
  return list.length;
}

function liveErrorsOf(userId, kpId) {
  const list = liveErrors.get(String(userId || 'anonymous')) || [];
  return kpId ? list.filter(item => item.kpId === kpId) : list;
}

function errorMeta(name) {
  return errorTypes.find(item => item.name === name) || {
    name,
    description: '这一类的错误特征还需要再观察',
    advice: '把出错的那一步单独抄下来，写下当时是怎么想的。'
  };
}

function kpName(id) {
  const kp = knowledgePoints.find(item => item.id === id);
  return kp ? kp.name : id;
}

function timeText(at) {
  const date = new Date(at || Date.now());
  const pad = num => String(num).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function sessionsOf(userId, kpId) {
  return learningSessions
    .filter(item => item.userId === userId && (!kpId || item.knowledgePointId === kpId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// ---------------------------------------------------------------------------
// 错题记录
// ---------------------------------------------------------------------------
function buildErrorBook(user, kpId) {
  const userId = user ? user.id : 'anonymous';
  const sessions = sessionsOf(userId, kpId);
  const buckets = new Map();

  function bucket(name) {
    if (!buckets.has(name)) {
      const meta = errorMeta(name);
      buckets.set(name, {
        type: name,
        description: meta.description,
        advice: meta.advice,
        times: 0,
        kpNames: [],
        steps: [],
        lastAt: null,
        samples: []
      });
    }
    return buckets.get(name);
  }

  function touch(item, at) {
    if (!at) return;
    const stamp = new Date(at).getTime();
    if (!item.lastAt || stamp > new Date(item.lastAt).getTime()) item.lastAt = at;
  }

  // 1) 历史学习记录里的错因标签
  sessions.forEach(session => {
    (session.errorTypes || []).forEach(name => {
      const item = bucket(name);
      item.times += 1;
      if (item.kpNames.indexOf(kpName(session.knowledgePointId)) === -1) {
        item.kpNames.push(kpName(session.knowledgePointId));
      }
      touch(item, session.updatedAt);
    });
  });

  // 2) 智能体对话中实时记下的错题明细
  liveErrorsOf(userId, kpId).forEach(entry => {
    if (!entry.errorType) return;
    const item = bucket(entry.errorType);
    item.times += 1;
    const name = kpName(entry.kpId);
    if (item.kpNames.indexOf(name) === -1) item.kpNames.push(name);
    if (entry.stepName && item.steps.indexOf(entry.stepName) === -1) item.steps.push(entry.stepName);
    touch(item, entry.at);
    if (entry.answer) {
      item.samples.unshift({
        answer: String(entry.answer).slice(0, 40),
        stepName: entry.stepName || '',
        kpName: name,
        at: timeText(entry.at)
      });
    }
  });

  // 3) 画像兜底：对话里判定过错因，但还没有明细的情况
  const profile = memory.getProfile(userId);
  (profile.errorTypes || []).forEach(name => {
    const item = bucket(name);
    if (!item.times) item.times = profile.wrongCount || 1;
  });

  const items = Array.from(buckets.values())
    .map(item => Object.assign({}, item, {
      samples: item.samples.slice(0, 3),
      lastAtText: item.lastAt ? timeText(item.lastAt) : ''
    }))
    .sort((a, b) => b.times - a.times);

  const recent = liveErrorsOf(userId, kpId)
    .filter(entry => entry.errorType)
    .slice(-6)
    .reverse()
    .map(entry => ({
      kpName: kpName(entry.kpId),
      stepName: entry.stepName || '',
      errorType: entry.errorType,
      answer: entry.answer ? String(entry.answer).slice(0, 40) : '',
      advice: errorMeta(entry.errorType).advice,
      at: timeText(entry.at)
    }));

  return {
    generatedAt: timeText(),
    kpId: kpId || null,
    lesson: kpId && lessons[kpId] ? lessons[kpId].title : '全部知识点',
    totalWrong: items.reduce((sum, item) => sum + item.times, 0),
    wrongCount: profile.wrongCount || 0,
    blockedCount: profile.blockedCount || 0,
    topTypes: items.slice(0, 3).map(item => item.type),
    items,
    recent,
    headline: items.length
      ? '这段时间最需要盯的是「' + items[0].type + '」，已经出现 ' + items[0].times + ' 次'
      : '暂时还没有明显错因，保持这个节奏就好'
  };
}

// ---------------------------------------------------------------------------
// 学习报告
// ---------------------------------------------------------------------------
function buildStudyReport(user, kpId, range) {
  const userId = user ? user.id : 'anonymous';
  const isWeek = range === 'week';
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  let sessions = sessionsOf(userId, kpId);
  if (isWeek) {
    const inWindow = sessions.filter(item => now - new Date(item.updatedAt).getTime() <= windowMs);
    if (inWindow.length) sessions = inWindow;
  }

  const lesson = kpId && lessons[kpId] ? lessons[kpId] : null;
  const kp = knowledgePoints.find(item => item.id === (kpId || (lesson && lesson.id)));
  const profile = memory.getProfile(userId);
  const gam = gamification[userId] || gamification.u1 || {};

  const stepTotal = sessions.reduce((sum, item) => sum + (item.totalSteps || 5), 0);
  const stepDone = sessions.reduce((sum, item) => sum + (item.currentStep || 0), 0);
  const quizCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);
  const quizTotal = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);
  const hints = sessions.reduce((sum, item) => sum + (item.hintCount || 0), 0);
  const corrections = sessions.reduce((sum, item) => sum + (item.correctionCount || 0), 0);
  const minutes = sessions.reduce((sum, item) => sum + (item.duration || 0), 0);
  const errorSignals = sessions.reduce((sum, item) => sum + (item.errorTypes || []).length, 0)
    + liveErrorsOf(userId, kpId).length;

  const lessonRate = stepTotal ? Math.round((stepDone / stepTotal) * 100) : 0;
  const quizRate = quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0;
  const fixRate = (corrections + errorSignals)
    ? Math.round((corrections / (corrections + errorSignals)) * 100)
    : 100;

  const book = buildErrorBook(user, kpId);

  const stages = [
    {
      key: 'lesson',
      label: '讲题启发',
      icon: '🎬',
      value: lessonRate,
      detail: '走过 ' + stepDone + ' / ' + stepTotal + ' 个讲题步骤',
      note: lessonRate >= 80 ? '步骤走得很完整' : '还有步骤没走完，先把卡住的那一步补上'
    },
    {
      key: 'quiz',
      label: '动手练会',
      icon: '📐',
      value: quizRate,
      detail: quizTotal ? '标准题答对 ' + quizCorrect + ' / ' + quizTotal + ' 道' : '还没有标准题记录',
      note: quizRate >= 80 ? '能独立把题做出来' : '错的题大多不是不会，是没检查'
    },
    {
      key: 'correction',
      label: '归因改对',
      icon: '🔧',
      value: fixRate,
      detail: '主动订正 ' + corrections + ' 次 · 待处理错因 ' + errorSignals + ' 处',
      note: fixRate >= 70 ? '错题闭环做得不错' : '错因还没订正完，这是现在最值钱的动作'
    }
  ];

  const highlights = [];
  highlights.push('共记录 ' + sessions.length + ' 次学习，累计 ' + minutes + ' 分钟');
  if (quizTotal) highlights.push('答题正确率 ' + quizRate + '%，动手练会这一段站住了');
  if (corrections) highlights.push('主动订正 ' + corrections + ' 次，这是提分最快习惯');
  if (gam.streakDays) highlights.push('连续学习 ' + gam.streakDays + ' 天，节奏保持得稳');
  if (profile.blockedCount) highlights.push('有 ' + profile.blockedCount + ' 次想直接看答案被拦下来 —— 忍住了就是进步');

  const weakest = stages.slice().sort((a, b) => a.value - b.value)[0];
  const suggestions = [];
  if (book.items.length) {
    suggestions.push('优先处理「' + book.items[0].type + '」：' + book.items[0].advice);
  }
  if (weakest && weakest.value < 80) {
    suggestions.push('最弱的一段是「' + weakest.label + '」（' + weakest.value + '%）：' + weakest.note);
  }
  if (hints >= 3) suggestions.push('提示用了 ' + hints + ' 次，合上黑板把思路自己复述一遍再往下走');
  if (!suggestions.length) suggestions.push('三段闭环都很稳，可以挑战带情境的综合题了');

  const nextAction = weakest && weakest.key === 'correction'
    ? '去错题订正页把「' + (book.items[0] ? book.items[0].type : '昨天的错题') + '」重做一遍，写下当时错在哪一步'
    : (weakest && weakest.key === 'quiz'
      ? '去标准题训练挑 3 道本节题，做完先自己检查一遍再对答案'
      : '把这节的 5 个步骤合上黑板复述一遍，再挑一道变式题检验');

  return {
    generatedAt: timeText(),
    range: isWeek ? '近一周' : '本次学习',
    student: {
      name: user ? (user.nickname || user.name || '同学') : '同学',
      grade: user ? user.grade || '' : ''
    },
    scope: {
      kpId: kpId || null,
      lessonTitle: lesson ? lesson.title : '全部知识点',
      grade: lesson ? lesson.grade || '' : '',
      goal: lesson ? lesson.goal || '' : ''
    },
    overview: {
      mastery: kp ? kp.progress || 0 : Math.round((lessonRate + quizRate) / 2),
      correctRate: quizRate,
      minutes,
      hints,
      corrections,
      points: gam.points || 0,
      streakDays: gam.streakDays || 0,
      level: gam.level ? gam.level.current : 1,
      levelName: gam.level ? gam.level.name : ''
    },
    stages,
    errorTypes: book.items.slice(0, 4).map(item => ({
      name: item.type,
      times: item.times,
      advice: item.advice
    })),
    highlights,
    suggestions,
    nextAction
  };
}

module.exports = {
  recordError,
  liveErrorsOf,
  buildErrorBook,
  buildStudyReport
};