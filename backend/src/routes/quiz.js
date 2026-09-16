const express = require('express');
const router = express.Router();
const { quizzes, gamification, learningSessions, resolveLevel, users } = require('../models/mockData');
const { currentUser } = require('../utils/auth');
const accessService = require('../services/accessService');
const walletService = require('../services/walletService');

function resolveUserId(req) {
  const user = currentUser(req, users);
  return user ? user.id : (req.query.userId || (req.body && req.body.userId) || 'u1');
}

router.get('/questions', (req, res) => {
  const { knowledgePointId } = req.query;
  const user = currentUser(req, users);
  // 免费版只开放第一颗星球：锁住的星球不发题
  if (knowledgePointId) {
    const blocked = accessService.block(user, knowledgePointId);
    if (blocked) return res.status(blocked.status).json(blocked.body);
  }
  const allowed = accessService.unlockedIds(user);
  const list = knowledgePointId
    ? quizzes.filter(q => q.knowledgePointId === knowledgePointId)
    : quizzes.filter(q => allowed.indexOf(q.knowledgePointId) !== -1);
  // 不返回答案，判题统一走 /submit
  res.json({ data: list.map(q => ({ id: q.id, knowledgePointId: q.knowledgePointId, question: q.question, options: q.options, hint: q.hint, type: q.type })) });
});

router.post('/submit', (req, res) => {
  const { questionId, answer } = req.body;
  const question = quizzes.find(q => q.id === questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  // 锁住的星球同样不许交卷，避免绕过前端直接刷题
  const blocked = accessService.block(currentUser(req, users), question.knowledgePointId);
  if (blocked) return res.status(blocked.status).json(blocked.body);

  const userId = resolveUserId(req);
  const isCorrect = question.correctAnswer === Number(answer);
  const stat = gamification[userId];

  if (isCorrect && stat) {
    stat.exp += 10;
    stat.points += 10;
    stat.level = resolveLevel(stat.exp);
    // 答对标准题发 10 星尘，写一条收支流水
    walletService.record(userId, 'dust', 10, 'quiz', '答对标准题');
  }

  res.json({
    data: {
      isCorrect,
      hint: isCorrect ? null : question.hint,
      pointsEarned: isCorrect ? 10 : 0,
      totalPoints: stat ? stat.points : 0,
      level: stat ? stat.level : null,
      message: isCorrect ? '答对了！+10 积分' : '再想想，不要直接看答案哦'
    }
  });
});

router.get('/stats', (req, res) => {
  const userId = resolveUserId(req);
  const stat = gamification[userId] || gamification.u1;
  const sessions = learningSessions.filter(item => item.userId === userId);
  const totalAnswered = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);
  const totalCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);

  res.json({
    data: {
      totalAnswered,
      correctRate: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      bestStreak: stat.streakDays,
      points: stat.points,
      level: stat.level ? stat.level.current : 1,
      levelName: stat.level ? stat.level.name : '见习学员'
    }
  });
});

module.exports = router;
