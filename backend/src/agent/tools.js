// 问数智能体 - 工具集
// 模型（或规则引擎）只能通过这里的工具获取事实，保证「答案」永远留在服务端

const { lessons } = require('../models/lessons');
const { quizzes, errorTypes } = require('../models/mockData');

// ---------------------------------------------------------------------------
// 工具声明（供大模型的 function calling 使用）
// ---------------------------------------------------------------------------
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_lesson_status',
      description: '获取学生当前所在的讲题步骤、总步骤数和整体进度',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_step_detail',
      description: '获取某个讲题步骤的讲解要点、黑板图形和检查点题目（不含答案）',
      parameters: {
        type: 'object',
        properties: { stepIndex: { type: 'integer', description: '步骤序号，从 0 开始，默认当前步骤' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_hint',
      description: '获取分级提示。level=1 提醒相关概念，level=2 指出思考方向，level=3 给出第一步怎么做。绝不返回答案。',
      parameters: {
        type: 'object',
        properties: { level: { type: 'integer', description: '提示级别 1-3，默认 1' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_answer',
      description: '提交学生对当前检查点的选择并判题，返回对错、引导语和错因归类',
      parameters: {
        type: 'object',
        properties: { answer: { type: 'string', description: '学生选择的选项，如 A / B / C / D，或选项原文' } },
        required: ['answer']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'explain_concept',
      description: '按关键词讲解数学概念，例如 斜率、截距、内角和、勾股定理、逆定理',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '要讲解的概念关键词' } },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_variant',
      description: '生成一道同知识点的变式练习题（不含答案）',
      parameters: {
        type: 'object',
        properties: { difficulty: { type: 'string', enum: ['easy', 'normal', 'hard'], description: '难度，默认 normal' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'classify_error',
      description: '把学生的错误归到 7 类错因之一，并给出针对性建议',
      parameters: {
        type: 'object',
        properties: { answer: { type: 'string', description: '学生给出的错误答案或错误说法' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_expression',
      description: '安全计算一个纯算术表达式，例如 3^2+4^2 或 (5+7)*2',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: '只包含数字与 + - * / ( ) ^ 的算式' } },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_lesson',
      description: '生成本次讲题的学习小结（已完成步骤、提示次数、易错点）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_error_book',
      description: '读取学生的错题本：反复出现的错因、对应的薄弱步骤和针对性建议',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_report',
      description: '生成本次学习报告：进度、提示次数、正确率、卡点与下一步建议',
      parameters: {
        type: 'object',
        properties: { range: { type: 'string', description: '统计范围，session=本次讲题，week=近一周', enum: ['session', 'week'] } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'make_plan',
      description: '按知识点缺口生成接下来三天的学习计划',
      parameters: {
        type: 'object',
        properties: { days: { type: 'integer', description: '计划天数，默认 3' } },
        required: []
      }
    }
  }
];

// ---------------------------------------------------------------------------
// 概念词典（离线也能讲清楚概念）
// ---------------------------------------------------------------------------
const CONCEPTS = {
  斜率: {
    title: '斜率 k 是什么',
    points: [
      '在 y = kx + b 里，k 就是 x 前面的那个数。',
      '它描述的是「x 每多 1，y 变化多少」。',
      'k > 0 直线上升，k < 0 直线下降，|k| 越大越陡。'
    ],
    analogy: '可以把 k 想成上坡的坡度：坡度大就陡，坡度是负的就变成下坡。'
  },
  截距: {
    title: '截距 b 是什么',
    points: [
      'b 是直线与 y 轴交点的纵坐标。',
      '求法：令 x = 0，算出来的 y 就是 b。',
      'b 决定直线从 y 轴的哪个高度出发。'
    ],
    analogy: '像出租车的起步价，不管走多远都要先付这一笔。'
  },
  内角和: {
    title: '三角形内角和',
    points: [
      '任意三角形的三个内角加起来都是 180°。',
      '原因是三个角撕下来可以拼成一个平角。',
      '推论：(n − 2) × 180° 就是 n 边形的内角和。'
    ],
    analogy: '两个三角尺的三个角加起来都是 180°，不管三角形歪成什么样都一样。'
  },
  外角: {
    title: '三角形的外角',
    points: [
      '外角 = 与它不相邻的两个内角之和。',
      '外角与相邻内角互补（加起来 180°）。'
    ],
    analogy: '把三角形的一条边延长出去，转过的那个角就是外角。'
  },
  勾股定理: {
    title: '勾股定理',
    points: [
      '只在直角三角形里成立：a² + b² = c²。',
      'a、b 是两条直角边，c 是斜边（直角对的边）。',
      '常见组合：3-4-5、5-12-13、6-8-10。'
    ],
    analogy: '两条直角边上正方形的面积加起来，正好等于斜边上正方形的面积。'
  },
  逆定理: {
    title: '勾股定理的逆定理',
    points: [
      '如果三边满足 a² + b² = c²，那这个三角形一定是直角三角形。',
      '用法：先找最长边，再算两条短边的平方和做比较。'
    ],
    analogy: '正定理是「知道是直角 → 得到平方关系」，逆定理是「得到平方关系 → 知道是直角」。'
  },
  直角边: {
    title: '直角边与斜边',
    points: [
      '直角边是夹着直角的两条边。',
      '斜边是直角正对着的那条边，也是最长的一条。',
      '公式里的 c 永远是斜边。'
    ]
  },
  因变量: {
    title: '自变量与因变量',
    points: [
      'x 是自变量，是我们主动去取的值。',
      'y 是因变量，它随着 x 的变化而变化。',
      '函数就是「给一个 x，按规则得到唯一 y」的对应关系。'
    ]
  }
};

const CONCEPT_ALIASES = [
  { keys: ['斜率', 'k是什么', '倾斜', '陡'], concept: '斜率' },
  { keys: ['截距', 'b是什么', '交点'], concept: '截距' },
  { keys: ['内角和', '180', '平角'], concept: '内角和' },
  { keys: ['外角'], concept: '外角' },
  { keys: ['勾股定理', 'a2+b2', '平方和', '斜边的平方'], concept: '勾股定理' },
  { keys: ['逆定理', '反过来'], concept: '逆定理' },
  { keys: ['直角边', '斜边'], concept: '直角边' },
  { keys: ['自变量', '因变量', '函数是什么'], concept: '因变量' }
];

// 每个知识点最容易掉的坑（用于错因归类）
const KP_ERROR_TYPE = { kp1: '符号混淆', kp2: '概念不清', kp3: '公式错误' };

function errorAdvice(name) {
  const meta = errorTypes.find(item => item.name === name);
  return meta ? meta.advice : '把这一步的计算过程写下来，再回代验算一次。';
}

function currentStep(ctx, args) {
  const lesson = ctx.lesson;
  if (!lesson || !lesson.steps) return null;
  const index = typeof args.stepIndex === 'number'
    ? Math.max(0, Math.min(args.stepIndex, lesson.steps.length - 1))
    : Math.min(ctx.stepIndex || 0, lesson.steps.length - 1);
  return { step: lesson.steps[index], index };
}

// ---------------------------------------------------------------------------
// 工具实现
// ---------------------------------------------------------------------------
const executors = {
  get_lesson_status(args, ctx) {
    const lesson = ctx.lesson || {};
    const total = lesson.steps ? lesson.steps.length : 0;
    const index = ctx.stepIndex || 0;
    return {
      lesson: lesson.title,
      stepIndex: index,
      stepName: lesson.steps ? lesson.steps[index].name : '',
      totalSteps: total,
      completedSteps: Math.max(index, 0),
      progress: total ? Math.round((index / total) * 100) : 0
    };
  },

  get_step_detail(args, ctx) {
    const found = currentStep(ctx, args);
    if (!found) return { error: '当前没有进行中的讲题步骤' };
    const step = found.step;
    return {
      index: found.index,
      name: step.name,
      tag: step.tag,
      summary: step.summary,
      diagram: step.diagram ? step.diagram.title : '',
      question: step.checkpoint ? step.checkpoint.question : '',
      options: step.checkpoint ? step.checkpoint.options : []
    };
  },

  get_hint(args, ctx) {
    const found = currentStep(ctx, args);
    if (!found || !found.step.checkpoint) return { error: '当前步骤没有提示' };
    const hints = found.step.checkpoint.hints || [];
    const level = Math.max(1, Math.min(Number(args.level) || 1, hints.length));
    const levelName = level === 1 ? '概念提醒' : level === 2 ? '思考方向' : '第一步怎么做';
    return {
      level,
      levelName,
      text: hints[level - 1],
      total: hints.length,
      hasMore: level < hints.length
    };
  },

  check_answer(args, ctx) {
    const found = currentStep(ctx, args);
    if (!found || !found.step.checkpoint) return { error: '当前步骤没有检查点' };
    const checkpoint = found.step.checkpoint;
    const raw = String(args.answer == null ? '' : args.answer).trim();
    let index = -1;

    if (/^[A-Da-d]$/.test(raw)) index = raw.toUpperCase().charCodeAt(0) - 65;
    else if (/^[1-4]$/.test(raw)) index = Number(raw) - 1;
    else index = checkpoint.options.findIndex(text => text === raw || text.indexOf(raw) !== -1);

    if (index < 0 || index >= checkpoint.options.length) {
      return { parsed: false, message: '没能识别你选的选项，请直接回复 A、B、C 或 D。' };
    }

    const isCorrect = index === checkpoint.correct;
    const errorType = isCorrect ? null : KP_ERROR_TYPE[ctx.kpId] || '概念不清';
    return {
      parsed: true,
      isCorrect,
      chosen: String.fromCharCode(65 + index) + '. ' + checkpoint.options[index],
      feedback: isCorrect ? checkpoint.correctText : (checkpoint.wrongText[String(index)] || checkpoint.wrongText._),
      errorType,
      advice: isCorrect ? null : errorAdvice(errorType),
      summary: found.step.summary
    };
  },

  explain_concept(args, ctx) {
    const keyword = String(args.keyword || '').trim();
    let key = null;
    if (keyword && CONCEPTS[keyword]) key = keyword;
    if (!key) {
      const hit = CONCEPT_ALIASES.find(item => item.keys.some(k => keyword.indexOf(k) !== -1));
      if (hit) key = hit.concept;
    }
    if (!key && ctx.lesson) {
      const hit = CONCEPT_ALIASES.find(item => item.keys.some(k => String(ctx.lesson.title).indexOf(k) !== -1));
      if (hit) key = hit.concept;
    }
    if (!key) key = '斜率';
    return Object.assign({ keyword: key }, CONCEPTS[key]);
  },

  generate_variant(args, ctx) {
    const pool = quizzes.filter(item => item.knowledgePointId === ctx.kpId);
    if (!pool.length) return { error: '这个知识点暂时没有更多变式题' };
    const used = (ctx.profile && ctx.profile.variantIds) || [];
    const fresh = pool.filter(item => used.indexOf(item.id) === -1);
    const list = fresh.length ? fresh : pool;
    const picked = list[Math.floor(Math.random() * list.length)];
    return {
      id: picked.id,
      question: picked.question,
      options: picked.options,
      hint: picked.hint,
      difficulty: args.difficulty || 'normal'
    };
  },

  classify_error(args, ctx) {
    const name = KP_ERROR_TYPE[ctx.kpId] || '概念不清';
    return {
      errorType: name,
      description: (errorTypes.find(item => item.name === name) || {}).description || '',
      advice: errorAdvice(name),
      answer: args.answer || null
    };
  },

  evaluate_expression(args) {
    const raw = String(args.expression || '')
      .replace(/[×✕xX]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[−–—]/g, '-')
      .replace(/\^/g, '**')
      .replace(/²/g, '**2')
      .replace(/³/g, '**3')
      .replace(/,/g, '')
      .trim();

    if (!/^[0-9+\-*/().\s*]+$/.test(raw)) {
      return { ok: false, message: '我只能计算纯数字算式，比如 3^2+4^2 这种。' };
    }
    try {
      // 只允许数字与四则运算符，因此这里是安全的
      const value = Function('"use strict";return (' + raw + ')')();
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, message: '这个算式我算不出来，检查一下有没有写错。' };
      }
      return { ok: true, expression: raw, value: Math.round(value * 10000) / 10000 };
    } catch (err) {
      return { ok: false, message: '算式好像不完整，再检查一下括号和运算符。' };
    }
  },

  summarize_lesson(args, ctx) {
    const lesson = ctx.lesson || {};
    const profile = ctx.profile || {};
    const steps = lesson.steps || [];
    return {
      lesson: lesson.title,
      goal: lesson.goal,
      totalSteps: steps.length,
      doneSteps: Math.min((ctx.stepIndex || 0), steps.length),
      keyPoints: steps.map(step => step.summary),
      hintCount: profile.hintCount || 0,
      wrongCount: profile.wrongCount || 0,
      errorTypes: profile.errorTypes || []
    };
  },

  get_error_book(args, ctx) {
    const profile = ctx.profile || {};
    const names = profile.errorTypes && profile.errorTypes.length
      ? profile.errorTypes
      : [KP_ERROR_TYPE[ctx.kpId] || '概念不清'];
    const items = names.map(name => {
      const meta = errorTypes.find(item => item.name === name) || {};
      return {
        type: name,
        times: profile.wrongCount || 0,
        description: meta.description || '',
        advice: errorAdvice(name)
      };
    });
    return {
      kpId: ctx.kpId,
      lesson: ctx.lesson ? ctx.lesson.title : '',
      wrongCount: profile.wrongCount || 0,
      blockedCount: profile.blockedCount || 0,
      weakSteps: (profile.weakSteps || []).slice(0, 3),
      items
    };
  },

  generate_report(args, ctx) {
    const lesson = ctx.lesson || {};
    const profile = ctx.profile || {};
    const steps = lesson.steps || [];
    const total = steps.length;
    const done = Math.min(ctx.stepIndex || 0, total);
    const right = profile.correctCount || 0;
    const wrong = profile.wrongCount || 0;
    const hints = profile.hintCount || 0;
    const attempts = right + wrong;
    const accuracy = attempts ? Math.round((right / attempts) * 100) : 0;
    const current = steps[Math.min(ctx.stepIndex || 0, Math.max(total - 1, 0))];

    const highlights = [];
    highlights.push('走完 ' + done + '/' + total + ' 个讲题步骤，当前停在第 '
      + Math.min((ctx.stepIndex || 0) + 1, total) + ' 步「' + (current ? current.name : '') + '」');
    if (right) highlights.push('答对 ' + right + ' 次，正确率 ' + accuracy + '%');
    if (hints) highlights.push('使用提示 ' + hints + ' 次，说明有 ' + hints + ' 个地方还需要再顺一遍');
    if (profile.blockedCount) highlights.push('有 ' + profile.blockedCount + ' 次想直接看答案，被我拦下来了 —— 这是好事');

    const suggestions = [];
    if (wrong > 0) suggestions.push('把出错的第 ' + (ctx.stepIndex || 0) + ' 步重新讲一遍，重点是「' + (current ? current.summary : '这一步的要点') + '」');
    if (hints >= 2) suggestions.push('提示用得多的地方，建议合上黑板自己复述一次完整思路');
    if (!suggestions.length) suggestions.push('思路很顺，可以去做一组标准题巩固，再挑战变式题');

    return {
      lesson: lesson.title,
      grade: lesson.grade,
      goal: lesson.goal,
      range: args.range === 'week' ? '近一周' : '本次讲题',
      stats: {
        doneSteps: done,
        totalSteps: total,
        correctCount: right,
        wrongCount: wrong,
        hintCount: hints,
        blockedCount: profile.blockedCount || 0,
        accuracy
      },
      errorTypes: profile.errorTypes || [],
      highlights,
      suggestions,
      nextAction: wrong > 0
        ? '先把出错的那一步讲给别人听（或讲给我听），再说别的'
        : '去标准题里挑 3 道练手，错的那道再回来找我'
    };
  },

  make_plan(args, ctx) {
    const lesson = ctx.lesson || {};
    const steps = lesson.steps || [];
    const profile = ctx.profile || {};
    const days = Math.max(1, Math.min(Number(args.days) || 3, 5));
    const index = Math.min(ctx.stepIndex || 0, Math.max(steps.length - 1, 0));
    const weak = (profile.weakSteps || []).filter(Boolean);

    const templates = [
      {
        title: '第 1 天 · 补上卡住的那一步',
        tasks: [
          '把第 ' + (index + 1) + ' 步「' + (steps[index] ? steps[index].name : '') + '」重新讲一遍，合上黑板自己复述',
          '说出这一步为什么这么做，而不是背下结论',
          '练习 2 道同类基础题，做完先自己检查再对答案'
        ]
      },
      {
        title: '第 2 天 · 把错因变成检查动作',
        tasks: [
          '翻开错题本，重做 1 道' + (weak[0] ? '「' + weak[0] + '」' : '之前错的') + '的题',
          '每道题做完写一句话：我刚才差点在哪一步出错',
          '换一道变式题，检验是不是真的懂了'
        ]
      },
      {
        title: '第 3 天 · 串起整个知识点',
        tasks: [
          '不看讲义，把「' + (lesson.title || '这个知识点') + '」的 ' + steps.length + ' 个步骤按顺序说一遍',
          '做一组标准题（5 道），记录正确率和用时',
          '把还卡的地方告诉我，我们再拆一次'
        ]
      },
      {
        title: '第 4 天 · 迁移到新题型',
        tasks: ['挑战带情境的综合题', '对比同类题的条件差异']
      },
      {
        title: '第 5 天 · 复盘与巩固',
        tasks: ['回看错题本', '重做全部错题']
      }
    ];

    return {
      lesson: lesson.title,
      goal: lesson.goal,
      days: days,
      plan: templates.slice(0, days)
    };
  }
};

function runTool(name, args, ctx) {
  const executor = executors[name];
  if (!executor) return { error: '未知工具：' + name };
  try {
    return executor(args || {}, ctx);
  } catch (err) {
    return { error: '工具执行失败：' + err.message };
  }
}

module.exports = { TOOL_SCHEMAS, CONCEPTS, KP_ERROR_TYPE, runTool, errorAdvice };
