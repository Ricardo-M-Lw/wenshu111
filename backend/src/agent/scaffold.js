// 问数智能体 · 引导式教学骨架（通用模版）
// ---------------------------------------------------------------------------
// 设计原则：「脚本管骨架，大模型管临场」。
//   · 脚本（本文件）：五步教学闭环 / 答题六步 SOP / 错因分类矩阵 / 话术模版
//   · 临场（大模型）：判答、一句话短评、降级追问 —— 但只能从矩阵里挑标签，不自由发挥
// 所有话术都守「不泄答案」红线：只指出错因类别，绝不铺开完整正解。
// ---------------------------------------------------------------------------

const MAX_HINTS = 3; // 同一道题的提示上限，超过则标注「本题需要老师介入」

// ---------------------------------------------------------------------------
// 一、通用教学闭环（五步法）
// 情境唤醒 → 概念建构 → 标准训练 → 错因诊断 → 提问纠正
// ---------------------------------------------------------------------------
const STAGES = [
  {
    key: 'anchor',
    step: 1,
    en: 'Anchor',
    name: '情境唤醒与认知冲突',
    short: '情境唤醒',
    goal: '从旧知引出新知，让学生感到「原来会的办法不够用了」。',
    figure: '前置知识图 / 生活场景图 / 几何直观图',
    scripts: [
      '小宇航员，以前我们学过 {旧知识}，现在黑板上出现了 {新现象}。你发现它和以前有什么不一样吗？',
      '如果要解决这个问题，我们以前的方法还够用吗？'
    ],
    fallback: ['A. 变了', 'B. 没变', 'C. 还不知道'],
    llmTask: '判断学生有没有察觉到新旧差异；没察觉就换更小的数字再问一次。'
  },
  {
    key: 'explore',
    step: 2,
    en: 'Explore',
    name: '概念建构与直观感知',
    short: '概念建构',
    goal: '让图自己说话：通过切换、高亮、改参数，让学生自己发现规律。',
    figure: '核心概念动态演示图（面积拼图 / 函数图像 / 几何辅助线）',
    scripts: [
      '观察黑板上的图，当 {参数A} 变化的时候，{参数B} 是怎么跟着变的？',
      '你能用自己的话，把看到的规律描述出来吗？'
    ],
    fallback: ['A. 跟着变大', 'B. 跟着变小', 'C. 好像没关系'],
    llmTask: '判断学生的口语描述有没有碰到核心概念；跑偏了用追问拉回来，不要直接给结论。'
  },
  {
    key: 'formalize',
    step: 3,
    en: 'Formalize',
    name: '抽象归纳与符号化',
    short: '抽象归纳',
    goal: '从具体数字走到一般规律、公式或定理。',
    figure: '公式推导高亮图 / 定理结构拆解图',
    scripts: [
      '如果把刚才的数字换成字母，你能把规律总结成一个式子吗？',
      '看着黑板上的结构，你觉得这个结论成立的关键条件是什么？'
    ],
    fallback: ['A. 条件要写清楚', 'B. 什么图形都行', 'C. 我也不确定'],
    llmTask: '只判定「这一步对不对」；符号化没完成就退回阶段二，用更简单的数字重走一遍。'
  },
  {
    key: 'practice',
    step: 4,
    en: 'Practice',
    name: '标准题训练与独立作答',
    short: '标准训练',
    goal: '用刚学的知识做一道标准题，把真实的问题暴露出来。',
    figure: '原题固定图 + 答题区（拍照 / 写字板 / 键盘输入）',
    scripts: [
      '现在来试一道标准题。请把你的解题过程写下来或拍下来传给我，我不看答案，只看你的步骤。',
      '想一想，用我们刚才总结的结论，第一步应该先找什么？'
    ],
    fallback: ['A. 先找已知条件', 'B. 先套公式', 'C. 不知道从哪开始'],
    llmTask: '识别学生卡在哪一步，不要代算；只出结构固定的题，数字可变。'
  },
  {
    key: 'diagnose',
    step: 5,
    en: 'Diagnose & Correct',
    name: '错因诊断与提问式纠正',
    short: '错因纠正',
    goal: '精准定位错因，用提问让学生自己改对（不泄答案）。',
    figure: '原题高亮错误步骤 / 公式代入参数模版',
    scripts: [
      '你在 {某一步} 好像出现了一点小状况（{错因类型}），我们回到黑板上的图再检查一下？',
      '改对之后我们立刻换一个数字，你再试一次，看看是不是真的掌握了。'
    ],
    fallback: ['A. 我重新算这一步', 'B. 我换个方法试试', 'C. 帮我拆得再小一点'],
    llmTask: '从错因矩阵里选一个主标签（可带一个次标签），给一句话短评 + 一个降级追问，再做变式确认。'
  }
];

