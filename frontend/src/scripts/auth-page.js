/**
 * 问数 Web 平台 - 登录 / 注册页逻辑
 * 平台已收敛为单一学生端：支持 ?redirect=... &notice=... 参数
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;
  const HOME = '/pages/student/home.html';
  // 三类角色各留一个演示账号，方便课堂上一键切换身份
  const DEMOS = [
    { account: '13800000001', password: '123456', label: '👦 学生演示号' },
    { account: 'teacher', password: '123456', label: '🧑‍🏫 教师演示号' },
    { account: 'admin', password: 'admin123', label: '🛰 运营演示号' }
  ];

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') ? decodeURIComponent(params.get('redirect')) : '';

  // 只允许跳回站内页面（学生端 / 管理端），避免被拼出站外地址
  function safeRedirect() {
    if (!redirect) return '';
    if (redirect.indexOf('//') !== -1) return '';
    if (redirect.indexOf('/pages/student/') !== 0 && redirect.indexOf('/pages/admin/') !== 0) return '';
    return redirect;
  }

  function showMsg(text, kind) {
    const box = $('#authMsg');
    if (!box) return;
    box.textContent = text;
    box.className = 'qw-auth-msg show ' + (kind || 'error');
  }

  function hideMsg() {
    const box = $('#authMsg');
    if (box) box.className = 'qw-auth-msg';
  }

  function bindDemo() {
    Array.from(document.querySelectorAll('.qw-demo-chip')).forEach(btn => {
      btn.addEventListener('click', () => {
        const account = $('#loginAccount');
        const password = $('#loginPassword');
        if (account) account.value = btn.getAttribute('data-account') || '';
        if (password) password.value = btn.getAttribute('data-password') || '';
        hideMsg();
      });
    });
  }

  // ------------------------------------------------------------------
  // 登录页
  // ------------------------------------------------------------------
  function bootLogin() {
    const form = $('#loginForm');
    if (!form) return;

    const demo = $('#authDemo');
    if (demo) {
      demo.innerHTML = '<b>课堂演示账号（点击自动填入）</b><div>'
        + DEMOS.map(item => '<button type="button" class="qw-demo-chip" data-account="' + esc(item.account)
          + '" data-password="' + esc(item.password) + '">' + esc(item.label) + '</button>').join('')
        + '</div>';
      bindDemo();
    }

    const remembered = AUTH.rememberedPhone();
    if (remembered) {
      $('#loginAccount').value = remembered;
      $('#loginRemember').checked = true;
    }

    const notice = params.get('notice');
    if (notice) showMsg(notice, 'notice');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      hideMsg();
      const account = $('#loginAccount').value.trim();
      const password = $('#loginPassword').value;
      const remember = $('#loginRemember').checked;
      if (!account) return showMsg('请输入手机号或用户名');
      if (!password) return showMsg('请输入密码');

      const btn = $('#loginSubmit');
      btn.disabled = true;
      btn.textContent = '正在登录…';
      try {
        const user = await AUTH.login({ account, password, remember });
        btn.textContent = '登录成功，正在进入…';
        // 学生进学习首页，教师 / 运营进管理控制台
        window.location.replace(safeRedirect() || AUTH.homeFor(user.role));
      } catch (err) {
        showMsg(err.message);
        btn.disabled = false;
        btn.textContent = '登录';
      }
    });
  }

  // ------------------------------------------------------------------
  // 注册页
  // ------------------------------------------------------------------
  function bootRegister() {
    const form = $('#registerForm');
    if (!form) return;

    const codeBtn = $('#sendCodeBtn');
    if (codeBtn) {
      codeBtn.addEventListener('click', async () => {
        hideMsg();
        const phone = $('#regPhone').value.trim();
        if (!/^1[3-9]\d{9}$/.test(phone)) return showMsg('请先填写正确的手机号');
        codeBtn.disabled = true;
        try {
          const data = (await AUTH.request('/api/auth/send-code', { method: 'POST', body: { phone } })).data;
          showMsg('演示环境验证码：' + (data.demoCode || '') + '（5 分钟内有效）', 'demo');
          let left = 60;
          codeBtn.textContent = left + ' 秒后重发';
          const timer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
              clearInterval(timer);
              codeBtn.disabled = false;
              codeBtn.textContent = '重新获取';
            } else {
              codeBtn.textContent = left + ' 秒后重发';
            }
          }, 1000);
        } catch (err) {
          showMsg(err.message);
          codeBtn.disabled = false;
        }
      });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      hideMsg();
      const grade = $('#regGrade');
      const payload = {
        name: $('#regName').value.trim(),
        phone: $('#regPhone').value.trim(),
        password: $('#regPassword').value,
        confirmPassword: $('#regConfirm').value,
        grade: grade ? grade.value : '八年级'
      };
      const code = $('#regCode') ? $('#regCode').value.trim() : '';

      if (!payload.name) return showMsg('请填写姓名');
      if (!/^1[3-9]\d{9}$/.test(payload.phone)) return showMsg('请输入正确的手机号');
      if (code && code.length !== 6) return showMsg('验证码是 6 位数字');
      if (!payload.password || payload.password.length < 6) return showMsg('密码至少 6 位');
      if (payload.password !== payload.confirmPassword) return showMsg('两次输入的密码不一致');

      const btn = $('#registerSubmit');
      btn.disabled = true;
      btn.textContent = '正在创建账号…';
      try {
        await AUTH.register(payload);
        btn.textContent = '注册成功，正在进入…';
        window.location.replace(HOME);
      } catch (err) {
        showMsg(err.message);
        btn.disabled = false;
        btn.textContent = '注册并开始学习';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bootLogin();
    bootRegister();
  });
})();