// 管理端（运营）—— 对应框架「二、分层框架总览」的管理端一层
// 权限由 requirePermission 控制，权限码与角色映射写在 permissions.js；
// 接入若依 RuoYi 后由菜单 / 按钮权限下发，本文件与前端都不用改。

const express = require('express');
const router = express.Router();

const config = require('../config');
const cache = require('../cache');
const repos = require('../repositories');
const mock = require('../models/mockData');
const vipService = require('../services/vipService');
const { requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { ok, reply } = require('../utils/reply');

// 经营 / 学情看板
router.get('/overview', requirePermission('admin:overview:read'), asyncHandler(async function (req, res) {
  const students = repos.user.findByRole('student');
  const sessions = repos.learning.listAllSessions();
  const completed = sessions.filter(function (item) { return item.status === 'completed'; }).length;
  const paid = repos.vip.listPaidOrders();
  const activeMembers = repos.user.list().filter(function (user) { return repos.vip.isActive(user); }).length;

  reply(res, ok({
    data: {
      generatedAt: new Date().toISOString(),
      users: {
        total: repos.user.count(),
        student: students.length,
        ops: repos.user.findByRole('ops').length
      },
      learning: {
        knowledgePoints: repos.learning.countKnowledgePoints(),
        questions: repos.quiz.count(),
        sessions: sessions.length,
        completed: completed,
        completionRate: sessions.length ? Math.round(completed / sessions.length * 100) : 0
      },
      gamification: {
        totalPoints: repos.gamification.totalPoints(),
        ranking: repos.gamification.ranking(5).map(function (row) {
          const user = repos.user.findById(row.userId) || {};
          return { userId: row.userId, name: user.nickname || user.name || row.userId, points: row.points || 0 };
        })
      },
      membership: {
        orders: repos.vip.countOrders(),
        paid: paid.length,
        revenue: repos.vip.totalRevenue(),
        activeMembers: activeMembers
      },
      // 技术自检：当前跑在哪个驱动上、哪些表已经落地、哪些还留在嵌套结构里
      platform: {
        env: config.env,
        dbDriver: config.db.driver,
        cacheDriver: cache.driver,
        llm: config.hasLlm ? config.ai.model : 'rules',
        tables: repos.info().tables,
        pendingTables: repos.info().pending
      }
    }
  }));
}));

// 题库：题干 / 选项 / 提示都下发，答案一律不下发（不泄答案不变量）
router.get('/questions', requirePermission('admin:question:list'), asyncHandler(async function (req, res) {
  const kpId = req.query.knowledgePointId;
  const items = repos.quiz.safeList(kpId ? String(kpId) : null);
  reply(res, ok({ data: { total: repos.quiz.count(), filtered: items.length, items: items } }));
}));

// 错因字典：字典 + 真实出现次数（来自学习会话）
router.get('/error-types', requirePermission('admin:error-type:list'), asyncHandler(async function (req, res) {
  const counter = {};
  repos.learning.listAllSessions().forEach(function (session) {
    (session.errorTypes || []).forEach(function (name) {
      counter[name] = (counter[name] || 0) + 1;
    });
  });

  const items = mock.errorTypes.map(function (item) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      advice: item.advice,
      count: counter[item.name] || 0
    };
  }).sort(function (a, b) { return b.count - a.count; });

  reply(res, ok({
    data: {
      total: items.length,
      totalHits: items.reduce(function (sum, item) { return sum + item.count; }, 0),
      items: items
    }
  }));
}));

// 会员订单（仅运营角色可见，需要 admin:order:list 权限码）
router.get('/orders', requirePermission('admin:order:list'), asyncHandler(async function (req, res) {
  reply(res, vipService.adminOrders());
}));

// 会员列表
router.get('/members', requirePermission('admin:member:list'), asyncHandler(async function (req, res) {
  reply(res, vipService.adminMembers());
}));

module.exports = router;