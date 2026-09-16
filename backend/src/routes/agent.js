const express = require('express');
const router = express.Router();
const agent = require('../agent');
const guardrail = require('../agent/guardrail');
const scaffold = require('../agent/scaffold');
const agentQuota = require('../services/agentQuotaService');
const { users } = require('../models/mockData');
const { lessons } = require('../models/lessons');
const { currentUser } = require('../utils/auth');

function resolveUser(req) {
  return currentUser(req, users) || users.find(item => item.role === 'student') || null;
}

// 把整段回复切成小片，便于前端做打字机效果
function chunkText(text) {
  const chunks = [];
  let buffer = '';
  Array.from(String(text || '')).forEach(char => {
    buffer += char;
    if (buffer.length >= 5 || '。！？；\n'.indexOf(char) !== -1) {
      chunks.push(buffer);
      buffer = '';
    }
  });
  if (buffer) chunks.push(buffer);
  return chunks;
}

function metaOf(result) {
  return {
    persona: result.persona || 'tutor',
    personaName: result.personaName || '讲题老师',
    provider: result.provider,
    model: result.model,
    blocked: !!result.blocked,
    guardType: result.guardType || null,
    intent: result.intent || null,
    degraded: !!result.degraded,
    toolCalls: (result.toolCalls || []).map(call => ({ name: call.name, args: call.args || {} })),
    quickReplies: result.quickReplies || [],
    effects: result.effects || {},
    step: result.step || null,
    stage: result.stage || null,
    profile: result.profile ? {
      hintCount: result.profile.hintCount,
      correctCount: result.profile.correctCount,
      wrongCount: result.profile.wrongCount,
      helpfulCount: result.profile.helpfulCount,
      confusedCount: result.profile.confusedCount,
      errorTypes: result.profile.errorTypes
    } : null
  };
}

function payloadOf(req) {
  const body = req.body || {};
  return {
    user: resolveUser(req),
    kpId: body.kpId || 'kp1',
    stepIndex: Number(body.stepIndex) || 0,
    persona: body.persona || 'tutor',
    message: String(body.message || '')
  };
}

// 配额拦截：免费版每天 N 次。用完返回 429，把当前配额一起带回去，
// 前端据此弹「用星尘 / 星钻兑换加次」而不是普通的报错。
function quotaBlock(res, gate) {
  const quota = gate.quota;
  res.status(429).json({
    code: 'AGENT_QUOTA_EXHAUSTED',
    error: '今天的 ' + quota.freeDaily + ' 次免费 AI 对话用完啦，可以用星尘 / 星钻兑换，或者开通领航员不限次。',
    quota: quota
  });
}

// 一次性返回（便于测试与降级）
router.post('/chat', async (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(503).json({ error: '暂时没有可用的学生账号' });

  const gate = agentQuota.consume(user);
  if (!gate.allowed) return quotaBlock(res, gate);

  try {
    const result = await agent.reply(payloadOf(req));
    res.json({ data: Object.assign({ reply: result.reply, quota: gate.quota }, metaOf(result)) });
  } catch (err) {
    agentQuota.refund(user); // 扣了额度但没答上来，这次不算
    res.status(500).json({ error: '智能体暂时不可用：' + err.message });
  }
});

// 流式返回（NDJSON：start / tool / delta / done / error）
router.post('/chat/stream', async (req, res) => {
  // 配额必须在写响应头之前判：不够就整条请求按 429 回，而不是开流之后再断
  const streamUser = resolveUser(req);
  if (!streamUser) return res.status(503).json({ error: '暂时没有可用的学生账号' });
  const streamGate = agentQuota.consume(streamUser);
  if (!streamGate.allowed) return quotaBlock(res, streamGate);

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const write = payload => res.write(JSON.stringify(payload) + '\n');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    write({ type: 'start' });
    const result = await agent.reply(payloadOf(req));

    const toolCalls = result.toolCalls || [];
    for (let i = 0; i < toolCalls.length; i += 1) {
      write({ type: 'tool', name: toolCalls[i].name, args: toolCalls[i].args || {}, index: i });
      await wait(200);
    }

    const chunks = chunkText(result.reply);
    for (let i = 0; i < chunks.length; i += 1) {
      write({ type: 'delta', text: chunks[i] });
      await wait(result.blocked ? 24 : 16);
    }

    write({ type: 'done', data: Object.assign({ quota: streamGate.quota }, metaOf(result)) });
    res.end();
  } catch (err) {
    agentQuota.refund(streamUser);
    write({ type: 'error', error: err.message });
    res.end();
  }
});

// 引导式教学骨架：五步闭环 / 答题六步 SOP / 错因分类矩阵（只给骨架与话术，不含答案）
router.get('/scaffold', (req, res) => {
  const kpId = req.query.kpId || 'kp1';
  const lesson = lessons[kpId] || lessons.kp1;
  const stepIndex = Math.max(0, Math.min(Number(req.query.stepIndex) || 0, lesson.steps.length - 1));
  const stage = scaffold.stageInfo(lesson.steps[stepIndex].name, stepIndex, lesson.steps.length);
  res.json({ data: Object.assign({ kpId: lesson.id, stepIndex: stepIndex, stage: stage }, scaffold.describe()) });
});

// AI 对话配额：免费版每天 N 次，会员不限次；余额含可兑换的星尘 / 星钻
router.get('/quota', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(503).json({ error: '暂时没有可用的学生账号' });
  res.json({ data: agentQuota.state(user) });
});

// 兑换加次：body.method = dust（星尘）| gem（星钻）
router.post('/quota/redeem', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(503).json({ error: '暂时没有可用的学生账号' });
  const result = agentQuota.redeem(user, (req.body && req.body.method) || '');
  res.status(result.status || 200).json(result.body);
});

// 可用角色列表
router.get('/personas', (req, res) => {
  res.json({ data: agent.personas.list() });
});

// 主动建议：打开智能体时先给一句「现在最值得做的事」
router.get('/suggest', (req, res) => {
  res.json({ data: agent.suggest(resolveUser(req), req.query.kpId || 'kp1', req.query.persona || 'tutor') });
});

// 学生对某条回复的反馈（有帮助 / 还没懂）
router.post('/feedback', (req, res) => {
  res.json({ data: agent.feedback(resolveUser(req), req.body || {}) });
});

// 当前智能体会话状态（消息历史 + 学生画像）
router.get('/session', (req, res) => {
  const user = resolveUser(req);
  res.json({ data: agent.sessionState(user, req.query.kpId || 'kp1', req.query.persona || 'tutor') });
});

router.post('/reset', (req, res) => {
  const user = resolveUser(req);
  res.json({ data: agent.reset(user, req.body.kpId || 'kp1') });
});

// ---------------------------------------------------------------------------
// 一键自动生成：学习报告 / 错题记录
// 这两条不经过大模型，随时可用；大模型在线时也会用同一份数据来做讲解
// ---------------------------------------------------------------------------
router.get('/study-report', (req, res) => {
  const user = resolveUser(req);
  const range = req.query.range === 'week' ? 'week' : 'session';
  res.json({ data: agent.records.buildStudyReport(user, req.query.kpId || 'kp1', range) });
});

router.get('/error-book', (req, res) => {
  const user = resolveUser(req);
  res.json({ data: agent.records.buildErrorBook(user, req.query.kpId || null) });
});

// 安全边界说明：只暴露分类与条数，不暴露具体词表（避免被试探绕过）
router.get('/guardrails', (req, res) => {
  res.json({ data: guardrail.describe() });
});

router.get('/health', (req, res) => {
  res.json({ data: agent.providerInfo() });
});

module.exports = router;