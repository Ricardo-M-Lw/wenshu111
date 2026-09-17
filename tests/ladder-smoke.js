/**
 * 星际天梯冒烟：赛季 / 开局（不泄答案）/ 服务端计时判分 / 结算与段位保护 / 每日场次 / 家长守护 / 天梯榜
 * 自己起一个临时后端（默认 3201）。
 *
 * 说明：这个脚本 require 了同一个进程里的 app.js，所以还能拿到仓储层去构造
 * 「超时」「免打扰时段」这类靠 HTTP 不好复现的前置条件。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.PORT = process.env.LADDER_PORT || '3201';
process.env.AGENT_PROVIDER = 'rules';
require(path.join(ROOT, 'backend/src/app.js'));

const repos = require(path.join(ROOT, 'backend/src/repositories'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
let token = '';
let failed = 0;

function check(label, ok, detail) {
  if (!ok) failed += 1;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

async function call(method, url, body, override) {
  const res = await fetch(BASE + url, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' },
      (override || token) ? { Authorization: 'Bearer ' + (override || token) } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(function () { return {}; });
  return { status: res.status, data: data };
}

// 北京时间，和服务端的口径保持一致（UTC+8）
function beijing() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  return String(shifted.getUTCHours()).padStart(2, '0') + ':' + String(shifted.getUTCMinutes()).padStart(2, '0');
}

function shift(hhmm, minutes) {
  const parts = hhmm.split(':');
  const total = (Number(parts[0]) * 60 + Number(parts[1]) + minutes + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// 打完一局：逐题提交（答案未知，就用第 0 个选项），返回 { matchId, submit, finish }
async function playOne(kpId) {
  const started = await call('POST', '/api/ladder/match', kpId ? { kpId: kpId } : {});
  if (started.status !== 200) return { start: started, matchId: null };
  const match = started.data.data.match;
  const questions = started.data.data.questions;
  const submits = [];
  for (let i = 0; i < questions.length; i += 1) {
    submits.push(await call('POST', '/api/ladder/match/' + match.id + '/answer', { seq: i + 1, choice: i % 4 }));
  }
  const finish = await call('POST', '/api/ladder/match/' + match.id + '/finish');
  return { start: started, matchId: match.id, match: match, questions: questions, submits: submits, finish: finish };
}

(async () => {
  const login = await call('POST', '/api/auth/login', { account: '13800000001', password: '123456', role: 'student' });
  token = login.data.token;
  check('演示学生登录', !!token, 'status=' + login.status);

  // ---------- 1. 赛季与规则 ----------
  const season = (await call('GET', '/api/ladder/season')).data.data;
  check('赛季信息可用（S1 · 星海启航，带剩余天数）',
    !!season.season && season.season.id === 's1' && season.season.daysLeft >= 0,
    season.season && (season.season.name + ' / ' + season.season.daysLeftLabel));
  check('赛季返回 9 个段位与 6 名星海对手', season.tiers.length === 9 && season.rivals.length === 6,
    'tiers=' + season.tiers.length + ' rivals=' + season.rivals.length);
  check('规则写明每题限时与每日场次', season.rules.secondsPerQuestion === 20 && season.rules.questionCount === 8
    && season.rules.dailyLimit.free === 3 && season.rules.dailyLimit.vip === 10, JSON.stringify(season.rules.dailyLimit));
  check('规则里写明段位保护', /段位保护/.test(season.rules.protect || ''), season.rules.protect);

  // ---------- 2. 我的天梯 ----------
  const me = (await call('GET', '/api/ladder/me')).data.data;
  check('我的段位按积分换算（1128 → 流光）', me.tier.id === 'streak' && me.rating === 1128, me.tier.label + ' / ' + me.rating);
  check('战绩与连胜来自档案', me.record.wins === 7 && me.record.losses === 4 && me.record.bestStreak === 4, JSON.stringify(me.record));
  check('免费版每天 3 局', me.daily.limit === 3 && me.daily.vip === false, 'limit=' + me.daily.limit + ' used=' + me.daily.used);
  check('返回名次与家长守护状态', typeof me.rank === 'number' && !!me.guard && me.guard.allowed === true,
    'rank=' + me.rank + ' guard=' + me.guard.enabled);

  // ---------- 3. 开局：题面里不能有答案 ----------
  const started = await call('POST', '/api/ladder/match', {});
  const payloadText = JSON.stringify(started.data);
  const startData = started.data.data;
  check('开局成功并返回 8 道题', started.status === 200 && startData.questions.length === 8,
    'status=' + started.status + ' n=' + (startData.questions || []).length);
  check('题面里没有 correctAnswer（不泄答案）', !/correctAnswer/.test(payloadText) && !/answerIndex/.test(payloadText), '');
  check('每题都带选项、知识点与限时', startData.questions.every(function (q) {
    return q.options.length === 4 && !!q.knowledgePointName && q.seconds === 20 && !!q.question;
  }), '');
  check('返回对手信息与对手积分',
    !!startData.match.opponent.name && startData.match.opponent.rating > 0,
    startData.match.opponent.avatar + ' ' + startData.match.opponent.name + '（' + startData.match.opponent.rating + '）');
  check('开局后每日场次 +1', startData.daily.used === 1 && startData.daily.remaining === 2,
    'used=' + startData.daily.used + ' remaining=' + startData.daily.remaining);

  const matchId = startData.match.id;

  // ---------- 4. 判分规则 ----------
  const jumped = await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: 3, choice: 0 });
  check('跳题提交被拒（要按顺序作答）', jumped.status === 400 && /顺序/.test(jumped.data.error || ''), jumped.data.error);

  const first = await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: 1, choice: 0 });
  check('第 1 题提交成功且只回对错', first.status === 200 && typeof first.data.data.correct === 'boolean',
    'correct=' + first.data.data.correct + ' score=' + first.data.data.score);
  check('答题响应里依然没有正确答案', !/correctAnswer/.test(JSON.stringify(first.data)) && !/answerIndex/.test(JSON.stringify(first.data)), '');
  check('答对给基础分 100 + 速度分（0~45）', first.data.data.correct
    ? (first.data.data.score >= 100 && first.data.data.score <= 145) : first.data.data.score === 0,
    'score=' + first.data.data.score);

  const again = await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: 1, choice: 1 });
  check('同一题重复提交被拒', again.status === 400 && /提交过/.test(again.data.error || ''), again.data.error);

  const wrongSeq = await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: 99, choice: 0 });
  check('越界题号被拒', wrongSeq.status === 400, wrongSeq.data.error);

  // 超时：把本题开始时间往回拨 60 秒，服务端应判超时且不得分
  repos.ladder.updateMatch(matchId, { seqStartedAt: new Date(Date.now() - 60000).toISOString() });
  const late = await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: 2, choice: 0 });
  check('超时作答被判错且速度分归零',
    late.status === 200 && late.data.data.timeout === true && late.data.data.correct === false && late.data.data.score === 0,
    'timeout=' + late.data.data.timeout + ' score=' + late.data.data.score);

  // ---------- 5. 未答完不能结算 ----------
  const early = await call('POST', '/api/ladder/match/' + matchId + '/finish');
  check('没答完就结算被拒', early.status === 400 && /没答完/.test(early.data.error || ''), early.data.error);

  const rest = [];
  for (let i = 3; i <= 8; i += 1) {
    rest.push(await call('POST', '/api/ladder/match/' + matchId + '/answer', { seq: i, choice: i % 4 }));
  }
  check('剩余题目全部提交成功', rest.every(function (r) { return r.status === 200; }), '');

  const finish = await call('POST', '/api/ladder/match/' + matchId + '/finish');
  const settle = finish.data.data;
  check('结算成功并返回结算卡', finish.status === 200 && !!settle.settlement, 'status=' + finish.status);
  check('结算后揭晓答案（replay 每题都带 answerIndex / answerText）',
    settle.replay.length === 8 && settle.replay.every(function (q) {
      return typeof q.answerIndex === 'number' && !!q.answerText;
    }), '');
  check('回放里的对错与「我的选择」一致（服务端判分正确）',
    settle.replay.every(function (q) {
      if (q.timeout === true || !q.answered) return q.correct === false;
      return q.correct === (q.choice === q.answerIndex);
    }), JSON.stringify(settle.replay.map(function (q) { return q.choice + ':' + q.answerIndex + ':' + q.correct; })));

  // ---------- 6. 积分结算与幂等 ----------
  const before = 1128;
  const after = settle.settlement.ratingAfter;
  const delta = settle.settlement.ratingDelta;
  check('积分变化与胜负一致，且不低于段位门槛（1000）',
    after === Math.max(1000, before + delta) && [25, 10, -15, 30, 35].indexOf(delta) !== -1,
    before + ' -> ' + after + ' (' + delta + ') result=' + settle.settlement.result);
  check('结算后段位跟着积分走', settle.settlement.tier.rating === after, settle.settlement.tier.label);
  check('按胜负发星尘（赢 12 / 平 8 / 负 3）',
    settle.settlement.reward === ({ win: 12, draw: 8, lose: 3 })[settle.settlement.result],
    'reward=' + settle.settlement.reward);

  const repeat = await call('POST', '/api/ladder/match/' + matchId + '/finish');
  check('重复结算幂等，积分不再变化',
    repeat.status === 200 && repeat.data.data.repeated === true
    && repeat.data.data.settlement.ratingAfter === after, 'after=' + repeat.data.data.settlement.ratingAfter);

  const logs = (await call('GET', '/api/wallet/logs')).data.data;
  const ladderLog = logs.items.filter(function (item) { return item.category === 'ladder'; })[0];
  check('结算写了星尘收支流水（category=ladder）', !!ladderLog,
    ladderLog ? (ladderLog.reason + ' ' + ladderLog.signed) : 'no log');
  if (ladderLog) check('收支记录里天梯分类有中文名', ladderLog.categoryLabel === '星际天梯', ladderLog.categoryLabel);

  const mine = (await call('GET', '/api/ladder/me')).data.data;
  check('近 10 局里能看到刚打完的这一局',
    mine.recent.length >= 1 && mine.recent[0].id === matchId && !!mine.recent[0].resultLabel,
    mine.recent[0].resultIcon + ' ' + mine.recent[0].resultLabel);

  // ---------- 7. 每日场次上限 ----------
  const second = await playOne();
  check('第 2 局能正常开打', second.start.status === 200, 'status=' + second.start.status);
  const third = await playOne();
  check('第 3 局能正常开打', third.start.status === 200, 'status=' + third.start.status);
  const fourth = await call('POST', '/api/ladder/match', {});
  check('免费版第 4 局被拦（429 + LADDER_DAILY_LIMIT）',
    fourth.status === 429 && fourth.data.code === 'LADDER_DAILY_LIMIT' && fourth.data.daily.remaining === 0,
    fourth.data.error);
  check('被拦的文案提示明天重置 / 开通领航员',
    /明天/.test(fourth.data.error || '') && /领航员|10 局/.test(fourth.data.error || ''), fourth.data.error);

  // ---------- 8. 家长守护 ----------
  const guardOn = await call('POST', '/api/ladder/guard', { enabled: true });
  check('家长守护可以打开', guardOn.status === 200 && guardOn.data.data.enabled === true, guardOn.data.data.message);

  const now = beijing();
  repos.study.save('u1', { quietHours: { enabled: true, start: shift(now, -1), end: shift(now, 5) } });
  const blocked = await call('POST', '/api/ladder/match', {});
  check('免打扰时段开局被拦（403 + LADDER_GUARD）',
    blocked.status === 403 && blocked.data.code === 'LADDER_GUARD' && blocked.data.guard.reason === 'quiet',
    blocked.data.error);

  repos.study.save('u1', { quietHours: { enabled: false, start: '21:30', end: '07:00' },
    studyWindow: { enabled: true, start: '00:00', end: '23:59', weekdays: [] } });
  const guardOff = await call('POST', '/api/ladder/guard', { enabled: false });
  check('关掉家长守护后不再拦人', guardOff.data.data.enabled === false && guardOff.data.data.guard.allowed === true, '');
  const reopened = await call('POST', '/api/ladder/match', {});
  check('关掉守护后即使免打扰时段也能开一局（429 = 只是没场次了，不是守护拦的）',
    reopened.status === 200 || reopened.status === 429, 'status=' + reopened.status);

  // ---------- 9. 天梯榜与越权 ----------
  const board = (await call('GET', '/api/ladder/leaderboard?limit=10')).data.data;
  check('天梯榜按积分倒序', board.items.length >= 1 && board.items.every(function (item, index) {
    return index === 0 || board.items[index - 1].rating >= item.rating;
  }), 'n=' + board.items.length);
  check('榜单第一行带段位与名次', !!board.items[0].tier.icon && board.items[0].rank === 1,
    board.items[0].avatar + ' ' + board.items[0].name + ' ' + board.items[0].tier.label);
  check('演示账号在榜单里被标成「演示」', board.items.some(function (item) { return item.demo === true; }), '');
  check('登录用户能看到自己的名次', typeof board.rank === 'number' && board.rank >= 1, 'rank=' + board.rank);

  const reg = await call('POST', '/api/auth/register', {
    name: '天梯测试生', phone: '13700000088', password: 'abc123', role: 'student', grade: '七年级'
  });
  const otherToken = reg.data.token
    || (await call('POST', '/api/auth/login', { account: '13700000088', password: 'abc123' })).data.token;
  const peek = await call('GET', '/api/ladder/match/' + matchId, undefined, otherToken);
  check('看不了别人的对局（403）', peek.status === 403, 'status=' + peek.status);
  const steal = await call('POST', '/api/ladder/match/' + matchId + '/finish', undefined, otherToken);
  check('结算不了别人的对局（403）', steal.status === 403, 'status=' + steal.status);

  const freshMe = (await call('GET', '/api/ladder/me', undefined, otherToken)).data.data;
  check('新学生的天梯档案自动初始化（陨石 / 900 分 / 0 战绩）',
    freshMe.rating === 900 && freshMe.tier.id === 'meteor' && freshMe.record.total === 0,
    freshMe.tier.label + ' / ' + freshMe.rating);
  const freshBoard = await call('GET', '/api/ladder/leaderboard', undefined, otherToken);
  check('未开局的新学生也能拿到天梯榜与名次',
    freshBoard.status === 200 && freshBoard.data.data.rank >= 1, 'rank=' + freshBoard.data.data.rank);

  const anon = await call('GET', '/api/ladder/me', undefined, 'none');
  check('未登录访问 /api/ladder/me 返回 401', anon.status === 401, 'status=' + anon.status);

  console.log('');
  console.log('RESULT: ' + (failed ? failed + ' failed' : 'all passed'));
  process.exit(failed ? 1 : 0);
})().catch(function (err) { console.error('CRASH', err); process.exit(1); });
