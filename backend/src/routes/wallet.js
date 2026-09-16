// 路由层：星尘 / 星钻钱包（充值档位 / 收支记录 / 充值下单与支付）
// 业务规则在 services/walletService.js，数据在 repositories/walletRepository.js。

const express = require('express');
const router = express.Router();

const walletService = require('../services/walletService');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { reply } = require('../utils/reply');

// 充值档位：未登录也能看
router.get('/packs', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, walletService.packs());
}));

// 收支记录：余额 + 汇总 + 最近流水
router.get('/logs', requireAuth, asyncHandler(async function (req, res) {
  const limit = Number(req.query.limit) || 40;
  reply(res, walletService.overview(req.user, limit));
}));

router.post('/recharge', requireAuth, asyncHandler(async function (req, res) {
  reply(res, walletService.createRecharge(req.user, req.body));
}));

router.post('/recharge/pay', requireAuth, asyncHandler(async function (req, res) {
  reply(res, walletService.payRecharge(req.user, req.body));
}));

module.exports = router;