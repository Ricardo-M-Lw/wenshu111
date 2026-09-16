// 缓存层（Redis 语义）—— 对应框架「六、Redis：缓存常用数据与短期状态」
//   热点列表：wrap() 缓存回填，重复读取不再查主库
//   登录状态：saveSession / readSession / revokeSession，支持主动踢下线
//   频率计数：hit() 计数窗口，供限流中间件使用
// 驱动可切换：默认内存驱动（演示零依赖），装好 redis 并配置 REDIS_URL 即走真实 Redis；
// 业务代码只依赖下面这组方法，不感知驱动。

const config = require('../config');

function nowMs() { return Date.now(); }

// ---------------------------------------------------------------------------
// 内存驱动：实现 Redis 命令语义的一个子集
// ---------------------------------------------------------------------------
function createMemoryDriver() {
  const store = new Map();

  function alive(entry) { return !!entry && (entry.expireAt === 0 || entry.expireAt > nowMs()); }
  function read(key) {
    const entry = store.get(key);
    if (!alive(entry)) { store.delete(key); return null; }
    return entry;
  }

  const sweeper = setInterval(function () {
    store.forEach(function (entry, key) { if (!alive(entry)) store.delete(key); });
  }, 30000);
  if (sweeper.unref) sweeper.unref();

  return {
    name: 'memory',
    get: async function (key) { const entry = read(key); return entry ? entry.value : null; },
    set: async function (key, value, ttlSec) {
      store.set(key, { value: value, expireAt: ttlSec ? nowMs() + ttlSec * 1000 : 0 });
    },
    del: async function (key) { store.delete(key); },
    incr: async function (key, ttlSec) {
      const entry = read(key);
      const next = (entry ? Number(entry.value) || 0 : 0) + 1;
      const expireAt = entry ? entry.expireAt : (ttlSec ? nowMs() + ttlSec * 1000 : 0);
      store.set(key, { value: next, expireAt: expireAt });
      return next;
    },
    ttl: async function (key) {
      const entry = read(key);
      if (!entry) return -2;
      if (!entry.expireAt) return -1;
      return Math.max(0, Math.round((entry.expireAt - nowMs()) / 1000));
    },
    keys: async function (prefix) {
      const out = [];
      store.forEach(function (entry, key) { if (alive(entry) && key.indexOf(prefix) === 0) out.push(key); });
      return out;
    },
    size: async function () { return store.size; }
  };
}

// ---------------------------------------------------------------------------
// Redis 驱动：装了 redis 客户端且配置 REDIS_URL 时启用；连不上自动降级内存驱动
// ---------------------------------------------------------------------------
function createRedisDriver(fallback) {
  let client = null;
  let broken = false;
  try {
    const redis = require('redis');
    client = redis.createClient({ url: config.cache.url });
    client.on('error', function (err) { console.error('[cache] Redis 错误：' + err.message); });
    client.connect().catch(function (err) {
      broken = true;
      console.error('[cache] Redis 连接失败，自动降级为内存驱动：' + err.message);
    });
  } catch (err) {
    console.warn('[cache] 未安装 redis 客户端，使用内存驱动（执行 npm i redis 并配置 REDIS_URL 即可切换）');
    return null;
  }

  async function run(op) {
    if (broken || !client) return undefined;
    try {
      return await op();
    } catch (err) {
      broken = true;
      console.error('[cache] Redis 操作失败，降级为内存驱动：' + err.message);
      return undefined;
    }
  }

  return {
    name: 'redis',
    get: async function (key) {
      const raw = await run(function () { return client.get(key); });
      if (raw === undefined) return fallback.get(key);
      return raw === null ? null : JSON.parse(raw);
    },
    set: async function (key, value, ttlSec) {
      const raw = JSON.stringify(value);
      const done = await run(function () {
        return ttlSec ? client.set(key, raw, { EX: ttlSec }) : client.set(key, raw);
      });
      if (done === undefined) return fallback.set(key, value, ttlSec);
      return undefined;
    },
    del: async function (key) {
      const done = await run(function () { return client.del(key); });
      if (done === undefined) return fallback.del(key);
      return undefined;
    },
    incr: async function (key, ttlSec) {
      const next = await run(async function () {
        const value = await client.incr(key);
        if (value === 1 && ttlSec) await client.expire(key, ttlSec);
        return value;
      });
      if (next === undefined) return fallback.incr(key, ttlSec);
      return next;
    },
    ttl: async function (key) {
      const value = await run(function () { return client.ttl(key); });
      if (value === undefined) return fallback.ttl(key);
      return value;
    },
    keys: async function (prefix) {
      const value = await run(function () { return client.keys(prefix + '*'); });
      if (value === undefined) return fallback.keys(prefix);
      return value;
    },
    size: async function () { return fallback.size(); }
  };
}

const memory = createMemoryDriver();
const wantRedis = config.cache.driver === 'redis' && !!config.cache.url;
const driver = (wantRedis ? createRedisDriver(memory) : null) || memory;

// 键命名空间：一眼看出这类数据放在缓存里做什么
const keys = {
  session: function (token) { return 'qw:session:' + token; },
  revoked: function (token) { return 'qw:revoked:' + token; },
  code: function (phone) { return 'qw:code:' + phone; },
  rate: function (bucket, id) { return 'qw:rate:' + bucket + ':' + id; },
  hot: function (name) { return 'qw:hot:' + name; }
};

const cache = {
  driver: driver.name,
  configuredDriver: config.cache.driver,
  isRedis: driver.name === 'redis',
  keys: keys,

  get: function (key) { return driver.get(key); },
  set: function (key, value, ttlSec) { return driver.set(key, value, ttlSec || config.cache.defaultTtlSec); },
  del: function (key) { return driver.del(key); },
  incr: function (key, ttlSec) { return driver.incr(key, ttlSec); },
  ttl: function (key) { return driver.ttl(key); },

  // ---------------- 登录状态 ----------------
  saveSession: function (token, payload, ttlSec) {
    return driver.set(keys.session(token), Object.assign({ at: new Date().toISOString() }, payload || {}), ttlSec);
  },
  readSession: function (token) { return driver.get(keys.session(token)); },
  // 退出登录 / 踢下线：在令牌剩余有效期内打一个作废标记
  revokeSession: function (token, ttlSec) { return driver.set(keys.revoked(token), 1, ttlSec); },
  isRevoked: function (token) {
    return driver.get(keys.revoked(token)).then(function (value) { return !!value; });
  },

  // ---------------- 频率计数 ----------------
  hit: function (key, windowSec) {
    return driver.incr(key, windowSec).then(function (count) {
      return driver.ttl(key).then(function (ttl) {
        return { key: key, count: count, windowSec: windowSec, ttl: ttl < 0 ? windowSec : ttl };
      });
    });
  },

  // ---------------- 热点列表（缓存回填）----------------
  wrap: async function (key, ttlSec, producer) {
    const cached = await driver.get(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await producer();
    if (value !== undefined && value !== null) await driver.set(key, value, ttlSec || config.cache.defaultTtlSec);
    return value;
  },
  invalidate: function (prefix) {
    return driver.keys(prefix).then(function (list) {
      return Promise.all(list.map(function (key) { return driver.del(key); }));
    }).then(function () { return true; });
  },
  stats: async function () {
    const list = await driver.keys('qw:');
    return { driver: driver.name, configured: config.cache.driver, keyCount: list.length, keys: list.slice(0, 12) };
  }
};

module.exports = cache;