// ---------------------------------------------------------------------------
// 二、引导式答题 SOP（六步）
// ---------------------------------------------------------------------------
const ANSWER_SOP = [
  { key: 'read', name: '读题与信息提取', action: '先看系数与条件，把「题目给了我什么」写成一句话。', script: '要解这道题，我们先看它的条件。题目里给了哪些数字？' },
  { key: 'strategy', name: '策略选择脚手架', action: '给方法选择树，让学生自己挑，不替他选。', script: '想一想，这道题用哪种方法最快？你选哪一个？' },
  { key: 'attempt', name: '独立作答过程识别', action: '只看步骤不看结论，识别他卡在哪一步。', script: '把你的过程写下来或拍给我，我不看答案，只看你的步骤。' },
  { key: 'classify', name: '错因分档与一句话短评', action: '从错因矩阵里选一个主标签，写一句话短评。', script: '你在 {某一步} 好像出现了一点小状况（{错因类型}），我们再检查一下？' },
  { key: 'correct', name: '提问式纠正', action: '用降级追问拆小问题，直到学生自己算出中间量。', script: '我们回到出错的那一步：这里的条件是什么？你用的公式是什么？' },
  { key: 'transfer', name: '变式训练与掌握反馈', action: '换一个数字出同型题，确认是不是真的掌握。', script: '刚才的错误我们已经纠正了，现在换一个数字，你再来试一次。' }
];

// ---------------------------------------------------------------------------
// 三、通用错因分类矩阵（大模型只在库里选，不自由发挥）
// aliases 用于把历史数据里的错因名称映射回本矩阵
// ---------------------------------------------------------------------------
const ERROR_MATRIX = [
  {
    key: 'concept',
    label: '概念不清',
    aliases: ['概念不清', '条件识别'],
    symptoms: ['忽略 a ≠ 0 这类前提条件', '把勾股定理用在非直角三角形上', '绝对值算出负数'],
    strategy: '退回「概念建构」阶段，用图重新提问适用条件。',
    probe: ['这个图是直角三角形吗？如果不是，我们还能用这个定理吗？'],
    fallback: ['A. 是直角三角形', 'B. 不是直角三角形', 'C. 看不出来']
  },
  {
    key: 'strategy',
    label: '策略 / 逻辑错',
    aliases: ['不会迁移'],
    symptoms: ['该因式分解却硬套公式', '条件和结论倒着推', '漏掉分类讨论'],
    strategy: '退回策略选择，给方法选择树，让学生自己重选。',
    probe: ['用公式法当然可以，但你看常数项，是不是拆成两个数相乘更快？'],
    fallback: ['A. 因式分解法', 'B. 配方法', 'C. 公式法']
  },
  {
    key: 'symbol',
    label: '符号 / 公式错',
    aliases: ['符号混淆', '公式错误'],
    symptoms: ['求根公式分母写成 a', '移项忘记变号', '去括号漏乘负号'],
    strategy: '高亮公式模板，让学生代入参数，重新算这一步。',
    probe: ['原题里 b 是几？那么 −b 应该是多少？你代入的时候写对了吗？'],
    fallback: ['A. 符号写反了', 'B. 公式记错了', 'C. 我再检查一遍']
  },
  {
    key: 'compute',
    label: '纯计算错',
    aliases: ['计算失误'],
    symptoms: ['3 × 4 算成 7', '开平方漏掉负数根', '2³ 算成 6'],
    strategy: '不重讲知识点，直接让学生把这一步重算一遍。',
    probe: ['我们重新算一下这一步，先别管思路，只看数字：这里的乘法结果是多少？'],
    fallback: ['A. 我重算一遍', 'B. 我用草稿纸验算', 'C. 我口算容易错']
  },
  {
    key: 'blank',
    label: '空白 / 看不清',
    aliases: ['无法识别'],
    symptoms: ['答题区空着没写', '拍照太暗或手写认不出'],
    strategy: '绝不报错。降级为选项或追问，先把学生带进这道题。',
    probe: ['没关系，我们先不写字。你求的是哪一条边？', '这张图有点看不清，你能把题目里的数字念给我听吗？'],
    fallback: ['A. 求斜边', 'B. 求直角边', 'C. 我还不确定求什么']
  },
  {
    key: 'emotion',
    label: '情绪 / 跑题',
    aliases: ['跑题', '情绪'],
    symptoms: ['答非所问', '说「烦死了」「直接告诉我」'],
    strategy: '触发拦截，换成轻松语气，把问题缩到最简单的一个选项。',
    probe: ['我理解你想快点做完。那我们只做最小的一步：这一步里你最先看到的是哪个数字？'],
    fallback: ['A. 我歇一下再来', 'B. 换个最简单的问法', 'C. 我想换个知识点']
  }
];

