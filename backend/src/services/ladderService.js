// 服务层：星际天梯（异步 1v1 排位赛）
//
// 为什么是「异步」天梯：
//   · 学生随时能打，不需要两个人同时在线，也就不用引入 WebSocket 和房间服务；
//   · 对手由「星海对手档案 + 本局种子」在服务端预演出来，双方同题、同一套判分标准；
//   · 全程不调用大模型 —— 边际成本为 0，也就不存在被诱导泄题的可能。
//
// 四条硬规则（要改产品口径，改这里就够）：
//   1. 答案只在服务端：题目连正确答案一起写进 qw_ladder_match.questions，
//      任何接口下发前统一走 questionView() 剥掉 correctAnswer；对局结束后才在「回放」里揭晓。
//   2. 计时在服务端：每题用 match.seq_started_at 计时，客户端改表也拿不到速度分。
//   3. 每局只结一次：status 从 playing 变成 done 之后，重复调用结算接口直接回放上一次的结果。
//   4. 不泄题给下一位：出题种子每局随机，同一学生连打两局拿到的题不会一样。
//
// 差异化：家长守护（profile.guard = 1）打开后，免打扰时段与非学习时段一律不能开局，
// 直接复用「学习报告 → 提醒设置」里的 studyWindow / quietHours，家长不用再配一遍。

const crypto = require('crypto');
const repos = require('../repositories');
const ladderBank = require('../models/ladderBank');
const walletService = require('./walletService');
const { ok, fail } = require('../utils/reply');

const RULES = ladderBank.RULES;

// 每日场次：免费版每天 3 局，领航员每天 10 局（够用又不至于一坐一晚上）
const DAILY_LIMIT = { free: 3, vip: 10 };
// 网络抖动宽限：超时判定再给 2.5 秒，避免因为一次卡顿判错
const GRACE_MS = 2500;
// 每局星尘奖励：赢多输少，但输也有，孩子不会因为连败就不敢打
const REWARD = { win: 12, draw: 8, lose: 3 };
const RESULT_LABEL = { win: '胜利', lose: '惜败', draw: '平局' };
const RESULT_ICON = { win: '🏆', lose: '💫', draw: '🤝' };

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isDemoUser(user) { return !!user && String(user.phone) === '13800000001'; }

function weekdayLabel(day) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(day) % 7];
}

function dayLabel(dateText) {
  const parts = String(dateText || '').split('-');
  if (parts.length !== 3) return dateText || '';
  return Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日';
}

// 北京时间：容器 / 服务器时区不可信，统一按 UTC+8 推算
function beijing() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    hhmm: String(shifted.getUTCHours()).padStart(2, '0') + ':' + String(shifted.getUTCMinutes()).padStart(2, '0'),
    weekday: shifted.getUTCDay()
  };
}

