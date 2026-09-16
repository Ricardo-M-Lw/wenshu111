// 问数智能体 - 大模型适配层（OpenAI 兼容协议，可对接 DeepSeek / 通义 / 文心等）
// 配置环境变量即可启用：LLM_API_KEY、LLM_BASE_URL、LLM_MODEL

const { TOOL_SCHEMAS, runTool } = require('../tools');
const { buildSystemPrompt } = require('../prompts');
const personas = require('../personas');

function config() {
  return {
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxRounds: Number(process.env.LLM_MAX_ROUNDS || 3),
    temperature: Number(process.env.LLM_TEMPERATURE || 0.5),
    timeout: Number(process.env.LLM_TIMEOUT || 30000)
  };
}

function available() {
  return !!config().apiKey;
}

function collectEffects(name, result, effects) {
  if (name === 'get_hint' && !result.error) effects.hint = result;
  if (name === 'check_answer' && result.parsed !== false && !result.error) effects.answer = result;
  if (name === 'generate_variant' && !result.error) effects.variant = result;
  if (name === 'explain_concept' && !result.error) effects.concept = result;
  if (name === 'generate_report' && !result.error) effects.report = result;
  if (name === 'make_plan' && !result.error) effects.plan = result;
  if (name === 'get_error_book' && !result.error) effects.errorbook = result;
  if (name === 'classify_error' && !result.error) effects.classify = result;
}

// 角色拥有各自的工具白名单，避免规划师被问去判题
function toolsFor(persona) {
  const allowed = personas.allowedTools(persona);
  if (!allowed.length) return TOOL_SCHEMAS;
  return TOOL_SCHEMAS.filter(schema => allowed.indexOf(schema.function.name) !== -1);
}

function defaultQuickReplies(ctx) {
  const persona = personas.get(ctx.persona);
  if (persona.quickReplies) return persona.quickReplies.slice(0, 4);
  const step = ctx.lesson && ctx.lesson.steps ? ctx.lesson.steps[ctx.stepIndex] : null;
  const list = [{ label: '💡 给我提示', text: '给我一点提示' }];
  if (step && step.checkpoint) list.push({ label: '❓ 为什么这样想', text: '为什么要这样想' });
  list.push({ label: '🔁 换一道变式题', text: '换一道变式题吧' });
  return list;
}

async function respond(ctx, message, history) {
  const cfg = config();
  const persona = personas.get(ctx.persona);
  const messages = [{ role: 'system', content: buildSystemPrompt(ctx, persona) }];
  (history || []).slice(-8).forEach(item => {
    messages.push({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.text });
  });
  messages.push({ role: 'user', content: message });

  const toolCalls = [];
  const effects = { hint: null, answer: null, variant: null, concept: null, report: null, plan: null, errorbook: null, classify: null };

  for (let round = 0; round < cfg.maxRounds; round += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout);
    let res;
    try {
      res = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: cfg.temperature,
          messages,
          tools: toolsFor(persona),
          tool_choice: 'auto'
        })
      });
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? '大模型响应超时（' + cfg.timeout + 'ms）' : err.message);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error('大模型接口返回 ' + res.status + '：' + detail.slice(0, 200));
    }

    const data = await res.json();
    const choice = data.choices && data.choices[0] ? data.choices[0].message : null;
    if (!choice) throw new Error('大模型返回内容为空');

    if (choice.tool_calls && choice.tool_calls.length) {
      // 只回传必要字段：DeepSeek 等推理模型的 reasoning_content 不能再次提交
      messages.push({
        role: 'assistant',
        content: choice.content || '',
        tool_calls: choice.tool_calls
      });
      choice.tool_calls.forEach(call => {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch (err) {
          args = {};
        }
        const result = runTool(call.function.name, args, ctx);
        toolCalls.push({ name: call.function.name, args, result });
        collectEffects(call.function.name, result, effects);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result)
        });
      });
      continue;
    }

    return {
      reply: String(choice.content || '').trim(),
      toolCalls,
      quickReplies: defaultQuickReplies(ctx),
      effects,
      provider: 'openai',
      model: cfg.model
    };
  }

  return {
    reply: '我这边想了几个方向，先给你一句最关键的：把这一步的已知条件单独写下来，再对照定义看一遍。',
    toolCalls,
    quickReplies: defaultQuickReplies(ctx),
    effects,
    provider: 'openai',
    model: cfg.model
  };
}

module.exports = { available, respond, config };
