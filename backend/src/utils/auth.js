// 轻量级令牌 / 密码工具（Mock 环境下的真实实现，可平滑替换为标准 JWT + bcrypt / argon2）

const crypto = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'wenshu_dev_secret_key_2025';
const SECRET = process.env.JWT_SECRET || (IS_PROD ? '' : DEV_SECRET);

// 生产环境没有配置密钥就直接拒绝启动：否则会用一个写在代码里、人人可查的密钥签发令牌，
// 任何人都能伪造 token 冒充任意用户（含运营）。宁可起不来，也不能裸奔。
if (!SECRET) {
  throw new Error('生产环境必须配置 JWT_SECRET（建议 32 位以上随机串），当前未配置，已拒绝启动');
}
if (IS_PROD && SECRET === DEV_SECRET) {
  throw new Error('生产环境的 JWT_SECRET 不能沿用开发默认值，请换成随机密钥');
}
if (IS_PROD && SECRET.length < 32) {
  throw new Error('生产环境的 JWT_SECRET 太短（当前 ' + SECRET.length + ' 位，至少 32 位）。'
    + '生成：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + signature;
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function issueToken(user) {
  return signPayload({
    sub: user.id,
    role: user.role,
    name: user.name,
    exp: Date.now() + TOKEN_TTL
  });
}

// ---------------------------------------------------------------------------
// 密码哈希
// scrypt 是「慢哈希」：每次校验都要付出固定的 CPU / 内存代价，
// 数据库泄露后攻击者也无法用 GPU 每秒暴力尝试几十亿次。
// ---------------------------------------------------------------------------
const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// 旧版哈希（单轮 sha256）：只用于兼容历史数据，新密码一律走 scrypt
function legacyHashPassword(password, salt) {
  return crypto.createHash('sha256').update(String(password) + '::' + salt).digest('hex');
}

function hashPassword(password, salt) {
  const key = crypto.scryptSync(String(password), String(salt), SCRYPT_KEYLEN, SCRYPT_OPTS);
  return SCRYPT_PREFIX + key.toString('hex');
}

function setPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.passwordHash = hashPassword(password, user.salt);
  delete user.password;
}

function verifyPassword(user, password) {
  if (!user) return false;
  if (user.passwordHash && user.salt) {
    const stored = String(user.passwordHash);
    if (stored.indexOf(SCRYPT_PREFIX) === 0) {
      return safeEqual(hashPassword(password, user.salt), stored);
    }
    // 历史 sha256 哈希：校验通过后顺手升级成 scrypt，用户无感
    if (safeEqual(legacyHashPassword(password, user.salt), stored)) {
      setPassword(user, password);
      return true;
    }
    return false;
  }
  // 兼容初始化数据里的明文密码，校验通过后自动升级为加盐哈希
  if (typeof user.password === 'string' && user.password === String(password)) {
    setPassword(user, password);
    return true;
  }
  return false;
}

function publicUser(user) {
  if (!user) return null;
  const copy = Object.assign({}, user);
  delete copy.password;
  delete copy.passwordHash;
  delete copy.salt;
  return copy;
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.indexOf('Bearer ') === 0) return header.slice(7).trim();
  // 不再支持 ?token=xxx：URL 会进 Nginx 访问日志、浏览器历史与 Referer，
  // 等于把登录凭证到处撒。链接直达场景请改用一次性短时效 ticket。
  return null;
}

// 从请求中解析当前用户；令牌无效时返回 null
function currentUser(req, users) {
  const payload = verifyToken(readToken(req));
  if (!payload) return null;
  return users.find(item => item.id === payload.sub) || null;
}

module.exports = {
  signPayload,
  verifyToken,
  issueToken,
  hashPassword,
  setPassword,
  verifyPassword,
  publicUser,
  readToken,
  currentUser
};