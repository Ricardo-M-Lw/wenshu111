/**
 * 问数 Web 平台 - 学生端页面脚本
 * 覆盖：学习首页 / 答题星球 / 标准题训练 / 签到积分 / 徽章挑战 / 等级体系 / 学习结果
 * 讲题课堂请见 classroom.js
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message) {
    let node = $('.qw-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qw-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function api(url, options) {
    return AUTH.request(url, options);
  }

  function formatDate(value, withTime) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const opts = withTime
      ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return date.toLocaleDateString('zh-CN', opts);
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' 小时前';
    const days = Math.floor(hours / 24);
    if (days === 1) return '昨天';
    if (days < 7) return days + ' 天前';
    return formatDate(value, false);
  }

  const STATUS_META = {
    '已掌握': { cls: 'ok', label: '已掌握' },
    '学习中': { cls: 'doing', label: '学习中' },
    '待巩固': { cls: 'warn', label: '待巩固' },
    '未开始': { cls: 'idle', label: '未开始' }
  };

  function statusPill(status) {
    const meta = STATUS_META[status] || STATUS_META['未开始'];
    return '<span class="qw-status qw-status-' + meta.cls + '">' + meta.label + '</span>';
  }

  function renderRing(percent, label, sub) {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);
    return '<div class="qw-ring">'
      + '<svg viewBox="0 0 120 120">'
      + '<circle cx="60" cy="60" r="' + radius + '" fill="none" stroke="rgba(43,164,160,.14)" stroke-width="10"/>'
      + '<circle cx="60" cy="60" r="' + radius + '" fill="none" stroke="url(#qwRingGrad)" stroke-width="10" stroke-linecap="round"'
      + ' stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 60 60)"/>'
      + '<defs><linearGradient id="qwRingGrad" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#43C7B8"/><stop offset="100%" stop-color="#1E8C88"/></linearGradient></defs>'
      + '</svg>'
      + '<div class="qw-ring-text"><b>' + label + '</b><span>' + esc(sub || '') + '</span></div>'
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // 五维能力雷达图（我的 → 能力图）
  // ---------------------------------------------------------------------------
  function radarChart(dimensions) {
    const size = 270;
    const cx = size / 2;
    const cy = size / 2 + 4;
    const radius = 88;
    const count = dimensions.length;
    const angleAt = index => (Math.PI * 2 * index) / count - Math.PI / 2;
    const at = (index, r) => [
      cx + Math.cos(angleAt(index)) * r,
      cy + Math.sin(angleAt(index)) * r
    ];
    const pair = (index, r) => at(index, r).map(v => v.toFixed(1)).join(',');

    const rings = [0.25, 0.5, 0.75, 1].map(ratio =>
      '<polygon points="' + dimensions.map((item, index) => pair(index, radius * ratio)).join(' ')
      + '" fill="none" stroke="rgba(120,140,190,.26)" stroke-width="1"/>').join('');

    const spokes = dimensions.map((item, index) =>
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + at(index, radius)[0].toFixed(1)
      + '" y2="' + at(index, radius)[1].toFixed(1) + '" stroke="rgba(120,140,190,.22)" stroke-width="1"/>').join('');

    const shape = dimensions.map((item, index) =>
      pair(index, radius * Math.max(0.08, item.score / 100))).join(' ');

    const dots = dimensions.map((item, index) => {
      const point = at(index, radius * Math.max(0.08, item.score / 100));
      return '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1)
        + '" r="4.2" fill="' + item.color + '" stroke="#fff" stroke-width="2"/>';
    }).join('');

    const labels = dimensions.map((item, index) => {
      const point = at(index, radius + 27);
      const y = point[1];
      return '<text class="qw-radar-name" x="' + point[0].toFixed(1) + '" y="' + y.toFixed(1)
        + '" text-anchor="middle" dominant-baseline="middle" fill="' + item.color + '">' + esc(item.name) + '</text>'
        + '<text class="qw-radar-score" x="' + point[0].toFixed(1) + '" y="' + (y + 15).toFixed(1)
        + '" text-anchor="middle">' + item.score + '</text>';
    }).join('');

    return '<svg class="qw-radar" viewBox="0 0 ' + size + ' ' + size + '" role="img"'
      + ' aria-label="五维能力雷达图">'
      + '<defs><radialGradient id="qwRadarFill" cx="50%" cy="50%" r="55%">'
      + '<stop offset="0%" stop-color="#FFC53D" stop-opacity=".58"/>'
      + '<stop offset="100%" stop-color="#7C6CF5" stop-opacity=".34"/>'
      + '</radialGradient></defs>'
      + rings + spokes
      + '<polygon points="' + shape + '" fill="url(#qwRadarFill)" stroke="#F5A623"'
      + ' stroke-width="2.4" stroke-linejoin="round"/>'
      + dots + labels
      + '</svg>';
  }

  function abilityCard(ability) {
    if (!ability || !ability.dimensions) return '';
    return '<section class="qw-card qw-ability-card">'
      + '  <div class="qw-ability-head">'
      + '    <div><h3>🛰️ 五维能力雷达</h3><p>' + esc(ability.summary) + '</p></div>'
      + '    <span class="qw-ability-overall"><b>' + (ability.overall || 0) + '</b><i>综合能力</i></span>'
      + '  </div>'
      + '  <div class="qw-ability-body">'
      + '    <div class="qw-ability-chart">' + radarChart(ability.dimensions) + '</div>'
      + '    <ul class="qw-ability-list">' + ability.dimensions.map(item =>
        '<li><span class="qw-ability-ic">' + esc(item.icon) + '</span>'
        + '<div class="qw-ability-main">'
        + '<div class="qw-ability-row"><b>' + esc(item.name) + '</b><i>' + item.score + '</i></div>'
        + '<div class="qw-ability-bar"><span style="width:' + item.score + '%;background:' + item.color + '"></span></div>'
        + '<p>' + esc(item.note) + '</p></div></li>').join('')
      + '    </ul>'
      + '  </div>'
      + '  <p class="qw-ability-advice">🎯 ' + esc(ability.advice) + '</p>'
      + '</section>';
  }
  async function loadDashboard() {
    return (await api('/api/dashboard')).data;
  }

  // ---------------------------------------------------------------------------
  // 学习首页
  // ---------------------------------------------------------------------------
  // 星球命名与状态标签（星途主题）
  const PLANET_NAMES = { kp1: '一次函数彗星', kp2: '内角和之星', kp3: '勾股星' };
  const PLANET_LABELS = { '已掌握': '核心主星', '学习中': '几何公理', '待巩固': '待加固天体', '未开始': '新发现天体' };
  const RECENT_COLORS = ['#667EEA', '#EE5A6F', '#2BA4A0'];

  // 星球卡 · 手绘数学插画（叠在笑脸星球外圈，呼应参考稿的几何涂鸦）
  const ORB_ART_FALLBACK = {
    kp1: '<svg class="sq-orb-svg" viewBox="0 0 160 160" aria-hidden="true">'
      + '<text x="30" y="34" font-size="14.5" fill="#7C6CF5">y = kx + b</text>'
      + '<g class="orb-line" stroke="#7C6CF5" opacity=".60">'
      + '<path d="M26 138V22M26 138h120"/>'
      + '<path d="M26 22l-5 11M26 22l5 11M146 138l-11-5M146 138l-11 5"/></g>'
      + '<path class="orb-line" stroke="#FF7A59" stroke-width="2.8" stroke-dasharray="7 6" d="M34 132L128 46"/>'
      + '<circle class="orb-dot" fill="#FFC53D" cx="128" cy="46" r="6.4"/></svg>',
    kp2: '<svg class="sq-orb-svg" viewBox="0 0 160 160" aria-hidden="true">'
      + '<text x="10" y="32" font-size="12.5" fill="#2BA4A0">&#8736;A+&#8736;B+&#8736;C = 180&#176;</text>'
      + '<path class="orb-line" stroke="#2BA4A0" stroke-dasharray="5 5" opacity=".72" d="M80 16L10 142h140z"/>'
      + '<path class="orb-line" stroke="#2BA4A0" opacity=".5" stroke-width="1.8"'
      + ' d="M80 38a20 20 0 0 0-10 17M34 124a17 17 0 0 0 15 10M126 124a17 17 0 0 1-15 10"/></svg>',
    kp3: '<svg class="sq-orb-svg" viewBox="0 0 160 160" aria-hidden="true">'
      + '<text x="32" y="32" font-size="14" fill="#A2610A">a&#178; + b&#178; = c&#178;</text>'
      + '<path class="orb-line" stroke="#F5A81F" stroke-dasharray="5 5" opacity=".75" d="M16 138h132L16 34z"/>'
      + '<path class="orb-line" stroke="#F5A81F" opacity=".55" stroke-width="1.8" d="M16 124h14v14"/></svg>'
  };

  // 图形库（space-art.js）：优先用它生成的手绘表情星球；未加载时回退到几何点线插画
  const ART = window.QWSpaceArt || null;
  const ORB_HAS_ART = !!(ART && ART.ORB_ART);
  const ORB_ART = (ART && ART.ORB_ART) || ORB_ART_FALLBACK;
  const HAS_EMBLEM = !!(ART && typeof ART.emblem === 'function');

  // 徽章纹章：10 枚徽章各自一种底座造型 + 主色 + 星数刻度（越靠后越稀有）
  const BADGE_TIERS = [
    { shape: 'hex',     color: '#35C5BE', stars: 1 },
    { shape: 'hex',     color: '#4C7DF0', stars: 1 },
    { shape: 'round',   color: '#7C6CF5', stars: 2 },
    { shape: 'round',   color: '#5B8DEF', stars: 2 },
    { shape: 'hex',     color: '#F5A623', stars: 3 },
    { shape: 'diamond', color: '#FF7A59', stars: 3 },
    { shape: 'shield',  color: '#2BA4A0', stars: 4 },
    { shape: 'shield',  color: '#8B5CF6', stars: 4 },
    { shape: 'diamond', color: '#EC4899', stars: 5 },
    { shape: 'shield',  color: '#FFC53D', stars: 5 }
  ];
  // 等级纹章：1-2 级六边形、3 级圆形、4 级盾形、5 级菱形（越高级越"贵重"）
  const LEVEL_EMBLEM_SHAPE = ['hex', 'hex', 'round', 'shield', 'diamond'];

  // 结果页勋章：按正确率发一枚，纯前端展示，不写库
  const RESULT_MEDALS = [
    { min: 100, name: '满分勋章', shape: 'diamond', symbol: '\uD83D\uDC51', stars: 5, color: '#FFC53D', note: '全部答对，这个知识点你已经完全拿下。' },
    { min: 80,  name: '优秀勋章', shape: 'shield',  symbol: '\uD83C\uDFC5', stars: 4, color: '#7C6CF5', note: '只差一点点就满分，把错的那道题再想一遍就完美了。' },
    { min: 60,  name: '进阶勋章', shape: 'round',   symbol: '\uD83D\uDE80', stars: 3, color: '#4C7DF0', note: '思路已经通了，回到讲题课堂把卡住的那一步补上。' },
    { min: 0,   name: '起航勋章', shape: 'hex',     symbol: '\uD83C\uDF31', stars: 1, color: '#35C5BE', note: '敢于开始就很棒，我们回到黑板前一步一步来。' }
  ];

  // 没有图形库时优雅回退成原来的 emoji，页面绝不至于空掉
  function emblemHtml(spec, emoji) {
    if (!HAS_EMBLEM) return esc(emoji);
    return ART.emblem(spec);
  }

  // 背景星系的静态插画（拼一次，后续页面直接复用，不重复生成）
  const GALAXY_DECOS = (ART && typeof ART.galaxy === 'function')
    ? [
        ART.galaxy({ size: 330, color: '#7C6CF5', tilt: -20, className: 'qwp-galaxy-deco g1' }),
        ART.galaxy({ size: 400, color: '#4C7DF0', tilt: 14, className: 'qwp-galaxy-deco g2' })
      ]
    : [];

  // 首页新手引导：第一次登录后自动走一遍，之后可以点「怎么用」重看
  const HOME_TOUR_STEPS = [
    { sel: '.sq-hero', title: '这里是你的星图总览',
      text: '左边一句话报今天的日期、你的等级和全星系掌握度；右上角三个数字分别看掌握度、已开放星宿和当前护眼模式。' },
    { sel: '.sq-station', title: '照着三个航标走就不会迷路',
      text: '讲题启发 → 动手练会 → 归因改对，这三步是一个完整闭环。卡片上会显示你已经走到哪一站了。' },
    { sel: '.sq-planets', title: '一颗星球 = 一个知识点',
      text: '前面的星球又大又亮，点进去就是对应的讲题课堂和练习；后面还没开放的要先开通领航员。' },
    { sel: '.sq-companion', title: '卡住了就喊小问',
      text: '伴学领航员小问随时在右下角待命，可以直接语音对话。它只会一步步引导你，不会把答案直接给你。' },
    { sel: '.sq-quick', title: '常用入口都在这',
      text: '讲题课堂、标准题训练、答题星球、签到、徽章、等级体系，六个入口一键直达。' }
  ];

  async function renderHome() {
    const root = $('#homeApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在校准星图…</div>';
    try {
      const data = await loadDashboard();
      const user = data.user || {};
      const gam = data.gamification || {};
      const level = gam.level || {};
      const kps = data.knowledgePoints || [];
      const recent = data.recentSessions || [];
      const today = data.todayStats || {};
      const overall = data.overall || {};

      const mastered = kps.filter(kp => kp.status === '已掌握').length;
      const avgProgress = kps.length
        ? Math.round(kps.reduce((sum, kp) => sum + (kp.progress || 0), 0) / kps.length)
        : 0;
      const masteryRate = (typeof overall.correctRate === 'number' && overall.correctRate > 0)
        ? overall.correctRate : avgProgress;
      // 免费版只开放第一颗星球：kp.locked 由后端 /api/dashboard 下发
      const isLocked = kp => (typeof kp.locked === 'boolean') ? kp.locked : kp.status === '未开始';
      const access = data.access || null;
      // 伴学卡片 / 快捷入口都指向「已解锁」的星球，避免点了进去发现锁着
      const openKps = kps.filter(kp => !isLocked(kp));
      const focus = openKps.filter(kp => kp.status !== '已掌握')[0] || openKps[0] || kps[0] || null;
      const focusId = focus ? focus.id : 'kp1';
      const accessBanner = (access && !access.vip)
        ? '<div class="sq-lock-banner">'
          + '  <span class="sq-lock-ic" aria-hidden="true">🔒</span>'
          + '  <div><b>' + esc(access.label) + '</b><p>' + esc(access.upgradeText) + '</p></div>'
          + '  <a class="sq-lock-btn" href="./vip.html">👑 开通领航员</a>'
          + '</div>'
        : '';

      // 星舰学习闭环：三站航标的真实状态（讲题启发 / 动手练会 / 归因改对）
      const recentCorrections = recent.reduce((sum, item) => sum + (item.correctionCount || 0), 0);
      const recentHints = recent.reduce((sum, item) => sum + (item.hintCount || 0), 0);
      const errorSignals = recent.reduce((sum, item) => sum + ((item.errorTypes || []).length), 0);
      const fixRate = (recentCorrections + errorSignals)
        ? Math.round((recentCorrections / (recentCorrections + errorSignals)) * 100) : 0;
      const talkState = avgProgress >= 60 ? 'done' : (avgProgress > 0 ? 'active' : '');
      const drillState = masteryRate >= 70 ? 'done' : (masteryRate > 0 ? 'active' : '');
      const fixState = recentCorrections === 0 ? ''
        : (fixRate >= 60 && recentCorrections >= 2 ? 'done' : 'active');
      const stationState = state => state === 'done' ? '✅ 已通关'
        : (state === 'active' ? '🚀 进行中' : '🔒 待启航');
      const stationClass = state => state === 'done' ? 'is-done' : (state === 'active' ? 'is-active' : '');
      const stationDone = [talkState, drillState, fixState].filter(state => state === 'done').length;

      const planetCards = kps.map((kp, index) => {
        const progress = kp.progress || 0;
        const stepNow = Math.min((kp.currentStep || 0) + 1, kp.totalSteps || 5);
        const points = kp.keyPoints || [];
        const taskText = points.length
          ? points[Math.min(kp.currentStep || 0, points.length - 1)]
          : kp.description;
        // vipLocked = 免费版没解锁（要去会员页）；locked 还包含「自己还没开始学」
        const vipLocked = kp.locked === true;
        const locked = vipLocked || kp.status === '未开始';
        const label = vipLocked ? '领航员星系' : (PLANET_LABELS[kp.status] || '新发现天体');
        const cta = vipLocked
          ? '🔒 开通领航员解锁'
          : (kp.status === '未开始'
            ? '🔒 破译坐标（第 1 关）'
            : (kp.status === '已掌握'
              ? '♻️ 重返星球 · 复习一遍'
              : (index % 2 === 1 ? '🧭 启航探索（第' + stepNow + '关）' : '🚀 继续漫游（第' + stepNow + '关）')));
        return '<a class="sq-planet' + (locked ? ' locked' : '') + (vipLocked ? ' is-vip-locked' : '') + '"'
          + ' href="' + (vipLocked ? './vip.html' : './classroom.html?kp=' + esc(kp.id)) + '"'
          + ' style="--planet:' + esc(kp.accent || '#FFC53D') + ';--planet-soft:' + esc(kp.soft || 'rgba(255,197,61,.20)') + '">'
          + '  <span class="sq-planet-flag">' + esc(label) + '</span>'
          + '  <div class="sq-planet-orb' + (ORB_HAS_ART ? ' has-art' : '') + '" aria-hidden="true">'
          + (ORB_HAS_ART ? (ORB_ART[kp.id] || '') : '<i></i><i></i><em></em>' + (ORB_ART[kp.id] || '')) + '</div>'
          + '  <div class="sq-planet-head"><h3>' + esc(PLANET_NAMES[kp.id] || kp.name) + '</h3>'
          + '    <span class="sq-planet-mastery">掌握度 ' + progress + '%</span></div>'
          + '  <p class="sq-planet-desc">' + esc(kp.description) + '　' + esc(kp.grade || '') + '</p>'
          + '  <div class="sq-progress"><b style="width:' + progress + '%"></b></div>'
          + '  <div class="sq-task"><span>🛰</span><div><b>当前任务 · 第 ' + stepNow + ' 关</b>'
          + '    <p>' + esc(taskText) + '</p></div></div>'
          + '  <span class="sq-planet-cta">' + cta + '</span>'
          + (vipLocked ? '<span class="sq-planet-lock" aria-hidden="true">🔒</span>' : '')
          + '</a>';
      }).join('');

      const recentHtml = recent.length
        ? recent.map((item, index) => '<a class="sq-recent-item" href="./classroom.html?kp=' + esc(item.knowledgePointId) + '">'
            + '<span class="sq-recent-icon" style="--c:' + RECENT_COLORS[index % RECENT_COLORS.length] + '">'
            + esc(String(item.knowledgePointName || '').slice(0, 1)) + '</span>'
            + '<span class="sq-recent-main"><b>' + esc(item.knowledgePointName) + '</b>'
            + '<i>讲题步骤 ' + item.currentStep + '/' + item.totalSteps + ' · 提示 ' + item.hintCount + ' 次 · 纠正 ' + item.correctionCount + ' 次</i></span>'
            + '<span class="sq-recent-time">' + esc(relativeTime(item.updatedAt)) + '</span>'
            + '</a>').join('')
        : '<p class="qw-empty">还没有学习记录，先从一次函数开始吧。</p>';

      root.innerHTML = ''
        + '<section class="sq-hero">'
        + '  <div>'
        + '    <button type="button" class="sq-mode-chip" data-qw-theme-toggle>'
        + '      <span data-qw-theme-label>🌤 白暖白天</span></button>'
        + '    <button type="button" class="sq-mode-chip sq-tour-chip" id="qwHomeTourBtn" title="重看一遍首页使用引导">❓ 怎么用</button>'
        + '    <h1>数理思维漫游图景 · <span data-qw-mode-phrase'
        + '      data-day="白天探索模式运行中" data-night="夜航护眼模式运行中">白天探索模式运行中</span></h1>'
        + '    <p>' + esc(formatDate(new Date(), false)) + '　你好，' + esc(AUTH.displayName(user))
        + '　· <a class="sq-hero-level" href="./level.html" title="查看等级体系与经验获取方式">'
        + 'Lv.' + (level.current || 1) + ' ' + esc(level.name || '见习学员') + ' →</a></p>'
        + '  </div>'
        + '  <div class="sq-stats">'
        + '    <div class="sq-stat"><span>全星系掌握度</span><b>' + masteryRate + '%</b></div>'
        + '    <div class="sq-stat"><span>'
        + (access && !access.vip ? '已开放星宿' : '已点亮星宿') + '</span><b>'
        + (access && !access.vip ? access.unlockedCount + '/' + access.total : mastered + '/' + kps.length) + ' 宿</b>'
        + (access && !access.vip ? '<i class="sq-stat-hint">👑 解锁全部</i>' : '')
        + '</div>'
        + '    <div class="sq-stat"><span>视力守护</span>'
        + '      <b data-qw-day>舒适自然光</b>'
        + '      <b data-qw-night hidden>温和睡前微光</b></div>'
        + '  </div>'
        + '</section>'
        + '<section class="sq-station">'
        + '  <div class="sq-station-head">'
        + '    <div class="sq-station-title"><span>🛰</span><div>'
        + '      <b>星舰学习闭环</b><i>跟着航标走：讲题启发 → 动手练会 → 归因改对</i></div></div>'
        + '    <span class="sq-station-meter">航标进度 ' + stationDone + '/3</span>'
        + '  </div>'
        + '  <div class="sq-station-track">'
        + '    <a class="sq-station-card ' + stationClass(talkState) + '" href="./classroom.html?kp=' + esc(focusId) + '">'
        + '      <span class="sq-station-no">01</span><b>讲题启发</b>'
        + '      <p>跟着小问把每一步的道理讲明白，五步走完一个知识点。</p>'
        + '      <span class="sq-station-state">' + stationState(talkState) + '</span></a>'
        + '    <a class="sq-station-card ' + stationClass(drillState) + '" href="./quiz.html?kp=' + esc(focusId) + '">'
        + '      <span class="sq-station-no">02</span><b>动手练会</b>'
        + '      <p>用标准题检验是否真的会做，练到正确率稳过 70%。</p>'
        + '      <span class="sq-station-state">' + stationState(drillState) + '</span></a>'
        + '    <a class="sq-station-card ' + stationClass(fixState) + '" href="./correction.html">'
        + '      <span class="sq-station-no">03</span><b>归因改对</b>'
        + '      <p>把错因归档并订正，让每一次出错都变成一颗星石。</p>'
        + '      <span class="sq-station-state">' + stationState(fixState) + '</span></a>'
        + '  </div>'
        + '</section>'
        + '<div class="sq-section">'
        + '  <div class="sq-section-head"><h2>知识星系</h2><span>'
        + (access && !access.vip ? '免费版已开放 ' + access.unlockedCount + ' / ' + access.total + ' 颗星球' : '共 ' + kps.length + ' 颗星球 · 点击继续漫游')
        + '</span></div>'
        + accessBanner
        + '  <div class="sq-planets">' + planetCards + '</div>'
        + '</div>'
        + '<div class="sq-bottom">'
        + '  <div class="sq-companion">'
        + '    <span class="sq-companion-avatar"><img src="/assets/images/mascot/xiaowen/idle.webp" data-qw-xiaowen="follow" alt="小问领航员"></span>'
        + '    <div class="sq-companion-body">'
        + '      <b>伴学领航员 · 小问</b>'
        + '      <p data-qw-mode-phrase'
        + '        data-day="早呀，小宇航员！挑一颗星球出发吧，卡住的时候叫我一声，我陪你一步步拆开它。今晚给自己定一个小目标：把一个没弄懂的步骤讲给别人听。"'
        + '        data-night="晚安，小宇航员～睡前适合把今天讲过的步骤在脑子里再走一遍，想不通的地方我陪你慢慢捋，别熬太晚。">早呀，小宇航员！挑一颗星球出发吧。</p>'
        + '      <div class="sq-companion-acts">'
        + '        <a class="sq-chip-btn" href="./agent.html">🎙 呼唤小问答疑</a>'
        + '        <a class="sq-chip-btn" href="./report.html">📊 查看星图报告</a>'
        + '        <a class="sq-chip-btn" href="./classroom.html?kp=' + esc(focusId) + '">🎬 进入讲题课堂</a>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '  <div class="sq-note-card">'
        + '    <h3><span data-qw-day>☀️ 白天专注模式</span><span data-qw-night hidden>🌙 夜航护眼模式</span></h3>'
        + '    <p>7-14 岁启发式数学漫游。建议单次专注 30 分钟，起身活动一下再看星图。</p>'
        + '    <div class="sq-note-row"><span>今日漫游时长</span><b>' + (today.minutes || 0) + ' 分钟</b></div>'
        + '    <div class="sq-note-row"><span>今日主动纠正</span><b>' + (today.corrections || 0) + ' 次</b></div>'
        + '    <div class="sq-note-row"><span>连续点亮星宿</span><b>' + (gam.streakDays || 0) + ' 天</b></div>'
        + '    <div id="qwFocusCard"></div>'
        + '  </div>'
        + '</div>'
        + '<div class="sq-grid-2">'
        + '  <div class="sq-section">'
        + '    <div class="sq-section-head"><h2>最近的学习航迹</h2><span>按时间倒序</span></div>'
        + '    <div class="sq-recent">' + recentHtml + '</div>'
        + '  </div>'
        + '  <div class="sq-side">'
        + '    <div class="sq-side-card">'
        + '      <h3>快捷入口</h3>'
        + '      <div class="sq-quick">'
        + '        <a href="./classroom.html?kp=' + esc(focusId) + '"><span>🎬</span>讲题课堂</a>'
        + '        <a href="./quiz.html?kp=' + esc(focusId) + '"><span>📝</span>标准题训练</a>'
        + '        <a href="./planet.html"><span>🪐</span>答题星球</a>'
        + '        <a href="./checkin.html"><span>📅</span>每日签到</a>'
        + '        <a href="./badge.html"><span>🏅</span>我的徽章</a>'
        + '        <a href="./level.html"><span>📈</span>等级体系</a>'
        + '      </div>'
        + '    </div>'
        + '    <div class="sq-side-card">'
        + '      <h3>今日星图速览</h3>'
        + '      <ul class="sq-side-list">'
        + '        <li><span>完成会话</span><b>' + (today.sessionCount || 0) + ' 次</b></li>'
        + '        <li><span>累计星尘</span><b>' + (gam.points || 0) + ' 分</b></li>'
        + '        <li><span>连续航行</span><b>' + (gam.streakDays || 0) + ' 天</b></li>'
        + '        <li><span>累计讲解</span><b>' + (overall.totalMinutes || 0) + ' 分钟</b></li>'
        + '      </ul>'
        + '    </div>'
        + '    <div class="sq-side-card">'
        + '      <h3>星途小贴士</h3>'
        + '      <p>做题前先圈出题目条件，做完记得回代检查符号——这两个习惯能帮你少丢一半的分。</p>'
        + '    </div>'
        + '  </div>'
        + '</div>';

      if (window.QWSpace) window.QWSpace.sync();
      if (window.QWFocus) window.QWFocus.mount(document.getElementById('qwFocusCard'));

      const tour = window.QWTour;
      const tourBtn = $('#qwHomeTourBtn');
      if (tour && tourBtn) tourBtn.addEventListener('click', () => tour.start(HOME_TOUR_STEPS, { key: 'home', label: '首页使用引导' }));
      if (tour && !tour.seen('home')) {
        setTimeout(() => { if (!tour.isOpen()) tour.autoStart('home', HOME_TOUR_STEPS, { label: '首页使用引导' }); }, 1200);
      }
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }
  // ---------------------------------------------------------------------------
  // 答题星球
  // ---------------------------------------------------------------------------

  // 星球插画：把手写的 △ / ∠ / √ 升级成会发光的小几何图
  const PLANET_ORB_ART_FALLBACK = {
    kp1: '<svg class="qw-planet-art" viewBox="0 0 100 100" aria-hidden="true">'
      + '<path class="pl-line" d="M16 90V12M16 90h72"/>'
      + '<path class="pl-soft" d="M16 90L88 22"/>'
      + '<path class="pl-line" d="M16 90L80 30"/>'
      + '<circle class="pl-dot" cx="80" cy="30" r="5.2"/>'
      + '<circle class="pl-dot" cx="16" cy="90" r="3.4"/>'
      + '</svg>',
    kp2: '<svg class="qw-planet-art" viewBox="0 0 100 100" aria-hidden="true">'
      + '<path class="pl-line" d="M50 12L90 84H10Z"/>'
      + '<path class="pl-soft" d="M36 44a17 17 0 0 0 28 0"/>'
      + '<path class="pl-soft" d="M22 68a13 13 0 0 0 13 12"/>'
      + '<path class="pl-soft" d="M78 68a13 13 0 0 1-13 12"/>'
      + '<circle class="pl-dot" cx="50" cy="12" r="4.4"/>'
      + '<circle class="pl-dot" cx="10" cy="84" r="4.4"/>'
      + '<circle class="pl-dot" cx="90" cy="84" r="4.4"/>'
      + '</svg>',
    kp3: '<svg class="qw-planet-art" viewBox="0 0 100 100" aria-hidden="true">'
      + '<path class="pl-line" d="M20 82L20 24L86 82Z"/>'
      + '<path class="pl-soft" d="M20 68h14v14"/>'
      + '<path class="pl-soft" d="M32 30L88 30L88 76"/>'
      + '<circle class="pl-dot" cx="20" cy="24" r="4.4"/>'
      + '<circle class="pl-dot" cx="86" cy="82" r="4.4"/>'
      + '</svg>'
  };

  // ---------------------------------------------------------------------------
  const PLANET_ORB_ART = (ART && ART.ORB_ART) || PLANET_ORB_ART_FALLBACK;

  async function renderPlanet() {
    const root = $('#planetApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty text-white/60">正在登录数学星球…</div>';
    try {
      const [data, statsRes] = await Promise.all([
        loadDashboard(),
        api('/api/quiz/stats').catch(() => ({ data: {} }))
      ]);
      const stats = statsRes.data || {};
      const planets = data.knowledgePoints || [];
      const access = data.access || null;
      const palette = [
        ['#43C7B8', '#1E8C88', '#0E5F5C'],
        ['#FFB84D', '#F5A623', '#B36F0C'],
        ['#8CAAD4', '#6C8EBF', '#3C5580']
      ];

      // 每颗星球就是一个星系：前面的（序号小的）在前排、更亮更大，
      // 后面的逐层退到背景里；免费版没解锁的盖一层锁
      const galaxies = planets.map((kp, index) => {
        const color = palette[index % palette.length];
        const meta = STATUS_META[kp.status] || STATUS_META['未开始'];
        const vipLocked = kp.locked === true;
        const href = vipLocked ? './vip.html' : './quiz.html?kp=' + esc(kp.id);
        const cta = vipLocked
          ? '🔒 开通领航员解锁'
          : (kp.status === '已掌握' ? '♻️ 再练一遍' : '🚀 进入星系复习');
        return '<a class="qwp-galaxy' + (vipLocked ? ' is-locked' : '') + '"'
          + ' href="' + href + '"'
          + ' style="--c1:' + color[0] + ';--c2:' + color[1] + ';--c3:' + color[2]
          + ';--depth:' + index + ';--delay:' + (index * 0.6) + 's">'
          + '  <span class="qwp-index">0' + (index + 1) + '</span>'
          + '  <div class="qwp-orb">'
          + '    <span class="qwp-halo" aria-hidden="true"></span>'
          + '    <div class="qwp-glow"></div>'
          + '    <div class="qwp-body' + (ORB_HAS_ART ? ' has-art' : '') + '">'
          + (PLANET_ORB_ART[kp.id] || ('<span>' + esc(kp.icon) + '</span>')) + '</div>'
          + (ORB_HAS_ART ? '' : '    <div class="qwp-ring"></div>')
          + '  </div>'
          + '  <div class="qwp-galaxy-main">'
          + '    <h3>' + esc(kp.name) + '</h3>'
          + '    <p>' + esc(kp.description) + '</p>'
          + '    <div class="qw-progress qw-progress-dark"><span style="width:' + (kp.progress || 0) + '%"></span></div>'
          + '    <div class="qw-planet-meta"><span class="qw-planet-badge qw-planet-' + meta.cls + '">' + meta.label + '</span>'
          + '    <span>' + (kp.progress || 0) + '% · 讲题 ' + (kp.currentStep || 0) + '/' + (kp.totalSteps || 5) + '</span></div>'
          + '  </div>'
          + '  <span class="qwp-cta">' + cta + '</span>'
          + (vipLocked ? '<span class="qwp-lock" aria-hidden="true">🔒</span>' : '')
          + '</a>';
      }).join('');

      const accessNote = (access && !access.vip)
        ? '<div class="qwp-note"><span>🔒</span><div><b>' + esc(access.label) + '</b>'
          + '<p>' + esc(access.upgradeText) + '</p></div>'
          + '<a href="./vip.html">👑 开通领航员</a></div>'
        : (access ? '<div class="qwp-note is-vip"><span>👑</span><div><b>' + esc(access.label) + '</b>'
          + '<p>全部知识星系的讲题、练题、改错都已解锁，去挑一个星系开练吧。</p></div></div>' : '');

      root.innerHTML = ''
        + '<div class="qwp-sky" aria-hidden="true">'
        + '  <i class="qwp-nebula n1"></i><i class="qwp-nebula n2"></i><i class="qwp-nebula n3"></i>'
        + GALAXY_DECOS.map(function (art) { return '<i class="qwp-galaxy-holder">' + art + '</i>'; }).join('')
        + '  <i class="qwp-orbit o1"></i><i class="qwp-orbit o2"></i>'
        + '  <i class="qwp-stars"></i>'
        + '</div>'
        + '<div class="qw-planet-head">'
        + '  <span class="qw-planet-tag">🚀 复习星系</span>'
        + '  <h1>选择一颗星球，开始复习</h1>'
        + '  <p>星球上的题目只标注对错并给出提示，不会直接给解析，凭真本事拿下它。</p>'
        + '</div>'
        + accessNote
        + '<div class="qwp-map"><div class="qwp-track" aria-hidden="true"></div>' + galaxies + '</div>'
        + '<div class="qw-planet-stats">'
        + '  <div><b>' + (stats.totalAnswered || 0) + '</b><span>累计答题</span></div>'
        + '  <div><b>' + (stats.correctRate || 0) + '%</b><span>正确率</span></div>'
        + '  <div><b>' + (stats.bestStreak || 0) + '</b><span>连续学习天数</span></div>'
        + '  <a class="qwp-stats-level" href="./level.html" title="查看等级体系与经验获取方式">'
        + '    <b>Lv.' + (stats.level || 1) + '</b><span>' + esc(stats.levelName || '见习学员') + '</span>'
        + '    <i>查看等级 →</i></a>'
        + '</div>';
    } catch (err) {
      root.innerHTML = '<p class="qw-empty text-white/60">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }
  // ---------------------------------------------------------------------------
  // 标准题训练
  // ---------------------------------------------------------------------------
  const KP_NAMES = { kp1: '一次函数', kp2: '三角形内角和', kp3: '勾股定理' };

  async function renderQuiz() {
    const root = $('#quizApp');
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const kpId = params.get('kp') || 'kp1';
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在加载题目…</div>';

    try {
      const questions = (await api('/api/quiz/questions?knowledgePointId=' + kpId)).data || [];
      if (!questions.length) {
        root.innerHTML = '<p class="qw-empty">这个知识点暂时没有练习题。</p>';
        return;
      }

      let index = 0;
      let selected = null;
      let attempts = 0;
      let score = 0;
      let nextAction = null;
      let hintUsed = false;

      function renderQuestion() {
        const q = questions[index];
        selected = null;
        attempts = 0;
        hintUsed = false;
        nextAction = null;

        const options = (q.options || []).map((text, i) =>
          '<button type="button" class="qw-option" data-answer="' + i + '">'
          + '<span class="qw-option-key">' + String.fromCharCode(65 + i) + '</span>'
          + '<span class="qw-option-text">' + esc(text) + '</span></button>').join('');

        root.innerHTML = ''
          + '<div class="qw-quiz-head">'
          + '  <a href="./classroom.html?kp=' + esc(kpId) + '" class="qw-back-link"><i data-lucide="arrow-left" class="w-4 h-4"></i><span>回到讲题</span></a>'
          + '  <div class="qw-quiz-tags">'
          + '    <span class="qw-pill qw-pill-primary">' + esc(KP_NAMES[kpId] || '知识点') + '</span>'
          + '    <span class="qw-pill qw-pill-accent">第 ' + (index + 1) + ' / ' + questions.length + ' 题</span>'
          + '  </div>'
          + '  <span class="qw-quiz-score">已答对 <b>' + score + '</b> 题</span>'
          + '</div>'
          + '<div class="qw-progress qw-quiz-progress"><span style="width:' + Math.round((index / questions.length) * 100) + '%"></span></div>'
          + '<div class="qw-quiz-grid">'
          + '  <div class="qw-card qw-quiz-question">'
          + '    <span class="qw-quiz-label">题目</span>'
          + '    <h2>' + esc(q.question) + '</h2>'
          + '    <div class="qw-quiz-tips"><span>💡 卡住了可以点“提示一下”，但不会告诉你答案</span></div>'
          + '  </div>'
          + '  <div class="qw-card qw-quiz-answer">'
          + '    <p class="qw-quiz-label">选择你的答案</p>'
          + '    <div class="qw-options">' + options + '</div>'
          + '    <div class="qw-feedback" id="quizFeedback"></div>'
          + '    <div class="qw-chat-buttons">'
          + '      <button type="button" class="qw-btn-ghost" id="quizHint">💡 提示一下</button>'
          + '      <button type="button" class="qw-btn-primary" id="quizSubmit">提交答案</button>'
          + '    </div>'
          + '  </div>'
          + '</div>';
        if (window.lucide) window.lucide.createIcons();

        $$('#quizApp .qw-option').forEach(btn => {
          btn.addEventListener('click', () => {
            $$('#quizApp .qw-option').forEach(item => item.classList.remove('selected'));
            btn.classList.add('selected');
            selected = Number(btn.dataset.answer);
          });
        });

        $('#quizHint').addEventListener('click', () => {
          hintUsed = true;
          $('#quizFeedback').innerHTML = '<div class="qw-hint-note">💡 ' + esc(q.hint || '再读一遍题目，找找关键条件。') + '</div>';
        });

        $('#quizSubmit').addEventListener('click', async () => {
          if (nextAction) { nextAction(); return; }
          if (selected == null) { toast('先选一个答案吧'); return; }

          const btn = $('#quizSubmit');
          btn.disabled = true;
          btn.textContent = '判断中…';
          try {
            const result = (await api('/api/quiz/submit', {
              method: 'POST',
              body: { questionId: q.id, answer: selected }
            })).data;

            if (result.isCorrect) {
              score += 1;
              $$('#quizApp .qw-option').forEach(item => { item.disabled = true; });
              $('#quizFeedback').innerHTML = '<div class="qw-feedback-item ok"><span class="qw-feedback-icon">✅</span><div>'
                + esc(result.message) + (hintUsed ? '（这题用了提示，也算过关）' : '') + '</div></div>';
              if (ART && typeof ART.burst === 'function') {
                const feedback = $('#quizFeedback');
                feedback.classList.add('qw-dust-host');
                ART.burst(feedback, { texts: ['+10', '★', '答对啦', '✦', '+10', '★'], color: '#FFE16E' });
              }
              const isLast = index >= questions.length - 1;
              btn.textContent = isLast ? '查看本次结果' : '下一题 →';
              btn.disabled = false;
              nextAction = () => {
                if (isLast) {
                  window.location.href = './result.html?score=' + score + '&total=' + questions.length + '&kp=' + kpId;
                } else {
                  index += 1;
                  renderQuestion();
                }
              };
            } else {
              attempts += 1;
              $('#quizFeedback').innerHTML = '<div class="qw-feedback-item no"><span class="qw-feedback-icon">🤔</span><div>'
                + '再想想，先不急着看答案。' + (attempts >= 2 ? '建议点“提示一下”，按提示一步步推。' : '') + '</div></div>';
              $$('#quizApp .qw-options').forEach(box => {
                box.classList.add('shake');
                setTimeout(() => box.classList.remove('shake'), 460);
              });
              btn.textContent = '再试一次';
              btn.disabled = false;
              selected = null;
              $$('#quizApp .qw-option').forEach(item => item.classList.remove('selected'));
            }
          } catch (err) {
            toast(err.message);
            btn.disabled = false;
            btn.textContent = '提交答案';
          }
        });
      }

      renderQuestion();
    } catch (err) {
      // 免费版点进锁住的星球：后端返回 403 KP_LOCKED，这里换成「解锁引导」而不是裸报错
      if (err && err.status === 403 && err.data && err.data.code === 'KP_LOCKED') {
        const kpName = (KP_NAMES[kpId] || '这颗星球');
        root.innerHTML = ''
          + '<section class="qw-locked-panel">'
          + '  <span class="qw-locked-ic" aria-hidden="true">🔒</span>'
          + '  <h2>' + esc(kpName) + ' 还没解锁</h2>'
          + '  <p>' + esc(err.data.error || '') + '</p>'
          + '  <ul class="qw-locked-list">'
          + '    <li>免费版开放 <b>一次函数</b> 星球：五步讲题 + 标准题训练都能练</li>'
          + '    <li>开通领航员：内角和、勾股定理等全部星系一起解锁</li>'
          + '    <li>还能用领航员特权拿到完整学情看板与五维能力雷达</li>'
          + '  </ul>'
          + '  <div class="qw-locked-acts">'
          + '    <a class="qw-btn-primary" href="./vip.html">👑 去开通领航员</a>'
          + '    <a class="qw-btn-ghost" href="./quiz.html?kp=kp1">📝 先练一次函数</a>'
          + '  </div>'
          + '</section>';
        return;
      }
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 签到积分
  // ---------------------------------------------------------------------------
  async function renderCheckin() {
    const root = $('#checkinApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在加载签到数据…</div>';
    try {
      const [statusRes, abilityRes, vipRes, levelsRes] = await Promise.all([
        api('/api/gamification/status'),
        api('/api/student/ability').catch(() => null),
        api('/api/vip/status').catch(() => null),
        api('/api/gamification/levels').catch(() => null)
      ]);
      const membership = vipRes && vipRes.data ? vipRes.data.membership : null;
      const data = statusRes.data;
      const ability = abilityRes && abilityRes.data ? abilityRes.data : null;
      const expRules = levelsRes && levelsRes.data ? (levelsRes.data.expRules || []) : [];
      const history = data.checkinHistory || [];
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const checkedSet = new Set(history.map(item => item.date));
      const checkedToday = checkedSet.has(todayKey);

      let cells = '';
      for (let i = 0; i < firstDay; i++) cells += '<div class="qw-day empty"></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const cls = 'qw-day' + (checkedSet.has(key) ? ' checked' : '') + (key === todayKey ? ' today' : '');
        cells += '<div class="' + cls + '"><b>' + day + '</b>' + (checkedSet.has(key) ? '<i>✓</i>' : '') + '</div>';
      }

      const weekDot = (offset) => {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        return '<div class="qw-week-day' + (checkedSet.has(key) ? ' checked' : '') + '">'
          + '<span>' + ['日', '一', '二', '三', '四', '五', '六'][date.getDay()] + '</span>'
          + '<b>' + date.getDate() + '</b></div>';
      };
      let weekHtml = '';
      for (let i = 6; i >= 0; i--) weekHtml += weekDot(i);

      root.innerHTML = ''
        + '<div class="qw-section-head"><h2>签到积分</h2><span>' + year + ' 年 ' + (month + 1) + ' 月</span></div>'
        + '<section class="qw-hero qw-checkin-hero">'
        + '  <div class="qw-checkin-main">'
        + '    <span class="qw-hero-chip">🔥 已连续签到 ' + data.streakDays + ' 天</span>'
        + '    <h2>' + (checkedToday ? '今天已经签到啦，明天见 👋' : '今天还没签到哦') + '</h2>'
        + '    <p>每天签到得 2 积分，连续 7 天额外奖励 10 积分。</p>'
        + '    <button type="button" class="qw-btn-light" id="qwCheckinBtn"' + (checkedToday ? ' disabled' : '') + '>'
        + (checkedToday ? '今日已签到 ✓' : '立即签到 +2 积分') + '</button>'
        + '  </div>'
        + renderRing(Math.min((data.streakDays / 7) * 100, 100), data.streakDays + ' 天', '连续签到')
        + '</section>'
        + '<div class="qw-checkin-grid">'
        + '  <div class="qw-card qw-calendar-card">'
        + '    <div class="qw-calendar-head"><h3>' + (month + 1) + ' 月签到日历</h3><span>共签到 ' + history.length + ' 天</span></div>'
        + '    <div class="qw-weekdays">' + ['日', '一', '二', '三', '四', '五', '六'].map(d => '<span>' + d + '</span>').join('') + '</div>'
        + '    <div class="qw-calendar">' + cells + '</div>'
        + '  </div>'
        + '  <div class="qw-card qw-side-card">'
        + '    <h3>最近 7 天</h3>'
        + '    <div class="qw-week-row">' + weekHtml + '</div>'
        + '    <h3 class="qw-side-sub">积分账户</h3>'
        + '    <ul class="qw-side-list">'
        + '      <li><span>当前积分</span><b>' + data.points + '</b></li>'
        + '      <li><span>累计签到</span><b>' + data.totalCheckins + ' 次</b></li>'
        + '      <li><span>连续签到</span><b>' + data.streakDays + ' 天</b></li>'
        + '    </ul>'
        + '  </div>'
        + '</div>';

      const btn = $('#qwCheckinBtn');
      if (btn && !checkedToday) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '签到中…';
          try {
            const res = (await api('/api/gamification/checkin', { method: 'POST', body: {} })).data;
            toast('签到成功，+' + res.points + ' 积分');
            renderCheckin();
          } catch (err) {
            toast(err.message);
            btn.disabled = false;
            btn.textContent = '立即签到 +2 积分';
          }
        });
      }
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 徽章挑战
  // ---------------------------------------------------------------------------
  async function renderBadges() {
    const root = $('#badgeApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在加载徽章…</div>';
    try {
      const [statusRes, abilityRes, vipRes, levelsRes] = await Promise.all([
        api('/api/gamification/status'),
        api('/api/student/ability').catch(() => null),
        api('/api/vip/status').catch(() => null),
        api('/api/gamification/levels').catch(() => null)
      ]);
      const membership = vipRes && vipRes.data ? vipRes.data.membership : null;
      const data = statusRes.data;
      const ability = abilityRes && abilityRes.data ? abilityRes.data : null;
      const expRules = levelsRes && levelsRes.data ? (levelsRes.data.expRules || []) : [];
      const badges = data.badges || [];
      const unlocked = badges.filter(item => item.unlockedAt).length;

      const cards = badges.map((item, badgeIndex) => {
        const got = !!item.unlockedAt;
        const tier = BADGE_TIERS[badgeIndex % BADGE_TIERS.length];
        const art = emblemHtml({
          shape: tier.shape, color: tier.color, stars: tier.stars,
          symbol: item.icon, size: 82, label: item.name
        }, item.icon);
        return '<div class="qw-badge ' + (got ? 'unlocked' : 'locked') + '">'
          + '  <span class="qw-badge-icon' + (HAS_EMBLEM ? ' has-emblem' : '') + '">' + art + '</span>'
          + '  <h3>' + esc(item.name) + '</h3>'
          + '  <p>' + esc(item.description) + '</p>'
          + '  <span class="qw-badge-date">' + (got ? esc(item.unlockedAt) + ' 获得' : '🔒 尚未解锁') + '</span>'
          + '</div>';
      }).join('');

      root.innerHTML = ''
        + '<div class="qw-section-head"><h2>徽章挑战</h2><span>已获得 ' + unlocked + ' / ' + badges.length + ' 枚</span></div>'
        + '<section class="qw-hero qw-badge-hero">'
        + '  <div>'
        + '    <span class="qw-hero-chip">🏅 徽章收集进度</span>'
        + '    <h2>你已经点亮 ' + unlocked + ' 枚徽章</h2>'
        + '    <p>继续完成讲题步骤和标准题训练，就能解锁剩下的徽章。</p>'
        + '    <div class="qw-progress qw-progress-light"><span style="width:' + Math.round((unlocked / badges.length) * 100) + '%"></span></div>'
        + '  </div>'
        + renderRing(Math.round((unlocked / badges.length) * 100), unlocked + '/' + badges.length, '已解锁')
        + '</section>'
        + '<div class="qw-badge-grid">' + cards + '</div>';
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 等级体系
  // ---------------------------------------------------------------------------
  const LEVELS = [
    { level: 1, name: '见习学员', icon: '🌱', required: 0, desc: '踏出数学学习的第一步，完成首次知识点学习' },
    { level: 2, name: '数学新星', icon: '✨', required: 50, desc: '展现了持续学习的毅力，对基础概念有了初步理解' },
    { level: 3, name: '解题能手', icon: '🧮', required: 120, desc: '在数学的道路上稳步前进，展现出不错的能力' },
    { level: 4, name: '思维达人', icon: '🧠', required: 220, desc: '融会贯通，能够灵活运用知识解决变式问题' },
    { level: 5, name: '错题终结者', icon: '🏆', required: 320, desc: '最高荣耀！所有知识点全部掌握，错题近乎为零' }
  ];

  // 预设头像：一键选用，不用自己打字
  const AVATAR_PRESETS = ['🧑‍🎓', '🐱', '🐼', '🦊', '🐧', '🐨', '🐯', '🦁', '🐳', '🦄', '🚀', '🪐', '⭐', '🌟', '🍀', '🎯'];

  function avatarPickerHtml() {
    const presets = AVATAR_PRESETS.map(item =>
      '<button type="button" class="qw-avatar-preset" data-avatar="' + esc(item) + '" aria-label="选用头像 ' + esc(item) + '">' + esc(item) + '</button>').join('');
    return ''
      + '<section class="qw-card qw-avatar-picker" id="qwAvatarPicker" hidden>'
      + '  <div class="qw-avatar-picker-head">'
      + '    <h3>换个头像吧</h3>'
      + '    <button type="button" class="qw-avatar-close" id="qwAvatarClose" aria-label="收起头像选择器">✕</button>'
      + '  </div>'
      + '  <p class="qw-avatar-tip">挑一个喜欢的，也可以在下面自己输入一个表情或文字，甚至粘贴一张图片的链接。</p>'
      + '  <div class="qw-avatar-presets">' + presets + '</div>'
      + '  <div class="qw-avatar-custom">'
      + '    <input type="text" id="qwAvatarInput" maxlength="120" autocomplete="off" placeholder="自己输入：😎 或者「星际探险家」">'
      + '    <button type="button" class="qw-btn-primary" id="qwAvatarSave">保存头像</button>'
      + '  </div>'
      + '  <p class="qw-avatar-preview">当前预览：<span class="qw-avatar-preview-slot" id="qwAvatarPreview">🧑‍🎓</span></p>'
      + '</section>';
  }

  function bindAvatarPicker() {
    const user = (AUTH && AUTH.getUser()) || {};
    const avatarBtn = $('#qwAvatarBtn');
    const picker = $('#qwAvatarPicker');
    const avatarInput = $('#qwAvatarInput');
    const preview = $('#qwAvatarPreview');
    const isImage = value => !!(AUTH && typeof AUTH.isImageAvatar === 'function' && AUTH.isImageAvatar(value));

    function paint(value) {
      if (!preview) return;
      if (AUTH && typeof AUTH.fillAvatar === 'function') AUTH.fillAvatar(preview, value || '🧑‍🎓', '🧑‍🎓');
      else preview.textContent = value || '🧑‍🎓';
    }

    if (avatarBtn && picker) {
      avatarBtn.addEventListener('click', () => {
        picker.hidden = !picker.hidden;
        if (picker.hidden) return;
        const current = (AUTH.getUser() || {}).avatar || '';
        if (avatarInput) avatarInput.value = isImage(current) ? current : '';
        paint(current || '🧑‍🎓');
        picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    const closeBtn = $('#qwAvatarClose');
    if (closeBtn && picker) closeBtn.addEventListener('click', () => { picker.hidden = true; });

    if (picker) {
      picker.addEventListener('click', event => {
        const preset = event.target.closest ? event.target.closest('[data-avatar]') : null;
        if (!preset) return;
        if (avatarInput) avatarInput.value = preset.getAttribute('data-avatar');
        paint(preset.getAttribute('data-avatar'));
      });
    }

    if (avatarInput) avatarInput.addEventListener('input', () => paint(avatarInput.value.trim() || '🧑‍🎓'));

    const saveBtn = $('#qwAvatarSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const value = avatarInput ? avatarInput.value.trim() : '';
        if (!value) { toast('先挑一个头像，或者自己输入一个吧'); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中…';
        try {
          const next = await AUTH.updateProfile({ avatar: value });
          const saved = (next && next.avatar) || value;
          renderLevel();
          toast(isImage(saved) ? '头像换好啦，图片已保存' : '头像换好啦 ' + saved);
        } catch (err) {
          toast(err.message);
          saveBtn.disabled = false;
          saveBtn.textContent = '保存头像';
        }
      });
    }
  }

  // 会员领航舱入口：未开通时是推广卡，开通后是「领航员特权生效中」的权益卡
  function vipEntryHtml(membership) {
    const m = membership || {};
    const active = !!m.active;
    const endLabel = m.endAtLabel || (m.endAt ? formatDate(m.endAt) : '');
    if (active) {
      return ''
        + '<section class="qw-vip-entry is-active">'
        + '  <span class="qw-vip-entry-crown">👑</span>'
        + '  <div class="qw-vip-entry-main">'
        + '    <b>' + esc(m.planName || '会员领航舱') + '</b>'
        + '    <p>领航员特权生效中 · 有效期至 ' + esc(endLabel) + '</p>'
        + '  </div>'
        + '  <a class="qw-vip-entry-btn" href="./vip.html">查看 / 续费权益 →</a>'
        + '</section>';
    }
    return ''
      + '<section class="qw-vip-entry">'
      + '  <span class="qw-vip-entry-crown">🚀</span>'
      + '  <div class="qw-vip-entry-main">'
      + '    <b>开通会员领航舱</b>'
      + '    <p>解锁全部知识星球、无限变式题库与错因推演，小问全程陪你到改对为止。</p>'
      + '  </div>'
      + '  <a class="qw-vip-entry-btn" href="./vip.html">立即开通 →</a>'
      + '</section>';
  }
  async function renderLevel() {
    const root = $('#levelApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在加载等级数据…</div>';
    try {
      const [statusRes, abilityRes, vipRes, levelsRes] = await Promise.all([
        api('/api/gamification/status'),
        api('/api/student/ability').catch(() => null),
        api('/api/vip/status').catch(() => null),
        api('/api/gamification/levels').catch(() => null)
      ]);
      const membership = vipRes && vipRes.data ? vipRes.data.membership : null;
      const data = statusRes.data;
      const ability = abilityRes && abilityRes.data ? abilityRes.data : null;
      const expRules = levelsRes && levelsRes.data ? (levelsRes.data.expRules || []) : [];
      const level = data.level || { current: 1, name: '见习学员', progress: 0, required: 50 };
      const percent = Math.round(((level.progress || 0) / (level.required || 1)) * 100);

      const ladder = levelsRes && levelsRes.data ? levelsRes.data.levels : LEVELS;
      const timeline = ladder.map((item, index) => {
        const isCurrent = item.level === level.current;
        const isDone = item.level < level.current;
        const cls = isCurrent ? 'current' : isDone ? 'done' : 'locked';
        const nextItem = ladder[index + 1];
        const span = nextItem ? (nextItem.required - item.required) + ' 经验' : '满级';
        const crest = emblemHtml({
          shape: LEVEL_EMBLEM_SHAPE[Math.min(item.level - 1, LEVEL_EMBLEM_SHAPE.length - 1)] || 'hex',
          level: item.level, symbol: item.icon, stars: Math.min(item.level, 5),
          size: 58, label: item.name
        }, item.icon);
        return '<div class="qw-level ' + cls + '" style="--lvl:' + item.level + '">'
          + '  <span class="qw-level-badge' + (HAS_EMBLEM ? ' has-emblem' : '') + '">' + crest + '</span>'
          + '  <div class="qw-level-main">'
          + '    <div class="qw-level-head"><h3>Lv.' + item.level + ' ' + esc(item.name) + '</h3>'
          + '      <span class="qw-status qw-status-' + (isCurrent ? 'doing' : isDone ? 'ok' : 'idle') + '">'
          + (isCurrent ? '当前等级' : isDone ? '已完成' : '未解锁') + '</span></div>'
          + '    <p>' + esc(item.desc) + '</p>'
          + '    <div class="qw-level-req"><span class="qw-level-need">需要 ' + item.required + ' 经验</span>'
          + '    <span class="qw-level-span">本级区间 ' + span + '</span></div>'
          + '  </div>'
          + '</div>';
      }).join('');

      const expCard = expRules.length
        ? '<section class="qw-card qw-exp-card">'
          + '  <div class="qw-exp-head"><h3>⭐ 经验怎么来</h3><p>经验只涨在「真学真练」上，刷分不算数。</p></div>'
          + '  <div class="qw-exp-grid">' + expRules.map(rule =>
            '<div class="qw-exp-item">'
            + '<span class="qw-exp-ic">' + esc(rule.icon) + '</span>'
            + '<div><b>' + esc(rule.action) + '</b><p>' + esc(rule.note) + '</p></div>'
            + '<span class="qw-exp-val">' + (rule.exp ? '+' + rule.exp + ' 经验' : '—')
            + '<i>' + esc(rule.reward) + '</i></span>'
            + '</div>').join('') + '</div>'
          + '</section>'
        : '';

      const user = AUTH.getUser() || {};
      const meta = [user.grade, user.className, user.school].filter(Boolean).join(' · ');

      root.innerHTML = ''
        + '<section class="qw-account-card">'
        + '  <button type="button" class="qw-account-avatar" id="qwAvatarBtn" title="点击更换头像" aria-label="更换头像">'
        +      (AUTH && typeof AUTH.avatarHtml === 'function' ? AUTH.avatarHtml(user.avatar, '🧑‍🎓') : esc(user.avatar || '🧑‍🎓'))
        + '    <i class="qw-avatar-edit" aria-hidden="true">✎</i>'
        + '  </button>'
        + '  <div class="qw-account-main">'
        + '    <b>' + esc(user.nickname || user.name || '同学') + '</b>'
        + '    <p>' + esc(meta || '问数学生账号') + '</p>'
        + '  </div>'
        + '  <div class="qw-account-actions">'
        + '    <a class="qw-btn-ghost" href="./agent.html">🤖 问数智能体</a>'
        + '    <button type="button" class="qw-btn-ghost" id="qwLogoutBtn">退出登录</button>'
        + '  </div>'
        + '</section>'
        + avatarPickerHtml()
        + vipEntryHtml(membership)
        + '<div class="qw-section-head"><h2>等级体系</h2><span>当前 ' + level.exp + ' 经验</span></div>'
        + '<section class="qw-hero qw-level-hero">'
        + '  <div>'
        + '    <span class="qw-hero-chip">' + esc(level.icon || '🌱') + ' Lv.' + level.current + ' ' + esc(level.name) + '</span>'
        + '    <h2>' + (level.nextLevel ? '再积累 ' + Math.max((level.required || 0) - (level.progress || 0), 0) + ' 经验，升级为 ' + esc(level.nextLevel) : '你已经是最高等级啦！') + '</h2>'
        + '    <p>完成一次讲题课堂 +20 经验，答对一道标准题 +10 经验。</p>'
        + '    <div class="qw-progress qw-progress-light"><span style="width:' + percent + '%"></span></div>'
        + '    <span class="qw-level-exp">' + (level.progress || 0) + ' / ' + (level.required || 0) + ' 经验</span>'
        + '  </div>'
        + renderRing(percent, 'Lv.' + level.current, esc(level.name))
        + '</section>'
        + expCard
        + abilityCard(ability)
        + '<div class="qw-section-head"><h2>等级阶梯</h2><span>共 ' + ladder.length + ' 级 · 每级都有专属图标</span></div>'
        + '<div class="qw-level-list">' + timeline + '</div>';

      const logoutBtn = $('#qwLogoutBtn');
      if (logoutBtn) logoutBtn.addEventListener('click', () => AUTH.logout());
      bindAvatarPicker();
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
      toast(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 学习结果
  // ---------------------------------------------------------------------------
  function renderResult() {
    const root = $('#resultApp');
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const score = Number(params.get('score') || 0);
    const total = Number(params.get('total') || 0);
    const kpId = params.get('kp') || 'kp1';
    const percent = total ? Math.round((score / total) * 100) : 0;
    const wrong = Math.max(total - score, 0);
    const message = percent === 100 ? '满分通关！这个知识点你已经拿下了。'
      : percent >= 80 ? '掌握得不错，把错的那道题再想一想就完美了。'
      : percent >= 60 ? '基本思路有了，建议回到讲题课堂把卡住的步骤再过一遍。'
      : '别灰心，错题正是成长的机会，我们一起回到黑板前再看看。';
    const medal = RESULT_MEDALS.filter(item => percent >= item.min)[0] || RESULT_MEDALS[RESULT_MEDALS.length - 1];
    const medalArt = emblemHtml({
      shape: medal.shape, color: medal.color, symbol: medal.symbol,
      stars: medal.stars, size: 92, label: medal.name
    }, medal.symbol);

    root.innerHTML = ''
      + '<div class="qw-section-head"><h2>本次练习结果</h2><span>' + esc(KP_NAMES[kpId] || '知识点') + '</span></div>'
      + '<section class="qw-hero qw-result-hero">'
      + '  <div>'
      + '    <span class="qw-hero-chip">' + (percent >= 80 ? '🎉' : '💪') + ' ' + (percent >= 80 ? '表现优秀' : '继续加油') + '</span>'
      + '    <h2>' + score + ' / ' + total + ' 题答对</h2>'
      + '    <p>' + esc(message) + '</p>'
      + '    <div class="qw-result-tags">'
      + '      <span>正确率 ' + percent + '%</span>'
      + '      <span>错题 ' + wrong + ' 道</span>'
      + '    </div>'
      + '  </div>'
      + renderRing(percent, percent + '%', '正确率')
      + '</section>'
      + '<section class="qw-card qw-result-medal">'
      + '  <div class="qw-result-medal-art">' + medalArt + '</div>'
      + '  <div class="qw-result-medal-main">'
      + '    <span class="qw-result-medal-chip">★ 本次获得</span>'
      + '    <h3>' + esc(medal.name) + '</h3>'
      + '    <p>' + esc(medal.note) + '</p>'
      + '    <span class="qw-result-medal-stars">' + '★'.repeat(medal.stars) + '<i>' + '★'.repeat(5 - medal.stars) + '</i></span>'
      + '  </div>'
      + '</section>'
      + '<div class="qw-result-grid">'
      + '  <div class="qw-card qw-side-card">'
      + '    <h3>接下来可以做什么</h3>'
      + '    <div class="qw-quick qw-quick-col">'
      + '      <a href="./quiz.html?kp=' + esc(kpId) + '"><span>🔁</span>再练一组标准题</a>'
      + '      <a href="./classroom.html?kp=' + esc(kpId) + '"><span>🎬</span>回到讲题课堂</a>'
      + '      <a href="./planet.html"><span>🪐</span>换一颗星球复习</a>'
      + '      <a href="./home.html"><span>🏠</span>返回学习首页</a>'
      + '    </div>'
      + '  </div>'
      + '  <div class="qw-card qw-side-card">'
      + '    <h3>' + (wrong ? '错题提醒' : '学习建议') + '</h3>'
      + '    <p class="qw-side-tip">' + (wrong
            ? '这次有 ' + wrong + ' 道题没有一次做对，系统已经把对应的错因记录到「学习报告 · 掌握概览」里。回到讲题课堂，把出错的那一步重新讲一遍，效果比直接看答案好得多。'
            : '这个知识点的讲题步骤你都走通了，可以尝试下勾股定理的逆定理应用，那是这一章最容易被扣分的地方。')
      + '    </p>'
      + '  </div>'
      + '</div>';

    // 通关庆祝：整页粒子比只撒一次更有仪式感
    const hero = $('.qw-result-hero', root);
    if (hero && ART && typeof ART.celebrate === 'function') {
      hero.classList.add('qw-dust-host');
      ART.celebrate(hero, {
        times: percent >= 80 ? 2 : 1,
        texts: percent === 100 ? ['🎉', '★', '+20', '✦', '★', '🎉'] : ['★', '+10', '✦', '★', '+10', '✦']
      });
    }
  }

  function boot() {
    if ($('#homeApp')) renderHome();
    else if ($('#planetApp')) renderPlanet();
    else if ($('#quizApp')) renderQuiz();
    else if ($('#checkinApp')) renderCheckin();
    else if ($('#badgeApp')) renderBadges();
    else if ($('#levelApp')) renderLevel();
    else if ($('#resultApp')) renderResult();
  }

  window.QW = { api: api, esc: esc, toast: toast, formatDate: formatDate };
  document.addEventListener('DOMContentLoaded', boot);
})();
