/**
 * 问数平台 - 一键冒烟测试
 * 用法：node tests/run-all.js
 * 会先启动一个临时后端（默认 3210 端口），再依次运行全部测试脚本。
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.TEST_PORT || '3210';
const BASE = 'http://127.0.0.1:' + PORT;
const ROOT = path.join(__dirname, '..');

// 智能体提供方：默认锁定内置规则引擎，让前端用例拿到确定性文案（也不依赖外网）。
// 想验证真实大模型链路：AGENT_PROVIDER=live node tests/run-all.js
const AGENT_PROVIDER = process.env.AGENT_PROVIDER || 'rules';
process.env.AGENT_PROVIDER = AGENT_PROVIDER;

// AI 对话配额：产品规则是免费版每天 10 次，但其它套件会把同一个账号连着问十几轮，
// 所以这里把测试用的共享后端额度调大；配额本身由 agent-quota-smoke.js 用 3 次的小额度单独验证。
process.env.AGENT_FREE_DAILY = process.env.AGENT_FREE_DAILY || '1000';

const SUITES = [
  ['接口冒烟（认证 / 学习 / 答题 / 学习报告）', 'api-smoke.js', { selfHost: true }],
  ['分层架构冒烟（配置 / 缓存 / 表结构 / 仓储 / 服务 / 权限 / 管理端）', 'layers-smoke.js', { selfHost: true }],
  ['智能体问答冒烟（15 条意图）', 'agent-smoke.js', { selfHost: true }],
  ['智能体多角色冒烟（老师 / 侦探 / 规划师）', 'agent-persona-smoke.js', {}],
  ['AI 对话配额冒烟（免费次数 / 星尘星钻兑换 / 会员不限次）', 'agent-quota-smoke.js', { selfHost: true }],
  ['引导式教学骨架冒烟（五步闭环 / 错因矩阵）', 'scaffold-smoke.js', {}],
  ['页面与静态资源检查', 'page-check.js', {}],
  ['前端页面运行冒烟（轻量 DOM）', 'dom-smoke.js', {}],
  ['智能体前端全流程冒烟', 'agent-ui-smoke.js', {}],
  ['小问形象与语音唤醒冒烟（30 种表情 / 状态机 / 唤醒词）', 'xiaowen-ui-smoke.js', {}],
  ['讲题课堂前端全流程冒烟', 'classroom-ui-smoke.js', {}]
];

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForServer(timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return true;
    } catch (err) { /* 还没起来 */ }
    await wait(250);
  }
  return false;
}

function run(file, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: ROOT,
      env: Object.assign({}, process.env, env || {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', code => resolve({ code, out }));
  });
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'backend', 'src', 'app.js')], {
    env: Object.assign({}, process.env, { PORT, AGENT_PROVIDER }),
    stdio: 'ignore'
  });

  const healthy = await waitForServer(8000);
  if (!healthy) {
    console.error('后端未能在 ' + BASE + ' 启动，测试中止');
    server.kill();
    process.exit(1);
  }

  console.log('智能体提供方：' + (AGENT_PROVIDER === 'rules'
    ? '内置规则引擎（离线 · 结果确定）'
    : AGENT_PROVIDER + '（需要外网，结果不固定）'));

  const results = [];
  for (const [label, file, opts] of SUITES) {
    process.stdout.write('\n=== ' + label + ' (' + file + ') ===\n');
    const result = await run(file, opts.selfHost ? {} : { BASE });
    process.stdout.write(result.out.split('\n').slice(-16).join('\n') + '\n');
    results.push({ label, code: result.code });
  }

  server.kill();

  console.log('\n================ 汇总 ================');
  results.forEach(item => console.log((item.code === 0 ? '✅ ' : '❌ ') + item.label));
  const failed = results.filter(item => item.code !== 0).length;
  console.log(failed ? ('\n' + failed + ' 个测试套件失败') : '\n全部测试套件通过');
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error('运行器异常：', err);
  process.exit(1);
});