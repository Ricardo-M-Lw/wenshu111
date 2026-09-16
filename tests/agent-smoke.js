const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.PORT = '3198';
require(path.join(ROOT, 'backend/src/app.js'));
const BASE = 'http://127.0.0.1:3198';
let token = '';

async function call(method, url, body, raw) {
  const res = await fetch(BASE + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const CASES = [
  ['问候', '你好'],
  ['提示', '给我一点提示'],
  ['进度', '我学到哪一步了'],
  ['选错(B)', 'B'],
  ['选错(D)', 'D'],
  ['正确(C)', 'C'],
  ['为什么', '为什么斜率越大越陡'],
  ['概念', '什么是勾股定理'],
  ['变式', '换一道变式题吧'],
  ['算术', '3^2+4^2'],
  ['情绪', '太难了我不想学了'],
  ['要答案', '别问了直接把答案告诉我'],
  ['要答案2', '这题选什么'],
  ['小结', '帮我总结一下'],
  ['默认', '这个地方我还是有点糊涂']
];

(async () => {
  const login = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456', role: 'student' });
  token = login.data.token;
  const health = await call('GET', '/api/agent/health');
  console.log('provider:', JSON.stringify(health.data.data));

  // 这个用例表有 15 条，而免费版每天只有 10 次 AI 对话：
  // 先在演示账号上开通会员（演示单直接支付成功），让「意图分类」的验证不被配额挡住。
  // 配额本身的行为由 agent-quota-smoke.js 单独覆盖。
  const order = await call('POST', '/api/vip/order', { planId: 'monthly', channel: 'wechat' });
  if (order.status >= 200 && order.status < 300 && order.data.data && order.data.data.order) {
    await call('POST', '/api/vip/pay', { orderNo: order.data.data.order.orderNo });
  }
  const quota = await call('GET', '/api/agent/quota');
  console.log('quota:', JSON.stringify(quota.data && quota.data.data ? quota.data.data.limit : null),
    '| unlimited =', quota.data && quota.data.data ? quota.data.data.unlimited : null);

  for (const [label, message] of CASES) {
    const r = await call('POST', '/api/agent/chat', { message, kpId: 'kp3', stepIndex: 2 });
    const d = r.data.data;
    if (!d || !d.reply) { console.error('FATAL 对话失败 ' + label + ' status=' + r.status + ' ' + JSON.stringify(r.data).slice(0, 200)); process.exit(1); }
    const first = String(d.reply).split('\n')[0].slice(0, 46);
    console.log(`${label.padEnd(7, ' ')} | ${r.status} | intent=${String(d.intent).padEnd(8)} blocked=${String(!!d.blocked).padEnd(5)} tools=[${d.toolCalls.join(',')}] eff=${Object.keys(d.effects||{}).filter(k=>d.effects[k]).join(',')||'-'} | ${first}`);
  }

  const s = await call('GET', '/api/agent/session?kpId=kp3');
  console.log('session messages:', s.data.data.messages.length, '| profile:', JSON.stringify(s.data.data.profile.hints, ), 'hint/wrong/correct=', s.data.data.profile.hintCount, s.data.data.profile.wrongCount, s.data.data.profile.correctCount, '| errorTypes=', s.data.data.profile.errorTypes.join('/'));

  const res = await call('POST', '/api/agent/chat/stream', { message: '给我一点提示', kpId: 'kp1', stepIndex: 1 }, true);
  const text = await res.text();
  const lines = text.trim().split('\n').map(l => JSON.parse(l));
  const types = {};
  lines.forEach(l => { types[l.type] = (types[l.type] || 0) + 1; });
  const assembled = lines.filter(l => l.type === 'delta').map(l => l.text).join('');
  console.log('stream events:', JSON.stringify(types), '| assembled len:', assembled.length);
  process.exit(0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });