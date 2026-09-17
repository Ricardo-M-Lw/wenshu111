// 天梯题库 —— 按种子确定性生成，服务端判分，答案永不下发
//
// 为什么用「生成器」而不是写死题库：
//   · 天梯赛要求「双方同题 + 服务端判分 + 零大模型成本」，题量小就会出现重复出题；
//   · 生成器按 (种子, 知识点, 难度) 出题，同一局双方拿到完全相同的题目，
//     判分只认服务端手里的那一份，前端从头到尾拿不到 correctAnswer。
//
// 难度随段位上升：数字范围更大、步骤更多。所有题都是四选一，选项两两不相同。

// ---------------------------------------------------------------------------
// 随机数：mulberry32，同一个种子必得同一串数（可复现、可服务端复核）
// ---------------------------------------------------------------------------

function hashSeed(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed, salt) {
  let a = (hashSeed(seed) ^ hashSeed(salt || '')) >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
function pick(rng, list) { return list[int(rng, 0, list.length - 1)]; }

function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = int(rng, 0, i);
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

function uniqueText(list) {
  const seen = [];
  list.forEach(function (item) {
    const text = String(item);
    if (seen.indexOf(text) === -1) seen.push(text);
  });
  return seen;
}

// 斜率渲染：1 -> x，-1 -> -x，其余照写（避免出现 "y = -1x" 这种不规范的写法）
function slopeText(k) {
  if (k === 1) return 'x';
  if (k === -1) return '-x';
  return k + 'x';
}

// 组四选一：正确项 + 干扰项，去重后取前 4 个，再按种子打乱顺序
function choice(rng, correct, distractors, suffix) {
  const tail = suffix || '';
  const pool = uniqueText([correct].concat(distractors)).slice(0, 4);
  while (pool.length < 4) pool.push('无法确定' + (pool.length - 3));
  const options = shuffle(rng, pool).map(function (text) { return text + tail; });
  return { options: options, correctAnswer: options.indexOf(String(correct) + tail) };
}

// ---------------------------------------------------------------------------
// 勾股数（用于勾股定理题库，保证答案是整数）
// ---------------------------------------------------------------------------

const TRIPLES = [
  [3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25],
  [9, 12, 15], [12, 16, 20], [20, 21, 29], [9, 40, 41], [10, 24, 26]
];

// ---------------------------------------------------------------------------
// kp1 一次函数
// ---------------------------------------------------------------------------

function qSlope(rng, level) {
  const range = level >= 3 ? 9 : (level === 2 ? 6 : 4);
  let k = int(rng, -range, range); if (k === 0) k = 3;
  let b = int(rng, -range, range); if (b === 0) b = 2;
  const tail = b > 0 ? ' + ' + b : ' - ' + Math.abs(b);
  const built = choice(rng, k, [b, -k, k + 1, k - 1, b + k]);
  return {
    knowledgePointId: 'kp1',
    question: '一次函数 y = ' + slopeText(k) + tail + ' 中，斜率 k 是多少？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '斜率就是 x 前面的系数，注意正负号'
  };
}

function qValue(rng, level) {
  const range = level >= 3 ? 6 : 4;
  let k = int(rng, -range, range); if (k === 0) k = 2;
  let b = int(rng, -range, range); if (b === 0) b = 3;
  const x = int(rng, -range, range);
  const y = k * x + b;
  const tail = b > 0 ? ' + ' + b : ' - ' + Math.abs(b);
  const built = choice(rng, y, [y + 1, y - 1, y + k, k * x, y + 2]);
  return {
    knowledgePointId: 'kp1',
    question: '已知一次函数 y = ' + slopeText(k) + tail + '，当 x = ' + x + ' 时，y 的值是多少？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '把 x 的值代进去，先算乘法再算加减'
  };
}

function qIntercept(rng, level) {
  const range = level >= 3 ? 9 : 6;
  let k = int(rng, -range, range); if (k === 0) k = 4;
  let b = int(rng, -range, range); if (b === 0) b = 5;
  const tail = b > 0 ? ' + ' + b : ' - ' + Math.abs(b);
  const built = choice(rng, '(0, ' + b + ')', ['(' + b + ', 0)', '(0, ' + k + ')', '(' + k + ', 0)', '(0, 0)']);
  return {
    knowledgePointId: 'kp1',
    question: '直线 y = ' + slopeText(k) + tail + ' 与 y 轴的交点坐标是什么？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '与 y 轴相交时横坐标 x = 0，把 x = 0 代进去看 y'
  };
}

function qOnLine(rng, level) {
  const range = level >= 3 ? 6 : 4;
  let k = int(rng, -range, range); if (k === 0) k = 2;
  let b = int(rng, -range, range); if (b === 0) b = 1;
  const x = int(rng, -range, range);
  const y = k * x + b;
  const point = function (px, py) { return '(' + px + ', ' + py + ')'; };
  const built = choice(rng, point(x, y), [point(x, y + 1), point(x + 1, y), point(x, y - 1), point(x - 1, y)]);
  const tail = b > 0 ? ' + ' + b : ' - ' + Math.abs(b);
  return {
    knowledgePointId: 'kp1',
    question: '下面哪个点在直线 y = ' + slopeText(k) + tail + ' 上？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '把点的横坐标代入直线，算出来的 y 和点的纵坐标一样才是'
  };
}

// ---------------------------------------------------------------------------
// kp2 内角和
// ---------------------------------------------------------------------------

function qPolygonSum(rng, level) {
  const n = level >= 3 ? int(rng, 5, 12) : int(rng, 3, 8);
  const sum = (n - 2) * 180;
  const built = choice(rng, sum, [sum + 180, sum - 180, n * 180, sum + 360], '°');
  return {
    knowledgePointId: 'kp2',
    question: n + ' 边形的内角和是多少度？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '内角和 = (边数 - 2) × 180°',
  };
}

function qThirdAngle(rng, level) {
  const a = int(rng, 25, 80);
  const b = int(rng, 25, 80);
  const c = 180 - a - b;
  if (c <= 0) return qThirdAngle(rng, level);
  const built = choice(rng, c, [c + 10, c - 10, 180 - a, 180 - b], '°');
  return {
    knowledgePointId: 'kp2',
    question: '三角形中两个角分别是 ' + a + '° 和 ' + b + '°，第三个角是多少度？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '用 180° 减去已知的两个角',
  };
}

function qRightAngle(rng) {
  const a = int(rng, 20, 70);
  const other = 90 - a;
  const built = choice(rng, other, [180 - a, other + 10, other - 5, 90 + a], '°');
  return {
    knowledgePointId: 'kp2',
    question: '直角三角形中，一个锐角是 ' + a + '°，另一个锐角是多少度？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '直角三角形已经有一个 90° 的角，两个锐角加起来是 90°',
  };
}

function qRegularPolygon(rng) {
  const sides = [4, 5, 6, 8, 9, 10, 12];
  const n = pick(rng, sides);
  const each = ((n - 2) * 180) / n;
  const built = choice(rng, each, [each + 12, each - 12, 180 - each, each + 6], '°');
  return {
    knowledgePointId: 'kp2',
    question: '正 ' + n + ' 边形的每一个内角是多少度？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '先算内角和 (n - 2) × 180°，再平均分成 n 份',
  };
}

// ---------------------------------------------------------------------------
// kp3 勾股定理
// ---------------------------------------------------------------------------

function qHypotenuse(rng) {
  const t = pick(rng, TRIPLES);
  const a = t[0]; const b = t[1]; const c = t[2];
  const built = choice(rng, c, [c + 1, c - 1, a + b, c + 2]);
  return {
    knowledgePointId: 'kp3',
    question: '直角三角形的两条直角边分别是 ' + a + ' 和 ' + b + '，斜边是多少？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '两条直角边的平方和等于斜边的平方：a² + b² = c²'
  };
}

function qLeg(rng) {
  const t = pick(rng, TRIPLES);
  const a = t[0]; const b = t[1]; const c = t[2];
  const built = choice(rng, b, [b + 1, b - 1, c - a, b + 2]);
  return {
    knowledgePointId: 'kp3',
    question: '直角三角形斜边是 ' + c + '，一条直角边是 ' + a + '，另一条直角边是多少？',
    options: built.options,
    correctAnswer: built.correctAnswer,
    hint: '用 c² - a² = b²，先算平方差再开方'
  };
}

function qRightCheck(rng) {
  const isRight = rng() < 0.5;
  let a; let b; let c;
  if (isRight) {
    const t = pick(rng, TRIPLES);
    a = t[0]; b = t[1]; c = t[2];
  } else {
    const t = pick(rng, TRIPLES);
    a = t[0]; b = t[1]; c = t[2] + 1;
  }
  const sides = shuffle(rng, [a, b, c]);
  const options = [
    '是直角三角形，因为两短边的平方和等于最长边的平方',
    '不是直角三角形，因为两短边的平方和不等于最长边的平方',
    '无法判断，缺少一个角的信息',
    '是等腰三角形'
  ];
  return {
    knowledgePointId: 'kp3',
    question: '三条边长分别为 ' + sides[0] + '、' + sides[1] + '、' + sides[2] + ' 的三角形是直角三角形吗？',
    options: options,
    correctAnswer: isRight ? 0 : 1,
    hint: '先找最长边，再看两条短边的平方和是不是等于最长边的平方'
  };
}

const GENERATORS = {
  kp1: [qSlope, qValue, qIntercept, qOnLine],
  kp2: [qPolygonSum, qThirdAngle, qRightAngle, qRegularPolygon],
  kp3: [qHypotenuse, qLeg, qRightCheck]
};

const KP_NAMES = { kp1: '一次函数', kp2: '内角和', kp3: '勾股定理' };

// ---------------------------------------------------------------------------
// 出题：同一 (种子, 知识点, 难度) 必得同一份题目
// ---------------------------------------------------------------------------

function buildQuestions(spec) {
  const seed = String((spec && spec.seed) || Date.now());
  const kpIds = (spec && spec.knowledgePointIds && spec.knowledgePointIds.length)
    ? spec.knowledgePointIds : ['kp1', 'kp2', 'kp3'];
  const count = Math.max(1, (spec && spec.count) || 8);
  const level = Math.min(3, Math.max(1, (spec && spec.level) || 1));
  const rng = rngFrom(seed, 'questions');
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const kpId = kpIds[i % kpIds.length];
    const pool = GENERATORS[kpId] || GENERATORS.kp1;
    let item = null;
    for (let attempt = 0; attempt < 8 && !item; attempt += 1) {
      const built = pick(rng, pool)(rng, level);
      // correctAnswer 必须落在选项里；生成器兜底失败就换一题重来
      if (built && built.correctAnswer >= 0 && built.options.length === 4) item = built;
    }
    if (!item) item = qHypotenuse(rng, level);
    out.push({
      seq: i + 1,
      id: 'LQ' + (i + 1),
      knowledgePointId: item.knowledgePointId,
      knowledgePointName: KP_NAMES[item.knowledgePointId] || '',
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      hint: item.hint
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 段位：积分 -> 段位（星际命名，和星系主题一致）
// ---------------------------------------------------------------------------

const TIERS = [
  { id: 'meteor', name: '陨石', icon: '🪨', min: 0, color: '#8A94A6' },
  { id: 'streak', name: '流光', icon: '☄️', min: 1000, color: '#4C7DF0' },
  { id: 'nova', name: '新星', icon: '✨', min: 1200, color: '#2BA4A0' },
  { id: 'planet', name: '行星', icon: '🪐', min: 1400, color: '#7C6CF5' },
  { id: 'star', name: '恒星', icon: '🌞', min: 1600, color: '#F5A623' },
  { id: 'cluster', name: '星团', icon: '🌌', min: 1800, color: '#EE5A6F' },
  { id: 'nebula', name: '星云', icon: '🌫️', min: 2000, color: '#34C759' },
  { id: 'galaxy', name: '星系', icon: '🌀', min: 2200, color: '#FF7A59' },
  { id: 'king', name: '星海之王', icon: '👑', min: 2400, color: '#FFC53D' }
];

// 新账号从 900 分起步（陨石段位），打赢 4 局左右就能升到「流光」，
// 这样 9 个段位从最低一档开始爬，第一次升段来得快、有成就感。
const START_RATING = 900;

// 结算规则：赢 +25 / 平 +10 / 输 -15；连胜有额外加成
// 段位保护：积分不会掉到「当前段位门槛」以下，孩子不会被一路打回原点
const RULES = {
  win: 25,
  draw: 10,
  lose: -15,
  streakBonus: 5,     // 连胜 3 场起，每多一场多 +5
  streakFrom: 3,
  streakBonusMax: 10,
  questionScore: 100, // 每题基础分
  speedPerSecond: 3,  // 每题剩余每秒加 3 分
  speedCap: 45,       // 单题速度分上限
  secondsPerQuestion: 20,
  questionCount: 8
};

function tierOf(rating) {
  let current = TIERS[0];
  TIERS.forEach(function (item) { if (rating >= item.min) current = item; });
  const index = TIERS.indexOf(current);
  const next = TIERS[index + 1] || null;
  const floor = current.min;
  const ceiling = next ? next.min : current.min + 400;
  const span = ceiling - floor;
  return {
    id: current.id,
    name: current.name,
    icon: current.icon,
    color: current.color,
    min: floor,
    index: index,
    next: next ? { id: next.id, name: next.name, icon: next.icon, min: next.min } : null,
    progress: Math.max(0, Math.min(100, Math.round((rating - floor) / span * 100)))
  };
}

function tierFloor(rating) { return tierOf(rating).min; }

function deltaFor(result, streak) {
  if (result === 'win') {
    const bonus = streak >= RULES.streakFrom ? Math.min(RULES.streakBonusMax, (streak - RULES.streakFrom + 1) * RULES.streakBonus) : 0;
    return RULES.win + bonus;
  }
  if (result === 'draw') return RULES.draw;
  return RULES.lose;
}

// 单题得分：答对给基础分 + 剩余时间速度分
function questionScore(ok, costMs) {
  if (!ok) return 0;
  const leftSec = Math.max(0, RULES.secondsPerQuestion - Math.ceil((costMs || 0) / 1000));
  return RULES.questionScore + Math.min(RULES.speedCap, leftSec * RULES.speedPerSecond);
}

module.exports = {
  TIERS, RULES, START_RATING,
  buildQuestions, tierOf, tierFloor, deltaFor, questionScore,
  rngFrom, int, pick, shuffle
};
