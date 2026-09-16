// 权限与基座的运行时实现：鉴权与角色 / 权限码校验
// 流程：解析令牌 -> 恢复登录态 -> 校验会话是否已注销 -> 挂到 req.user / req.token。
// 会话状态存在缓存层（Redis 语义）：退出登录与踢下线只需打一个作废标记。

const cache = require('../cache');
const config = require('../config');
const repos = require('../repositories');
const permissions = require('../permissions');
const { verifyToken, readToken } = require('../utils/auth');

function ttlSeconds() { return Math.floor(config.auth.tokenTtlMs / 1000); }

// 可选鉴权：带令牌就恢复登录态，不带也放行（价格页这类允许游客访问）
function optionalAuth(req, res, next) {
  const token = readToken(req);
  req.token = token || null;
  req.user = null;
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload) return next();

  cache.isRevoked(token).then(function (revoked) {
    if (!revoked) {
      const user = repos.user.findById(payload.sub);
      if (user) req.user = user;
    }
    next();
  }).catch(next);
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, function () {
    if (req.user) return next();
    return res.status(401).json({ error: '请先登录' });
  });
}

// 角色校验：对齐若依的角色（学生 / 教师 / 运营）
function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    requireAuth(req, res, function () {
      const role = permissions.roleOf(req.user);
      if (roles.indexOf(role) === -1) {
        return res.status(403).json({ error: '当前角色无权访问该功能', role: role, allow: roles });
      }
      return next();
    });
  };
}

// 权限码校验：对齐若依的菜单 / 按钮权限
function requirePermission(code) {
  return function (req, res, next) {
    requireAuth(req, res, function () {
      if (!permissions.can(req.user, code)) {
        return res.status(403).json({ error: '当前角色没有该操作权限', permission: code, role: permissions.roleOf(req.user) });
      }
      return next();
    });
  };
}

module.exports = { optionalAuth, requireAuth, requireRole, requirePermission, ttlSeconds };