// 时间段判断，支持跨零点（21:30 ~ 07:00）
function inRange(hhmm, start, end) {
  if (!start || !end) return false;
  if (start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

function newId(prefix) {
  return String(prefix || 'lm') + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// 段位 / 赛季
// ---------------------------------------------------------------------------

function tierCard(rating) {
  const tier = ladderBank.tierOf(rating);
  return {
    id: tier.id,
    name: tier.name,
    icon: tier.icon,
    color: tier.color,
    min: tier.min,
    index: tier.index,
    next: tier.next,
    progress: tier.progress,
    rating: rating,
    total: ladderBank.TIERS.length,
    label: tier.icon + ' ' + tier.name
  };
}

// 难度随段位上升：陨石 / 流光 / 新星打 1 级，行星 / 恒星 / 星团打 2 级，星云往上打 3 级
function levelFor(rating) {
  const index = ladderBank.tierOf(rating).index;
  return Math.min(3, 1 + Math.floor(index / 3));
}

function seasonView(season) {
  if (!season) return null;
  const end = new Date(String(season.endAt) + 'T23:59:59+08:00');
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  return {
    id: season.id,
    name: season.name,
    status: season.status,
    startAt: season.startAt,
    endAt: season.endAt,
    endLabel: dayLabel(season.endAt),
    daysLeft: daysLeft,
    daysLeftLabel: daysLeft > 0 ? ('赛季还剩 ' + daysLeft + ' 天') : '本赛季即将收官'
  };
}

function currentSeason() { return repos.ladder.activeSeason(); }

// ---------------------------------------------------------------------------
// 档案 / 配额 / 家长守护
// ---------------------------------------------------------------------------

function defaultProfile(season) {
  const rating = ladderBank.START_RATING;
  return {
    seasonId: season ? season.id : 's1',
    rating: rating,
    tier: ladderBank.tierOf(rating).id,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    bestScore: 0,
    dailyDate: today(),
    dailyUsed: 0,
    guard: 0
  };
}

// 跨天重置：昨天打掉的场次不带进今天
function rollover(row) {
  const date = today();
  if (row.dailyDate === date && typeof row.dailyUsed === 'number') return row;
  repos.ladder.updateProfile(row.userId, { dailyDate: date, dailyUsed: 0 });
  return repos.ladder.ofProfile(row.userId);
}

function profileOf(user) {
  const existing = repos.ladder.ofProfile(user.id);
  if (existing) return rollover(existing);
  return rollover(repos.ladder.ensureProfile(user.id, defaultProfile(currentSeason())));
}

function isVip(user) { return repos.vip.isActive(user); }

function dailyOf(user) {
  const row = profileOf(user);
  const vip = isVip(user);
  const limit = vip ? DAILY_LIMIT.vip : DAILY_LIMIT.free;
  const used = row.dailyUsed || 0;
  return {
    date: row.dailyDate || today(),
    vip: vip,
    freeLimit: DAILY_LIMIT.free,
    vipLimit: DAILY_LIMIT.vip,
    limit: limit,
    used: used,
    remaining: Math.max(0, limit - used),
    note: vip ? '领航员每天 10 局' : '免费版每天 3 局，开通领航员可到 10 局'
  };
}

// 家长守护：只读「学习报告 → 提醒设置」，不另存一份配置，避免两处口径打架
function guardState(user, profile) {
  const row = profile || profileOf(user);
  const setting = repos.study.of(user.id) || repos.study.defaultSetting();
  const now = beijing();
  const quiet = setting.quietHours || {};
  const study = setting.studyWindow || {};
  const enabled = Number(row.guard) === 1;

  const state = {
    enabled: enabled,
    allowed: true,
    reason: null,
    message: '',
    now: now.hhmm,
    weekday: now.weekday,
    weekdayLabel: weekdayLabel(now.weekday),
    quietHours: quiet,
    studyWindow: study,
    tip: enabled ? '家长守护已打开：免打扰时段与学习时段之外的比赛会被拦下' : '家长守护未打开：任何时间都能开一局'
  };

  if (!enabled) return state;

  if (quiet.enabled && inRange(now.hhmm, quiet.start, quiet.end)) {
    state.allowed = false;
    state.reason = 'quiet';
    state.message = '现在（' + now.hhmm + '）是免打扰时段 ' + quiet.start + ' ~ ' + quiet.end
      + '，家长守护把天梯拦下来了。做完当天的复习，明天再和对手比一场吧。';
    return state;
  }

  const weekdays = study.weekdays || [];
  const todayOn = !weekdays.length || weekdays.indexOf(now.weekday) !== -1;
  if (study.enabled && todayOn && !inRange(now.hhmm, study.start, study.end)) {
    state.allowed = false;
    state.reason = 'outside';
    state.message = '今天的学习时段是 ' + study.start + ' ~ ' + study.end + '（' + weekdayLabel(now.weekday) + '），'
      + '现在是 ' + now.hhmm + '。家长守护只允许在学习时段内开一局。';
    return state;
  }

  return state;
}
// ---------------------------------------------------------------------------
// 出题 / 对手预演
// ---------------------------------------------------------------------------

// 下发用的题面：正确答案在这里被剥掉，前端从头到尾拿不到
function questionView(question, extra) {
  return Object.assign({
    seq: question.seq,
    id: question.id,
    knowledgePointId: question.knowledgePointId,
    knowledgePointName: question.knowledgePointName,
    question: question.question,
    options: question.options,
    hint: question.hint,
    seconds: RULES.secondsPerQuestion
  }, extra || {});
}

function pickOpponent(rating, seed) {
  const rng = ladderBank.rngFrom(seed, 'rival-pick');
  const rivals = repos.ladder.rivals();
  if (!rivals.length) {
    return { id: 'bot', name: '星海机器人', avatar: '🤖', rating: rating, accuracy: 0.5, title: '随时在线' };
  }
  // 按积分就近排序，再在最近的两名之间摇一次，避免每局都是同一张脸
  const sorted = rivals.slice().sort(function (a, b) {
    return Math.abs((a.rating || 0) - rating) - Math.abs((b.rating || 0) - rating);
  });
  const pool = sorted.slice(0, Math.min(2, sorted.length));
  return ladderBank.pick(rng, pool);
}

// 对手逐题表现：服务端预演，结果写进 match.opponent_plan，前端只看到「进度条」
function simulateOpponent(seed, count, opponent) {
  const rng = ladderBank.rngFrom(seed, 'rival-play');
  const base = Number(opponent.accuracy);
  const accuracy = isFinite(base) ? base : 0.5;
  const plan = [];
  let score = 0;
  let correct = 0;
  for (let i = 0; i < count; i += 1) {
    // 水平越高的对手越稳；抖一下，免得每局都一模一样
    const chance = Math.max(0.15, Math.min(0.95, accuracy + (rng() - 0.5) * 0.18));
    const ok = rng() < chance;
    const costMs = Math.round(2600 + rng() * (RULES.secondsPerQuestion - 5) * 1000);
    if (ok) {
      correct += 1;
      score += ladderBank.questionScore(true, costMs);
    }
    plan.push({ seq: i + 1, correct: ok, costMs: costMs });
  }
  return { plan: plan, score: score, correct: correct };
}

// ---------------------------------------------------------------------------
// 对外视图
// ---------------------------------------------------------------------------

function opponentView(match) {
  return {
    name: match.opponentName,
    avatar: match.opponentAvatar,
    rating: match.opponentRating,
    tier: tierCard(match.opponentRating || 0),
    type: match.opponentType || 'rival'
  };
}

// 对局视图：对手的得分按「双方都答完的那几题」实时对齐，形成一条并排的进度条
function matchView(match, answers) {
  const rows = answers || [];
  const answered = rows.length;
  const plan = match.opponentPlan || [];
  let oppLive = 0;
  let oppLiveCorrect = 0;
  for (let i = 0; i < Math.min(answered, plan.length); i += 1) {
    if (plan[i].correct) {
      oppLiveCorrect += 1;
      oppLive += ladderBank.questionScore(true, plan[i].costMs);
    }
  }
  return {
    id: match.id,
    mode: match.mode || 'quick',
    status: match.status,
    total: match.total,
    answered: answered,
    currentSeq: match.status === 'playing' ? (match.currentSeq || 1) : match.total,
    seqStartedAt: match.seqStartedAt || match.createdAt,
    secondsPerQuestion: RULES.secondsPerQuestion,
    knowledgePointIds: match.knowledgePointIds || [],
    myScore: match.myScore || 0,
    myCorrect: match.myCorrect || 0,
    oppScore: match.status === 'done' ? (match.oppScore || 0) : oppLive,
    oppCorrect: match.status === 'done' ? (match.oppCorrect || 0) : oppLiveCorrect,
    opponent: opponentView(match),
    result: match.result || null,
    ratingBefore: match.ratingBefore,
    ratingAfter: match.ratingAfter,
    ratingDelta: match.ratingDelta,
    reward: match.reward,
    seed: match.seed,
    createdAt: match.createdAt,
    endedAt: match.endedAt || null
  };
}

// 结算后揭晓答案：此刻对局已经结束，不存在「边答边看答案」
function answerView(question, row) {
  // 超时是「服务端计时」的结论：超过限时 + 宽限就算超时，选了正确答案也不给分
  const late = !!row && Number(row.costMs || 0) > RULES.secondsPerQuestion * 1000 + GRACE_MS;
  return questionView(question, {
    choice: row ? row.choice : null,
    correct: row ? !!row.correct : null,
    answered: !!row,
    timeout: late,
    answerIndex: question.correctAnswer,
    answerText: question.options[question.correctAnswer]
  });
}

// ---------------------------------------------------------------------------
// 1 · 赛季总览（未登录也能看，页面上给一条「登录后开打」的引导）
// ---------------------------------------------------------------------------

function season() {
  return ok({
    data: {
      season: seasonView(currentSeason()),
      rules: {
        questionCount: RULES.questionCount,
        secondsPerQuestion: RULES.secondsPerQuestion,
        win: RULES.win,
        draw: RULES.draw,
        lose: RULES.lose,
        streakFrom: RULES.streakFrom,
        streakBonus: RULES.streakBonus,
        streakBonusMax: RULES.streakBonusMax,
        startRating: ladderBank.START_RATING,
        questionScore: RULES.questionScore,
        speedPerSecond: RULES.speedPerSecond,
        speedCap: RULES.speedCap,
        dailyLimit: DAILY_LIMIT,
        reward: REWARD,
        guard: '家长守护打开后，免打扰时段与学习时段之外不能开一局',
        protect: '段位保护：积分不会掉到当前段位门槛以下'
      },
      tiers: ladderBank.TIERS,
      rivals: repos.ladder.rivals().map(function (item) {
        return { id: item.id, name: item.name, avatar: item.avatar, rating: item.rating, title: item.title };
      })
    }
  });
}

// ---------------------------------------------------------------------------
// 2 · 我的天梯（段位 / 名次 / 每日场次 / 近 10 局 / 守护状态）
// ---------------------------------------------------------------------------

function me(user) {
  if (!user) return fail(401, '请先登录');
  const profile = profileOf(user);
  const seasonInfo = currentSeason();
  const daily = dailyOf(user);
  const recent = repos.ladder.listMatchesByUser(user.id, 10).map(function (match) {
    return {
      id: match.id,
      status: match.status,
      result: match.result || null,
      resultLabel: RESULT_LABEL[match.result] || '进行中',
      resultIcon: RESULT_ICON[match.result] || '⏳',
      myScore: match.myScore || 0,
      oppScore: match.oppScore || 0,
      ratingDelta: match.ratingDelta,
      reward: match.reward,
      opponent: { name: match.opponentName, avatar: match.opponentAvatar, rating: match.opponentRating },
      createdAt: match.createdAt,
      endedAt: match.endedAt || null
    };
  });
  const total = (profile.wins || 0) + (profile.losses || 0) + (profile.draws || 0);
  return ok({
    data: {
      season: seasonView(seasonInfo),
      tier: tierCard(profile.rating || ladderBank.START_RATING),
      rating: profile.rating || ladderBank.START_RATING,
      rank: repos.ladder.rankOf(user.id),
      record: {
        wins: profile.wins || 0,
        losses: profile.losses || 0,
        draws: profile.draws || 0,
        total: total,
        winRate: total ? Math.round(((profile.wins || 0) / total) * 100) : 0,
        streak: profile.streak || 0,
        bestStreak: profile.bestStreak || 0,
        bestScore: profile.bestScore || 0
      },
      daily: daily,
      guard: guardState(user, profile),
      recent: recent
    }
  });
}
// ---------------------------------------------------------------------------
// 3 · 星际天梯榜
// ---------------------------------------------------------------------------

function leaderboard(user, limit) {
  const size = Math.max(3, Math.min(100, Number(limit) || 30));
  const items = repos.ladder.ranking(size).map(function (row, index) {
    const owner = repos.user.findById(row.userId);
    const rating = row.rating || ladderBank.START_RATING;
    return {
      rank: index + 1,
      userId: row.userId,
      name: (owner && (owner.nickname || owner.name)) || '星途学员',
      avatar: (owner && owner.avatar) || '🙂',
      rating: rating,
      tier: tierCard(rating),
      wins: row.wins || 0,
      losses: row.losses || 0,
      draws: row.draws || 0,
      streak: row.streak || 0,
      demo: isDemoUser(owner),
      me: !!user && String(row.userId) === String(user.id)
    };
  });
  const mine = items.filter(function (item) { return item.me; })[0] || null;
  return ok({
    data: {
      items: items,
      me: mine,
      rank: user ? repos.ladder.rankOf(user.id) : null,
      total: repos.ladder.countProfiles(),
      limit: size
    }
  });
}

// ---------------------------------------------------------------------------
// 4 · 开局
// ---------------------------------------------------------------------------

function startMatch(user, body) {
  if (!user) return fail(401, '请先登录');
  const profile = profileOf(user);

  const guard = guardState(user, profile);
  if (!guard.allowed) {
    return { status: 403, body: { error: guard.message, code: 'LADDER_GUARD', guard: guard } };
  }

  const daily = dailyOf(user);
  if (daily.remaining <= 0) {
    return {
      status: 429,
      body: {
        error: '今天的 ' + daily.limit + ' 局已经打完了，明天 0 点重置。'
          + (daily.vip ? '' : '开通领航员可以每天打 10 局。'),
        code: 'LADDER_DAILY_LIMIT',
        daily: daily
      }
    };
  }

  const input = body || {};
  const all = ['kp1', 'kp2', 'kp3'];
  const requested = input.kpId || input.knowledgePointId;
  const kpIds = requested && all.indexOf(String(requested)) !== -1 ? [String(requested)] : all;
  const rating = profile.rating || ladderBank.START_RATING;
  const seed = crypto.randomBytes(8).toString('hex');
  const questions = ladderBank.buildQuestions({
    seed: seed,
    knowledgePointIds: kpIds,
    count: RULES.questionCount,
    level: levelFor(rating)
  });
  const opponent = pickOpponent(rating, seed);
  const simulated = simulateOpponent(seed, questions.length, opponent);
  const now = new Date().toISOString();

  const match = repos.ladder.insertMatch({
    id: newId('lm'),
    userId: user.id,
    seasonId: (currentSeason() || {}).id || 's1',
    mode: 'quick',
    opponentType: 'rival',
    opponentName: opponent.name,
    opponentAvatar: opponent.avatar,
    opponentRating: opponent.rating,
    opponentPlan: simulated.plan,
    seed: seed,
    knowledgePointIds: kpIds,
    questions: questions,
    total: questions.length,
    status: 'playing',
    myScore: 0,
    myCorrect: 0,
    oppScore: simulated.score,
    oppCorrect: simulated.correct,
    result: null,
    ratingBefore: rating,
    ratingAfter: null,
    ratingDelta: null,
    reward: 0,
    currentSeq: 1,
    seqStartedAt: now,
    createdAt: now,
    endedAt: null
  });

  repos.ladder.updateProfile(user.id, { dailyUsed: daily.used + 1 });

  return ok({
    data: {
      match: matchView(match, []),
      questions: questions.map(function (question) { return questionView(question); }),
      daily: dailyOf(user),
      rules: {
        secondsPerQuestion: RULES.secondsPerQuestion,
        questionScore: RULES.questionScore,
        speedPerSecond: RULES.speedPerSecond,
        speedCap: RULES.speedCap
      }
    }
  });
}

// 取一局：只能看自己的，别人拿着 id 也读不到
function readMatch(user, matchId) {
  if (!user) return fail(401, '请先登录');
  const match = repos.ladder.findMatch(matchId);
  if (!match) return fail(404, '这一局不存在或已经过期');
  if (String(match.userId) !== String(user.id)) return fail(403, '不能查看别人的对局');

  const rows = repos.ladder.listAnswersByMatch(match.id);
  const bySeq = {};
  rows.forEach(function (row) { bySeq[row.seq] = row; });
  const questions = (match.questions || []).map(function (question) {
    const row = bySeq[question.seq];
    return match.status === 'done'
      ? answerView(question, row)
      : questionView(question, {
        answered: !!row,
        choice: row ? row.choice : null,
        correct: row ? !!row.correct : null
      });
  });
  return ok({
    data: {
      match: matchView(match, rows),
      questions: questions,
      answers: rows.map(function (row) {
        return { seq: row.seq, choice: row.choice, correct: !!row.correct, costMs: row.costMs };
      }),
      settlement: match.status === 'done' ? settlementView(match) : null
    }
  });
}

// ---------------------------------------------------------------------------
// 5 · 逐题作答（服务端计时 + 服务端判分）
// ---------------------------------------------------------------------------

function submitAnswer(user, matchId, body) {
  if (!user) return fail(401, '请先登录');
  const match = repos.ladder.findMatch(matchId);
  if (!match) return fail(404, '这一局不存在或已经过期');
  if (String(match.userId) !== String(user.id)) return fail(403, '不能代别人作答');
  if (match.status !== 'playing') return fail(400, '这一局已经结束了');

  const input = body || {};
  const seq = Number(input.seq);
  const question = (match.questions || [])[seq - 1];
  if (!seq || !question) return fail(400, '题号不对，这道题不在这场对局里');
  // 先查重复、再查顺序：重复提交给的是「已经提交过了」，比「要按顺序作答」更好懂
  if (repos.ladder.findAnswer(match.id, seq)) return fail(400, '这道题已经提交过了');
  if (seq !== (match.currentSeq || 1)) {
    return fail(400, '要按顺序作答，先把第 ' + (match.currentSeq || 1) + ' 题做完');
  }

  const limitMs = RULES.secondsPerQuestion * 1000;
  const startedAt = new Date(match.seqStartedAt || match.createdAt).getTime();
  const costMs = Math.max(0, Date.now() - startedAt);
  const timeout = costMs > limitMs + GRACE_MS;

  const choice = Number(input.choice);
  const picked = isFinite(choice) && choice >= 0 && choice < question.options.length ? choice : -1;
  const correct = !timeout && picked === question.correctAnswer;
  const score = ladderBank.questionScore(correct, costMs);
  const now = new Date().toISOString();

  repos.ladder.insertAnswer({
    id: match.id + '#' + seq,
    matchId: match.id,
    userId: user.id,
    seq: seq,
    knowledgePointId: question.knowledgePointId,
    choice: picked,
    correct: correct ? 1 : 0,
    costMs: costMs,
    createdAt: now
  });

  repos.ladder.updateMatch(match.id, {
    myScore: (match.myScore || 0) + score,
    myCorrect: (match.myCorrect || 0) + (correct ? 1 : 0),
    currentSeq: seq + 1,
    seqStartedAt: now
  });

  const rows = repos.ladder.listAnswersByMatch(match.id);
  const nextQuestion = (match.questions || [])[seq];
  return ok({
    data: {
      seq: seq,
      correct: correct,
      timeout: timeout,
      choice: picked,
      score: score,
      costMs: costMs,
      message: timeout
        ? '这题超时啦，速度分归零；下一题记得先看清条件再算'
        : (correct ? '答对了，速度分 +' + Math.max(0, score - RULES.questionScore) : '这题不对，结算时会带你回看一遍'),
      finished: !nextQuestion,
      next: nextQuestion ? { seq: nextQuestion.seq, seconds: RULES.secondsPerQuestion, startedAt: now } : null,
      match: matchView(repos.ladder.findMatch(match.id), rows)
    }
  });
}

// ---------------------------------------------------------------------------
// 6 · 结算
// ---------------------------------------------------------------------------

function settlementView(match) {
  const result = match.result || 'draw';
  return {
    result: result,
    resultLabel: RESULT_LABEL[result],
    resultIcon: RESULT_ICON[result],
    myScore: match.myScore || 0,
    myCorrect: match.myCorrect || 0,
    oppScore: match.oppScore || 0,
    oppCorrect: match.oppCorrect || 0,
    total: match.total,
    ratingBefore: match.ratingBefore,
    ratingAfter: match.ratingAfter,
    ratingDelta: match.ratingDelta || 0,
    reward: match.reward || 0,
    tier: tierCard(match.ratingAfter || match.ratingBefore || ladderBank.START_RATING),
    tierBefore: tierCard(match.ratingBefore || ladderBank.START_RATING),
    promoted: !!match.ratingBefore && !!match.ratingAfter
      && ladderBank.tierOf(match.ratingAfter).id !== ladderBank.tierOf(match.ratingBefore).id,
    endedAt: match.endedAt || null
  };
}

function finishMatch(user, matchId) {
  if (!user) return fail(401, '请先登录');
  const match = repos.ladder.findMatch(matchId);
  if (!match) return fail(404, '这一局不存在或已经过期');
  if (String(match.userId) !== String(user.id)) return fail(403, '不能结算别人的对局');

  const rows = repos.ladder.listAnswersByMatch(match.id);
  const bySeq = {};
  rows.forEach(function (row) { bySeq[row.seq] = row; });
  const replay = (match.questions || []).map(function (question) {
    return answerView(question, bySeq[question.seq]);
  });

  // 幂等：已经结算过就把上一次的结果原样回放，不重复扣分，也不重复发星尘
  if (match.status === 'done') {
    return ok({
      data: {
        match: matchView(match, rows),
        settlement: settlementView(match),
        replay: replay,
        repeated: true
      }
    });
  }
  if (rows.length < (match.total || 0)) {
    return fail(400, '还有 ' + ((match.total || 0) - rows.length) + ' 题没答完，答完才能结算');
  }

  const myScore = rows.reduce(function (sum, row) {
    return sum + ladderBank.questionScore(!!row.correct, row.costMs);
  }, 0);
  const myCorrect = rows.filter(function (row) { return !!row.correct; }).length;
  const oppScore = match.oppScore || 0;
  const result = myScore > oppScore ? 'win' : (myScore < oppScore ? 'lose' : 'draw');

  const profile = profileOf(user);
  const ratingBefore = profile.rating || ladderBank.START_RATING;
  const streak = result === 'win' ? (profile.streak || 0) + 1 : 0;
  const delta = ladderBank.deltaFor(result, streak);
  // 段位保护：赢了照常加，输了不会掉出当前段位门槛
  const ratingAfter = Math.max(ladderBank.tierFloor(ratingBefore), ratingBefore + delta);
  const reward = REWARD[result];

  repos.ladder.updateProfile(user.id, {
    rating: ratingAfter,
    tier: ladderBank.tierOf(ratingAfter).id,
    wins: (profile.wins || 0) + (result === 'win' ? 1 : 0),
    losses: (profile.losses || 0) + (result === 'lose' ? 1 : 0),
    draws: (profile.draws || 0) + (result === 'draw' ? 1 : 0),
    streak: streak,
    bestStreak: Math.max(profile.bestStreak || 0, streak),
    bestScore: Math.max(profile.bestScore || 0, myScore),
    seasonId: (currentSeason() || {}).id || profile.seasonId
  });

  repos.ladder.updateMatch(match.id, {
    status: 'done',
    myScore: myScore,
    myCorrect: myCorrect,
    result: result,
    ratingBefore: ratingBefore,
    ratingAfter: ratingAfter,
    ratingDelta: ratingAfter - ratingBefore,
    reward: reward,
    endedAt: new Date().toISOString()
  });

  walletService.record(user.id, 'dust', reward, 'ladder',
    '完成一局星际天梯（' + RESULT_LABEL[result] + '，对手 ' + match.opponentName + '）');

  const fresh = repos.ladder.findMatch(match.id);
  return ok({
    data: {
      match: matchView(fresh, rows),
      settlement: settlementView(fresh),
      replay: replay,
      repeated: false,
      daily: dailyOf(user)
    }
  });
}

// ---------------------------------------------------------------------------
// 7 · 家长守护开关
// ---------------------------------------------------------------------------

function setGuard(user, body) {
  if (!user) return fail(401, '请先登录');
  const profile = profileOf(user);
  const input = body || {};
  const on = input.enabled === undefined ? !(Number(profile.guard) === 1) : !!input.enabled;
  repos.ladder.updateProfile(user.id, { guard: on ? 1 : 0 });
  return ok({
    data: {
      enabled: on,
      guard: guardState(user, repos.ladder.ofProfile(user.id)),
      message: on ? '家长守护已打开，只允许在学习时段内开一局' : '家长守护已关闭，任何时间都能开一局'
    }
  });
}

// 掉线兜底：把卡在 playing 的对局标成 abandoned（不影响积分与星尘）
function abandoned(matchId) {
  const match = repos.ladder.findMatch(matchId);
  if (!match || match.status !== 'playing') return null;
  return repos.ladder.updateMatch(match.id, { status: 'abandoned', endedAt: new Date().toISOString() });
}

module.exports = {
  RULES, DAILY_LIMIT, REWARD,
  season, me, leaderboard, startMatch, readMatch, submitAnswer, finishMatch, setGuard,
  guardState, dailyOf, profileOf, tierCard, settlementView, abandoned
};