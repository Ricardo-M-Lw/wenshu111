// 问数星途 · 后端入口
// 分层：接入层（routes / middleware） -> 业务层（services） -> 持久层（repositories / db） -> 缓存层（cache）
// 配置集中在 config/index.js，换数据库 / 缓存 / 大模型都只改配置。

const path = require('path');
const express = require('express');
const cors = require('cors');
const os = require('os');

const config = require('./config');
const cache = require('./cache');
const repos = require('./repositories');
const { notFoundJson, errorHandler } = require('./middleware/error');
const compress = require('./middleware/compress');

const authRoutes = require('./routes/auth');
const learningRoutes = require('./routes/learning');
const quizRoutes = require('./routes/quiz');
const gamificationRoutes = require('./routes/gamification');
const reportRoutes = require('./routes/report');
const dashboardRoutes = require('./routes/dashboard');
const agentRoutes = require('./routes/agent');
const studentRoutes = require('./routes/student');
const vipRoutes = require('./routes/vip');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = config.port;

// 反向代理（Nginx / 负载均衡）后面必须开这个：
// 否则 req.ip 会全部变成 127.0.0.1，限流把全站访客算作同一个人，防暴力破解直接失效。
app.set('trust proxy', 1);

// gzip 压缩：common.css 97 KB + space.css 146 KB 全是裸传，压完通常只剩两成多。
// 挂前面是因为它要拦截 res.write / res.end，越早接管越不容易被别的中间件提前发头。
app.use(compress());

// 基础安全响应头（不引入 helmet 依赖，保持零新增包）
app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
  next();
});

// 跨域：默认全开方便本地联调；生产用 CORS_ORIGIN 环境变量收成白名单（逗号分隔）
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
app.use(cors(CORS_ORIGIN.length ? { origin: CORS_ORIGIN } : {}));
// 头像支持 data URL 图片（最大约 400KB），所以放宽请求体上限
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 健康检查：顺带暴露当前跑在哪个驱动上，方便排查部署形态
app.get('/api/health', function (req, res) {
  res.json({
    status: 'ok',
    env: config.env,
    db: config.db.driver,
    cache: cache.driver,
    llm: config.hasLlm ? config.ai.model : 'rules',
    timestamp: new Date().toISOString()
  });
});

// API 路由（接入层）
app.use('/api/auth', authRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/vip', vipRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// 未命中的接口统一返回 JSON，避免被前端路由兜底成 HTML
app.use('/api', notFoundJson);

// 静态资源：前端源码目录（含 pages / src / assets）
// 注意顺序 —— 先注册的优先命中，所以 pages/ 会覆盖 dist/pages/ 里的同名文件。
app.use(express.static(config.frontendDir));
// 构建产物目录（执行过 npm run build 后才有；未构建时该中间件自动跳过）
app.use(express.static(path.join(config.frontendDir, 'dist')));

// 页面路由兜底
app.get('*', function (req, res) {
  res.sendFile(path.join(config.frontendDir, 'index.html'));
});

// 错误处理（必须放在所有路由之后）
app.use(errorHandler);

// 局域网地址：部署到内网后，同一 WiFi / 内网的其他设备用这个地址访问
// 过滤掉虚拟机 / VPN / 蓝牙等虚拟网卡，否则横幅会列出一堆别人连不上的地址
const VIRTUAL_ADAPTER = /(virtual|vmware|hyper-v|vethernet|loopback|radmin|hamachi|tap|tun|bluetooth|zerotier|tailscale|docker|wsl|npcap|vpn)/i;
function lanAddresses() {
  const list = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    if (VIRTUAL_ADAPTER.test(name)) return;
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) list.push({ name: name, address: net.address });
    });
  });
  return list;
}

app.listen(PORT, function () {
  console.log('🚀 问数后端服务已启动: http://localhost:' + PORT);
  const lan = lanAddresses();
  if (lan.length) {
    console.log('🌐 局域网可访问（同一 WiFi / 内网的其他电脑和手机直接打开）:');
    lan.forEach(function (item) {
      console.log('     http://' + item.address + ':' + PORT + '/pages/auth/login.html   [' + item.name + ']');
    });
    if (lan.length > 1) {
      console.log('   ↳ 列了多条时，选名称是 WLAN / 以太网 的那条（虚拟机网卡的地址别人连不上）');
    }
    console.log('   ⚠️  http:// 下浏览器会禁用麦克风：语音唤醒 / 语音播报需要 HTTPS（见 部署文档.md）');
  }
  console.log('🔐 登录页: http://localhost:' + PORT + '/pages/auth/login.html');
  console.log('🎓 学生端: http://localhost:' + PORT + '/pages/student/home.html');
  console.log('🤖 智能体: http://localhost:' + PORT + '/pages/student/agent.html');
  console.log('📊 学习报告: http://localhost:' + PORT + '/pages/student/report.html');
  console.log('👑 会员领航舱: http://localhost:' + PORT + '/pages/student/vip.html');
  console.log('🧩 分层: 接入层 -> 业务层 -> 持久层(' + config.db.driver + ') / 缓存层(' + cache.driver + ')');
  console.log('🏗 数据表: ' + repos.info().tables.map(function (item) { return item.table + '(' + item.rows + ')'; }).join(' '));
  console.log('🛰 管理控制台: http://localhost:' + PORT + '/pages/admin/console.html（教师 teacher / 运营 admin）');
});

module.exports = app;