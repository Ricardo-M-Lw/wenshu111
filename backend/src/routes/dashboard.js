const express = require('express');
const router = express.Router();
const {
  users, knowledgePoints, learningSessions, gamification, dateOnly
} = require('../models/mockData');
const { lessons, lessonStepCount } = require('../models/lessons');
const { currentUser, publicUser } = require('../utils/auth');
const accessService = require('../services/accessService');

function withKnowledgePoint(session) {
  const kp = knowledgePoints.find(item => item.id === session.knowledgePointId);
  return Object.assign({}, session, {
    knowledgePointName: kp ? kp.name : '知识点',
    knowledgePointIcon: kp ? kp.icon : '△',
    knowledgePointColor: kp ? kp.accent : '#2BA4A0'
  });
}

function statusOf(session, hasCompleted) {
  if (hasCompleted) return '已掌握';
  if (!session) return '未开始';
  if (session.status === 'in_progress') return session.errorTypes && session.errorTypes.length ? '待巩固' : '学习中';
  return '未开始';
}

router.get('/', (req, res) => {
  const authUser = currentUser(req, users);
  const userId = authUser ? authUser.id : (req.query.userId || 'u1');
  const user = authUser || users.find(item => item.id === userId && item.role === 'student')
    || users.find(item => item.role === 'student');
  const sessions = learningSessions
    .filter(item => item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const knowledgePointList = knowledgePoints.map(kp => {
    const kpSessions = sessions.filter(item => item.knowledgePointId === kp.id);
    const completedSession = kpSessions.find(item => item.status === 'completed') || null;
    const latest = kpSessions[0] || null;
    const totalSteps = lessonStepCount(kp.id) || kp.totalSteps || 5;
    const currentStep = completedSession ? totalSteps : (latest ? latest.currentStep : 0);
    const lesson = lessons[kp.id];

    return Object.assign({}, kp, {
      status: statusOf(latest, !!completedSession),
      currentStep,
      totalSteps,
      lessonStepCount: lesson ? lesson.steps.length : 0,
      progress: completedSession ? 100 : Math.round((currentStep / totalSteps) * 100),
      hintCount: latest ? latest.hintCount : 0,
      latestSession: latest ? withKnowledgePoint(latest) : null
    });
  });

  // 免费版只开放第一颗星球：锁住的星球前端会显示「🔒 领航员解锁」
  const decorated = knowledgePointList.map(function (kp) { return accessService.decorate(user, kp); });

  const today = dateOnly(0);
  const todaySessions = sessions.filter(item => String(item.createdAt).slice(0, 10) === today);
  const gam = gamification[userId] || gamification.u1;
  const quizCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);
  const quizTotal = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);

  res.json({
    data: {
      user: publicUser(user),
      gamification: gam,
      access: accessService.summary(user),
      knowledgePoints: decorated,
      recentSessions: sessions.slice(0, 5).map(withKnowledgePoint),
      todayStats: {
        date: today,
        sessionCount: todaySessions.length,
        minutes: todaySessions.reduce((sum, item) => sum + item.duration, 0),
        hints: todaySessions.reduce((sum, item) => sum + item.hintCount, 0),
        corrections: todaySessions.reduce((sum, item) => sum + item.correctionCount, 0)
      },
      overall: {
        sessionCount: sessions.length,
        totalMinutes: sessions.reduce((sum, item) => sum + item.duration, 0),
        correctRate: quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0
      }
    }
  });
});

module.exports = router;
