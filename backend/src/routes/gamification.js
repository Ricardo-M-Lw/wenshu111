// 路由层：趣味化（状态 / 签到 / 徽章 / 等级）
// 业务规则在 services/gamificationService.js。

const express = require('express');
const router = express.Router();

const gamificationService = require('../services/gamificationService');
const walletService = require('../services/walletService');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { reply } = require('../utils/reply');

// 登录后取当前学生；未登录时保留旧的 userId 兜底（便于课堂演示与前端联调）
function userIdOf(req) {
  if (req.user) return req.user.id;
  return req.query.userId || (req.body && req.body.userId) || 'u1';
}

router.use(optionalAuth);

router.get('/status', asyncHandler(async function (req, res) {
  reply(res, gamificationService.status(userIdOf(req)));
}));

router.post('/checkin', asyncHandler(async function (req, res) {
  const userId = userIdOf(req);
  const result = gamificationService.checkin(userId);
  const earned = result && result.body && result.body.data ? result.body.data.points : 0;
  // 签到发的是星尘，写一条收支流水
  if (earned > 0) walletService.record(userId, 'dust', earned, 'checkin', '每日签到');
  reply(res, result);
}));

router.get('/badges', asyncHandler(async function (req, res) {
  reply(res, gamificationService.badges(userIdOf(req)));
}));

router.get('/levels', asyncHandler(async function (req, res) {
  reply(res, gamificationService.levels(userIdOf(req)));
}));

module.exports = router;