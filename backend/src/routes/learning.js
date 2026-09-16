const express = require('express');
const router = express.Router();
const {
  users, knowledgePoints, learningSessions, errorTypes, gamification, resolveLevel
} = require('../models/mockData');
const { lessons, listLessons, stepListFor } = require('../models/lessons');
const { currentUser } = require('../utils/auth');
const walletService = require('../services/walletService');

function resolveUserId(req) {
  const user = currentUser(req, users);
  if (user) return user.id;
  return req.query.userId || (req.body && req.body.userId) || 'u1';
}

// 对外输出讲题脚本时移除答案，保证「不泄答案」
function safeLesson(lesson) {
  return Object.assign({}, lesson, {
    steps: lesson.steps.map(step => Object.assign({}, step, {
      checkpoint: step.checkpoint ? {
        question: step.checkpoint.question,
        options: step.checkpoint.options,
        hints: step.checkpoint.hints
      } : null
    }))
  });
}

router.get('/knowledge-points', (req, res) => {
  res.json({ data: knowledgePoints });
});

// 讲题脚本列表
router.get('/lessons', (req, res) => {
  res.json({ data: listLessons() });
});

// 某个知识点的完整讲题步骤（不含答案）
router.get('/lessons/:kpId', (req, res) => {
  const lesson = lessons[req.params.kpId];
  if (!lesson) return res.status(404).json({ error: '讲题脚本不存在' });
  const kp = knowledgePoints.find(item => item.id === lesson.id) || null;
  res.json({ data: Object.assign({}, safeLesson(lesson), { knowledgePoint: kp }) });
});

// 校验讲题步骤里的互动检查点
router.post('/checkpoint', (req, res) => {
  const { lessonId, stepId, answer, hintUsed } = req.body;
  const lesson = lessons[lessonId];
  const step = lesson ? lesson.steps.find(item => item.id === stepId) : null;
  if (!step || !step.checkpoint) return res.status(404).json({ error: '检查点不存在' });

  const correct = Number(answer) === step.checkpoint.correct;
  const feedback = correct
    ? step.checkpoint.correctText
    : (step.checkpoint.wrongText[String(answer)] || step.checkpoint.wrongText._);

  res.json({
    data: {
      isCorrect: correct,
      feedback,
      hint: correct ? null : step.checkpoint.hints[Math.min(hintUsed || 0, step.checkpoint.hints.length - 1)],
      hintTotal: step.checkpoint.hints.length
    }
  });
});

// 记录讲题步骤进度
router.post('/progress', (req, res) => {
  const userId = resolveUserId(req);
  const { knowledgePointId, stepIndex, stepCount, hintsUsed, corrected, errorType, completed } = req.body;
  if (!knowledgePointId) return res.status(400).json({ error: '缺少知识点' });

  let session = learningSessions
    .filter(item => item.userId === userId && item.knowledgePointId === knowledgePointId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

  if (!session) {
    session = {
      id: 's' + Date.now(),
      userId,
      knowledgePointId,
      status: 'in_progress',
      currentStep: 0,
      totalSteps: stepCount || 5,
      hintCount: 0,
      correctionCount: 0,
      errorTypes: [],
      duration: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    learningSessions.push(session);
  }

  if (typeof stepIndex === 'number') session.currentStep = Math.max(session.currentStep || 0, stepIndex + 1);
  if (typeof stepCount === 'number') session.totalSteps = stepCount;
  if (hintsUsed) session.hintCount += Number(hintsUsed);
  if (corrected) session.correctionCount += 1;
  if (errorType && session.errorTypes.indexOf(errorType) === -1) session.errorTypes.push(errorType);
  if (completed) {
    // 只在「第一次」结课的时候发经验，重复上报不重复发
    const firstTime = session.status !== 'completed';
    session.status = 'completed';
    session.currentStep = session.totalSteps;
    const stat = gamification[userId];
    if (stat && firstTime) {
      stat.exp += 20;
      stat.points += 20;
      stat.level = resolveLevel(stat.exp);
      // 完成讲题课堂发 20 星尘，写一条收支流水
      walletService.record(userId, 'dust', 20, 'lesson', '完成讲题课堂');
    }
  }
  session.updatedAt = new Date().toISOString();

  res.json({ data: session });
});

router.get('/sessions', (req, res) => {
  const userId = resolveUserId(req);
  const sessions = learningSessions
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ data: sessions });
});

