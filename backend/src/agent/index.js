// 问数智能体 - 对外统一入口
// 负责：组装上下文 → 安全护栏 → 选择提供方（大模型 / 规则引擎）→ 记忆更新

const guardrail = require('./guardrail');
const memory = require('./memory');
const records = require('./records');
const personas = require('./personas');
const scaffold = require('./scaffold');
const rules = require('./providers/rules');
const openai = require('./providers/openai');
const { lessons } = require('../models/lessons');
const { knowledgePoints, learningSessions } = require('../models/mockData');

function providerInfo() {
  const cfg = openai.config();
  const forceRules = process.env.AGENT_PROVIDER === 'rules';
  const useModel = openai.available() && !forceRules;
  return {
    name: useModel ? 'openai' : 'rules',
    model: useModel ? cfg.model : '内置规则引擎（离线可用）',
    hasApiKey: openai.available(),
    baseUrl: useModel ? cfg.baseUrl : null
  };
}

function buildContext(user, kpId, stepIndex, personaId) {
  const lesson = lessons[kpId] || lessons.kp1;
  const total = lesson.steps.length;
  const index = Math.max(0, Math.min(Number(stepIndex) || 0, total - 1));
  return {
    userId: user ? user.id : 'anonymous',
    user: user || null,
    kpId: lesson.id,
    lesson,
    stepIndex: index,
    persona: personas.get(personaId).id,
    knowledgePoint: knowledgePoints.find(item => item.id === lesson.id) || null,
    profile: memory.getProfile(user ? user.id : 'anonymous')
  };
}

