// 问数智能体 - 规则引擎（离线可用）
// 没有配置大模型 API Key 时，由本模块完成「意图识别 → 调用工具 → 生成引导话术」的完整闭环

const { runTool } = require('../tools');
const { refuseAnswer } = require('../guardrail');
const personas = require('../personas');

function normalize(text) {
  return String(text || '').replace(/\s+/g, '').trim();
}

const RULES = [
  { name: 'math', test: text => /^[\d+\-*/().^×÷\s]+$/.test(text) && /\d/.test(text) },
  { name: 'variant', test: text => /(换一题|换一道|再来一题|再来一道|变式|类似的题|新题|再练|练习题)/.test(text) },
  { name: 'summary', test: text => /(总结|回顾|学到了什么|讲完了|梳理|小结|复盘)/.test(text) },
  { name: 'progress', test: text => /(学到哪|进度|还有几步|第几步|到哪了|剩下)/.test(text) },
  { name: 'emotion', test: text => /(太难|好难|不会吧|烦|累|不想学|学不动|坚持不住|不想做|放弃|崩溃|挫败|难受|压力|唉|没信心)/.test(text) },
  { name: 'hint', test: text => /(提示|不会|不懂|卡住|没思路|帮帮|怎么想|怎么做|教我|思路|懵)/.test(text) },
  { name: 'concept', test: text => /(什么是|是什么意思|解释|讲讲|定义|为什么|为啥|凭什么|怎么来的|原理|区别|不懂概念)/.test(text) },
  { name: 'thanks', test: text => /(谢谢|明白了|懂了|知道啦|好的|收到)/.test(text) },
  { name: 'greeting', test: text => /^(你好|您好|hi|hello|在吗|老师好|早上好|晚上好|嗨)/i.test(text) }
];

function matchesOption(text, ctx) {
  const step = currentStep(ctx);
  if (!step || !step.checkpoint) return false;
  if (/^[A-Da-d][.、:：]?$/.test(text) || /^[1-4]$/.test(text)) return true;
  return step.checkpoint.options.some(option => option.length > 1
    && (option === text || text.indexOf(option) !== -1 || option.indexOf(text) !== -1));
}

// 角色专属意图：同样是「错在哪」，讲题老师和错题侦探要走的流程并不一样
const PERSONA_RULES = {
  detective: [
    { name: 'errorbook', test: text => /(错题本|错题|错因|错在哪|哪里错|为什么错|老错|又错|反复错|扣分)/.test(text) },
    { name: 'report', test: text => /(报告|周报|统计|数据分析|进步情况)/.test(text) }
  ],
  coach: [
    { name: 'plan', test: text => /(计划|安排|先学|该学什么|怎么学|学习顺序|时间表|复习顺序|规划)/.test(text) },
    { name: 'report', test: text => /(报告|周报|统计|数据分析|进步|表现如何)/.test(text) }
  ]
};

function detectIntent(text, ctx) {
  if (!text) return 'empty';
  if (matchesOption(text, ctx)) return 'option';
  if (RULES[0].test(text)) return 'math';
  const scoped = PERSONA_RULES[ctx.persona];
  if (scoped) {
    const hit = scoped.find(rule => rule.test(text));
    if (hit) return hit.name;
  }
  const rule = RULES.find(item => item.test(text));
  return rule ? rule.name : 'default';
}

function currentStep(ctx) {
  if (!ctx.lesson || !ctx.lesson.steps) return null;
  const index = Math.min(ctx.stepIndex || 0, ctx.lesson.steps.length - 1);
  return ctx.lesson.steps[index];
}

function stepPrefix(ctx) {
  const step = currentStep(ctx);
  if (!step) return '';
  return '第 ' + ((ctx.stepIndex || 0) + 1) + ' 步「' + step.name + '」';
}

