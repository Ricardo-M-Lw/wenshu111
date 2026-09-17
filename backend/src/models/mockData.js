// 问数平台 Mock 数据层
// 说明：所有日期都以「今天」为基准动态推算，避免演示数据变成过期数据

const DAY = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function dayStart(daysAgo) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return new Date(date.getTime() - daysAgo * DAY);
}

// 本地日期字符串：2026-09-10
function dateOnly(daysAgo) {
  const date = dayStart(daysAgo);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

// 带时区的本地时间戳：2026-09-10T14:32:00+08:00
function stamp(daysAgo, hour, minute) {
  const date = dayStart(daysAgo);
  date.setHours(hour, minute, 0, 0);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return dateOnly(daysAgo) + 'T' + pad(hour) + ':' + pad(minute) + ':00' + sign
    + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}

const TODAY = dateOnly(0);

// ---------------------------------------------------------------------------
// 用户
// ---------------------------------------------------------------------------

const users = [
  {
    id: 'u1',
    name: '林小明',
    nickname: '小明',
    username: 'xiaoming',
    phone: '13800000001',
    password: '123456',
    role: 'student',
    avatar: '🧑‍🎓',
    grade: '八年级',
    school: '实验中学',
    className: '八年级（3）班',
    createdAt: stamp(126, 9, 0)
  },
  // 产品已收敛为「学生 + 家长」：原教师账号与班级课堂模式一并下线，
  // 管理端只保留运营账号（会员订单、收入对账、题库巡检）。
  {
    id: 'o1',
    name: '李运营',
    nickname: '李运营',
    username: 'admin',
    phone: '13900000002',
    password: 'admin123',
    role: 'ops',
    avatar: '🧑‍💼',
    school: '问数星途',
    createdAt: stamp(180, 9, 0)
  }
];

// ---------------------------------------------------------------------------
// 知识点
// ---------------------------------------------------------------------------

const knowledgePoints = [
  {
    id: 'kp1',
    name: '一次函数',
    icon: '△',
    color: 'linear-gradient(135deg,#667EEA,#764BA2)',
    accent: '#667EEA',
    soft: '#EEF1FF',
    cover: '/assets/images/knowledge/kp1-function.svg',
    grade: '八年级 · 第 12 章',
    totalSteps: 5,
    difficulty: 3,
    description: '理解一次函数的概念、图像和性质',
    keyPoints: ['y = kx + b 的形式', '斜率 k 的几何意义', '图像与坐标轴的交点']
  },
  {
    id: 'kp2',
    name: '三角形内角和',
    icon: '∠',
    color: 'linear-gradient(135deg,#FF6B6B,#EE5A6F)',
    accent: '#EE5A6F',
    soft: '#FFEFEF',
    cover: '/assets/images/knowledge/kp2-triangle.svg',
    grade: '八年级 · 第 11 章',
    totalSteps: 5,
    difficulty: 2,
    description: '掌握三角形内角和定理及其应用',
    keyPoints: ['内角和恒为 180°', '撕角拼平角实验', '外角与内角的关系']
  },
  {
    id: 'kp3',
    name: '勾股定理',
    icon: '√',
    color: 'linear-gradient(135deg,#4ECDC4,#44A08D)',
    accent: '#2BA4A0',
    soft: '#E4F7F5',
    cover: '/assets/images/knowledge/kp3-pythagoras.svg',
    grade: '八年级 · 第 17 章',
    totalSteps: 5,
    difficulty: 4,
    description: '理解勾股定理及其逆定理',
    keyPoints: ['a² + b² = c²', '直角边的判定', '常见勾股数 3-4-5']
  }
];

// ---------------------------------------------------------------------------
// 学习会话（最近 14 天）
// currentStep 表示「已完成的讲题步骤数」，讲题步骤定义见 models/lessons.js
// ---------------------------------------------------------------------------

const learningSessions = [
  {
    id: 's1', userId: 'u1', knowledgePointId: 'kp1',
    status: 'in_progress', currentStep: 3, totalSteps: 5,
    hintCount: 2, correctionCount: 1, errorTypes: ['符号混淆'],
    duration: 12, quiz: { correct: 4, total: 5 },
    createdAt: stamp(0, 14, 32), updatedAt: stamp(0, 14, 44)
  },
  {
    id: 's2', userId: 'u1', knowledgePointId: 'kp3',
    status: 'in_progress', currentStep: 1, totalSteps: 5,
    hintCount: 1, correctionCount: 0, errorTypes: [],
    duration: 9, quiz: { correct: 2, total: 3 },
    createdAt: stamp(0, 9, 15), updatedAt: stamp(0, 9, 24)
  },
  {
    id: 's3', userId: 'u1', knowledgePointId: 'kp2',
    status: 'completed', currentStep: 5, totalSteps: 5,
    hintCount: 1, correctionCount: 0, errorTypes: [],
    duration: 18, quiz: { correct: 5, total: 5 },
    createdAt: stamp(1, 18, 10), updatedAt: stamp(1, 18, 28)
  },
  {
    id: 's4', userId: 'u1', knowledgePointId: 'kp3',
    status: 'in_progress', currentStep: 3, totalSteps: 5,
    hintCount: 3, correctionCount: 2, errorTypes: ['公式错误'],
    duration: 22, quiz: { correct: 3, total: 5 },
    createdAt: stamp(2, 19, 40), updatedAt: stamp(2, 20, 2)
  },
  {
    id: 's5', userId: 'u1', knowledgePointId: 'kp1',
    status: 'in_progress', currentStep: 1, totalSteps: 5,
    hintCount: 2, correctionCount: 1, errorTypes: ['条件识别'],
    duration: 15, quiz: { correct: 2, total: 4 },
    createdAt: stamp(3, 17, 5), updatedAt: stamp(3, 17, 20)
  },
  {
    id: 's6', userId: 'u1', knowledgePointId: 'kp2',
    status: 'completed', currentStep: 5, totalSteps: 5,
    hintCount: 1, correctionCount: 0, errorTypes: [],
    duration: 20, quiz: { correct: 4, total: 5 },
    createdAt: stamp(5, 16, 20), updatedAt: stamp(5, 16, 40)
  },
  {
    id: 's7', userId: 'u1', knowledgePointId: 'kp1',
    status: 'in_progress', currentStep: 1, totalSteps: 5,
    hintCount: 0, correctionCount: 0, errorTypes: [],
    duration: 8, quiz: { correct: 1, total: 3 },
    createdAt: stamp(6, 20, 5), updatedAt: stamp(6, 20, 13)
  },
  {
    id: 's8', userId: 'u1', knowledgePointId: 'kp3',
    status: 'in_progress', currentStep: 3, totalSteps: 5,
    hintCount: 3, correctionCount: 1, errorTypes: ['计算失误'],
    duration: 24, quiz: { correct: 3, total: 5 },
    createdAt: stamp(8, 15, 30), updatedAt: stamp(8, 15, 54)
  },
  {
    id: 's9', userId: 'u1', knowledgePointId: 'kp2',
    status: 'completed', currentStep: 5, totalSteps: 5,
    hintCount: 2, correctionCount: 1, errorTypes: ['概念不清'],
    duration: 19, quiz: { correct: 5, total: 5 },
    createdAt: stamp(9, 18, 45), updatedAt: stamp(9, 19, 4)
  },
  {
    id: 's10', userId: 'u1', knowledgePointId: 'kp1',
    status: 'completed', currentStep: 5, totalSteps: 5,
    hintCount: 2, correctionCount: 1, errorTypes: ['概念不清'],
    duration: 25, quiz: { correct: 5, total: 5 },
    createdAt: stamp(11, 14, 15), updatedAt: stamp(11, 14, 40)
  },
  {
    id: 's11', userId: 'u1', knowledgePointId: 'kp3',
    status: 'in_progress', currentStep: 1, totalSteps: 5,
    hintCount: 1, correctionCount: 0, errorTypes: [],
    duration: 11, quiz: { correct: 2, total: 4 },
    createdAt: stamp(13, 19, 0), updatedAt: stamp(13, 19, 11)
  }
];

// ---------------------------------------------------------------------------
// 题库
// ---------------------------------------------------------------------------

const quizzes = [
  { id: 'q1', knowledgePointId: 'kp1', question: '直线 y = 2x + 1 的斜率是多少？', options: ['1', '2', '3', '0'], correctAnswer: 1, hint: '斜率就是 x 前面的系数', type: 'choice' },
  { id: 'q2', knowledgePointId: 'kp1', question: '当 x = 2 时，y = 2x + 1 的值是多少？', options: ['3', '4', '5', '6'], correctAnswer: 2, hint: '把 x = 2 代入公式计算', type: 'choice' },
  { id: 'q3', knowledgePointId: 'kp1', question: '一次函数 y = -3x + 2 中，斜率 k 是多少？', options: ['2', '-3', '3', '-2'], correctAnswer: 1, hint: '斜率是 x 前面的系数，注意正负号', type: 'choice' },
  { id: 'q4', knowledgePointId: 'kp1', question: '已知 y = 4x - 1，当 x = 0 时，y 的值是多少？', options: ['-1', '0', '4', '3'], correctAnswer: 0, hint: '把 x = 0 代入，先算 4 × 0', type: 'choice' },
  { id: 'q5', knowledgePointId: 'kp1', question: '直线 y = x + 5 与 y 轴的交点坐标是什么？', options: ['(5, 0)', '(0, 5)', '(1, 5)', '(0, 1)'], correctAnswer: 1, hint: '与 y 轴相交时，x = 0', type: 'choice' },
  { id: 'q6', knowledgePointId: 'kp2', question: '三角形的内角和是多少度？', options: ['90°', '180°', '270°', '360°'], correctAnswer: 1, hint: '任意三角形的内角和都是固定的', type: 'choice' },
  { id: 'q7', knowledgePointId: 'kp2', question: '三角形中两个角分别是 50° 和 60°，第三个角是多少度？', options: ['70°', '60°', '80°', '50°'], correctAnswer: 0, hint: '用 180° 减去已知的两个角', type: 'choice' },
  { id: 'q8', knowledgePointId: 'kp2', question: '直角三角形中，一个锐角是 40°，另一个锐角是多少度？', options: ['40°', '45°', '50°', '60°'], correctAnswer: 2, hint: '直角三角形已经有一个 90° 角', type: 'choice' },
  { id: 'q9', knowledgePointId: 'kp2', question: '一个三角形中不可能同时出现下面哪种情况？', options: ['两个锐角', '一个直角和一个锐角', '两个直角', '一个钝角和两个锐角'], correctAnswer: 2, hint: '两个直角加起来已经 180°，第三个角就没有了', type: 'choice' },
  { id: 'q10', knowledgePointId: 'kp3', question: '在直角三角形中，两条直角边分别为 3 和 4，斜边是多少？', options: ['5', '6', '7', '8'], correctAnswer: 0, hint: '试试勾股定理：a² + b² = c²', type: 'choice' },
  { id: 'q11', knowledgePointId: 'kp3', question: '勾股定理描述的是直角三角形中哪三条边的关系？', options: ['任意两边之和', '两条直角边与斜边的平方关系', '三条边长度相等', '三条边长度相加'], correctAnswer: 1, hint: '关键词是“平方”：a² + b² = c²', type: 'choice' },
  { id: 'q12', knowledgePointId: 'kp3', question: '直角三角形的两条直角边分别是 5 和 12，斜边是多少？', options: ['13', '14', '15', '17'], correctAnswer: 0, hint: '计算 5² + 12²，再开平方', type: 'choice' },
  { id: 'q13', knowledgePointId: 'kp3', question: '直角三角形的两条直角边分别是 6 和 8，斜边是多少？', options: ['9', '10', '11', '12'], correctAnswer: 1, hint: '6² = 36，8² = 64，先加起来', type: 'choice' },
  { id: 'q14', knowledgePointId: 'kp3', question: '直角三角形斜边为 13，一条直角边为 5，另一条直角边是多少？', options: ['10', '11', '12', '14'], correctAnswer: 2, hint: '用 c² - a² = b² 来求', type: 'choice' }
];

// ---------------------------------------------------------------------------
// 等级体系
// ---------------------------------------------------------------------------

const LEVELS = [
  { level: 1, name: '见习学员', icon: '🌱', required: 0, desc: '踏出数学学习的第一步，完成首次知识点学习' },
  { level: 2, name: '数学新星', icon: '✨', required: 50, desc: '展现了持续学习的毅力，对基础概念有了初步理解' },
  { level: 3, name: '解题能手', icon: '🧮', required: 120, desc: '在数学的道路上稳步前进，展现出不错的能力' },
  { level: 4, name: '思维达人', icon: '🧠', required: 220, desc: '融会贯通，能够灵活运用知识解决变式问题' },
  { level: 5, name: '错题终结者', icon: '🏆', required: 320, desc: '最高荣耀！所有知识点全部掌握，错题近乎为零' }
];

// 经验怎么来（等级页「经验获取方式」直接渲染这份表）
const EXP_RULES = [
  { icon: '🎬', action: '完成一次讲题课堂', exp: 20, reward: '星尘 +20', note: '五步走完一个知识点并结课' },
  { icon: '📝', action: '答对一道标准题', exp: 10, reward: '星尘 +10', note: '答题星球与标准题训练共用这条规则' },
  { icon: '🛰', action: '完成一局星际天梯', exp: 0, reward: '星尘 +3 ~ +12', note: '胜场拿最多；免费版每天 3 局，领航员每天 10 局' },
  { icon: '📅', action: '每日签到', exp: 0, reward: '星尘 +2', note: '连续签到满 7 天当天额外 +10 星尘（不计经验）' },
  { icon: '🛠️', action: '订正一道错题', exp: 0, reward: '订正率 +1', note: '错因归档 + 回课堂重讲，不计经验但会进错因雷达' },
  { icon: '🏅', action: '解锁一枚徽章', exp: 0, reward: '成就展示', note: '徽章与掌握度只做成就展示，不再折算星钻' }
];

function resolveLevel(exp) {
  let current = LEVELS[0];
  LEVELS.forEach(item => { if (exp >= item.required) current = item; });
  const next = LEVELS.find(item => item.level === current.level + 1) || null;
  const progress = exp - current.required;
  const required = next ? next.required - current.required : 100;
  return {
    current: current.level,
    name: current.name,
    icon: current.icon,
    exp,
    progress: Math.min(progress, required),
    required,
    nextLevel: next ? next.name : null,
    nextRequired: next ? next.required : null,
    maxed: !next
  };
}

// ---------------------------------------------------------------------------
// 趣味化数据
// ---------------------------------------------------------------------------

const gamification = {
  u1: {
    exp: 128,
    points: 128,
    // 星钻 = 等值充值买来的（1 元 = 1 星钻）；crystalUsed 记已经花掉的偏移量
    crystalRecharge: 12,
    crystalUsed: 0,
    streakDays: 4,
    totalCheckins: 16,
    badges: [
      { id: 'b1', name: '初来乍到', icon: '🌱', unlockedAt: dateOnly(24), description: '完成首次学习' },
      { id: 'b2', name: '首战告捷', icon: '✅', unlockedAt: dateOnly(22), description: '第一次答对题目' },
      { id: 'b3', name: '答题达人', icon: '⚡', unlockedAt: dateOnly(18), description: '连续答对 3 题' },
      { id: 'b4', name: '星球探索者', icon: '🪐', unlockedAt: dateOnly(9), description: '探索全部数学星球' },
      { id: 'b5', name: '七日之约', icon: '📅', unlockedAt: null, description: '连续签到 7 天' },
      { id: 'b6', name: '百题斩', icon: '🎯', unlockedAt: null, description: '累计答对 100 题' },
      { id: 'b7', name: '错题终结者', icon: '🛠️', unlockedAt: null, description: '成功纠正 10 道错题' },
      { id: 'b8', name: '全勤之星', icon: '📆', unlockedAt: null, description: '连续签到 14 天' },
      { id: 'b9', name: '数学探险家', icon: '🧭', unlockedAt: null, description: '完成 10 次学习会话' },
      { id: 'b10', name: '荣耀学者', icon: '🏆', unlockedAt: null, description: '全部知识点达到已掌握' }
    ],
    checkinHistory: [
      { date: dateOnly(4), points: 2 },
      { date: dateOnly(3), points: 2 },
      { date: dateOnly(2), points: 2 },
      { date: dateOnly(1), points: 2 }
    ]
  }
};

gamification.u1.level = resolveLevel(gamification.u1.exp);

// ---------------------------------------------------------------------------
// 错因分类 + 对应建议
// ---------------------------------------------------------------------------

const errorTypes = [
  { id: 'e1', name: '概念不清', description: '对数学概念理解不准确', advice: '回到第 1–2 步，用自己的话把概念讲一遍，再做题。' },
  { id: 'e2', name: '条件识别', description: '未能正确识别题目条件', advice: '做题前先圈出已知条件，用一句话写下「题目给了我什么」。' },
  { id: 'e3', name: '公式错误', description: '记错或用错公式', advice: '把公式抄写三遍，并说出每个字母代表哪条边 / 哪个量。' },
  { id: 'e4', name: '符号混淆', description: '正负号、运算符使用错误', advice: '每一步只做一件事，写完先检查符号再算数值。' },
  { id: 'e5', name: '计算失误', description: '算术计算出错', advice: '放慢速度，把中间结果写在草稿纸上，最后回代验算。' },
  { id: 'e6', name: '不会迁移', description: '无法将知识应用到新场景', advice: '把例题的数字换掉再做一遍，观察解法是否一样。' },
  { id: 'e7', name: '无法识别', description: '不知道从何入手', advice: '先问「这道题求什么」，再找和它相关的定义或定理。' }
];

// ---------------------------------------------------------------------------
// 家长端：掌握趋势 / 守护设置
// ---------------------------------------------------------------------------

const masteryTrend = [
  { label: '第 1 周', kp1: 15, kp2: 30, kp3: 5, overall: 17 },
  { label: '第 2 周', kp1: 35, kp2: 55, kp3: 20, overall: 37 },
  { label: '第 3 周', kp1: 60, kp2: 80, kp3: 35, overall: 58 },
  { label: '本周', kp1: 75, kp2: 92, kp3: 48, overall: 72 }
];

// 学习提醒设置（挂在学生自己的账号上）
const studySettings = {
  u1: {
    studyWindow: { enabled: true, start: '18:30', end: '20:30', weekdays: [1, 2, 3, 4, 5] },
    quietHours: { enabled: true, start: '21:30', end: '07:00' },
    imagePolicy: 'session',
    reminders: { dailyReport: true, weeklyReport: true, weeklyReportDay: 0 },
    privacy: { shareRanking: false, shareToTeacher: true, analytics: true },
    updatedAt: stamp(2, 20, 10)
  }
};

// 学习报告页的小贴士（由错因动态生成，这里提供兜底文案）
const studyTips = [
  { icon: '🗣️', title: '出声讲一遍', text: '每天挑一道做过的题，出声讲一遍，讲得顺才是真的懂。' },
  { icon: '⏰', title: '固定学习时段', text: '把学习安排在每天同一时间，比临时赶工更容易坚持。' },
  { icon: '🌱', title: '关注过程而非分数', text: '多留意「步骤写完整了」「这次检查了符号」，比只盯对错更有用。' }
];

// ---------------------------------------------------------------------------
// 钱包流水（qw_wallet_log）与星钻充值订单（qw_crystal_order）
// 演示账号 u1 的余额 = 128 星尘 / 12 星钻，下面这份流水按时间顺序把余额「走」到 128 / 12
// ---------------------------------------------------------------------------

const walletLogs = [
  { id: 'wl-seed-g1', userId: 'u1', wallet: 'gem', amount: 12, balance: 12, category: 'recharge', reason: '充值 ¥12 获得 12 星钻', createdAt: stamp(6, 10, 12) },
  { id: 'wl-seed-1', userId: 'u1', wallet: 'dust', amount: 40, balance: 40, category: 'seed', reason: '历史星尘结转', createdAt: stamp(6, 10, 15) },
  { id: 'wl-seed-2', userId: 'u1', wallet: 'dust', amount: 2, balance: 42, category: 'checkin', reason: '每日签到', createdAt: stamp(5, 19, 0) },
  { id: 'wl-seed-3', userId: 'u1', wallet: 'dust', amount: 10, balance: 52, category: 'quiz', reason: '答对标准题', createdAt: stamp(5, 19, 20) },
  { id: 'wl-seed-4', userId: 'u1', wallet: 'dust', amount: 20, balance: 72, category: 'lesson', reason: '完成讲题课堂', createdAt: stamp(4, 19, 0) },
  { id: 'wl-seed-5', userId: 'u1', wallet: 'dust', amount: 2, balance: 74, category: 'checkin', reason: '每日签到', createdAt: stamp(4, 19, 10) },
  { id: 'wl-seed-6', userId: 'u1', wallet: 'dust', amount: 10, balance: 84, category: 'quiz', reason: '答对标准题', createdAt: stamp(3, 20, 0) },
  { id: 'wl-seed-7', userId: 'u1', wallet: 'dust', amount: 20, balance: 104, category: 'lesson', reason: '完成讲题课堂', createdAt: stamp(3, 20, 30) },
  { id: 'wl-seed-8', userId: 'u1', wallet: 'dust', amount: 2, balance: 106, category: 'checkin', reason: '每日签到', createdAt: stamp(2, 18, 0) },
  { id: 'wl-seed-9', userId: 'u1', wallet: 'dust', amount: 10, balance: 116, category: 'quiz', reason: '答对标准题', createdAt: stamp(2, 18, 20) },
  { id: 'wl-seed-10', userId: 'u1', wallet: 'dust', amount: 2, balance: 118, category: 'checkin', reason: '每日签到', createdAt: stamp(1, 19, 0) },
  { id: 'wl-seed-11', userId: 'u1', wallet: 'dust', amount: 10, balance: 128, category: 'quiz', reason: '答对标准题', createdAt: stamp(1, 19, 30) }
];

const crystalOrders = [
  { orderNo: 'CR20260908SEEDA01', userId: 'u1', packId: 'c6', amount: 6, crystal: 6, channel: 'wechat', payCode: 'QWPAY:wechat:CR20260908SEEDA01:SEED', status: 'paid', createdAt: stamp(6, 10, 10), paidAt: stamp(6, 10, 12) },
  { orderNo: 'CR20260908SEEDA02', userId: 'u1', packId: 'c6', amount: 6, crystal: 6, channel: 'wechat', payCode: 'QWPAY:wechat:CR20260908SEEDA02:SEED', status: 'paid', createdAt: stamp(6, 10, 11), paidAt: stamp(6, 10, 12) }
];

// ---------------------------------------------------------------------------
// 星际天梯（联机挑战）
//   · season  当前赛季；profile 记段位积分与每日场次；rivals 是演示用的「星海对手」
//   · rivals 是演示数据：人少时匹配不到真人，用它们补位并撑起天梯榜，
//     页面上会给这些条目打一枚「演示」小标，不冒充真实用户。
// ---------------------------------------------------------------------------

const ladderSeasons = [
  { id: 's1', name: 'S1 · 星海启航', startAt: dateOnly(21), endAt: dateOnly(-49), status: 'active' }
];

const ladderProfiles = {
  u1: {
    seasonId: 's1',
    rating: 1128,
    tier: 'streak',
    wins: 7,
    losses: 4,
    draws: 1,
    streak: 2,
    bestStreak: 4,
    bestScore: 1180,
    dailyDate: TODAY,
    dailyUsed: 0,
    guard: 0,
    updatedAt: stamp(0, 19, 40)
  }
};

// 演示对手：积分围绕玩家分布，accuracy 决定它们大概能答对几成
const ladderRivals = [
  { id: 'r1', name: '豆豆', avatar: '🐣', rating: 980, accuracy: 0.42, title: '刚学会起飞' },
  { id: 'r2', name: '莉莉', avatar: '👧', rating: 1090, accuracy: 0.50, title: '细心派' },
  { id: 'r3', name: '小航', avatar: '🧑‍🚀', rating: 1180, accuracy: 0.58, title: '稳扎稳打' },
  { id: 'r4', name: '阿星', avatar: '👦', rating: 1245, accuracy: 0.64, title: '手速很快' },
  { id: 'r5', name: '小舟', avatar: '🧑‍🎓', rating: 1350, accuracy: 0.72, title: '公式记得牢' },
  { id: 'r6', name: '银河', avatar: '🌠', rating: 1420, accuracy: 0.78, title: '星海老手' }
];

const ladderMatches = [];
const ladderAnswers = [];

module.exports = {
  TODAY,
  ladderSeasons,
  ladderProfiles,
  ladderRivals,
  ladderMatches,
  ladderAnswers,
  users,
  knowledgePoints,
  learningSessions,
  quizzes,
  gamification,
  walletLogs,
  crystalOrders,
  LEVELS,
  EXP_RULES,
  resolveLevel,
  errorTypes,
  masteryTrend,
  studySettings,
  studyTips,
  dateOnly,
  stamp
};