// 从学习记录里推断学生真实的讲题进度，用于「主动建议」
function currentStepOf(userId, kpId) {
  const session = learningSessions
    .filter(item => item.userId === userId && item.knowledgePointId === kpId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  if (!session) return 0;
  return Math.max((session.currentStep || 1) - 1, 0);
}

function guardQuickReplies() {
  return [
    { label: '💡 给我提示', text: '给我一点提示' },
    { label: '📌 我在第几步', text: '我学到哪一步了' },
    { label: '🔁 换一道变式题', text: '换一道变式题吧' }
  ];
}

async function reply(options) {
  const { user, kpId, stepIndex, message, persona } = options;
  const ctx = buildContext(user, kpId, stepIndex, persona);
  const userId = ctx.userId;

  memory.appendMessage(userId, ctx.kpId, 'user', message);
  memory.recordEvent(userId, { type: 'turn' });

  const guard = guardrail.inspect(message, ctx);
  if (guard.blocked) {
    memory.recordEvent(userId, { type: 'blocked' });
    memory.appendMessage(userId, ctx.kpId, 'assistant', guard.reply, { intent: 'blocked' });
    return {
      reply: guard.reply,
      blocked: true,
      guardType: guard.type,
      intent: 'blocked',
      persona: ctx.persona,
      provider: 'guardrail',
      toolCalls: [],
      quickReplies: guardQuickReplies(),
      effects: { hint: null, answer: null, variant: null, concept: null, report: null, plan: null, errorbook: null },
      profile: memory.getProfile(userId)
    };
  }

  const info = providerInfo();
  let result;
  try {
    result = info.name === 'openai'
      ? await openai.respond(ctx, message, memory.history(userId, ctx.kpId))
      : await rules.respond(ctx, message);
  } catch (err) {
    console.warn('[agent] 大模型调用失败，已自动降级到规则引擎：', err.message);
    result = await rules.respond(ctx, message);
    result.degraded = true;
    result.degradeReason = err.message;
  }

  if (result.effects && result.effects.hint) memory.recordEvent(userId, { type: 'hint' });
  if (result.effects && result.effects.answer) {
    const step = ctx.lesson.steps[ctx.stepIndex];
    if (result.effects.answer.isCorrect) {
      memory.recordEvent(userId, { type: 'answer-correct' });
    } else {
      memory.recordEvent(userId, {
        type: 'answer-wrong',
        errorType: result.effects.answer.errorType,
        stepName: step ? step.name : ''
      });
      // 自动记入错题档案：错因 + 学生当时选的答案 + 步骤（不含正确答案）
      records.recordError(userId, {
        kpId: ctx.kpId,
        stepName: step ? step.name : '',
        errorType: result.effects.answer.errorType,
        answer: result.effects.answer.chosen || '',
        advice: result.effects.answer.advice || ''
      });
    }
  }
  // 侦探角色走的是 classify_error（不经过判题接口），这里同样记入错题档案
  if (result.effects && result.effects.classify
      && !(result.effects.answer && result.effects.answer.isCorrect === false)) {
    const step = ctx.lesson.steps[ctx.stepIndex];
    memory.recordEvent(userId, {
      type: 'answer-wrong',
      errorType: result.effects.classify.errorType,
      stepName: step ? step.name : ''
    });
    records.recordError(userId, {
      kpId: ctx.kpId,
      stepName: step ? step.name : '',
      errorType: result.effects.classify.errorType,
      answer: result.effects.classify.answer || '',
      advice: result.effects.classify.advice || ''
    });
  }
  if (result.effects && result.effects.variant) {
    memory.recordEvent(userId, { type: 'variant', variantId: result.effects.variant.id });
  }

  // 出站护栏：大模型偶尔会好心直接报出正确选项，这里就地改写成引导话术
  const leak = guardrail.inspectReply(result.reply, ctx);
  if (leak.leaked) {
    result.reply = leak.reply;
    result.guardType = 'answer-output';
    result.blocked = true;
  }

  memory.appendMessage(userId, ctx.kpId, 'assistant', result.reply, { intent: result.intent });

  return Object.assign({}, result, {
    persona: ctx.persona,
    personaName: personas.get(ctx.persona).name,
    provider: result.provider || info.name,
    model: info.model,
    profile: memory.getProfile(userId),
    step: {
      index: ctx.stepIndex,
      name: ctx.lesson.steps[ctx.stepIndex].name,
      totalSteps: ctx.lesson.steps.length
    },
    stage: stageOf(ctx)
  });
}

// 当前讲题步骤落在五步闭环的哪个阶段（供前端展示阶段徽标）
function stageOf(ctx) {
  const step = ctx.lesson.steps[ctx.stepIndex];
  const info = scaffold.stageInfo(step.name, ctx.stepIndex, ctx.lesson.steps.length);
  return { key: info.key, step: info.step, name: info.name, short: info.short, goal: info.goal };
}

function sessionState(user, kpId, personaId) {
  const ctx = buildContext(user, kpId, 0, personaId);
  return {
    persona: personas.get(ctx.persona).id,
    personas: personas.list(),
    provider: providerInfo(),
    profile: memory.getProfile(ctx.userId),
    messages: memory.history(ctx.userId, ctx.kpId),
    lesson: { id: ctx.lesson.id, title: ctx.lesson.title, stepCount: ctx.lesson.steps.length }
  };
}

// 主动建议：学生一打开智能体，就先给一句「现在最值得做的事」
function suggest(user, kpId, personaId) {
  const userId = user ? user.id : 'anonymous';
  const step = currentStepOf(userId, kpId);
  const ctx = buildContext(user, kpId, step, personaId);
  const profile = ctx.profile;
  const lesson = ctx.lesson;
  const current = lesson.steps[ctx.stepIndex];

  let title = '先从这一步开始';
  let text = '你正停在「' + lesson.title + '」第 ' + (ctx.stepIndex + 1) + ' / ' + lesson.steps.length
    + ' 步「' + current.name + '」。先把这一步讲清楚，再往下走最省力。';
  let action = { label: '💡 先给点提示', text: '给我一点提示' };
  let tone = 'normal';

  if (profile.blockedCount >= 2) {
    tone = 'warn';
    title = '今天你两次想直接看答案';
    text = '我理解想快点做完的心情，但直接看答案会让这一步白练。不如换成侦探模式，我们找出你真正不确定的那个点。';
    action = { label: '🕵️ 切到错题侦探', text: '我这道题错在哪里', persona: 'detective' };
  } else if (profile.wrongCount >= 2) {
    tone = 'warn';
    title = '同一个知识点错了 ' + profile.wrongCount + ' 次';
    text = '这通常不是粗心，而是某一步的理解漏了。先把错因找出来，比再做十道题有用。';
    action = { label: '🕵️ 让侦探帮我看看', text: '看看我的错题本', persona: 'detective' };
  } else if (!profile.turnCount) {
    title = '第一次见面，我先看看你的进度';
    text = lesson.goal ? '这一课的目标是：' + lesson.goal : '我们从第一步开始。';
    action = { label: '📌 我在第几步', text: '我学到哪一步了' };
  } else if (profile.hintCount >= 3) {
    tone = 'warn';
    title = '这一步的提示用了 ' + profile.hintCount + ' 次';
    text = '提示用得越多，越需要自己复述一遍。合上黑板，把「' + current.name + '」讲给别人听试试。';
    action = { label: '📊 看看学习报告', text: '帮我生成学习报告', persona: 'coach' };
  } else if (profile.correctCount >= 2 && profile.consecutiveRight >= 2) {
    tone = 'good';
    title = '连续答对 ' + profile.consecutiveRight + ' 次，状态不错';
    text = '可以试试变式题，检验是不是真的会迁移，而不是记住了这一道。';
    action = { label: '🔁 来一道变式题', text: '换一道变式题吧' };
  }

  return {
    kpId: lesson.id,
    stepIndex: ctx.stepIndex,
    persona: ctx.persona,
    tone,
    title,
    text,
    action,
    quickReplies: personas.get(ctx.persona).quickReplies
  };
}

function feedback(user, payload) {
  const userId = user ? user.id : 'anonymous';
  const profile = memory.recordFeedback(userId, payload);
  return {
    saved: true,
    rating: (payload && payload.rating) === 'confused' ? 'confused' : 'helpful',
    profile: {
      helpfulCount: profile.helpfulCount,
      confusedCount: profile.confusedCount,
      weakSteps: profile.weakSteps
    }
  };
}

function reset(user, kpId) {
  memory.resetSession(user ? user.id : 'anonymous', kpId);
  return { reset: true };
}

module.exports = { reply, sessionState, suggest, feedback, reset, providerInfo, buildContext, personas, records };
