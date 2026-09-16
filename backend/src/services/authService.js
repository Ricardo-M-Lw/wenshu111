// 服务层：认证与个人资料
// 只写业务规则（账号查重 / 密码校验 / 验证码有效期 / 登录会话），
// 数据访问走仓储层，短期状态（验证码、会话）走缓存层，HTTP 细节留在路由层。

const cache = require('../cache');
const config = require('../config');
const repos = require('../repositories');
const auth = require('../utils/auth');
const gamificationService = require('./gamificationService');
const { ok, created, fail } = require('../utils/reply');

const AVATAR_PRESETS = [
  '🧑‍🎓', '🐱', '🐼', '🦊', '🐧', '🐨', '🐯', '🦁',
  '🐳', '🦄', '🚀', '🪐', '⭐', '🌟', '🍀', '🎯'
];
const MAX_AVATAR_TEXT = 120;
const MAX_AVATAR_IMAGE = 400000;
const CODE_TTL_SEC = 300;

function isPhone(value) { return /^1[3-9]\d{9}$/.test(String(value || '')); }

// 登录成功后把会话写进缓存（Redis 语义）：支持退出登录与踢下线
async function startSession(user) {
  const token = auth.issueToken(user);
  await cache.saveSession(token, { userId: user.id, role: user.role, name: user.name }, Math.floor(config.auth.tokenTtlMs / 1000));
  return token;
}

// 短信验证码：5 分钟有效，存缓存不进数据库
async function sendCode(phone) {
  const value = String(phone == null ? '' : phone).trim();
  if (!isPhone(value)) return fail(400, '请输入正确的手机号');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await cache.set(cache.keys.code(value), { code: code, sentAt: Date.now() }, CODE_TTL_SEC);
  return ok({ data: { sent: true, expiresIn: CODE_TTL_SEC, demoCode: code } });
}

async function register(body) {
  const input = body || {};
  const name = input.name;
  const phone = input.phone;
  const password = input.password;

  if (!name || !String(name).trim()) return fail(400, '请填写姓名');
  if (!isPhone(phone)) return fail(400, '请输入正确的手机号');
  if (!password || String(password).length < 6) return fail(400, '密码至少 6 位');
  if (input.confirmPassword !== undefined && password !== input.confirmPassword) {
    return fail(400, '两次输入的密码不一致');
  }
  if (repos.user.search(phone)) return fail(409, '该手机号已注册，请直接登录');

  const user = {
    id: repos.user.nextId(),
    name: String(name).trim(),
    nickname: String(name).trim(),
    username: String(phone).slice(-6),
    phone: String(phone),
    role: 'student',
    avatar: '🧑‍🎓',
    grade: input.grade || '八年级',
    school: '实验中学',
    createdAt: new Date().toISOString()
  };
  auth.setPassword(user, password);
  repos.user.insert(user);
  gamificationService.initFor(user);

  const token = await startSession(user);
  return created({ token: token, user: auth.publicUser(user) });
}

async function login(body) {
  const input = body || {};
  const account = input.account || input.phone || input.name;
  const user = repos.user.search(account);
  if (!user) return fail(401, '账号不存在，请先注册');
  if (!auth.verifyPassword(user, input.password)) return fail(401, '密码不正确，请重新输入');

  const token = await startSession(user);
  return ok({ token: token, user: auth.publicUser(user) });
}

async function resetPassword(body) {
  const input = body || {};
  const phone = String(input.phone == null ? '' : input.phone).trim();
  const user = repos.user.findByPhone(phone);
  if (!user) return fail(404, '该手机号尚未注册');

  const record = await cache.get(cache.keys.code(phone));
  if (!record || record.code !== String(input.code)) return fail(400, '验证码错误或已过期');
  if (!input.password || String(input.password).length < 6) return fail(400, '密码至少 6 位');

  auth.setPassword(user, input.password);
  await cache.del(cache.keys.code(phone));
  return ok({ data: { reset: true } });
}

async function changePassword(user, body) {
  const input = body || {};
  if (!user) return fail(401, '请先登录');
  if (!auth.verifyPassword(user, input.oldPassword)) return fail(400, '原密码不正确');
  if (!input.password || String(input.password).length < 6) return fail(400, '新密码至少 6 位');
  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
    return fail(400, '两次输入的密码不一致');
  }
  auth.setPassword(user, input.password);
  return ok({ data: { changed: true } });
}

// 当前登录用户（未带令牌 / 令牌失效 / 用户已不存在，分别给不同提示）
function me(req) {
  if (!req.token) return fail(401, '登录已过期，请重新登录');
  if (!req.user) return fail(401, '用户不存在');
  return ok({ user: auth.publicUser(req.user) });
}

function profile(user) {
  if (!user) return fail(401, '请先登录');
  return ok({ data: { user: auth.publicUser(user), presets: AVATAR_PRESETS } });
}

// 头像：emoji / 文字 / 图片链接 / data URL 图片
function normalizeAvatar(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return { error: '头像不能为空' };
  if (/^data:image\//i.test(value)) {
    if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(value)) {
      return { error: '图片数据格式不正确，请重新选择' };
    }
    if (value.length > MAX_AVATAR_IMAGE) return { error: '图片太大啦，换一张小一点的吧' };
    return { value: value };
  }
  if (/^https?:\/\//i.test(value)) {
    if (value.length > 500) return { error: '图片链接太长了' };
    return { value: value };
  }
  if (value.length > MAX_AVATAR_TEXT) return { error: '头像最多 ' + MAX_AVATAR_TEXT + ' 个字符' };
  return { value: value };
}

function updateProfile(user, body) {
  if (!user) return fail(401, '请先登录');
  const input = body || {};

  if (input.avatar !== undefined) {
    const result = normalizeAvatar(input.avatar);
    if (result.error) return fail(400, result.error);
    repos.user.update(user.id, { avatar: result.value, avatarUpdatedAt: new Date().toISOString() });
  }

  if (input.nickname !== undefined) {
    const value = String(input.nickname).trim();
    if (!value) return fail(400, '昵称不能为空');
    if (value.length > 16) return fail(400, '昵称最多 16 个字');
    repos.user.update(user.id, { nickname: value });
  }

  return ok({ data: { updated: true, user: auth.publicUser(user), presets: AVATAR_PRESETS } });
}

// 退出登录：注销服务端会话（原来是纯前端清本地，现在服务端也真的失效）
async function logout(token) {
  if (token) await cache.revokeSession(token, Math.floor(config.auth.tokenTtlMs / 1000));
  return ok({ data: { logout: true } });
}

module.exports = {
  AVATAR_PRESETS,
  isPhone, sendCode, register, login, resetPassword, changePassword,
  me, profile, updateProfile, normalizeAvatar, logout, startSession
};