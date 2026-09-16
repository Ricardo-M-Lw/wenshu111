// 问数智能体 · 安全护栏
// ---------------------------------------------------------------------------
// 三道闸门：
//   1) inspect()       入站——限制词 / 敏感词分类拦截，只放行合规消息给大模型
//   2) refuseAnswer()  「不泄答案」引导话术：把大问题拆小，交给学生自己迈出下一步
//   3) inspectReply()  出站——大模型回复若直接宣布了正确选项，就地改写成引导话术
// ---------------------------------------------------------------------------

const { WORDS, PATTERNS, CATEGORIES, ORDER } = require('./blocklist');
const scaffold = require('./scaffold');

function normalize(message) {
  return String(message || '').replace(/\s+/g, '').trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 按 ORDER 优先级逐类匹配，命中即返回分类名
function matchCategory(text) {
  for (let i = 0; i < ORDER.length; i += 1) {
    const name = ORDER[i];
    const words = WORDS[name] || [];
    for (let w = 0; w < words.length; w += 1) {
      if (text.indexOf(words[w]) !== -1) return name;
    }
    const patterns = PATTERNS[name] || [];
    for (let p = 0; p < patterns.length; p += 1) {
      if (patterns[p].test(text)) return name;
    }
  }
  return null;
}

// 返回 { blocked, type, category, label, severity, soft, reply }
function inspect(message, context) {
  const text = normalize(message);
  if (!text) return { blocked: false };
  // 纯数字 / 纯符号（例如学生只回了一个选项）不做过筛
  if (!/[\u4e00-\u9fa5a-zA-Z]/.test(text)) return { blocked: false };

  const category = matchCategory(text);
  if (!category) return { blocked: false };

  const meta = CATEGORIES[category] || {};
  const reply = category === 'answer' || !meta.reply
    ? refuseAnswer(context)
    : meta.reply;

  return {
    blocked: true,
    type: category,
    category,
    label: meta.label || category,
    severity: meta.severity || 'medium',
    soft: meta.severity === 'low',
    reply
  };
}

// 「不泄答案」时的引导话术：把大问题拆小，交给学生自己迈出下一步
function refuseAnswer(context) {
  const step = context && context.lesson && context.lesson.steps
    ? context.lesson.steps[context.stepIndex]
    : null;
  const head = '我理解你想快点知道结果，不过如果我说了，这道题就白做了 😌';

  // 提示次数到顶：不再靠追问，改为展示标准步骤图 + 标注「需要老师介入」
  const used = context && context.profile ? Number(context.profile.hintCount) || 0 : 0;
  if (step && used >= scaffold.MAX_HINTS) return scaffold.hintLimitReply(step.name);

  if (!step) {
    return head + '\n\n换个方式：你先把题目里已知的条件念给我听，我陪你一步一步往下推。';
  }

  const firstHint = step.checkpoint && step.checkpoint.hints ? step.checkpoint.hints[0] : '';
  return head + '\n\n我们现在在第 ' + (context.stepIndex + 1) + ' 步「' + step.name + '」，先把这一小步想清楚：'
    + '\n· ' + (firstHint || '你觉得题目给出的条件里，哪个数字最可能先派上用场？')
    + '\n\n你先说一个你的想法，说错也没关系，我们再一起看哪里可以调整。';
}

// 出站检查：大模型有时会好心直接报出正确选项，这里拦回来
function inspectReply(reply, context) {
  const text = String(reply || '');
  if (!text) return { leaked: false, reply: text };

  const step = context && context.lesson && context.lesson.steps
    ? context.lesson.steps[context.stepIndex]
    : null;
  const checkpoint = step && step.checkpoint ? step.checkpoint : null;
  if (!checkpoint || !Array.isArray(checkpoint.options)) return { leaked: false, reply: text };

  const correctIndex = typeof checkpoint.correct === 'number' ? checkpoint.correct : -1;
  if (correctIndex < 0 || correctIndex >= checkpoint.options.length) return { leaked: false, reply: text };

  const letter = 'ABCD'[correctIndex];
  const optionText = String(checkpoint.options[correctIndex] || '').replace(/\s+/g, '');
  const compact = text.replace(/\s+/g, '');

  // 1) 宣布选项字母：答案是 B / 应该选 B
  const byLetter = /(答案|正确答案|正确选项|应该选|选|就选)(是|为|就是|：|:)?([A-D])/.exec(compact);
  if (byLetter && byLetter[3] === letter) {
    return { leaked: true, reason: 'letter', reply: leakRewrite(context) };
  }

  // 2) 宣布选项原文：答案是 y = 2x + 8
  if (optionText.length >= 2) {
    const byValue = new RegExp('(答案|正确答案|正确选项|得数|结果|就是)(是|为|：|:)?' + escapeRegExp(optionText));
    if (byValue.test(compact)) {
      return { leaked: true, reason: 'value', reply: leakRewrite(context) };
    }
  }

  return { leaked: false, reply: text };
}

function leakRewrite(context) {
  return '哎，我差点把结论说出来了 😅\n\n' + refuseAnswer(context);
}

// 对外说明：给前端 / 老师看「我们拦了哪些类别」，但不暴露具体词表
function describe() {
  const items = ORDER.map(key => {
    const meta = CATEGORIES[key] || {};
    const patternCount = (PATTERNS[key] || []).length;
    const wordCount = (WORDS[key] || []).length;
    return {
      key,
      label: meta.label || key,
      severity: meta.severity || 'medium',
      soft: meta.severity === 'low',
      rules: wordCount + patternCount
    };
  });
  return {
    total: items.reduce((sum, item) => sum + item.rules, 0),
    categories: items
  };
}
module.exports = {
  inspect,
  inspectReply,
  refuseAnswer,
  matchCategory,
  describe,
  ANSWER_PATTERNS: PATTERNS.answer,
  UNSAFE_PATTERNS: [].concat(PATTERNS.abuse || [], PATTERNS.adult || [], PATTERNS.violence || []),
  WORD_BLOCKLIST: WORDS,
  CATEGORIES
};