const STAGE_ORDER = STAGES.map(item => item.key);

// 讲题步骤名 → 教学阶段；命中不了再按序号比例映射
const STEP_NAME_RULES = [
  { stage: 'anchor', keys: ['情境', '导入', '唤醒', '生活'] },
  { stage: 'explore', keys: ['概念', '观察', '猜想', '感知', '测量', '动手', '探究'] },
  { stage: 'practice', keys: ['例题', '应用', '练习', '训练', '拓展', '逆定理'] },
  { stage: 'formalize', keys: ['定理', '证明', '表述', '归纳', '公式', '抽象', '推导'] },
  { stage: 'diagnose', keys: ['小结', '变式', '易错', '诊断', '纠正', '复盘', '自查'] }
];

function getStage(key) {
  return STAGES.find(item => item.key === key || item.name === key) || null;
}

function stageForStepName(name) {
  const text = String(name || '');
  if (!text) return null;
  for (let i = 0; i < STEP_NAME_RULES.length; i += 1) {
    const rule = STEP_NAME_RULES[i];
    for (let k = 0; k < rule.keys.length; k += 1) {
      if (text.indexOf(rule.keys[k]) !== -1) return rule.stage;
    }
  }
  return null;
}

function stageForStepIndex(stepIndex, total) {
  const count = Math.max(1, Number(total) || STAGES.length);
  const index = Math.max(0, Math.min(Number(stepIndex) || 0, count - 1));
  const slot = Math.min(STAGE_ORDER.length - 1, Math.floor((index * STAGE_ORDER.length) / count));
  return STAGE_ORDER[slot];
}

// 优先按步骤名判断，判断不出再按序号
function resolveStage(stepName, stepIndex, total) {
  return stageForStepName(stepName) || stageForStepIndex(stepIndex, total);
}

function stageInfo(stepName, stepIndex, total) {
  const key = resolveStage(stepName, stepIndex, total);
  const stage = getStage(key) || STAGES[0];
  return {
    key: stage.key,
    step: stage.step,
    name: stage.name,
    short: stage.short,
    en: stage.en,
    goal: stage.goal,
    figure: stage.figure,
    scripts: stage.scripts,
    fallback: stage.fallback,
    llmTask: stage.llmTask
  };
}

// ---------------------------------------------------------------------------
// 四、错因矩阵读写：标签归一 / 一句话短评 / 降级追问 / 降级选项
// ---------------------------------------------------------------------------
function matrixEntry(keyOrLabel) {
  const text = String(keyOrLabel || '');
  if (!text) return null;
  return ERROR_MATRIX.find(item => item.key === text || item.label === text)
    || ERROR_MATRIX.find(item => item.aliases.indexOf(text) !== -1)
    || null;
}

function normalizeErrorType(name) {
  const entry = matrixEntry(name);
  return entry ? entry.key : null;
}

// 一句话短评：只指错因类别，绝不铺开完整正解
function shortComment(errorType, stepName) {
  const entry = matrixEntry(errorType) || ERROR_MATRIX[0];
  const where = stepName ? '「' + stepName + '」这一步' : '这一步';
  return '你在' + where + '好像出现了一点小状况（' + entry.label + '），我们回到黑板上的图再检查一下？';
}

function probeFor(errorType, index) {
  const entry = matrixEntry(errorType) || ERROR_MATRIX[0];
  const list = entry.probe || [];
  if (!list.length) return '';
  const at = Math.max(0, Math.min(Number(index) || 0, list.length - 1));
  return list[at];
}

function fallbackFor(errorType) {
  const entry = matrixEntry(errorType) || ERROR_MATRIX[0];
  return (entry.fallback || []).slice();
}

// 学生这句话最可能属于哪一类错因（规则命中，命中不了返回 null）
const ERROR_TEXT_RULES = [
  { key: 'blank', keys: ['没写', '空白', '看不清', '看不见', '模糊', '认不出'] },
  { key: 'emotion', keys: ['烦', '不想学', '直接告诉', '给答案', '太难了', '讨厌'] },
  { key: 'symbol', keys: ['符号', '负号', '变号', '正负', '分母'] },
  { key: 'compute', keys: ['算错', '计算', '算成', '乘错', '加错'] },
  { key: 'strategy', keys: ['哪种方法', '怎么选', '想不到方法', '套公式', '用哪个方法'] },
  { key: 'concept', keys: ['什么是', '为什么', '适用', '条件', '不懂'] }
];

function classifyError(text) {
  const source = String(text || '');
  if (!source) return null;
  for (let i = 0; i < ERROR_TEXT_RULES.length; i += 1) {
    const rule = ERROR_TEXT_RULES[i];
    for (let k = 0; k < rule.keys.length; k += 1) {
      if (source.indexOf(rule.keys[k]) !== -1) return rule.key;
    }
  }
  return null;
}

// 提示次数到顶：不再追问，改为展示标准步骤图 + 标注需要老师介入
function hintLimitReply(stepName) {
  return '这道题的提示我们已经用了 ' + MAX_HINTS + ' 次啦。'
    + '\n· 我把标准步骤图放大给你看，你对着图核对自己的每一步。'
    + '\n· 剩下的部分标注为「本题需要老师介入」，下节课当面讲效果更好。'
    + '\n\n不过先别急着走：你能自己把「' + (stepName || '这一步') + '」复述一遍吗？能讲出来，就算你真的掌握了。';
}

// ---------------------------------------------------------------------------
// 五、注入系统提示词：把当前阶段 + 错因矩阵 + 红线交给大模型
// ---------------------------------------------------------------------------
function promptBlock(stageKey) {
  const stage = getStage(stageKey) || STAGES[0];
  const lines = [];
  lines.push('【引导式教学骨架 · 必须遵守】');
  lines.push('当前阶段：阶段' + stage.step + '「' + stage.name + '」（' + stage.en + '）');
  lines.push('本阶段目标：' + stage.goal);
  lines.push('本阶段图模板：' + stage.figure);
  lines.push('本阶段脚本（用你自己的话改写，不要照读）：');
  stage.scripts.forEach(item => lines.push('  · ' + item));
  lines.push('答不出时的降级选项：' + stage.fallback.join(' / '));
  lines.push('这一步你只做一件事：' + stage.llmTask);
  lines.push('');
  lines.push('【错因分类矩阵：只能从下面 ' + ERROR_MATRIX.length + ' 类里选一个主标签，不要自由发挥】');
  ERROR_MATRIX.forEach((item, index) => {
    lines.push((index + 1) + '. ' + item.label + ' —— 典型表现：' + item.symptoms.join('；') + '；应对：' + item.strategy);
  });
  lines.push('');
  lines.push('【一句话短评模版】你在「某一步」好像出现了一点小状况（错因类型），我们回到黑板上的图再检查一下？');
  lines.push('红线：短评只指错因类别，不写完整正解；同一题提示上限 ' + MAX_HINTS
    + ' 次，超过就说「本题需要老师介入」。');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 六、对外说明（前端展示用，不含任何题目答案）
// ---------------------------------------------------------------------------
function describe() {
  return {
    principle: '脚本管骨架，大模型管临场',
    maxHints: MAX_HINTS,
    loop: STAGES.map(item => ({
      step: item.step,
      key: item.key,
      name: item.name,
      short: item.short,
      goal: item.goal,
      figure: item.figure,
      scripts: item.scripts,
      fallback: item.fallback
    })),
    sop: ANSWER_SOP.map(item => ({ key: item.key, name: item.name, action: item.action, script: item.script })),
    errorMatrix: ERROR_MATRIX.map(item => ({
      key: item.key,
      label: item.label,
      symptoms: item.symptoms,
      strategy: item.strategy,
      probe: item.probe
    })),
    redline: '短评只指错因类别，绝不铺开完整正解；同一题提示上限 ' + MAX_HINTS + ' 次。'
  };
}

module.exports = {
  MAX_HINTS,
  STAGES,
  STAGE_ORDER,
  ANSWER_SOP,
  ERROR_MATRIX,
  stageInfo,
  getStage,
  resolveStage,
  stageForStepName,
  stageForStepIndex,
  matrixEntry,
  normalizeErrorType,
  classifyError,
  shortComment,
  probeFor,
  fallbackFor,
  hintLimitReply,
  promptBlock,
  describe
};