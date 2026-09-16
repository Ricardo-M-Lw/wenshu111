// 问数智能体 - 提示词与上下文拼装
// 系统提示词 = 角色设定（personas.js）+ 引导式教学骨架（scaffold.js）+ 当前学习上下文（本文件）

const personas = require('./personas');
const scaffold = require('./scaffold');

const TUTOR_PERSONA = [
  '你是「问数」平台的数学讲题智能体，面对的是 12-15 岁的初中生。',
  '',
  '【最高原则：不泄答案】',
  '1. 任何情况下都不能直接说出正确答案、也不能把完整解析一次性写完。',
  '2. 学生索要答案时，先共情，再给方向：把问题拆小、给类比、指到对应的定义或定理。',
  '3. 提示分三级递进：①先提醒相关概念 ②再指出思考方向 ③最后给出第一步该做什么，但绝不代算到底。',
  '4. 不评判学生「这很简单」「你怎么连这个都不会」。',
  '',
  '【讲题风格】',
  '- 一次只推进一小步，多用提问代替陈述：「你觉得 x = 0 时 y 会变成多少？」',
  '- 多用生活类比：出租车计费、撕角拼平角、绳结测量。',
  '- 学生答对时，说明「对在哪里」，而不是只说「很好」。',
  '- 学生答错时，先肯定他思考的部分，再指出岔开的那一步。',
  '- 回复控制在 120 字以内，最多 3 段，适合手机阅读，不要长篇大论。',
  '',
  '【可用工具】',
  '你可以调用工具获取当前步骤信息、分级提示、判题结果、变式题、错因归类等。',
  '需要事实（当前步骤、选项、判题结论）时优先调用工具，不要凭记忆编造。',
  '',
  '【输出格式】',
  '纯文本，不要 Markdown 标题和代码块。需要分点时用「· 」开头。'
].join('\n');

function buildSystemPrompt(context, persona) {
  const target = persona || personas.get(context && context.persona);
  return [personas.systemPrompt(target), '', buildContextBlock(context)].join('\n');
}

function buildContextBlock(context) {
  const lesson = context.lesson || {};
  const steps = lesson.steps || [];
  const step = steps[context.stepIndex];
  const lines = ['【当前学习上下文】'];

  if (lesson.title) lines.push('知识点：' + lesson.title + '（' + (lesson.grade || '') + '）');
  if (lesson.goal) lines.push('本课目标：' + lesson.goal);

  if (step) {
    lines.push('当前讲题步骤：第 ' + (context.stepIndex + 1) + ' 步「' + step.name + '」（' + (step.tag || '') + '）');
    lines.push('这一步的要点：' + (step.summary || ''));
    if (step.checkpoint) {
      lines.push('检查点问题：' + step.checkpoint.question);
      lines.push('选项：' + step.checkpoint.options.map((text, index) => String.fromCharCode(65 + index) + '. ' + text).join('；'));
    }
  }

  const profile = context.profile;
  if (profile) {
    const parts = [];
    if (profile.hintCount) parts.push('本次会话已使用提示 ' + profile.hintCount + ' 次');
    if (profile.correctCount) parts.push('答对 ' + profile.correctCount + ' 次');
    if (profile.wrongCount) parts.push('答错 ' + profile.wrongCount + ' 次');
    if (profile.errorTypes && profile.errorTypes.length) parts.push('历史易错类型：' + profile.errorTypes.join('、'));
    if (parts.length) lines.push('学生画像：' + parts.join('，'));
  }

  // 引导式教学骨架：把当前阶段 + 错因矩阵 + 红线交给大模型
  if (step) {
    const stage = scaffold.stageInfo(step.name, context.stepIndex, steps.length);
    lines.push('');
    lines.push(scaffold.promptBlock(stage.key));
  }

  return lines.join('\n');
}

module.exports = { TUTOR_PERSONA, buildSystemPrompt, buildContextBlock };