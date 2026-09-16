const path = require('path');
process.env.PORT = '3199';
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'backend/src/app.js'));

const BASE = 'http://127.0.0.1:3199';
let token = '';

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = { parseError: String(e) }; }
  return { status: res.status, data };
}

(async () => {
  const out = [];
  const log = (label, r) => out.push(label + ' -> ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 300));

  log('health', await call('GET', '/api/health'));
  log('login-bad', await call('POST', '/api/auth/login', { account: '13800000001', password: 'wrong' }));
  const login = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456', role: 'student' });
  log('login-student', login);
  token = login.data.token;
  log('me', await call('GET', '/api/auth/me'));
  log('dashboard', await call('GET', '/api/dashboard'));
  log('lessons', await call('GET', '/api/learning/lessons'));
  const lesson = await call('GET', '/api/learning/lessons/kp1');
  out.push('lesson kp1 steps=' + lesson.data.data.steps.length + ' leaksAnswer=' + JSON.stringify(lesson.data.data.steps[0].checkpoint).includes('correct'));
  log('checkpoint-right', await call('POST', '/api/learning/checkpoint', { lessonId: 'kp1', stepId: 'kp1-s1', answer: 1 }));
  log('checkpoint-wrong', await call('POST', '/api/learning/checkpoint', { lessonId: 'kp1', stepId: 'kp1-s1', answer: 0, hintUsed: 0 }));
  log('progress', await call('POST', '/api/learning/progress', { knowledgePointId: 'kp1', stepIndex: 1, stepCount: 5, hintsUsed: 1 }));
  log('gamification', await call('GET', '/api/gamification/status'));
  log('checkin', await call('POST', '/api/gamification/checkin', {}));
  log('quiz-stats', await call('GET', '/api/quiz/stats'));
  log('quiz-submit', await call('POST', '/api/quiz/submit', { questionId: 'q1', answer: 1 }));

  // 学习报告（原家长端功能，已并入学生端，用学生自己的 token 访问）
  const overview = await call('GET', '/api/report/overview');
  const d = overview.data.data;
  out.push('report overview -> ' + overview.status + ' dateLabel=' + d.dateLabel + ' calendar=' + d.calendar.length + ' problems=' + d.problems.length + ' suggestions=' + d.suggestions.length + ' today.minutes=' + d.today.minutes);
  log('report-mastery', await call('GET', '/api/report/mastery'));
  log('report-session', await call('GET', '/api/report/session/s4'));
  log('report-calendar', await call('GET', '/api/report/calendar?days=7'));
  log('report-settings-get', await call('GET', '/api/report/settings'));
  log('report-settings-put', await call('PUT', '/api/report/settings', { quietHours: { enabled: false, start: '22:00', end: '06:30' } }));

  // 个人资料 / 头像（GET + PATCH /api/auth/profile）
  log('profile-get', await call('GET', '/api/auth/profile'));
  const pSet = await call('PATCH', '/api/auth/profile', { avatar: '🚀' });
  const pEmpty = await call('PATCH', '/api/auth/profile', { avatar: '   ' });
  const pBadImg = await call('PATCH', '/api/auth/profile', { avatar: 'data:image/png;base64,###' });
  const pImg = await call('PATCH', '/api/auth/profile', { avatar: 'data:image/png;base64,iVBORw0KGgo=' });
  const pLongNick = await call('PATCH', '/api/auth/profile', { nickname: '一二三四五六七八九十一二三四五六七' });
  const savedToken = token;
  token = '';
  const pAnon = await call('PATCH', '/api/auth/profile', { avatar: '🦊' });
  token = savedToken;
  const pRestore = await call('PATCH', '/api/auth/profile', { avatar: '🧑‍🎓' });

  token = '';
  log('register', await call('POST', '/api/auth/register', { name: '王小雨', phone: '13700000009', password: 'abc123', confirmPassword: 'abc123', role: 'student', grade: '七年级' }));
  log('register-dup', await call('POST', '/api/auth/register', { name: '王小雨', phone: '13700000009', password: 'abc123', role: 'student' }));
  log('send-code', await call('POST', '/api/auth/send-code', { phone: '13700000009' }));
  log('api-404', await call('GET', '/api/nope'));

  // 会员领航舱（VIP）：方案 / 随机付款码 / 演示账号直接付款成功
  token = savedToken; // 上面测未登录注册时清空了 token，这里先恢复登录态
  const plans = await call('GET', '/api/vip/plans');
  const planIds = plans.data.data.plans.map(item => item.id).join(',');
  const order = await call('POST', '/api/vip/order', { planId: 'yearly', channel: 'wechat' });
  const order2 = await call('POST', '/api/vip/order', { planId: 'yearly', channel: 'wechat' });
  const pay = await call('POST', '/api/vip/pay', { orderNo: order.data.data.order.orderNo });
  const payAgain = await call('POST', '/api/vip/pay', { orderNo: order.data.data.order.orderNo });
  const badPlan = await call('POST', '/api/vip/order', { planId: 'free' });
  const badOrder = await call('POST', '/api/vip/pay', { orderNo: 'QW0000000000000000' });
  token = '';
  const vipAnon = await call('GET', '/api/vip/status');
  token = savedToken;
  const vipStatus = await call('GET', '/api/vip/status');
  out.push('vip plans=' + planIds + ' channels=' + plans.data.data.channels.length);
  out.push('vip order amount=' + order.data.data.order.amount + ' tail=' + order.data.data.order.codeTail + ' code=' + String(order.data.data.order.code).slice(0, 26) + '...');
  out.push('vip receipt=' + JSON.stringify(pay.data.data.receipt));

  // 断言：任何一条不过就以非 0 退出，避免「静默绿」
  const checks = [
    ['头像可选中并回读', pSet.status === 200 && pSet.data.data.user.avatar === '🚀' && pSet.data.data.presets.length === 16],
    ['空头像被拒', pEmpty.status === 400],
    ['非法图片数据被拒', pBadImg.status === 400],
    ['合法 data URL 图片可保存', pImg.status === 200 && String(pImg.data.data.user.avatar).indexOf('data:image/png') === 0],
    ['超长昵称被拒', pLongNick.status === 400],
    ['未登录改头像被拒', pAnon.status === 401],
    ['头像可还原', pRestore.status === 200 && pRestore.data.data.user.avatar === '🧑‍🎓'],
    ['VIP 三档方案齐备', plans.status === 200 && planIds === 'free,monthly,yearly' && plans.data.data.channels.length === 3],
    ['VIP 下单返回随机付款码', order.status === 201 && /^QWPAY:wechat:QW\d{8}[0-9A-F]{8}:[0-9A-F]{24}$/.test(order.data.data.order.code)],
    ['VIP 两次下单付款码不同', order2.data.data.order.code !== order.data.data.order.code],
    ['VIP 演示账号付款直接成功', pay.status === 200 && pay.data.data.paid === true && pay.data.data.instant === true && pay.data.data.membership.active === true],
    ['VIP 回执手机号已打码', /^\d{3}\*{4}\d{4}$/.test(pay.data.data.receipt.account)],
    ['VIP 开通后状态为有效会员', vipStatus.data.data.membership.active === true && vipStatus.data.data.membership.planId === 'yearly'],
    ['VIP 重复支付被拒', payAgain.status === 400],
    ['VIP 免费方案不可下单', badPlan.status === 400],
    ['VIP 无效订单被拒', badOrder.status === 404],
    ['VIP 未登录查状态被拒', vipAnon.status === 401]
  ];
  checks.forEach(item => out.push((item[1] ? 'PASS ' : 'FAIL ') + item[0]));

  console.log(out.join('\n'));
  const failed = checks.filter(item => !item[1]).length;
  console.log('\nRESULT: ' + (checks.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });