/**
 * AI 对话配额冒烟：免费版每天 N 次 → 用完 429 → 星尘 / 星钻兑换加次 → 会员不限次
 * 自己起一个临时后端（默认 3199），并把 AGENT_FREE_DAILY 调到 3，方便一轮跑完。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.PORT = process.env.QUOTA_PORT || '3199';
process.env.AGENT_FREE_DAILY = process.env.QUOTA_FREE_DAILY || '3';
process.env.AGENT_PROVIDER = 'rules';
require(path.join(ROOT, 'backend/src/app.js'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
const FREE = Number(process.env.AGENT_FREE_DAILY);
let token = '';
let failed = 0;

function check(label, ok, detail) {
  if (!ok) failed += 1;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const chat = (message) => call('POST', '/api/agent/chat', { message: message || '给我一点提示', kpId: 'kp1', stepIndex: 0 });
const quota = () => call('GET', '/api/agent/quota');

(async () => {
  const login = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456', role: 'student' });
  token = login.data.token;
  check('演示学生登录', !!token, 'status=' + login.status);

  // ---------- 1. 初始配额 ----------
  const first = (await quota()).data.data;
  check('免费版每天配额 = ' + FREE + ' 次', first.freeDaily === FREE && first.limit === FREE && first.remaining === FREE,
    'limit=' + first.limit + ' remaining=' + first.remaining);
  check('免费版不是会员 / 非不限次', first.vip === false && first.unlimited === false, 'plan=' + first.planName);
  check('配额里带星尘与星钻余额', typeof first.balance.dust === 'number' && typeof first.balance.gem === 'number',
    'dust=' + first.balance.dust + ' gem=' + first.balance.gem);
  check('兑换选项有星尘与星钻两种',
    first.redeem.length === 2 && first.redeem.map(r => r.id).sort().join(',') === 'dust,gem',
    first.redeem.map(r => r.label).join(' | '));

  // ---------- 2. 用完免费额度 ----------
  let last = null;
  for (let i = 0; i < FREE; i += 1) last = await chat('第 ' + (i + 1) + ' 次提问：给我一点提示');
  check('免费额度内 ' + FREE + ' 次对话全部成功', last.status === 200, 'status=' + last.status);
  check('对话成功后返回 quota 便于前端刷新角标', !!(last.data.data && last.data.data.quota),
    'remaining=' + (last.data.data.quota || {}).remaining);

  const used = (await quota()).data.data;
  check('用完 ' + FREE + ' 次后剩余为 0', used.used === FREE && used.remaining === 0,
    'used=' + used.used + ' remaining=' + used.remaining);

  const over = await chat('超出额度的一次提问');
  check('超出额度返回 429', over.status === 429, 'status=' + over.status);
  check('429 带 AGENT_QUOTA_EXHAUSTED 标记与配额快照',
    over.data.code === 'AGENT_QUOTA_EXHAUSTED' && over.data.quota && over.data.quota.remaining === 0,
    'code=' + over.data.code);
  check('429 文案提示可用星尘 / 星钻兑换',
    /星尘|星钻/.test(over.data.error || '') && /兑换/.test(over.data.error || ''), over.data.error);

  // ---------- 3. 新注册学生余额为 0 → 兑换被拒 ----------
  const reg = await call('POST', '/api/auth/register', {
    name: '配额测试生', phone: '13700000077', password: 'abc123', role: 'student', grade: '七年级'
  });
  const freshToken = reg.data.token
    || (await call('POST', '/api/auth/login', { account: '13700000077', password: 'abc123' })).data.token;
  const saved = token;
  token = freshToken;
  const freshQuota = (await quota()).data.data;
  check('新注册学生的星尘 / 星钻都是 0',
    freshQuota.balance.dust === 0 && freshQuota.balance.gem === 0, JSON.stringify(freshQuota.balance));
  check('新注册学生同样是每天 ' + FREE + ' 次', freshQuota.limit === FREE, 'limit=' + freshQuota.limit);
  const broke = await call('POST', '/api/agent/quota/redeem', { method: 'dust' });
  check('余额不足时兑换被拒，并提示怎么攒星尘',
    broke.status === 400 && /不够/.test(broke.data.error || '') && /星尘/.test(broke.data.error || ''),
    broke.data.error);
  token = saved;

  // ---------- 4. 星钻兑换加次 ----------
  const beforeGem = (await quota()).data.data;
  check('回到演示账号：今日额度仍是 ' + FREE + ' 次',
    beforeGem.limit === FREE && beforeGem.extra === 0, 'limit=' + beforeGem.limit + ' extra=' + beforeGem.extra);
  const gemBefore = beforeGem.balance.gem;
  const gemRedeem = await call('POST', '/api/agent/quota/redeem', { method: 'gem' });
  check('星钻兑换成功', gemRedeem.status === 200 && gemRedeem.data.data.redeemed === true, 'status=' + gemRedeem.status);
  const afterGem = gemRedeem.data.data.quota;
  check('兑换后今日额度 +' + gemRedeem.data.data.rounds + ' 次', afterGem.extra === 1 && afterGem.limit === FREE + 1,
    'extra=' + afterGem.extra + ' limit=' + afterGem.limit);
  check('兑换扣掉 2 星钻（2 星钻 = 1 次）', afterGem.balance.gem === gemBefore - 2,
    gemBefore + ' -> ' + afterGem.balance.gem);

  const again = await chat('兑换后又可以提问了');
  check('兑换后能继续对话', again.status === 200, 'status=' + again.status);

  // ---------- 5. 星尘兑换 ----------
  const dustBefore = afterGem.balance.dust;
  const dustRedeem = await call('POST', '/api/agent/quota/redeem', { method: 'dust' });
  check('星尘兑换成功并扣 50 星尘',
    dustRedeem.status === 200 && dustRedeem.data.data.quota.balance.dust === dustBefore - 50,
    dustBefore + ' -> ' + (dustRedeem.data.data.quota || {}).balance.dust);
  check('星尘兑换 +1 次', dustRedeem.data.data.quota.extra === 2, 'extra=' + dustRedeem.data.data.quota.extra);
  const book = dustRedeem.data.data.quota;
  check('剩余 = 免费 ' + FREE + ' + 兑换 2 - 已用 ' + (FREE + 1) + ' = 1',
    book.remaining === FREE + 2 - book.used, 'used=' + book.used + ' remaining=' + book.remaining);

  check('未知兑换方式被拒', (await call('POST', '/api/agent/quota/redeem', { method: 'gold' })).status === 400, '');

  // ---------- 6. 开通会员 → 不限次 ----------
  const order = await call('POST', '/api/vip/order', { planId: 'monthly', channel: 'wechat' });
  const pay = await call('POST', '/api/vip/pay', { orderNo: order.data.data.order.orderNo });
  check('演示账号开单即支付成功', pay.status === 200 && pay.data.data.paid === true, 'status=' + pay.status);

  const vipQuota = (await quota()).data.data;
  check('会员配额为不限次', vipQuota.vip === true && vipQuota.unlimited === true && vipQuota.remaining === null,
    'plan=' + vipQuota.planName + ' remaining=' + vipQuota.remaining);

  let vipOk = true;
  for (let i = 0; i < 15; i += 1) {
    const r = await chat('会员第 ' + (i + 1) + ' 次提问（远超免费额度）');
    if (r.status !== 200) { vipOk = false; break; }
  }
  check('会员连续 15 次对话都不被拦（远超免费额度）', vipOk, '');

  const vipRedeem = await call('POST', '/api/agent/quota/redeem', { method: 'dust' });
  check('会员无需兑换，兑换接口被拒', vipRedeem.status === 400 && /领航员/.test(vipRedeem.data.error || ''),
    vipRedeem.data.error);

  // ---------- 7. 方案里的 AI 配额说明 ----------
  const plans = (await call('GET', '/api/vip/plans')).data.data.plans;
  const freePlan = plans.find(p => p.id === 'free');
  const monthPlan = plans.find(p => p.id === 'monthly');
  check('免费方案写明每天 10 次 AI 对话',
    !!freePlan && /每天 10 次/.test(freePlan.quota || '')
    && freePlan.features.some(f => /10 次/.test(f.text) && /星尘|星钻/.test(f.text)),
    freePlan && freePlan.quota);
  check('会员方案写明不限次', !!monthPlan && /不限次/.test(monthPlan.quota || ''), monthPlan && monthPlan.quota);

  console.log('\nRESULT: ' + (failed ? failed + ' failed' : 'all passed'));
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('CRASH', err); process.exit(1); });