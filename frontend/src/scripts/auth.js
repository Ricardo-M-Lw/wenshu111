/**
 * 问数 Web 平台 - 登录态与接口客户端
 * 页面在 <head> 中引入本文件后，学生端页面会自动校验登录态
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'qw_token';
  const USER_KEY = 'qw_user';
  const ROLE_HOME = {
    student: '/pages/student/home.html',
    teacher: '/pages/admin/console.html',
    ops: '/pages/admin/console.html'
  };
  const LOGIN_PAGE = '/pages/auth/login.html';

  function readStore() {
    return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getToken() && !!getUser();
  }

  function save(token, user, remember) {
    clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
    if (remember) localStorage.setItem('qw_remember', user.phone || '');
  }

  function clear() {
    [localStorage, sessionStorage].forEach(store => {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    });
  }

  function homeFor(role) {
    return ROLE_HOME[role] || ROLE_HOME.student;
  }

  function pageRole() {
    const path = window.location.pathname;
    if (path.indexOf('/pages/student/') !== -1) return 'student';
    // 管理端：教师 / 运营共用一套控制台，守卫按「内部人员」处理
    if (path.indexOf('/pages/admin/') !== -1) return 'staff';
    return null;
  }

  function isStaff(user) {
    return !!user && (user.role === 'teacher' || user.role === 'ops');
  }

  function redirectToLogin(role, message) {
    const target = role || pageRole() || 'student';
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    const query = '?role=' + target + '&redirect=' + redirect + (message ? '&notice=' + encodeURIComponent(message) : '');
    window.location.replace(LOGIN_PAGE + query);
  }

  async function request(url, options) {
    const config = Object.assign({}, options || {});
    const headers = Object.assign({}, config.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (config.body && typeof config.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    config.headers = headers;

    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && pageRole()) {
      clear();
      redirectToLogin(null, data.error || '登录已过期，请重新登录');
      throw new Error(data.error || '登录已过期');
    }
    if (!res.ok) {
      // 把状态码与响应体一起挂在错误上：智能体配额用完是 429，调用方要读 data.quota
      const err = new Error(data.error || data.message || '请求失败，请稍后重试');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function login(payload) {
    const data = await request('/api/auth/login', { method: 'POST', body: payload });
    save(data.token, data.user, !!payload.remember);
    return data.user;
  }

  // NDJSON 流式请求：智能体逐段返回文字，前端边收边显示
  async function stream(url, body, onEvent) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    if (!res.ok || !res.body) {
      const detail = await res.json().catch(() => ({}));
      const err = new Error(detail.error || '智能体暂时没有响应');
      err.status = res.status;
      err.data = detail;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.filter(line => line.trim()).forEach(line => {
        try {
          const event = JSON.parse(line);
          if (event.type === 'done') result = event.data;
          onEvent(event);
        } catch (err) {
          /* 忽略不完整的行 */
        }
      });
    }
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        if (event.type === 'done') result = event.data;
        onEvent(event);
      } catch (err) {
        /* 忽略 */
      }
    }
    return result;
  }

  async function register(payload) {
    const data = await request('/api/auth/register', { method: 'POST', body: payload });
    save(data.token, data.user, true);
    return data.user;
  }

  async function me() {
    const data = await request('/api/auth/me');
    readStore().setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }

  // 更新个人资料（头像 / 昵称），成功后同步本地登录态并广播事件
  async function updateProfile(payload) {
    const res = await request('/api/auth/profile', { method: 'PATCH', body: payload || {} });
    const user = (res && res.data && res.data.user) || null;
    if (user) {
      try { readStore().setItem(USER_KEY, JSON.stringify(user)); } catch (err) { /* 忽略 */ }
      window.dispatchEvent(new CustomEvent('qw-user-change', { detail: { user: user } }));
    }
    return user;
  }

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 头像既可以是 emoji / 文字，也可以是图片链接或图片数据
  function isImageAvatar(value) {
    const text = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(text) || /^data:image\//i.test(text);
  }

  function avatarHtml(value, fallback) {
    const text = String(value == null ? '' : value).trim();
    if (isImageAvatar(text)) {
      return '<img class="qw-avatar-img" src="' + escapeText(text) + '" alt="我的头像">';
    }
    return escapeText(text || fallback || '🙂');
  }

  // 把头像写进一个已有元素：图片走 <img>，其余按文字处理
  function fillAvatar(el, value, fallback) {
    if (!el) return;
    const text = String(value == null ? '' : value).trim();
    if (isImageAvatar(text)) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'qw-avatar-img';
      img.src = text;
      img.alt = '我的头像';
      el.appendChild(img);
    } else {
      el.textContent = text || fallback || '🙂';
    }
  }

  async function logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      /* 令牌是无状态的，接口失败也要清除本地登录态 */
    }
    clear();
    window.location.replace(LOGIN_PAGE);
  }

  function guard() {
    const role = pageRole();
    if (!role) return null;
    const user = getUser();
    if (!getToken() || !user) {
      redirectToLogin(role === 'staff' ? 'teacher' : role,
        role === 'staff' ? '请先登录教师 / 运营账号' : '请先登录再开始学习');
      return null;
    }
    // 管理端只放教师 / 运营进来，学生误入会被送回自己的首页
    if (role === 'staff') {
      if (!isStaff(user)) {
        window.location.replace(homeFor(user.role));
        return null;
      }
      return user;
    }
    if (user.role !== role) {
      window.location.replace(homeFor(user.role));
      return null;
    }
    return user;
  }

  function displayName(user) {
    if (!user) return '同学';
    return user.nickname || user.name || '同学';
  }

  function initials(user) {
    return displayName(user).slice(-2);
  }

  window.QWAuth = {
    LOGIN_PAGE: LOGIN_PAGE,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    save: save,
    clear: clear,
    request: request,
    login: login,
    register: register,
    me: me,
    stream: stream,
    logout: logout,
    guard: guard,
    homeFor: homeFor,
    pageRole: pageRole,
    isStaff: isStaff,
    redirectToLogin: redirectToLogin,
    updateProfile: updateProfile,
    fillAvatar: fillAvatar,
    isImageAvatar: isImageAvatar,
    avatarHtml: avatarHtml,
    escapeText: escapeText,
    displayName: displayName,
    initials: initials,
    rememberedPhone: function () { return localStorage.getItem('qw_remember') || ''; }
  };

  // 学生端页面引入本文件即自动校验登录态
  if (!window.QW_NO_GUARD) guard();
})();
