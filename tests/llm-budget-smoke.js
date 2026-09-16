/**
 * 大模型额度闸门冒烟测试：
 * 校验「全站每日大模型调用上限」（LLM_DAILY_CAP）确实生效——
 * 额度用满后不再打真实大模型，而是自动退回内置规则引擎，
 * 并且把降级原因带回接口，网站功能不受影响。
 *
 * 这个用例会自己起一个后端（端口 3311，LLM_DAILY_CAP=1），
 * 所以不受共享后端环境影响，也不依赖外网：
 * 有 Key 时第 1 次对话可能真的调用大模型（成功与否都不断言），
 * 第 2 次对话必然是「额度已用满」的降级结果。
 */
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const PORT = process.env.BUDGET_TEST_PORT || '3311';
const BASE = 'http://127.0.0.1:' + PORT;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let pass = 0; const fails = [];
function check(label, ok, detail) {
  if (ok) pass += 1; else fails.push(label + (detail ? ' :: ' + detail : ''));
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

async function getSession() {
  const res = await fetch(BASE + '/api/agent/session?kpId=kp1');
  const body = await res.json();
  return body.data;
}

async function chat(message) {
  const res = await fetch(BASE + '/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kpId: 'kp1', stepIndex: 0, persona: 'tutor', message: message })
  });
  const body = await res.json();
  return { status: res.status, data: body.data || {}, error: body.error };
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'backend', 'src', 'app.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: PORT,
      AGENT_PROVIDER: '',
      LLM_DAILY_CAP: '1',
      LLM_TIMEOUT: '2500',
      AGENT_FREE_DAILY: '50'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });

  let up = false;
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch(BASE + '/api/health'); if (res.ok) { up = true; break; } } catch (err) { /* 还没起来 */ }
    await wait(250);
  }
  if (!up) {
    console.log('后端未能在 ' + BASE + ' 启动：' + log.slice(-500));
    server.kill();
    process.exit(1);
  }

  const first = await getSession();
  check('会话里能看到今日额度状态', !!first.provider.budget, JSON.stringify(first.provider.budget));
  check('额度上限取自 LLM_DAILY_CAP', first.provider.budget.cap === 1, 'cap=' + first.provider.budget.cap);
  check('初始未消耗', first.provider.budget.used === 0 && first.provider.budget.remaining === 1,
    'used=' + first.provider.budget.used + ' remaining=' + first.provider.budget.remaining);

  const hasKey = !!first.provider.hasApiKey;
  if (!hasKey) {
    // 没配 LLM_API_KEY 的机器上闸门本来就是空转，只校验降级链路正常
    const r = await chat('给我一点提示');
    check('未配置 Key 时直接走规则引擎且不报错', r.status === 200 && r.data.provider === 'rules',
      'status=' + r.status + ' provider=' + r.data.provider);
    check('没有 Key 时不消耗大模型额度', r.data.quota && r.data.quota.remaining === 49,
      'quota=' + (r.data.quota && r.data.quota.remaining));
    server.kill();
    console.log('');
    console.log('（这台机器没有 LLM_API_KEY，跳过额度用满的断言）');
    console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
    if (fails.length) { fails.forEach(f => console.log('  x ' + f)); process.exit(1); }
    process.exit(0);
  }

  // 第 1 次：真的走大模型（网络/Key 有问题会自动降级，这里不做断言）
  const one = await chat('给我一点提示');
  check('第 1 次对话正常返回', one.status === 200 && !!one.data.reply, 'status=' + one.status);

  const after = await getSession();
  check('第 1 次对话消耗 1 次额度', after.provider.budget.used === 1 && after.provider.budget.remaining === 0,
    JSON.stringify(after.provider.budget));

  // 第 2 次：额度已满，必须退回规则引擎，并带上可读的降级原因
  const two = await chat('给我一点提示');
  check('额度用满后仍然返回 200（网站功能不受影响）', two.status === 200, 'status=' + two.status);
  check('额度用满后自动退回内置规则引擎', two.data.provider === 'rules' && two.data.degraded === true,
    'provider=' + two.data.provider + ' degraded=' + two.data.degraded);
  check('降级原因说明是额度用满', /额度已用满/.test(String(two.data.degradeReason || '')),
    String(two.data.degradeReason));
  check('降级时模型名显示为离线引擎', two.data.model === '内置规则引擎（离线可用）', String(two.data.model));
  check('降级后免费次数照常扣（配额与额度是两层）', two.data.quota && two.data.quota.remaining === 48,
    'quota=' + (two.data.quota && two.data.quota.remaining));

  const last = await getSession();
  check('额度不会突破上限', last.provider.budget.used === 1 && last.provider.budget.remaining === 0,
    JSON.stringify(last.provider.budget));

  server.kill();
  await wait(200);
  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  x ' + f)); process.exit(1); }
  process.exit(0);
})().catch(err => {
  console.error('异常：' + err.message);
  process.exit(1);
});
