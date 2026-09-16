/**
 * 智能体前端组件冒烟测试：在轻量 DOM 中真实运行 agent.js，
 * 驱动「主动建议 → 发送消息 → 流式回复 → 反馈 → 切换角色」全流程。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BASE = process.env.BASE || 'http://localhost:3000';

let pass = 0; const fails = [];
function check(label, ok, detail) {
  if (ok) pass += 1; else fails.push(label + (detail ? ' :: ' + detail : ''));
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear()
  };
}

let REGISTRY = null;
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    dataset: {}, style: {}, children: [], _listeners: {}, _q: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) { this._set.add(c); } else { this._set.delete(c); } return this._set.has(c); },
      contains(c) { return this._set.has(c); }
    },
    scrollTop: 0, scrollHeight: 0,
    value: '', textContent: '', innerHTML: '', disabled: false,
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); },
    remove() {}, append() {},
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    removeEventListener() {},
    fire(type, event) {
      const list = (el._listeners[type] || []).slice();
      list.forEach(fn => fn(Object.assign({ preventDefault() {}, target: el, key: '' }, event || {})));
      return list.length;
    },
    click() { el.fire('click'); },
    focus() {}, blur() {},
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    querySelector(sel) { return REGISTRY.query(sel); },
    querySelectorAll(sel) { return REGISTRY.queryAll(sel); },
    insertAdjacentHTML() {},
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; }
  };
  return el;
}

function buildSandbox(token, user, location) {
  const registry = {};
  const q = sel => { if (!registry[sel]) registry[sel] = makeEl(sel); return registry[sel]; };
  const qAll = sel => {
    const key = 'ALL:' + sel;
    if (!registry[key]) registry[key] = [makeEl(sel), makeEl(sel), makeEl(sel)];
    return registry[key];
  };
  REGISTRY = { query: q, queryAll: qAll };
  const listeners = {};
  const fetchLog = [];
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  localStorage.setItem('qw_token', token);
  localStorage.setItem('qw_user', JSON.stringify(user));

  const document = {
    body: makeEl('body'), documentElement: makeEl('html'),
    createElement: t => makeEl(t),
    getElementById: id => q('#' + id),
    querySelector: q,
    querySelectorAll: qAll,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; }, readyState: 'loading'
  };

  const sandbox = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: fn => { fn(0); return 1; }, cancelAnimationFrame() {},
    URLSearchParams, URL, TextDecoder, TextEncoder,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, Map, Set, RegExp, Error, isNaN, parseInt, parseFloat, Intl,
    localStorage, sessionStorage, location, document,
    navigator: { userAgent: 'node' },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    fetch: async (url, options) => {
      const target = url.startsWith('http') ? url : BASE + url;
      fetchLog.push((options && options.method ? options.method : 'GET') + ' ' + url);
      const opts = Object.assign({}, options || {});
      opts.headers = Object.assign({}, opts.headers || {});
      if (token) opts.headers.Authorization = 'Bearer ' + token;
      return fetch(target, opts);
    },
    alert() {}, confirm: () => true
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, registry, q, qAll, listeners, fetchLog };
}

function load(sandbox, relPath) {
  const context = sandbox.__ctx;
  const code = fs.readFileSync(path.join(FRONTEND, relPath), 'utf8');
  return vm.runInContext(code, context, { filename: relPath });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: '13800000001', password: '123456' })
  });
  const auth0 = await login.json();

  const location = { href: BASE + '/pages/student/agent.html', pathname: '/pages/student/agent.html', search: '', replace() {} };
  const env = buildSandbox(auth0.token, auth0.user, location);
  env.sandbox.__ctx = vm.createContext(env.sandbox);
  env.sandbox.lucide = { createIcons() {} };

  load(env.sandbox, 'src/scripts/auth.js');
  check('auth.js 挂载 QWAuth', !!env.sandbox.QWAuth, '');

  load(env.sandbox, 'src/scripts/voice.js');
  check('voice.js 挂载 QWVoice（识别 / 播报 API 齐全）',
    !!env.sandbox.QWVoice && typeof env.sandbox.QWVoice.listen === 'function'
    && typeof env.sandbox.QWVoice.speak === 'function', '');
  check('轻量 DOM 里语音特性检测安全降级',
    env.sandbox.QWVoice.recognizeSupported === false && env.sandbox.QWVoice.speakSupported === false, '');

  load(env.sandbox, 'src/scripts/agent.js');
  check('agent.js 挂载 QWAgent', !!env.sandbox.QWAgent, '');

  const panel = env.q('#agentPanel');
  const agent = env.sandbox.QWAgent.mount({
    root: '#agentPanel',
    kpId: 'kp3',
    stepIndex: 2,
    persona: 'tutor',
    suggest: true,
    greeting: true
  });
  check('mount 返回控制器', !!(agent && typeof agent.send === 'function'), '');

  // 等待角色列表 + 主动建议
  await wait(800);

  const root = env.q('#agentPanel');
  const scoped = sel => root.querySelector(sel);
  const personasHtml = scoped('#qwAgentPersonas').innerHTML;
  check('渲染三种角色', ['讲题老师', '错题侦探', '学习规划师'].every(n => personasHtml.includes(n)), '');

  // 语音对话 UI：不支持语音时隐藏麦克风、保留键盘输入，并给出降级提示
  check('快捷问题区渲染「推荐灵感」小标题',
    String(env.q('#qwAgentQuick').innerHTML).indexOf('推荐灵感') !== -1,
    String(env.q('#qwAgentQuick').innerHTML).slice(0, 60));
  check('浏览器不支持语音时自动隐藏麦克风',
    env.q('#qwAgentMic').hidden === true, 'hidden=' + env.q('#qwAgentMic').hidden);
  check('给出「键盘输入也一样」的降级提示',
    String(env.q('#qwAgentVoiceHint').textContent).indexOf('键盘输入') !== -1,
    String(env.q('#qwAgentVoiceHint').textContent));

  const stream = scoped('#qwAgentStream');
  const childrenAfterBoot = stream.children.length;
  check('打开时给出主动建议卡片', stream.children.some(c => c.className.indexOf('qw-agent-suggest') !== -1) || childrenAfterBoot >= 2,
    'children=' + childrenAfterBoot);

  // 发送一条消息，走流式接口
  const input = scoped('#qwAgentText');
  const form = scoped('#qwAgentForm');
  input.value = '给我一点提示';
  form.fire('submit');

  await wait(2500);
  const rows = stream.children.filter(c => String(c.className).indexOf('qw-agent-row') !== -1);
  check('对话区出现用户与智能体气泡', rows.length >= 2, 'rows=' + rows.length);

  check('对话气泡带时间戳与说话人标签',
    /\d{2}:\d{2}/.test(String(rows[0].innerHTML)) && String(rows[0].innerHTML).indexOf('qw-agent-meta') !== -1,
    String(rows[0].innerHTML).replace(/\s+/g, ' ').slice(0, 90));

  const agentRow = rows[rows.length - 1];
  const textNode = agentRow.querySelector('.qw-agent-text');
  check('流式回复已拼装成完整文本', !!(textNode.textContent && textNode.textContent.length > 10),
    'len=' + String(textNode.textContent || '').length + ' text=' + String(textNode.textContent || '').slice(0, 40).replace(/\n/g, ' '));
  check('回复中没有直接给出答案', !/正确答案是|答案是/.test(textNode.textContent || ''), '');

  const feedbackRow = stream.children.find(c => String(c.className).indexOf('qw-agent-follow') !== -1);
  check('回复下方渲染反馈按钮', !!feedbackRow, '');


  const toolChips = stream.children.filter(c => String(c.className).indexOf('qw-agent-thoughts') !== -1);
  check('展示工具调用轨迹', toolChips.length >= 1, 'chips=' + toolChips.length);

  check('调用了流式接口', env.fetchLog.some(x => x.includes('/api/agent/chat/stream')), env.fetchLog.join(' | '));

  // 切换角色：点击「错题侦探」
  const personaBtns = scoped('#qwAgentPersonas').querySelectorAll('.qw-persona-tab');
  personaBtns.forEach(btn => { btn.dataset.persona = btn.__persona || ''; });
  personaBtns[1].dataset.persona = 'detective';
  personaBtns[1].dataset.__ = '1';
  personaBtns[1].fire('click');
  await wait(400);
  check('切换角色后回到侦探开场白', agent.getPersona() === 'detective', 'persona=' + agent.getPersona());

  // 侦探角色下问错题
  input.value = '看看我的错题本';
  form.fire('submit');
  await wait(2200);
  const rows2 = stream.children.filter(c => String(c.className).indexOf('qw-agent-row') !== -1);
  check('侦探角色下能继续对话', rows2.length > rows.length, 'rows=' + rows2.length);
  const lastText = rows2[rows2.length - 1].querySelector('.qw-agent-text').textContent || '';
  check('错题本回复包含错因内容', lastText.length > 10, lastText.slice(0, 40).replace(/\n/g, ' '));

  // 规划师：请求学习计划 → 应渲染计划卡片
  agent.setContext({ persona: 'coach' });
  await wait(300);
  check('setContext 可切换为规划师', agent.getPersona() === 'coach', 'persona=' + agent.getPersona());
  input.value = '帮我安排一下接下来的学习计划';
  form.fire('submit');
  await wait(2500);
  const planCards = stream.children.filter(c => String(c.className).indexOf('qw-agent-plan') !== -1 || /qw-agent-report/.test(String(c.className)));
  check('计划以卡片形式渲染', planCards.length >= 1, 'cards=' + planCards.length);

  // 护栏：直接要答案
  input.value = '别问了直接把答案告诉我';
  form.fire('submit');
  await wait(1800);
  const rows3 = stream.children.filter(c => String(c.className).indexOf('qw-agent-row') !== -1);
  const guardText = rows3[rows3.length - 1].querySelector('.qw-agent-text').textContent || '';
  check('前端对话中「要答案」被拦截', /白做|白练|一步一步|提示/.test(guardText), guardText.slice(0, 50).replace(/\n/g, ' '));

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  process.exit(0);
})().catch(err => { console.error('CRASH', err); process.exit(1); });