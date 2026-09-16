const BASE = process.env.BASE || 'http://localhost:3000';
let token = '';

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 120) }; }
  return { status: res.status, data };
}

function line(label, res, pick) {
  const d = res.data && res.data.data ? res.data.data : res.data;
  const info = pick ? pick(d) : '';
  console.log(String(label).padEnd(22) + '| ' + res.status + ' | ' + info);
}

(async () => {
  const login = await call('POST', '/api/auth/login', { phone: '13800000001', password: '123456' });
  token = login.data.token;
  console.log('login ->', login.status);

  const personas = await call('GET', '/api/agent/personas');
  line('personas', personas, d => d.map(p => p.icon + p.name + '(' + p.quickReplies.length + '快捷)').join(' / '));

  for (const kp of ['kp1', 'kp2', 'kp3']) {
    const sg = await call('GET', '/api/agent/suggest?kpId=' + kp);
    line('suggest ' + kp, sg, d => '[' + d.tone + '] ' + d.title + ' → ' + d.action.label);
  }

  const cases = [
    ['detective', '我这道题错在哪里'],
    ['detective', '看看我的错题本'],
    ['detective', '我当时把 a 和 c 搞混了'],
    ['coach', '帮我安排一下接下来的学习计划'],
    ['coach', '帮我生成学习报告'],
    ['coach', '我有点学不动了'],
    ['tutor', '给我一点提示'],
    ['detective', '直接告诉我答案'],
    ['coach', '这题选什么']
  ];

  for (const [persona, message] of cases) {
    const res = await call('POST', '/api/agent/chat', { kpId: 'kp3', stepIndex: 2, persona, message });
    const d = res.data.data;
    console.log('');
    console.log('[' + persona + '] ' + message);
    console.log('  intent=' + d.intent + ' blocked=' + d.blocked + ' tools=[' + d.toolCalls.map(t => t.name).join(',') + ']'
      + ' effects=' + Object.keys(d.effects || {}).filter(k => d.effects[k]).join(',') || 'none');
    console.log('  ' + String(d.reply).replace(/\n/g, '\n  ').slice(0, 320));
    if (d.effects && d.effects.report) {
      console.log('  >> report stats: ' + JSON.stringify(d.effects.report.stats));
    }
    if (d.effects && d.effects.plan) {
      console.log('  >> plan days: ' + d.effects.plan.plan.map(x => x.title).join(' | '));
    }
  }

  const fb = await call('POST', '/api/agent/feedback', { rating: 'confused', kpId: 'kp3', stepName: '定理表述' });
  line('feedback confused', fb, d => JSON.stringify(d.profile));

  const session = await call('GET', '/api/agent/session?kpId=kp3&persona=coach');
  line('session personas', session, d => d.personas.length + ' roles, persona=' + d.persona + ', profile.confused=' + d.profile.confusedCount);

  const stream = await fetch(BASE + '/api/agent/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ kpId: 'kp1', stepIndex: 0, persona: 'coach', message: '帮我生成学习报告' })
  });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const counts = {};
  let text2 = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.filter(Boolean).forEach(l => {
      const evt = JSON.parse(l);
      counts[evt.type] = (counts[evt.type] || 0) + 1;
      if (evt.type === 'delta') text2 += evt.text;
    });
  }
  console.log('');
  console.log('stream events: ' + JSON.stringify(counts) + ' | len=' + text2.length);
})().catch(err => { console.error('FAILED', err); process.exit(1); });