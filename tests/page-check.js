const BASE = process.env.BASE || 'http://localhost:3000';
let token = '';
let pass = 0;
const fails = [];

async function head(url) {
  const res = await fetch(BASE + url);
  return { status: res.status, text: await res.text() };
}

function check(label, ok, detail) {
  if (ok) { pass += 1; } else { fails.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: '13800000001', password: '123456', role: 'student' })
  });
  token = (await login.json()).token;

  const pages = [
    ['/', ['sq-landing-stage', 'sq-cta', 'auth.js', 'space.css']],
    ['/pages/auth/login.html', ['loginForm', 'auth-page.js', 'space.css', 'qw-deep']],
    ['/pages/auth/register.html', ['registerForm', 'auth-page.js']],
    ['/pages/student/home.html', ['homeApp', 'app.js', 'auth.js', 'nav.js', 'space.css', 'space.js']],
    ['/pages/student/classroom.html', ['classroomApp', 'classroom.js', 'board.js', 'agent.js', 'auth.js']],
    ['/pages/student/agent.html', ['agentApp', 'agent-page.js', 'agent.js', 'auth.js', 'nav.js']],
    ['/pages/student/planet.html', ['planetApp', 'app.js', 'auth.js']],
    ['/pages/student/quiz.html', ['quizApp', 'app.js', 'auth.js']],
    ['/pages/student/level.html', ['levelApp', 'app.js', 'auth.js']],
    ['/pages/student/checkin.html', ['checkinApp', 'app.js', 'auth.js']],
    ['/pages/student/badge.html', ['badgeApp', 'app.js', 'auth.js']],
    ['/pages/student/result.html', ['resultApp', 'app.js', 'auth.js']],
    ['/pages/student/correction.html', ['correctionApp', 'correction.js', 'auth.js']],
    ['/pages/student/report.html', ['reportApp', 'report.js', 'auth.js', 'nav.js']],
    ['/pages/student/vip.html', ['vipApp', 'vip.js', 'auth.js', 'nav.js', 'space.css', 'space.js']],
    ['/pages/student/ladder.html', ['ladderApp', 'ladder.js', 'auth.js', 'nav.js', 'space.css', 'ladder.css']],
    ['/pages/admin/console.html', ['adminApp', 'admin.js', 'admin.css', 'auth.js', 'space.css']],
  ];

  for (const [url, needles] of pages) {
    const res = await head(url);
    const missing = needles.filter(n => res.text.indexOf(n) === -1);
    check('page ' + url, res.status === 200 && !missing.length,
      'status=' + res.status + (missing.length ? ' missing=' + missing.join(',') : ''));
  }

  const assets = [
    '/src/styles/common.css', '/src/styles/space.css', '/src/styles/admin.css',
    '/src/scripts/admin.js',
    '/src/scripts/space.js',
    '/assets/images/mascot/rocket.svg',
    '/assets/images/mascot/xiaowen/idle.webp',
    '/assets/images/mascot/xiaowen/idle.png',
    '/assets/images/mascot/xiaowen/thinking.webp',
    '/assets/images/mascot/xiaowen/celebrate.webp',
    '/assets/images/mascot/xiaowen/proud.png',
    '/src/scripts/xiaowen.js',
    '/src/scripts/auth.js', '/src/scripts/auth-page.js', '/src/scripts/nav.js',
    '/src/scripts/app.js', '/src/scripts/board.js', '/src/scripts/agent.js',
    '/src/scripts/agent-page.js', '/src/scripts/classroom.js', '/src/scripts/correction.js',
    '/src/scripts/report.js',
    '/src/scripts/vip.js',
    '/src/scripts/ladder.js',
    '/src/styles/ladder.css',
    '/assets/images/knowledge/kp1-function.svg',
    '/assets/images/knowledge/kp2-triangle.svg',
    '/assets/images/knowledge/kp3-pythagoras.svg'
  ];
  for (const url of assets) {
    const res = await head(url);
    check('asset ' + url, res.status === 200, 'status=' + res.status + ' bytes=' + res.text.length);
  }

  const auth = { Authorization: 'Bearer ' + token };
  const apis = [
    ['/api/dashboard', d => d.knowledgePoints.length === 3 && !!d.user],
    ['/api/learning/lessons', d => d.length === 3 && d[0].stepCount === 5],
    ['/api/learning/lessons/kp3', d => d.steps.length === 5 && !JSON.stringify(d).includes('correctText')],
    ['/api/learning/error-book', d => Array.isArray(d.items)],
    ['/api/gamification/status', d => !!d.level],
    ['/api/quiz/questions?knowledgePointId=kp1', d => d.length > 0],
    ['/api/agent/personas', d => d.length === 3],
    ['/api/agent/session?kpId=kp1', d => Array.isArray(d.personas)],
    ['/api/agent/suggest?kpId=kp3', d => !!d.title && !!d.action]
  ];
  for (const [url, ok] of apis) {
    const res = await fetch(BASE + url, { headers: auth });
    const body = await res.json();
    let good = res.status === 200;
    try { good = good && !!ok(body.data); } catch (e) { good = false; }
    check('api ' + url, good, 'status=' + res.status);
  }

  // 星际天梯：赛季 / 我的段位 / 天梯榜（只读，开局与结算在 ladder-smoke.js 里单独验证）
  const ladderApis = [
    ['/api/ladder/season', d => d.season.id === 's1' && d.tiers.length === 9 && d.rules.questionCount === 8],
    // 每日场次按会员态取值：免费 3 局 / 领航员 10 局（不写死 3，避免依赖「这台机器还没开过会员」）
    ['/api/ladder/me', d => d.tier.id === 'streak' && d.daily.limit === (d.daily.vip ? 10 : 3) && Array.isArray(d.recent)],
    ['/api/ladder/leaderboard', d => d.items.length >= 1 && d.items[0].rank === 1]
  ];
  for (const [url, ok] of ladderApis) {
    const res = await fetch(BASE + url, { headers: auth });
    const body = await res.json();
    let good = res.status === 200;
    try { good = good && !!ok(body.data); } catch (e) { good = false; }
    check('api ' + url, good, 'status=' + res.status);
  }

  // 学习报告接口（原家长端功能，已并入学生端，用学生自己的 token 访问）
  const reportApis = [
    ['/api/report/overview', d => d.calendar.length === 7 && !!d.dateLabel && !!d.today && !!d.summary && d.mastery.length === 3],
    ['/api/report/mastery', d => d.details.length === 3 && d.details[0].steps.length === 5 && !!d.errorStats],
    ['/api/report/sessions', d => d.sessions.length > 0 && !!d.summary && !!d.dateLabel && !!d.sessions[0].dateLabel],
    ['/api/report/session/s4', d => d.steps.length === 5 && !!d.knowledgePoint && !JSON.stringify(d).includes('correctText')],
    ['/api/report/settings', d => !!d.settings.studyWindow && !!d.settings.reminders && !!d.settings.privacy]
  ];
  for (const [url, ok] of reportApis) {
    const res = await fetch(BASE + url, { headers: auth });
    const body = await res.json();
    let good = res.status === 200;
    try { good = good && !!ok(body.data); } catch (e) { good = false; }
    check('api ' + url, good, 'status=' + res.status);
  }

  // 会员领航舱：方案 / 状态 / 下单（随机付款码）/ 支付开通
  const vipPlans = await (await fetch(BASE + '/api/vip/plans')).json();
  check('vip plans', vipPlans.data.plans.length === 3 && vipPlans.data.channels.length === 3,
    'plans=' + vipPlans.data.plans.length + ' channels=' + vipPlans.data.channels.length);
  const vipStatus = await (await fetch(BASE + '/api/vip/status', { headers: auth })).json();
  check('vip status', !!vipStatus.data.membership && typeof vipStatus.data.membership.active === 'boolean',
    'plan=' + vipStatus.data.membership.planId);
  const vipOrderRes = await fetch(BASE + '/api/vip/order', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ planId: 'yearly', channel: 'wechat' })
  });
  const vipOrder = (await vipOrderRes.json()).data;
  check('vip order 生成随机付款码', vipOrderRes.status === 201 && /^QWPAY:wechat:QW\d{8}[0-9A-F]{8}:[0-9A-F]{24}$/.test(vipOrder.order.code),
    'code=' + String(vipOrder.order.code).slice(0, 24) + '… amount=' + vipOrder.order.amount);
  const vipOrder2 = await (await fetch(BASE + '/api/vip/order', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ planId: 'yearly', channel: 'wechat' })
  })).json();
  check('vip 付款码每次随机', vipOrder2.data.order.code !== vipOrder.order.code, '');
  const vipPayRes = await fetch(BASE + '/api/vip/pay', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ orderNo: vipOrder.order.orderNo })
  });
  const vipPay = (await vipPayRes.json()).data;
  check('vip 演示账号支付直接成功', vipPayRes.status === 200 && vipPay.paid === true && vipPay.instant === true && vipPay.membership.active === true,
    'plan=' + vipPay.membership.planName + ' period=' + vipPay.receipt.period);
  check('vip 开通回执掩码手机号', /^\d{3}\*{4}\d{4}$/.test(vipPay.receipt.account), vipPay.receipt.account);
  const vipRepeat = await fetch(BASE + '/api/vip/pay', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ orderNo: vipOrder.order.orderNo })
  });
  check('vip 重复支付被拒', vipRepeat.status === 400, 'status=' + vipRepeat.status);
  const vipFree = await fetch(BASE + '/api/vip/order', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ planId: 'free' })
  });
  check('vip 免费方案不可下单', vipFree.status === 400, 'status=' + vipFree.status);

  // 不泄答案：讲题脚本与题目接口都不允许出现答案字段
  const lesson = await (await fetch(BASE + '/api/learning/lessons/kp1', { headers: auth })).text();
  check('no answer leak in lesson payload', !/correctText|"correct"\s*:/.test(lesson), '');
  const quiz = await (await fetch(BASE + '/api/quiz/questions', { headers: auth })).text();
  check('no answer leak in quiz payload', !/correctAnswer/.test(quiz), '');

  const book = await (await fetch(BASE + '/api/learning/error-book', { headers: auth })).json();
  console.log('error-book: totalWrong=' + book.data.totalWrong + ' items=' + book.data.items.map(i => i.name + '×' + i.count).join(','));

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(err => { console.error('CRASH', err); process.exit(1); });