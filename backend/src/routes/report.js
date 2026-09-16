const express = require('express');
const router = express.Router();
/**
 * 问数平台 - 学习报告接口
 * 覆盖：学习总览 / 掌握概览 / 学习记录 / 单次详情 / 提醒设置
 * 所有日期与数值都以「今天」为基准动态推算，避免出现写死的过期日期
 */
const {
  users, learningSessions, knowledgePoints, errorTypes,
  masteryTrend, studySettings, studyTips, dateOnly, stamp
} = require('../models/mockData');
const { lessons, stepListFor, lessonStepCount } = require('../models/lessons');
const { currentUser } = require('../utils/auth');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 优先用当前登录账号；没带登录态时回退到示例学生，保证演示环境下报告页不空白
function resolveStudent(req) {
  const authUser = currentUser(req, users);
  if (authUser) return authUser;
  return users.find(u => u.role === 'student') || null;
}

function dayLabel(date) {
  return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日 · ' + WEEKDAYS[date.getDay()];
}

function studentSessions(studentId) {
  return learningSessions
    .filter(item => item.userId === studentId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function buildMastery(sessions) {
  return knowledgePoints.map(kp => {
    const kpSessions = sessions.filter(item => item.knowledgePointId === kp.id);
    const completed = kpSessions.filter(item => item.status === 'completed').length;
    const latest = kpSessions[0] || null;
    let status = '未开始';
    if (completed) status = '已掌握';
    else if (latest && latest.status === 'in_progress') {
      status = latest.errorTypes && latest.errorTypes.length ? '需加强' : '进行中';
    }
    const totalSteps = lessonStepCount(kp.id) || kp.totalSteps || 5;
    const currentStep = completed ? totalSteps : (latest ? latest.currentStep : 0);
    return Object.assign({}, kp, {
      status,
      completedCount: completed,
      sessionCount: kpSessions.length,
      currentStep,
      totalSteps,
      progress: completed ? 100 : Math.round((currentStep / totalSteps) * 100),
      latestSession: latest,
      latestAt: latest ? latest.updatedAt : null
    });
  });
}

function buildCalendar(sessions, days) {
  const list = [];
  const total = days || 7;
  for (let i = total - 1; i >= 0; i--) {
    const key = dateOnly(i);
    const daySessions = sessions.filter(item => String(item.createdAt).slice(0, 10) === key);
    const minutes = daySessions.reduce((sum, item) => sum + item.duration, 0);
    let status = 'none';
    if (daySessions.some(item => item.status === 'completed')) status = 'completed';
    else if (daySessions.length) status = 'in_progress';
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    list.push({
      date: key,
      label: (date.getMonth() + 1) + '/' + date.getDate(),
      weekday: WEEKDAYS[date.getDay()],
      isToday: i === 0,
      status,
      minutes,
      sessionCount: daySessions.length
    });
  }
  return list;
}

function buildProblems(sessions) {
  const counter = {};
  sessions.forEach(item => (item.errorTypes || []).forEach(name => {
    counter[name] = (counter[name] || 0) + 1;
  }));
  return Object.keys(counter)
    .sort((a, b) => counter[b] - counter[a])
    .map(name => {
      const meta = errorTypes.find(item => item.name === name);
      return { name, count: counter[name], advice: meta ? meta.advice : '针对这一类问题做 2–3 道专项练习。', description: meta ? meta.description : '' };
    });
}

function buildSuggestions(problems, mastery) {
  const list = problems.slice(0, 2).map(item => ({ title: '专项巩固 · ' + item.name, text: item.advice }));
  const weakest = mastery
    .filter(item => item.status !== '已掌握')
    .sort((a, b) => a.progress - b.progress)[0];
  if (weakest) {
    list.push({
      title: '优先复习 · ' + weakest.name,
      text: '目前完成到第 ' + weakest.currentStep + '/' + weakest.totalSteps + " 步，先把这一步讲清楚，再继续往下学。"
    });
  }
  return list.length ? list : [{ title: '保持节奏', text: '当前学习状态稳定，按计划每天完成一个讲题步骤即可。' }];
}

router.get('/overview', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });

  const sessions = studentSessions(student.id);
  const todayKey = dateOnly(0);
  const todaySessions = sessions.filter(item => String(item.createdAt).slice(0, 10) === todayKey);
  const mastery = buildMastery(sessions);
  const problems = buildProblems(sessions.slice(0, 6));
  const quizCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);
  const quizTotal = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);
  const focus = todaySessions[0] || sessions[0] || null;
  const focusKp = focus ? knowledgePoints.find(kp => kp.id === focus.knowledgePointId) : null;
  const now = new Date();

  res.json({
    data: {
      student: { id: student.id, name: student.name, nickname: student.nickname, grade: student.grade, className: student.className, avatar: student.avatar },
      dateLabel: dayLabel(now),
      updatedAt: stamp(0, now.getHours(), now.getMinutes()),
      today: {
        sessionCount: todaySessions.length,
        minutes: todaySessions.reduce((sum, item) => sum + item.duration, 0),
        hints: todaySessions.reduce((sum, item) => sum + item.hintCount, 0),
        corrections: todaySessions.reduce((sum, item) => sum + item.correctionCount, 0),
        correctRate: quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0,
        quizCorrect,
        quizTotal,
        focus: focus ? Object.assign({}, focus, {
          knowledgePointName: focusKp ? focusKp.name : '知识点',
          grade: focusKp ? focusKp.grade : ''
        }) : null
      },
      summary: {
        sessionCount: sessions.length,
        totalMinutes: sessions.reduce((sum, item) => sum + item.duration, 0),
        correctRate: quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0,
        mastered: mastery.filter(item => item.status === '已掌握').length,
        totalKnowledgePoints: mastery.length
      },
      mastery,
      problems,
      suggestions: buildSuggestions(problems, mastery),
      tips: studyTips,
      calendar: buildCalendar(sessions, 7),
      trend: masteryTrend,
      recentSessions: sessions.slice(0, 5).map(item => {
        const kp = knowledgePoints.find(k => k.id === item.knowledgePointId);
        return Object.assign({}, item, {
          knowledgePointName: kp ? kp.name : '知识点',
          knowledgePointIcon: kp ? kp.icon : '△',
          accent: kp ? kp.accent : '#2BA4A0'
        });
      })
    }
  });
});