router.get('/sessions/:id', (req, res) => {
  const session = learningSessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  res.json({ data: Object.assign({}, session, { steps: stepListFor(session.knowledgePointId, session) }) });
});

router.post('/sessions', (req, res) => {
  const { knowledgePointId } = req.body;
  const newSession = {
    id: 's' + Date.now(),
    userId: resolveUserId(req),
    knowledgePointId,
    status: 'in_progress',
    currentStep: 1,
    totalSteps: 7,
    hintCount: 0,
    correctionCount: 0,
    errorTypes: [],
    duration: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  learningSessions.push(newSession);
  res.json({ data: newSession });
});

router.patch('/sessions/:id', (req, res) => {
  const session = learningSessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  Object.assign(session, req.body, { updatedAt: new Date().toISOString() });
  res.json({ data: session });
});

router.get('/error-types', (req, res) => {
  res.json({ data: errorTypes });
});

// 错题本：按错因汇总当前学生的错误，供「错题订正」页和智能体侦探使用
router.get('/error-book', (req, res) => {
  const userId = resolveUserId(req);
  const sessions = learningSessions
    .filter(item => item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const buckets = new Map();
  sessions.forEach(session => {
    const kp = knowledgePoints.find(item => item.id === session.knowledgePointId);
    (session.errorTypes || []).forEach(name => {
      if (!buckets.has(name)) {
        const meta = errorTypes.find(item => item.name === name) || {};
        buckets.set(name, {
          name,
          description: meta.description || '这一步的条件和结论容易对错位置',
          advice: meta.advice || '把这一步的过程写下来，再回代验算一次。',
          count: 0,
          knowledgePoints: [],
          knowledgePointIds: []
        });
      }
      const bucket = buckets.get(name);
      bucket.count += Math.max(session.correctionCount || 1, 1);
      if (kp && bucket.knowledgePoints.indexOf(kp.name) === -1) {
        bucket.knowledgePoints.push(kp.name);
        bucket.knowledgePointIds.push(kp.id);
      }
    });
  });

  const items = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const totalWrong = sessions.reduce((sum, item) => sum + (item.correctionCount || 0), 0);
  const errorSignals = sessions.reduce((sum, item) => sum + (item.errorTypes || []).length, 0);
  // 错因雷达图：取前 6 类错因，ratio 以最高频错因为 100% 归一化
  const maxCause = items.reduce((max, item) => Math.max(max, item.count), 0) || 1;
  const causes = items.slice(0, 6).map(item => ({
    name: item.name,
    count: item.count,
    ratio: Math.round((item.count / maxCause) * 100)
  }));
  const fixRate = (totalWrong + errorSignals)
    ? Math.round((totalWrong / (totalWrong + errorSignals)) * 100)
    : 0;
  const weakSessions = sessions
    .filter(item => item.correctionCount > 0)
    .slice(0, 5)
    .map(item => {
      const kp = knowledgePoints.find(k => k.id === item.knowledgePointId) || {};
      return {
        id: item.id,
        knowledgePointId: item.knowledgePointId,
        knowledgePointName: kp.name || '知识点',
        knowledgePointIcon: kp.icon || '△',
        currentStep: item.currentStep,
        totalSteps: item.totalSteps,
        errorTypes: item.errorTypes || [],
        correctionCount: item.correctionCount || 0,
        updatedAt: item.updatedAt
      };
    });

  res.json({
    data: {
      totalWrong,
      sessionCount: sessions.length,
      errorSignals,
      fixRate,
      items,
      causes,
      sessions: weakSessions,
      advice: items.length
        ? items[0].advice
        : '目前没有记录到错误，保持这个状态就很好。'
    }
  });
});

module.exports = router;
