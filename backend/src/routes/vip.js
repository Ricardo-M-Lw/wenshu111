// 路由层：会员领航舱（方案 / 状态 / 下单 / 支付）
// 业务规则在 services/vipService.js，数据访问在 repositories/vipRepository.js。

const express = require('express');
const router = express.Router();

const vipService = require('../services/vipService');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { reply } = require('../utils/reply');

// 方案列表：未登录也能看价格页
router.get('/plans', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, vipService.plans(req.user));
}));

router.get('/status', requireAuth, asyncHandler(async function (req, res) {
  reply(res, vipService.status(req.user));
}));

router.post('/order', requireAuth, asyncHandler(async function (req, res) {
  reply(res, vipService.createOrder(req.user, req.body));
}));

router.post('/pay', requireAuth, asyncHandler(async function (req, res) {
  reply(res, vipService.pay(req.user, req.body));
}));

module.exports = router;