router.get('/mastery', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });
  const sessions = studentSessions(student.id);
  const mastery = buildMastery(sessions);

  res.json({
    data: {
      student: { id: student.id, name: student.name, grade: student.grade, className: student.className },
      dateLabel: dayLabel(new Date()),
      mastery,
      trend: masteryTrend,
      errorStats: buildProblems(sessions),
      details: mastery.map(item => ({
        id: item.id,
        name: item.name,
        icon: item.icon,
        accent: item.accent,
        status: item.status,
        progress: item.progress,
        steps: stepListFor(item.id, item.latestSession)
      }))
    }
  });
});

// 孩子的全部学习记录（家长端「学习详情」列表）
router.get('/sessions', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });
  const sessions = studentSessions(student.id);
  const quizCorrect = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.correct : 0), 0);
  const quizTotal = sessions.reduce((sum, item) => sum + (item.quiz ? item.quiz.total : 0), 0);

  res.json({
    data: {
      student: { id: student.id, name: student.name, grade: student.grade, className: student.className, avatar: student.avatar },
      dateLabel: dayLabel(new Date()),
      total: sessions.length,
      summary: {
        totalMinutes: sessions.reduce((sum, item) => sum + item.duration, 0),
        hints: sessions.reduce((sum, item) => sum + item.hintCount, 0),
        corrections: sessions.reduce((sum, item) => sum + item.correctionCount, 0),
        correctRate: quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 0,
        completed: sessions.filter(item => item.status === 'completed').length
      },
      sessions: sessions.map(item => {
        const kp = knowledgePoints.find(k => k.id === item.knowledgePointId) || {};
        return {
          id: item.id,
          knowledgePointId: item.knowledgePointId,
          knowledgePointName: kp.name || '知识点',
          knowledgePointIcon: kp.icon || '△',
          grade: kp.grade || '',
          accent: kp.accent || '#2BA4A0',
          cover: kp.cover || null,
          status: item.status,
          currentStep: item.currentStep,
          totalSteps: item.totalSteps,
          duration: item.duration,
          hintCount: item.hintCount,
          correctionCount: item.correctionCount,
          errorTypes: item.errorTypes || [],
          quiz: item.quiz || { correct: 0, total: 0 },
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          dateLabel: dayLabel(new Date(item.createdAt)),
          timeLabel: String(item.createdAt).slice(11, 16)
        };
      })
    }
  });
});

router.get('/session/:id', (req, res) => {
  const session = learningSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const kp = knowledgePoints.find(item => item.id === session.knowledgePointId) || null;
  const student = users.find(item => item.id === session.userId) || null;
  const lesson = kp ? lessons[kp.id] : null;

  res.json({
    data: Object.assign({}, session, {
      knowledgePoint: kp,
      student: student ? { id: student.id, name: student.name, grade: student.grade, className: student.className } : null,
      dateLabel: dayLabel(new Date(session.createdAt)),
      steps: stepListFor(session.knowledgePointId, session)
    })
  });
});

router.get('/calendar', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });
  const days = Number(req.query.days) || 7;
  res.json({ data: buildCalendar(studentSessions(student.id), days) });
});

router.get('/settings', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });
  if (!studySettings[student.id]) {
    studySettings[student.id] = {
      studyWindow: { enabled: true, start: '18:30', end: '20:30', weekdays: [1, 2, 3, 4, 5] },
      quietHours: { enabled: true, start: '21:30', end: '07:00' },
      imagePolicy: 'session',
      reminders: { dailyReport: true, weeklyReport: true, weeklyReportDay: 0 },
      privacy: { shareRanking: false, shareToTeacher: true, analytics: true },
      updatedAt: new Date().toISOString()
    };
  }
  res.json({ data: { settings: studySettings[student.id] } });
});

router.put('/settings', (req, res) => {
  const student = resolveStudent(req);
  if (!student) return res.status(404).json({ error: '账号信息不存在' });
  const current = studySettings[student.id] || {};
  const next = Object.assign({}, current, req.body, { updatedAt: new Date().toISOString() });
  Object.keys(req.body || {}).forEach(key => {
    if (req.body[key] && typeof req.body[key] === 'object' && !Array.isArray(req.body[key])) {
      next[key] = Object.assign({}, current[key] || {}, req.body[key]);
    }
  });
  studySettings[student.id] = next;
  res.json({ data: { settings: next } });
});

module.exports = router;
