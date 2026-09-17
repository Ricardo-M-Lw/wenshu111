/**
 * 轻量 DOM 冒烟测试：不依赖浏览器，把学生端页面脚本真实执行一遍，
 * 捕获顶层与 DOMContentLoaded 阶段的运行时错误（ReferenceError / TypeError 等）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BASE = process.env.BASE || 'http://localhost:3000';

let storedToken = '';
let storedUser = null;

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear()
  };
}

// 收集一段 markup 里出现过的 id：先扫描页面 HTML，再随着 innerHTML 的写入持续累积，
// 这样 boot() 的分支判断与 addEventListener 的目标才与浏览器一致。
function noteIds(markup, ids) {
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(markup))) ids.add(m[1]);
}

// ids 按页面隔离：上一页遗留的定时器仍持有自己的注册表，不会误读下一页的状态
function makeEl(tag, ids) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    dataset: {},
    style: {},
    classList: {
      add() {}, remove() {}, toggle() { return false; }, contains() { return false; }
    },
    children: [],
    scrollTop: 0, scrollHeight: 0, scrollWidth: 0, clientWidth: 0, clientHeight: 0,
    offsetWidth: 0, offsetHeight: 0,
    value: '', textContent: '', disabled: false, checked: false,
    placeholder: '', href: '', src: '', id: '', className: '', type: '',
    appendChild(child) { el.children.push(child); return child; },
    insertBefore(child) { el.children.unshift(child); return child; },
    removeChild() {}, remove() {}, append() {}, prepend() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    click() {}, focus() {}, blur() {}, select() {}, reset() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    querySelector(sel) { return makeEl(sel, ids); },
    querySelectorAll() { return []; },
    closest() { return makeEl('div', ids); },
    insertAdjacentHTML() {},
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 }; },
    getContext() { return null; },
    parentNode: null, firstChild: null, lastChild: null, nextSibling: null
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    enumerable: true,
    configurable: true,
    get() { return html; },
    set(value) { html = String(value); if (ids) noteIds(html, ids); }
  });
  return el;
}

async function runPage(htmlFile, urlPath) {
  const rel = urlPath.split('?')[0].split('#')[0].replace(/^\//, '') || 'index.html';
  const html = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  const ids = new Set();
  noteIds(html, ids);
  const el = tag => makeEl(tag, ids);
  const scripts = [];
  const re = /<script(?![^>]*\btype="module")[^>]*\bsrc="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (src.startsWith('http')) continue;
    scripts.push(src);
  }

  const listeners = {};
  const errors = [];
  const fetchLog = [];
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  localStorage.setItem('qw_token', storedToken);
  localStorage.setItem('qw_user', JSON.stringify(storedUser));

  const location = {
    href: BASE + urlPath,
    pathname: urlPath,
    search: urlPath.indexOf('?') === -1 ? '' : urlPath.slice(urlPath.indexOf('?')),
    hash: urlPath.indexOf('#') === -1 ? '' : urlPath.slice(urlPath.indexOf('#')),
    replace(target) { location.replaced = target; },
    assign(target) { location.replaced = target; }
  };

  // 只让页面上真实存在的 id 命中，否则返回 null：
  // 这样 boot() 的 `if ($('#homeApp')) ... else if ...` 分支才会走对，
  // 每个页面真正执行的是它自己的渲染函数。
  const pick = sel => {
    const hash = /^#([\w-]+)$/.exec(sel);
    if (hash) return ids.has(hash[1]) ? el(sel) : null;
    return el(sel);
  };

  const document = {
    body: el('body'),
    documentElement: el('html'),
    head: el('head'),
    createElement: tag => el(tag),
    createTextNode: () => el('text'),
    getElementById: id => (ids.has(id) ? el(id) : null),
    querySelector: pick,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    readyState: 'loading'
  };

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => { try { fn(Date.now()); } catch (e) { errors.push('rAF: ' + e.message); } return 1; },
    cancelAnimationFrame() {},
    URLSearchParams, URL, TextDecoder, TextEncoder, Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, Map, Set, RegExp, Error, isNaN, parseInt, parseFloat, Intl,
    localStorage, sessionStorage, location, document,
    navigator: { userAgent: 'node-dom-smoke' },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    fetch: async (url, options) => {
      const target = url.startsWith('http') ? url : BASE + url;
      fetchLog.push((options && options.method ? options.method : 'GET') + ' ' + url);
      const opts = Object.assign({}, options || {});
      opts.headers = Object.assign({}, opts.headers || {});
      if (storedToken) opts.headers.Authorization = 'Bearer ' + storedToken;
      return fetch(target, opts);
    },
    alert() {}, confirm: () => true, prompt: () => null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  context.lucide = { createIcons() {} };

  for (const src of scripts) {
    const file = path.join(FRONTEND, src.replace(/^\//, ''));
    if (!fs.existsSync(file)) { errors.push('脚本不存在: ' + src); continue; }
    const code = fs.readFileSync(file, 'utf8');
    try {
      vm.runInContext(code, context, { filename: src });
    } catch (err) {
      errors.push('[' + src + '] ' + err.name + ': ' + err.message);
    }
  }

  for (const fn of listeners.DOMContentLoaded || []) {
    try {
      const out = fn();
      if (out && typeof out.then === 'function') await out.catch(e => errors.push('async DOMContentLoaded: ' + e.message));
    } catch (err) {
      errors.push('[DOMContentLoaded] ' + err.name + ': ' + err.message);
    }
  }

  // 等待页面内的异步请求落定
  await new Promise(resolve => setTimeout(resolve, 900));
  return { scripts, errors, fetchLog, location };
}

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: '13800000001', password: '123456' })
  });
  const data = await login.json();
  const studentToken = data.token;
  const studentUser = data.user;

  const pages = [
    ['index.html', '/'],
    ['student-classroom-1', '/pages/student/classroom.html?kp=kp1'],
    ['login', '/pages/auth/login.html'],
    ['register', '/pages/auth/register.html'],
    ['student-home', '/pages/student/home.html'],
    ['student-classroom', '/pages/student/classroom.html?kp=kp3'],
    ['student-agent', '/pages/student/agent.html?kp=kp3'],
    ['student-planet', '/pages/student/planet.html'],
    ['student-quiz', '/pages/student/quiz.html?kp=kp1'],
    ['student-level', '/pages/student/level.html'],
    ['student-checkin', '/pages/student/checkin.html'],
    ['student-badge', '/pages/student/badge.html'],
    ['student-result', '/pages/student/result.html?score=4&total=5&kp=kp1'],
    ['student-correction', '/pages/student/correction.html'],
    ['student-report-overview', '/pages/student/report.html'],
    ['student-report-mastery', '/pages/student/report.html?tab=mastery'],
    ['student-report-sessions', '/pages/student/report.html?tab=sessions'],
    ['student-report-detail', '/pages/student/report.html?tab=sessions&id=s4'],
    ['student-report-settings', '/pages/student/report.html?tab=settings'],
    ['student-ladder', '/pages/student/ladder.html']
  ];

  let failed = 0;
  async function runList(list, token, user) {
    storedToken = token;
    storedUser = user;
    for (const [label, urlPath] of list) {
      let result;
      try {
        result = await runPage(label, urlPath);
      } catch (err) {
        console.log('FAIL ' + label + ' :: 无法加载页面 ' + err.message);
        failed += 1;
        continue;
      }
      const calls = result.fetchLog.filter(x => x.includes('/api/')).length;
      if (result.errors.length) {
        failed += 1;
        console.log('FAIL ' + label + '  scripts=' + result.scripts.length + ' api=' + calls);
        result.errors.forEach(e => console.log('      ✗ ' + e));
      } else {
        console.log('PASS ' + label + '  scripts=' + result.scripts.length + ' api=' + calls
          + (result.location.replaced ? '  → 跳转 ' + result.location.replaced : ''));
      }
    }
  }

  await runList(pages, studentToken, studentUser);

  // 管理端（运营）：控制台页面同样要能无错跑起来
  const staffLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin', password: 'admin123' })
  });
  const staff = await staffLogin.json();
  const staffPages = [
    ['admin-console', '/pages/admin/console.html'],
    ['admin-console-orders', '/pages/admin/console.html#orders']
  ];
  await runList(staffPages, staff.token, staff.user);

  console.log('');
  console.log(failed ? ('FAILED PAGES: ' + failed) : 'ALL PAGES OK');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('CRASH', err); process.exit(1); });