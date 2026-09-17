/**
 * 问数 Web 平台 - 公共导航脚本
 * 根据当前页面路径自动注入对应的导航栏
 * 说明：平台已收敛为单一学生端，原家长端顶部导航已随「学习报告」并入学生端而移除。
 */

(function() {
  const path = window.location.pathname;
  const isStudent = path.includes('/pages/student/');

  const currentPage = path.split('/').pop().replace('.html', '') || 'index';

  // Student bottom tab navigation
  if (isStudent) {
  // 底部导航「星球」图标：lucide 的 planet 在部分版本里不存在，这里用自绘 SVG 保证一定显示
  const PLANET_TAB_SVG = '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="11.2" cy="12" r="5.4"/>'
    + '<path d="M6.4 8.5C3.8 10 2.3 11.7 2.8 13c.7 2 5.4 2.1 10.5.4 5-1.7 8.3-4 7.6-6-.4-1.2-2.3-1.6-4.9-1.2"/>'
    + '<circle cx="19.4" cy="6.2" r="1.4"/>'
    + '</svg>';

  const tabs = [
      { id: 'home', label: '首页', icon: 'home', href: './home.html' },
      { id: 'classroom', label: '讲题课堂', icon: 'book-open', href: './classroom.html' },
      { id: 'agent', label: '智能体', icon: 'sparkles', href: './agent.html' },
      { id: 'report', label: '报告', icon: 'bar-chart-3', href: './report.html' },
      { id: 'planet', label: '星球', icon: 'planet', href: './planet.html', svg: PLANET_TAB_SVG },
      { id: 'level', label: '我的', icon: 'user', href: './level.html' }
    ];

    // 二级页面归属到对应的一级标签，避免底部导航丢失选中态
    const ALIAS = {
      quiz: 'classroom',
      correction: 'classroom',
      ladder: 'planet',
      checkin: 'level',
      badge: 'level',
      vip: 'level',
      result: 'home'
    };
    const activeId = ALIAS[currentPage] || currentPage;

    const tabBar = document.createElement('nav');
    tabBar.className = 'qw-tabbar';
    tabBar.setAttribute('aria-label', '学生端主导航');
    tabBar.innerHTML = `
      <div class="qw-tabbar-inner">
        ${tabs.map(tab => {
          const isActive = activeId === tab.id;
          return `
            <a href="${tab.href}" class="tab-item qw-tab ${isActive ? 'active text-primary' : 'text-muted'}"${isActive ? ' aria-current="page"' : ''}>
              ${tab.svg || `<i data-lucide="${tab.icon}" class="tab-icon w-5 h-5"></i>`}
              <span class="text-[11px] font-medium">${tab.label}</span>
            </a>
          `;
        }).join('')}
      </div>
    `;
    document.body.appendChild(tabBar);

    // 星途顶部信息条（讲题课堂是整屏黑板，不注入）
    if (currentPage !== 'classroom') {
      // 星途顶部星座标签（参考设计稿：知识星系 / 漫游轨迹 / 伴学黑板舱 / 思维星座榜）
      const TOP_TABS = [
        { id: 'home', label: '星系首页', href: './home.html' },
        { id: 'classroom', label: '讲题启发', href: './classroom.html' },
        { id: 'quiz', label: '动手练会', href: './quiz.html' },
        { id: 'correction', label: '归因改对', href: './correction.html' },
        { id: 'ladder', label: '星际天梯', href: './ladder.html' },
        { id: 'level', label: '思维星座榜', href: './level.html' }
      ];
      const TOP_ALIAS = {
        result: 'home', checkin: 'level', badge: 'level'
      };
      const topKey = TOP_ALIAS[currentPage] || currentPage;
      const topTabs = TOP_TABS.map(tab => {
        const on = tab.id === topKey;
        return `<a href="${tab.href}"${on ? ' class="active" aria-current="page"' : ''}>${tab.label}</a>`;
      }).join('');
      const top = document.createElement('div');
      top.className = 'sq-topbar';
      top.innerHTML = `
        <div class="sq-topbar-inner">
          <a class="sq-topbar-brand" href="./home.html">
            <img src="/assets/images/mascot/xiaowen/idle.png" data-qw-xiaowen="idle" data-qw-xiaowen-still="1" alt="">
            <span class="sq-brand-text"><b>问数星途</b><i>STAR QUEST · MATH</i></span>
          </a>
          <nav class="sq-topbar-tabs" aria-label="星途导航">${topTabs}</nav>
          <span class="sq-topbar-spacer"></span>
          <span class="sq-topbar-dust" title="星尘：完成任务获得的通用积分">
            ✨ <b data-qw-dust>--</b><i>星尘</i>
          </span>
          <span class="sq-topbar-dust sq-topbar-gem" title="星钻：徽章与知识点成就折算的成就结晶">
            💎 <b data-qw-gem>--</b><i>星钻</i>
          </span>
          <button type="button" class="sq-topbar-icon" data-qw-theme-toggle aria-label="切换白天 / 夜晚模式">
            <span data-qw-theme-label data-qw-theme-icon>🌤</span>
          </button>
          <a class="sq-topbar-avatar" href="./level.html" aria-label="我的星图">
            <span data-qw-avatar>🙂</span>
            <b class="qw-topbar-crown" data-qw-crown hidden>👑</b>
          </a>
        </div>`;
      document.body.insertBefore(top, document.body.firstChild);

      // 顶栏星尘 / 星钻 / 头像：轻量接口，取不到就保持占位符
      const AUTH = window.QWAuth;
      const avatarSlot = top.querySelector('[data-qw-avatar]');
      // 会员（领航员）：头像右上角挂一枚小皇冠，详情在「我的」与会员页
      const crownSlot = top.querySelector('[data-qw-crown]');
      const syncCrown = user => {
        if (!crownSlot) return;
        const m = user && user.membership;
        const active = !!(m && m.endAt && new Date(m.endAt).getTime() > Date.now());
        crownSlot.hidden = !active;
        // 头像容器默认 overflow:hidden，挂上皇冠时要放开，否则角标会被裁掉
        if (avatarSlot && avatarSlot.parentNode) {
          avatarSlot.parentNode.classList.toggle('has-crown', active);
        }
        if (active) {
          // /api/auth/me 返回的 membership 没有 endAtLabel，这里兜底按本地时区格式化
          const end = m.endAt ? new Date(m.endAt) : null;
          const label = m.endAtLabel || (end && !isNaN(end)
            ? end.getFullYear() + '.' + String(end.getMonth() + 1).padStart(2, '0') + '.' + String(end.getDate()).padStart(2, '0')
            : '');
          crownSlot.setAttribute('title', m.planName + (label ? ' · ' + label + ' 到期' : ' · 领航员特权生效中'));
        } else {
          crownSlot.removeAttribute('title');
        }
      };
      if (AUTH && AUTH.isLoggedIn()) {
        const user = typeof AUTH.getUser === 'function' ? AUTH.getUser() : null;
        if (user && avatarSlot) {
          AUTH.fillAvatar(avatarSlot, user.avatar, '🙂');
          const name = typeof AUTH.displayName === 'function' ? AUTH.displayName(user) : (user.name || '');
          avatarSlot.parentNode.setAttribute('title', name + ' · 我的星图');
          syncCrown(user);
        }
        // 「我的」页换过头像后，顶栏立刻同步
        window.addEventListener('qw-user-change', event => {
          const next = (event && event.detail && event.detail.user) || (typeof AUTH.getUser === 'function' ? AUTH.getUser() : null);
          if (!next || !avatarSlot) return;
          AUTH.fillAvatar(avatarSlot, next.avatar, '🙂');
          const name = typeof AUTH.displayName === 'function' ? AUTH.displayName(next) : (next.name || '');
          avatarSlot.parentNode.setAttribute('title', name + ' · 我的星图');
          syncCrown(next);
        });
        // 会员 / 头像 / 昵称以服务端为准：本地缓存可能还是上一次开通的会员快照，
        // 不校正的话重置了服务端状态皇冠也会一直挂在顶栏
        if (avatarSlot) {
          AUTH.me().then(user => {
            if (!user) return;
            AUTH.fillAvatar(avatarSlot, user.avatar, '🙂');
            const name = typeof AUTH.displayName === 'function' ? AUTH.displayName(user) : (user.name || '');
            avatarSlot.parentNode.setAttribute('title', name + ' · 我的星图');
            syncCrown(user);
          }).catch(() => {});
        }
        const syncWallet = () => {
          AUTH.request('/api/gamification/status').then(res => {
            const data = (res && res.data) || {};
            const dust = top.querySelector('[data-qw-dust]');
            if (dust && typeof data.points === 'number') dust.textContent = data.points;
            const gem = top.querySelector('[data-qw-gem]');
            const crystals = data.crystals || {};
            // 星钻现在可以兑换 AI 对话次数，顶栏显示的是「还能花的」而不是累计值
            const gemValue = typeof crystals.available === 'number' ? crystals.available : crystals.total;
            if (gem && typeof gemValue === 'number') gem.textContent = gemValue;
            const gemPill = top.querySelector('.sq-topbar-gem');
            if (gemPill && crystals.note) gemPill.setAttribute('title', crystals.note);
          }).catch(() => {});
        };
        syncWallet();
        // 兑换 AI 对话次数 / 开通会员后，顶栏的星尘星钻要立刻跟着变
        window.addEventListener('qw-wallet-change', syncWallet);
      }
    }

    // Add student-page class to body
    document.body.classList.add('student-page');

    // Ensure body has bottom padding
    if (!document.body.classList.contains('pb-20')) {
      const main = document.querySelector('main');
      if (main && !main.classList.contains('pb-20')) {
        main.classList.add('pb-20');
      }
    }
  }

  const logoutBtn = document.getElementById('qwNavLogout');
  if (logoutBtn && window.QWAuth) {
    logoutBtn.addEventListener('click', () => window.QWAuth.logout());
  }

  // 小问吉祥物：所有学生端页面右下角都有一只会说话的小猫，点一下就能展开小聊天框
  if (isStudent) {
    if (!document.querySelector('script[data-qw-mascot]')) {
      const mascot = document.createElement('script');
      mascot.src = '/src/scripts/mascot.js';
      mascot.setAttribute('data-qw-mascot', '1');
      document.head.appendChild(mascot);
    }
  }

  // Initialize lucide icons after nav injection
  if (window.lucide) {
    lucide.createIcons();
  }

  // The student tab bar may be injected before the page script renders its shell
  document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
  });
})();