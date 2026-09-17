/**
 * 分层架构冒烟：配置 / 缓存 / 表结构 / 仓储 / 服务 / 权限 / 管理端
 * 用法：node tests/layers-smoke.js
 * 对应 README「🏗 项目框架（目标架构）」里的分层与迁移不变量。
 */
const path = require('path');
process.env.PORT = '3196';
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'backend/src/app.js'));

const BASE = 'http://127.0.0.1:3196';
const SRC = path.join(ROOT, 'backend/src');

const config = require(path.join(SRC, 'config'));
const cache = require(path.join(SRC, 'cache'));
const schema = require(path.join(SRC, 'db/schema'));
const repos = require(path.join(SRC, 'repositories'));
const permissions = require(path.join(SRC, 'permissions'));
const authService = require(path.join(SRC, 'services/authService'));
const vipService = require(path.join(SRC, 'services/vipService'));

const checks = [];
function check(label, pass, extra) {
  checks.push({ label: label, pass: !!pass, extra: extra === undefined ? '' : String(extra) });
}

async function call(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (err) { data = { parseError: String(err) }; }
  return { status: res.status, data: data };
}

(async () => {
  const out = [];

  // ---------------- 配置层 ----------------
  check('配置层集中管理环境变量',
    typeof config.port === 'number' && !!config.auth.secret && !!config.rateLimit.sendCode,
    JSON.stringify({ env: config.env, port: config.port, db: config.db.driver, cache: config.cache.driver }));
  check('配置层能定位 backend/.env（与启动目录无关）', config.hasEnvFile === true, 'hasEnvFile=' + config.hasEnvFile);

  // ---------------- 表结构（主键 / SQL / 索引）----------------
  const names = schema.TABLES.map(function (item) { return item.name; });
  const everyTableHasPk = schema.TABLES.every(function (item) {
    return item.columns.some(function (col) { return col.pk; });
  });
  const indexCount = schema.TABLES.reduce(function (sum, item) { return sum + item.indexes.length; }, 0);
  // 表数量会随功能增加，这里不做「等于某个魔法数字」的断言：
  // 改为「不少于 14 张 + 每张都有主键 + 表名不重复」，加表就不会再把用例写死。
  const uniqueNames = names.filter(function (name, index) { return names.indexOf(name) === index; });
  check('表结构每张表都有主键且表名不重复（当前 ' + names.length + ' 张）',
    names.length >= 14 && everyTableHasPk && uniqueNames.length === names.length, names.join(','));
  check('天梯四张表已登记（赛季 / 档案 / 对局 / 作答）',
    ['qw_ladder_season', 'qw_ladder_profile', 'qw_ladder_match', 'qw_ladder_answer']
      .every(function (name) { return names.indexOf(name) !== -1; }), 'tables=' + names.length);
  check('表结构声明了索引（主键 / SQL / 索引三件套）', indexCount >= 15, 'indexes=' + indexCount);

  const ddl = schema.toSql();
  check('DDL 含 CREATE TABLE / PRIMARY KEY / UNIQUE KEY',
    ddl.indexOf('CREATE TABLE IF NOT EXISTS') !== -1 && ddl.indexOf('PRIMARY KEY') !== -1 && ddl.indexOf('UNIQUE KEY') !== -1,
    'len=' + ddl.length);
  check('DDL 覆盖全部表', names.every(function (name) { return ddl.indexOf('CREATE TABLE IF NOT EXISTS ' + name) !== -1; }));

  // ---------------- 缓存层 ----------------
  await cache.set('qw:test:k', { v: 1 }, 60);
  const got = await cache.get('qw:test:k');
  const ttl = await cache.ttl('qw:test:k');
  check('缓存层 set / get / ttl', got && got.v === 1 && ttl > 0 && ttl <= 60, 'ttl=' + ttl);

  const hit1 = await cache.hit('qw:test:rate', 60);
  const hit2 = await cache.hit('qw:test:rate', 60);
  check('缓存层频率计数自增并带窗口', hit1.count === 1 && hit2.count === 2 && hit2.ttl > 0, JSON.stringify(hit2));

  await cache.del('qw:test:k');
  check('缓存层 del 生效', (await cache.get('qw:test:k')) === null);

  // ---------------- 仓储层 ----------------
  let produced = 0;
  async function producer() { produced += 1; return [{ id: 'x' }]; }
  await cache.invalidate(cache.keys.hot('probe'));
  await cache.wrap(cache.keys.hot('probe'), 60, producer);
  await cache.wrap(cache.keys.hot('probe'), 60, producer);
  check('热点列表缓存回填只查一次主库', produced === 1, 'produced=' + produced);

  const byPhone = repos.user.findByPhone('13800000001');
  check('仓储层走唯一索引按手机号查用户', !!byPhone && byPhone.id === 'u1', byPhone && byPhone.name);
  check('仓储层按角色索引查询',
    repos.user.findByRole('student').length === 1 && repos.user.findByRole('ops').length === 1);

  const info = repos.info();
  check('仓储层元信息：已落地表 + 待拆表',
    info.tables.length >= 7 && info.pending.length >= 1, 'pending=' + info.pending.join(','));

  const kps = await repos.learning.listKnowledgePoints();
  check('仓储层知识点热点列表可用', kps.length === 3, kps.map(function (item) { return item.id; }).join(','));

  check('仓储层题库剥离答案', repos.quiz.safeList().every(function (item) {
    return item.correctAnswer === undefined && item.hasAnswer === true;
  }));

  const inserted = repos.vip.insertOrder({
    order_no: 'QW_CHECK_1', user_id: 'u1', planId: 'monthly', amount: 29, status: 'pending',
    createdAt: new Date().toISOString()
  });
  check('仓储层插入时 snake_case 字段自动映射', inserted.orderNo === 'QW_CHECK_1' && inserted.userId === 'u1');

  repos.vip.updateOrder('QW_CHECK_1', { status: 'paid' });
  check('仓储层更新 + 按状态索引',
    repos.vip.findOrder('QW_CHECK_1').status === 'paid' && repos.vip.listPaidOrders().length === 1);
  check('仓储层收入合计按已支付订单统计', repos.vip.totalRevenue() === 29, repos.vip.totalRevenue());

  // ---------------- 权限层 ----------------
  check('权限层：角色 -> 权限码',
    permissions.can({ role: 'ops' }, 'admin:overview:read') &&
    permissions.can({ role: 'ops' }, 'admin:order:list') &&
    !permissions.can({ role: 'student' }, 'admin:overview:read'));
  check('权限层：学生没有任何管理端权限', permissions.permissionsOf({ role: 'student' }).length === 0);

  // ---------------- 服务层 ----------------
  const loginResult = await authService.login({ account: '13800000001', password: '123456' });
  check('服务层统一返回 { status, body }',
    loginResult.status === 200 && !!loginResult.body.token && !!loginResult.body.user, 'status=' + loginResult.status);

  const badLogin = await authService.login({ account: '13800000001', password: 'wrong' });
  check('服务层业务失败返回 401 + 文案',
    badLogin.status === 401 && badLogin.body.error === '密码不正确，请重新输入', JSON.stringify(badLogin.body));

  const vipPlans = vipService.plans(null);
  check('服务层会员方案（游客可看）',
    vipPlans.status === 200 && vipPlans.body.data.plans.length === 3 && vipPlans.body.data.membership === null);

  // ---------------- 接入层 ----------------
  const health = await call('GET', '/api/health');
  check('健康检查暴露部署形态',
    health.status === 200 && health.data.db === config.db.driver && health.data.cache === cache.driver,
    JSON.stringify(health.data));

  const notFound = await call('GET', '/api/nope');
  check('未命中的接口返回 JSON 404', notFound.status === 404 && notFound.data.error === '接口不存在');

  const badCode = await call('POST', '/api/auth/send-code', { phone: '123' });
  check('参数校验拦住非法手机号',
    badCode.status === 400 && badCode.data.error === '请输入正确的手机号', JSON.stringify(badCode.data));

  let limited = 0;
  for (let i = 0; i < 10; i += 1) {
    const res = await call('POST', '/api/auth/send-code', { phone: '13700000009' });
    if (res.status === 429) limited += 1;
  }
  check('频率计数触发 429 限流', limited === 2, 'limited=' + limited);

  const stu = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456' });
  const stuToken = stu.data.token;
  const meBefore = await call('GET', '/api/auth/me', null, stuToken);
  await call('POST', '/api/auth/logout', {}, stuToken);
  const meAfter = await call('GET', '/api/auth/me', null, stuToken);
  check('退出登录后会话在服务端真的失效',
    meBefore.status === 200 && meAfter.status === 401, 'before=' + meBefore.status + ' after=' + meAfter.status);

  // ---------------- 管理端 ----------------
  const ops = await call('POST', '/api/auth/login', { account: 'admin', password: 'admin123' });
  check('运营演示账号可登录', ops.status === 200 && ops.data.user.role === 'ops');

  const retired = await call('POST', '/api/auth/login', { account: 'teacher', password: '123456' });
  check('已下线的教师账号无法登录（产品收敛为学生 + 家长）', retired.status === 401);

  const opsToken = ops.data.token;

  const overview = await call('GET', '/api/admin/overview', null, opsToken);
  check('管理端看板（运营）',
    overview.status === 200 && overview.data.data.users.ops === 1 &&
    overview.data.data.platform.cacheDriver === cache.driver,
    JSON.stringify(overview.data.data.learning));

  const questions = await call('GET', '/api/admin/questions', null, opsToken);
  check('管理端题库不泄答案',
    questions.status === 200 && questions.data.data.items.length > 0 &&
    questions.data.data.items.every(function (item) { return item.correctAnswer === undefined; }));

  const errors = await call('GET', '/api/admin/error-types', null, opsToken);
  check('管理端错因字典带真实出现次数',
    errors.status === 200 && errors.data.data.total === 7 && errors.data.data.totalHits > 0,
    'hits=' + errors.data.data.totalHits);

  const stuFresh = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456' });
  const stuOrders = await call('GET', '/api/admin/orders', null, stuFresh.data.token);
  check('越权防护：学生访问管理端订单接口被 403 拦下',
    stuOrders.status === 403 && stuOrders.data.permission === 'admin:order:list');

  const opsOrders = await call('GET', '/api/admin/orders', null, opsToken);
  check('角色权限：运营可看订单与收入',
    opsOrders.status === 200 && typeof opsOrders.data.data.revenue === 'number',
    JSON.stringify(opsOrders.data.data).slice(0, 120));

  const opsMembers = await call('GET', '/api/admin/members', null, opsToken);
  check('管理端会员列表可用', opsMembers.status === 200 && opsMembers.data.data.total >= 0);

  const stu2 = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456' });
  const stuAdmin = await call('GET', '/api/admin/overview', null, stu2.data.token);
  check('角色权限：学生访问管理端被 403 拦下',
    stuAdmin.status === 403 && stuAdmin.data.permission === 'admin:overview:read');

  const anonAdmin = await call('GET', '/api/admin/overview');
  check('管理端匿名访问 401', anonAdmin.status === 401 && anonAdmin.data.error === '请先登录');

  // ---------------- 输出 ----------------
  checks.forEach(function (item) {
    out.push((item.pass ? 'PASS ' : 'FAIL ') + item.label + (item.extra ? '  [' + item.extra + ']' : ''));
  });
  console.log(out.join('\n'));

  const failed = checks.filter(function (item) { return !item.pass; }).length;
  console.log('\nRESULT: ' + (checks.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL', err);
  process.exit(1);
});