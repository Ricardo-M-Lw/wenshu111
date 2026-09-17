// 路由层：星际天梯（赛季 / 我的段位 / 天梯榜 / 开局 / 逐题作答 / 结算 / 家长守护）
// 业务规则在 services/ladderService.js，数据在 repositories/ladderRepository.js，题库在 models/ladderBank.js。
//
// 接口约定（前端只需要记住三条）：
//   · 开局 POST /api/ladder/match 返回的题面里没有正确答案，判分只在服务端做；
//   · 每题的剩余时间以服务端 match.seq_started_at 为准，前端倒计时只是显示；
//   · 答案要等 POST /api/ladder/match/:id/finish 结算后才在 replay 里揭晓。

const express = require('express');
const router = express.Router();

const ladderService = require('../services/ladderService');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { reply } = require('../utils/reply');

// 赛季总览：未登录也能看（首页 / 落地页可以用它做宣传位）
router.get('/season', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.season());
}));

// 天梯榜：公开可看，登录后多返回「我的名次」
router.get('/leaderboard', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.leaderboard(req.user, req.query.limit));
}));

// 我的天梯：段位 / 积分 / 名次 / 每日场次 / 近 10 局 / 家长守护状态
router.get('/me', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.me(req.user));
}));

// 家长守护开关
router.post('/guard', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.setGuard(req.user, req.body));
}));

// 开局：扣一次每日场次，返回题面（无答案）与对手
router.post('/match', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.startMatch(req.user, req.body));
}));

// 取本局进度（断线重连用）
router.get('/match/:id', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.readMatch(req.user, req.params.id));
}));

// 逐题提交：服务端判分，只回对错与得分，不下发正确答案
router.post('/match/:id/answer', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.submitAnswer(req.user, req.params.id, req.body));
}));

// 结算：算积分变化、发星尘、把答案在 replay 里揭晓
router.post('/match/:id/finish', requireAuth, asyncHandler(async function (req, res) {
  reply(res, ladderService.finishMatch(req.user, req.params.id));
}));

module.exports = router;