function baseQuickReplies(ctx) {
  const step = currentStep(ctx);
  const list = [{ label: '💡 给我提示', text: '给我一点提示' }];
  if (step && step.checkpoint) list.push({ label: '❓ 为什么这样想', text: '为什么要这样想' });
  list.push({ label: '🔁 换一道变式题', text: '换一道变式题吧' });
  return list;
}

function pickKeyword(text, ctx) {
  const cleaned = text
    .replace(/[?？。！!，,]/g, '')
    .replace(/什么是|是什么意思|是什么意思啊|是什么意思呢|为什么|为啥|凭什么|怎么来的|解释一下|讲讲|说一下|的原理|定义|我不懂|不懂/g, '');
  if (cleaned.length >= 2) return cleaned;
  return ctx.lesson ? ctx.lesson.title : '斜率';
}

async function respond(ctx, message) {
  const text = normalize(message);
  const persona = personas.get(ctx.persona);
  const intent = detectIntent(text, ctx);
  const toolCalls = [];
  const call = (name, args) => {
    const result = runTool(name, args || {}, ctx);
    toolCalls.push({ name, args: args || {}, result });
    return result;
  };

  const effects = { hint: null, answer: null, variant: null, concept: null, report: null, plan: null, errorbook: null };
  let reply = '';
  let quickReplies = (persona.quickReplies || baseQuickReplies(ctx)).slice(0, 4);

  switch (intent) {
    case 'greeting': {
      const status = call('get_lesson_status');
      const step = currentStep(ctx);
      reply = persona.intro + '\n\n'
        + '我们现在在「' + status.lesson + '」' + stepPrefix(ctx)
        + (step ? '，这一步的重点是：' + step.summary : '')
        + '\n\n有不懂的地方随时问我。';
      break;
    }

    case 'progress': {
      const status = call('get_lesson_status');
      reply = '我们正在「' + status.lesson + '」的第 ' + (status.stepIndex + 1) + '/' + status.totalSteps + ' 步「'
        + status.stepName + '」。\n\n'
        + '已经走完 ' + status.completedSteps + ' 步，整体进度 ' + status.progress + '%。'
        + '走完剩下 ' + (status.totalSteps - status.stepIndex) + ' 步，这个知识点就算过了一遍。';
      break;
    }

    case 'hint': {
      const level = Math.min((ctx.profile ? ctx.profile.hintCount : 0) + 1, 3);
      const hint = call('get_hint', { level });
      if (hint.error) {
        reply = '这一步没有额外的提示啦。你先说说自己的想法，我来帮你看看方向对不对。';
        break;
      }
      effects.hint = hint;
      reply = '没问题，给你一点方向 💡（第 ' + hint.level + ' 级 · ' + hint.levelName + '）\n\n'
        + '· ' + hint.text + '\n\n'
        + (hint.hasMore ? '要是还卡着，就说「再提示一点」，我给你更具体的。' : '提示就到这里，剩下的要靠你自己走完这一步了。');
      break;
    }

    case 'concept': {
      const concept = call('explain_concept', { keyword: pickKeyword(text, ctx) });
      effects.concept = concept;
      reply = '关于「' + concept.title + '」：\n\n'
        + concept.points.map(point => '· ' + point).join('\n')
        + (concept.analogy ? '\n\n打个比方：' + concept.analogy : '');
      quickReplies = [
        { label: '💡 给我提示', text: '给我一点提示' },
        { label: '🔁 换一道变式题', text: '换一道变式题吧' },
        { label: '📌 我在第几步', text: '我学到哪一步了' }
      ];
      break;
    }

    case 'option': {
      const result = call('check_answer', { answer: text });
      if (result.parsed === false) {
        reply = '没能看清你选的选项，直接回复 A、B、C 或 D 就行。';
        break;
      }
      effects.answer = result;
      if (result.isCorrect) {
        reply = '答对了 ✅ ' + result.feedback + '\n\n'
          + '小提醒：' + result.summary;
        quickReplies = [
          { label: '➡️ 下一步讲什么', text: '下一步讲什么' },
          { label: '🔁 换一道变式题', text: '换一道变式题吧' },
          { label: '📄 本课小结', text: '帮我总结一下' }
        ];
      } else {
        reply = '差一点点 🤔 ' + result.feedback + '\n\n'
          + '这类问题通常属于「' + result.errorType + '」：' + result.advice + '\n'
          + '再试一次，也可以说「给我一点提示」。';
        quickReplies = [
          { label: '💡 给我提示', text: '给我一点提示' },
          { label: '🤔 为什么不对', text: '为什么这个想法不对' },
          { label: '🔁 换一道变式题', text: '换一道变式题吧' }
        ];
      }
      break;
    }

    case 'variant': {
      const variant = call('generate_variant', { difficulty: 'normal' });
      if (variant.error) {
        reply = variant.error;
        break;
      }
      effects.variant = variant;
      reply = '来一道变式题，试试能不能独立做出来 👇\n\n'
        + '· ' + variant.question + '\n'
        + variant.options.map((option, index) => '  ' + String.fromCharCode(65 + index) + '. ' + option).join('\n')
        + '\n\n想好了直接回复选项字母，卡住就说「提示」。';
      quickReplies = [
        { label: '💡 给我提示', text: '给我一点提示' },
        { label: '📌 回到讲题', text: '我学到哪一步了' }
      ];
      break;
    }

    case 'emotion': {
      const hint = call('get_hint', { level: 1 });

      // 学习规划师遇到情绪问题：把任务缩到 5 分钟，先让人动起来
      if (persona.id === 'coach') {
        reply = '先停一下也没关系 🌱\n\n'
          + '我们把今天的目标缩小到 5 分钟：只看' + stepPrefix(ctx) + '，然后回答一个小问题 ——\n'
          + '· ' + (hint.text || '这一步到底在算什么？')
          + '\n\n做完这一小步就算今天达标，剩下的明天再说。';
        break;
      }

      reply = '这很正常，这一步确实容易绕进去 🌱\n\n'
        + '我们先把难度降下来：不看整道题，只回答一个小问题 ——\n'
        + '· ' + (hint.text || '你觉得题目里哪个数字最关键？') + '\n\n'
        + '想不出来也没关系，你可以先喝口水，再把题目读一遍找我。';
      break;
    }

    case 'summary': {
      const summary = call('summarize_lesson');
      reply = '本次「' + summary.lesson + '」讲题小结：\n\n'
        + '· 已完成 ' + summary.doneSteps + '/' + summary.totalSteps + ' 个讲题步骤\n'
        + '· 使用提示 ' + summary.hintCount + ' 次，答错 ' + summary.wrongCount + ' 次\n'
        + '· 这一步的要点：' + (currentStep(ctx) ? currentStep(ctx).summary : '')
        + '\n\n' + (summary.wrongCount > 0
          ? '错的地方已经记到家长端的错因分析里，建议把出错那一步再讲一遍。'
          : '全程思路很稳，可以去标准题检验一下掌握程度。');
      break;
    }

    case 'errorbook': {
      const book = call('get_error_book');
      effects.errorbook = book;
      if (!book.wrongCount) {
        reply = '你的错题本还空着 👍\n\n'
          + '到目前为止这个知识点还没有记下错误。如果你刚才有拿不准的地方，可以把当时的想法说给我听，我帮你判断算不算「错因」。';
        break;
      }
      const first = book.items[0] || {};
      reply = '错题本里最需要盯的是「' + first.type + '」这一类 🕵️\n\n'
        + '· 已经记下 ' + book.wrongCount + ' 次错误'
        + (book.weakSteps && book.weakSteps.length ? '，集中在「' + book.weakSteps.join('、') + '」' : '') + '\n'
        + '· 这类错误的典型特征：' + (first.description || '把条件和结论对错了位置') + '\n'
        + '· 下次遇到先做这个检查：' + first.advice
        + '\n\n把你当时的想法复述一遍，我陪你看是哪一步岔开了。';
      quickReplies = [
        { label: '🔍 我当时是这么想的', text: '我当时是这么想的' },
        { label: '🧩 换一道同类题', text: '换一道变式题吧' },
        { label: '💡 给点线索', text: '给我一点提示' }
      ];
      break;
    }

    case 'report': {
      const report = call('generate_report', { range: 'session' });
      effects.report = report;
      reply = '这是你「' + report.lesson + '」的' + report.range + '报告 📊\n\n'
        + report.highlights.map(line => '· ' + line).join('\n')
        + '\n\n下一步建议：' + report.nextAction;
      quickReplies = [
        { label: '🗺️ 给我三天计划', text: '帮我安排一下接下来的学习计划' },
        { label: '📕 看错题本', text: '看看我的错题本' },
        { label: '📄 本课小结', text: '帮我总结一下' }
      ];
      break;
    }

    case 'plan': {
      const plan = call('make_plan', { days: 3 });
      effects.plan = plan;
      reply = '按你现在的进度，接下来三天这样安排就好 🗺️\n\n'
        + plan.plan.map(day => '【' + day.title + '】\n' + day.tasks.map(task => '· ' + task).join('\n')).join('\n\n')
        + '\n\n每天 15 分钟就够，做完可以回来找我复盘。';
      quickReplies = [
        { label: '📊 生成学习报告', text: '帮我生成学习报告' },
        { label: '📌 我在第几步', text: '我学到哪一步了' },
        { label: '🌱 我有点学不动', text: '我有点学不动了' }
      ];
      break;
    }

    case 'math': {
      const result = call('evaluate_expression', { expression: text });
      reply = result.ok
        ? '算出来是 ' + result.value + '。\n\n用这个结果再往前推一步看看，如果和你的预期不一样，我们就回头检查计算过程。'
        : result.message;
      break;
    }

    case 'thanks': {
      reply = '不客气！能自己推出来才是真的掌握 💪\n\n'
        + '我们现在在' + stepPrefix(ctx) + '，要不要继续往下走，或者来一道变式题试试？';
      break;
    }

    case 'empty': {
      reply = '我在这儿 👋 你可以问我「这一步为什么要这样做」，也可以直接说「给我提示」。';
      break;
    }

    default: {
      const step = currentStep(ctx);

      // 错题侦探：学生描述自己的错误想法时，直接归因，而不是继续讲新课
      if (persona.id === 'detective' && /(错|不对|算成|写成|以为是|搞混)/.test(text)) {
        const found = call('classify_error', { answer: message });
        effects.answer = { isCorrect: false, chosen: message, errorType: found.errorType };
        reply = '按你说的这个思路，问题出在「' + found.errorType + '」这一类 🕵️\n\n'
          + '· ' + (found.description || '这一步的条件和结论容易对错位置')
          + '\n· 下次先做这个动作：' + found.advice
          + '\n\n现在把' + stepPrefix(ctx) + '再讲一遍，看看能不能自己绕开这个坑。';
        break;
      }

      const detail = call('get_step_detail', {});
      reply = '我把你的问题记下来了。\n\n'
        + '我们现在在' + stepPrefix(ctx) + (detail.tag ? '（' + detail.tag + '）' : '') + '，'
        + '这一步的要点是：' + (step ? step.summary : '')
        + '\n\n你可以先说说自己的想法，或者问我「' + (persona.quickReplies[0].label.replace(/^[^\u4e00-\u9fa5]+/, '')) + '」。';
      break;
    }
  }

  // 「直接要答案」的请求由规则引擎兜底拦截
  if (intent === 'default' && /(答案|解析|直接)/.test(text)) {
    reply = refuseAnswer(ctx);
  }

  return { reply, toolCalls, quickReplies, effects, intent, provider: 'rules' };
}

module.exports = { respond, detectIntent };
