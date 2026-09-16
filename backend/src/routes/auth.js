// 路由层（接入层）：只做「收参数 -> 调服务 -> 写响应」
// 业务规则在 services/authService.js，鉴权 / 限流 / 校验由 middleware 提供。

const express = require('express');
const router = express.Router();

const config = require('../config');
const authService = require('../services/authService');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { rateLimit, defaultKey } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/error');
const { reply } = require('../utils/reply');

// 验证码限流按手机号计数，没填手机号时退回 IP
function codeKey(req) {
  const phone = String((req.body && req.body.phone) || '').trim();
  return phone ? 'phone:' + phone : defaultKey(req);
}

router.post(
  '/send-code',
  validate({ phone: { required: true, type: 'phone', message: '请输入正确的手机号' } }),
  rateLimit({
    bucket: 'auth:code',
    limit: config.rateLimit.sendCode.limit,
    windowSec: config.rateLimit.sendCode.windowSec,
    keyOf: codeKey
  }),
  asyncHandler(async function (req, res) {
    reply(res, await authService.sendCode(req.body.phone));
  })
);

router.post(
  '/register',
  validate({
    name: { required: true, message: '请填写姓名' },
    phone: { required: true, type: 'phone', message: '请输入正确的手机号' },
    password: { required: true, minLength: 6, message: '密码至少 6 位' }
  }),
  asyncHandler(async function (req, res) {
    reply(res, await authService.register(req.body));
  })
);

router.post('/login', asyncHandler(async function (req, res) {
  reply(res, await authService.login(req.body));
}));

router.post('/reset-password', asyncHandler(async function (req, res) {
  reply(res, await authService.resetPassword(req.body));
}));

router.get('/me', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, authService.me(req));
}));

// 退出登录：服务端注销会话（不只是前端清本地）
router.post('/logout', optionalAuth, asyncHandler(async function (req, res) {
  reply(res, await authService.logout(req.token));
}));

router.post('/change-password', requireAuth, asyncHandler(async function (req, res) {
  reply(res, await authService.changePassword(req.user, req.body));
}));

router.get('/profile', requireAuth, asyncHandler(async function (req, res) {
  reply(res, authService.profile(req.user));
}));

router.patch('/profile', requireAuth, asyncHandler(async function (req, res) {
  reply(res, authService.updateProfile(req.user, req.body));
}));

module.exports = router;