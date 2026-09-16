// 配置中心：集中读取环境变量，对应 Spring Boot 的外置配置（application.yml）
// 换实现时只改这里，业务代码不感知部署形态。

const path = require('path');
const fs = require('fs');

// 显式指定 .env 位置：不论从哪个目录启动，都能读到 backend/.env
// （否则 dotenv 只按 cwd 查找，换目录启动会静默降级）
const BACKEND_DIR = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback) {
  return (value === undefined || value === null || value === '') ? fallback : String(value);
}

const config = {
  env: text(process.env.NODE_ENV, 'development'),
  port: num(process.env.PORT, 3000),
  frontendDir: path.join(__dirname, '..', '..', '..', 'frontend'),
  backendDir: BACKEND_DIR,

  // 鉴权：当前为 HMAC 签名令牌，可平滑替换为 JWT（只改 utils/auth.js）
  auth: {
    secret: text(process.env.JWT_SECRET, 'wenshu_dev_secret_key_2025'),
    tokenTtlMs: num(process.env.TOKEN_TTL_MS, 7 * 24 * 60 * 60 * 1000)
  },

  // 关系型数据库：默认内存驱动（演示零依赖）；配 DB_DRIVER=mysql 走真实库
  db: {
    driver: text(process.env.DB_DRIVER, 'memory'),
    host: text(process.env.DB_HOST, '127.0.0.1'),
    port: num(process.env.DB_PORT, 3306),
    name: text(process.env.DB_NAME, 'wenshu'),
    user: text(process.env.DB_USER, 'root'),
    password: text(process.env.DB_PASSWORD, ''),
    poolSize: num(process.env.DB_POOL, 10)
  },

  // 缓存：登录状态 / 频率计数 / 热点列表（Redis 语义）
  cache: {
    driver: text(process.env.CACHE_DRIVER, 'memory'),
    url: text(process.env.REDIS_URL, ''),
    defaultTtlSec: num(process.env.CACHE_TTL, 300)
  },

  // 频率计数阈值：防止频繁请求
  rateLimit: {
    sendCode: { limit: num(process.env.RL_SEND_CODE, 8), windowSec: 60 },
    agentChat: { limit: num(process.env.RL_AGENT_CHAT, 120), windowSec: 60 },
    agentReport: { limit: num(process.env.RL_AGENT_REPORT, 30), windowSec: 60 }
  },

  // AI 对话配额：免费版每天 N 次，用完可以用星尘 / 星钻兑换加次；会员不限次
  agentQuota: {
    freeDaily: num(process.env.AGENT_FREE_DAILY, 10),
    redeem: [
      { id: 'dust', unit: '星尘', icon: '✨', cost: 50, rounds: 1, desc: '签到、答对标准题、完成讲题课堂都能攒' },
      { id: 'gem', unit: '星钻', icon: '💎', cost: 2, rounds: 1, desc: '等值充值获得（1 元 = 1 星钻）' }
    ]
  },

  // AI 服务（OpenAI 兼容协议，默认 DeepSeek）
  ai: {
    provider: text(process.env.AGENT_PROVIDER, ''),
    apiKey: text(process.env.LLM_API_KEY, ''),
    baseUrl: text(process.env.LLM_BASE_URL, 'https://api.deepseek.com/v1'),
    model: text(process.env.LLM_MODEL, 'deepseek-flash'),
    // 模型名兜底链：配的模型在当前账号不存在时依次回退（见 providers/openai.js）
    modelFallbacks: text(process.env.LLM_MODEL_FALLBACKS, 'deepseek-chat,deepseek-reasoner'),
    temperature: num(process.env.LLM_TEMPERATURE, 0.6),
    maxRounds: num(process.env.LLM_MAX_ROUNDS, 3),
    // 全局每日大模型调用上限：公开部署时防刷额度；<= 0 表示不限量
    dailyCap: num(process.env.LLM_DAILY_CAP, 300)
  }
};

config.isProd = config.env === 'production';
config.hasLlm = !!config.ai.apiKey && config.ai.provider !== 'rules';
config.hasEnvFile = fs.existsSync(path.join(config.backendDir, '.env'));

module.exports = config;