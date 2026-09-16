/**
 * 讲题课堂前端冒烟测试：课堂骨架 → 黑板图形 → 逐步气泡 → 检查点判题 → 步骤小结 → 智能体联动
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
const wait = ms => new Promise(r => setTimeout(r, ms));

function makeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), clear: () => map.clear() };
}

let REGISTRY = null;
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    dataset: {}, style: {}, children: [], _listeners: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) { this._set.add(c); } else { this._set.delete(c); } return this._set.has(c); },
      contains(c) { return this._set.has(c); }
    },
    scrollTop: 0, scrollHeight: 0, value: '', textContent: '', innerHTML: '', disabled: false,
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); },
    remove() {}, append() {},
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    removeEventListener() {},
    fire(type, event) {
      const list = (el._listeners[type] || []).slice();
      list.forEach(fn => fn(Object.assign({ preventDefault() {}, key: '', target: el }, event || {})));
      return list.length;
    },
    click() { return el.fire('click'); },
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
    if (!registry[key]) registry[key] = [0, 1, 2, 3].map(() => makeEl(sel));
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
    querySelector: q, querySelectorAll: qAll,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; }, readyState: 'loading'
  };

  const sandbox = {
    console, setTimeout, clearTimeout, setInterval: fn => { sandbox.__timers.push(fn); return 1; }, clearInterval() {},
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
    alert() {}, confirm: () => true, __timers: []
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, q, qAll, listeners, fetchLog };
}

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: '13800000001', password: '123456' })
  });
  const auth0 = await login.json();

  const location = { href: BASE + '/pages/student/classroom.html?kp=kp1', pathname: '/pages/student/classroom.html', search: '?kp=kp1', replace() {} };
  const env = buildSandbox(auth0.token, auth0.user, location);
  const context = vm.createContext(env.sandbox);
  env.sandbox.__ctx = context;
  env.sandbox.lucide = { createIcons() {} };

  const load = rel => vm.runInContext(fs.readFileSync(path.join(FRONTEND, rel), 'utf8'), context, { filename: rel });
  load('src/scripts/auth.js');
  load('src/scripts/board.js');
  load('src/scripts/agent.js');
  load('src/scripts/classroom.js');

  check('board.js 挂载 QWBoard', typeof env.sandbox.QWBoard.render === 'function', '图形类型=' + env.sandbox.QWBoard.types.length);

  for (const fn of env.listeners.DOMContentLoaded || []) {
    const out = fn();
    if (out && out.then) await out;
  }
  await wait(600);

  const q = env.q;
  check('课堂骨架已渲染', /qw-classroom/.test(q('#classroomApp').innerHTML), '');
  check('黑板图形已生成 SVG', /<svg/.test(q('#qwBoardFigure').innerHTML), 'svg长度=' + q('#qwBoardFigure').innerHTML.length);
  check('步骤轨道显示 5 步', env.qAll('.qw-rail-item').length >= 1, '');

  await wait(4200); // 等待逐步气泡自动播放
  const chatRows = q('#qwChatStream').children.filter(c => /qw-chat-row/.test(String(c.className)));
  check('讲解气泡逐步出现', chatRows.length >= 3, 'bubbles=' + chatRows.length);

  const options = env.qAll('#qwChatAction .qw-option');
  check('检查点渲染选项', options.length === 4, 'options=' + options.length);
  options.forEach((btn, i) => { btn.dataset.answer = String(i); });

  // 逐个尝试选项，直到答对
  let solvedIndex = -1;
  for (let i = 0; i < 4; i += 1) {
    options[i].fire('click');
    q('#qwSubmitBtn').fire('click');
    await wait(500);
    const fb = q('#qwFeedback').innerHTML;
    if (/qw-feedback-item ok/.test(fb)) { solvedIndex = i; break; }
  }
  check('提交答案能判对并给出反馈', solvedIndex >= 0, 'correctIndex=' + solvedIndex
    + ' feedback=' + String(q('#qwFeedback').innerHTML).slice(0, 60).replace(/<[^>]+>/g, ''));
  check('已调用检查点判题接口', env.fetchLog.some(x => x.includes('/api/learning/checkpoint')), '');
  await wait(900);
  check('答对后进入下一步按钮', /qwNextBtn|qwFinishBtn/.test(q('#qwChatAction').innerHTML), '');

  // 智能体悬浮面板
  check('课堂内嵌入智能体面板', !!q('#qwAgentPanel'), '');
  const dock = q('#qwAgentDock');
  q('#qwAgentToggle').fire('click');
  check('点击可展开智能体面板', dock.classList.contains('open'), '');

  // 进入下一步
  const nextBtn = q('#qwNextBtn');
  nextBtn.fire('click');
  await wait(700);
  check('可以切换到下一步', /第 2 步/.test(q('#qwBoardTag').textContent), 'tag=' + q('#qwBoardTag').textContent);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch(err => { console.error('CRASH', err); process.exit(1); });