/**
 * 问数 Web 平台 - 错题订正（归因改对）
 * 把学习记录里的错因整理成一本紧凑的「错题本」，并画出错因雷达图。
 * 数据源：GET /api/learning/error-book
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日';
  }

  // 错因配色与图标：顺序固定，保证雷达图 / 图例 / 错题本三处颜色一致
  const CAUSE_COLORS = ['#FF7A59', '#F5A623', '#7C6CF5', '#2BA4A0', '#4C7DF0', '#EE5A6F', '#34C759'];
  const CAUSE_ICONS = {
    '概念不清': '📘', '条件识别': '🔍', '公式错误': '🧮', '符号混淆': '➕',
    '计算失误': '✏️', '不会迁移': '🧠', '无法识别': '🧭'
  };

  function colorOf(index) { return CAUSE_COLORS[index % CAUSE_COLORS.length]; }
  function iconOf(name) { return CAUSE_ICONS[name] || '⚠️'; }

  // ---------------------------------------------------------------------------
  // 错因雷达图：自绘 SVG，不依赖任何图表库
  // causes = [{ name, count, ratio }]，ratio 以最高频错因为 100%
  // ---------------------------------------------------------------------------
  function causeRadar(causes) {
    const size = 340;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 82;
    const labelR = radius + 26;
    const count = causes.length;
    const step = (Math.PI * 2) / count;
    const angleOf = index => -Math.PI / 2 + index * step;
    const at = (index, r) => [cx + Math.cos(angleOf(index)) * r, cy + Math.sin(angleOf(index)) * r];
    const ring = (index, r) => at(index, r).map(v => v.toFixed(1)).join(',');

    const rings = [0.25, 0.5, 0.75, 1].map(ratio =>
      '<polygon points="' + causes.map((item, index) => ring(index, radius * ratio)).join(' ')
      + '" fill="none" stroke="rgba(120,140,190,.26)" stroke-width="1"/>').join('');

    const spokes = causes.map((item, index) =>
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + at(index, radius)[0].toFixed(1)
      + '" y2="' + at(index, radius)[1].toFixed(1) + '" stroke="rgba(120,140,190,.22)" stroke-width="1"/>').join('');

    const shape = causes.map((item, index) =>
      ring(index, radius * Math.max(0.12, item.ratio / 100))).join(' ');

    const dots = causes.map((item, index) => {
      const point = at(index, radius * Math.max(0.12, item.ratio / 100));
      return '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1)
        + '" r="4" fill="' + colorOf(index) + '" stroke="#fff" stroke-width="1.8"/>';
    }).join('');

    const labels = causes.map((item, index) => {
      const point = at(index, labelR);
      const anchor = Math.abs(point[0] - cx) < 8 ? 'middle' : (point[0] > cx ? 'start' : 'end');
      return '<text class="qwe-radar-name" x="' + point[0].toFixed(1) + '" y="' + (point[1] - 5).toFixed(1)
        + '" text-anchor="' + anchor + '" dominant-baseline="middle" fill="' + colorOf(index) + '">'
        + esc(item.name) + '</text>'
        + '<text class="qwe-radar-val" x="' + point[0].toFixed(1) + '" y="' + (point[1] + 10).toFixed(1)
        + '" text-anchor="' + anchor + '" dominant-baseline="middle">' + item.count + ' 次</text>';
    }).join('');

    return '<svg class="qwe-radar" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="错因雷达图">'
      + '<defs><radialGradient id="qweRadarFill" cx="50%" cy="50%" r="58%">'
      + '<stop offset="0%" stop-color="#FFC53D" stop-opacity=".52"/>'
      + '<stop offset="100%" stop-color="#7C6CF5" stop-opacity=".30"/>'
      + '</radialGradient></defs>'
      + rings + spokes
      + '<polygon points="' + shape + '" fill="url(#qweRadarFill)" stroke="#F5A623"'
      + ' stroke-width="2.2" stroke-linejoin="round"/>'
      + dots + labels
      + '</svg>';
  }

  // ---------------------------------------------------------------------------
  // 错题本条目：一条错因 = 一张小卡
  // ---------------------------------------------------------------------------
  function bookItem(item, index, maxCount) {
    const ids = item.knowledgePointIds || [];
    const tags = (item.knowledgePoints || []).map(kp =>
      '<span>' + esc(kp) + '</span>').join('');
    const go = ids.length
      ? '<a class="qwe-go" href="./classroom.html?kp=' + esc(ids[0]) + '">去重讲 →</a>' : '';
    const width = Math.round(((item.count || 0) / maxCount) * 100);

    return '<article class="qwe-item" style="--c:' + colorOf(index) + '">'
      + '  <div class="qwe-item-top">'
      + '    <span class="qwe-item-ic">' + esc(iconOf(item.name)) + '</span>'
      + '    <div class="qwe-item-name"><b>' + esc(item.name) + '</b><i>' + esc(item.description) + '</i></div>'
      + '    <span class="qwe-item-count">' + item.count + ' 次</span>'
      + '  </div>'
      + '  <div class="qwe-item-bar"><span style="width:' + width + '%"></span></div>'
      + '  <p class="qwe-item-advice">🔧 ' + esc(item.advice) + '</p>'
      + '  <div class="qwe-item-foot">'
      + '    <div class="qwe-item-tags">' + tags + '</div>' + go
      + '  </div>'
      + '</article>';
  }

  function legendRow(cause, index) {
    return '<li style="--c:' + colorOf(index) + '">'
      + '<span class="qwe-legend-dot"></span><b>' + esc(cause.name) + '</b>'
      + '<span class="qwe-legend-bar"><i style="width:' + Math.max(6, cause.ratio) + '%"></i></span>'
      + '<i class="qwe-legend-num">' + cause.count + ' 次</i></li>';
  }

  function renderError(data) {
    const items = data.items || [];
    const sessions = data.sessions || [];
    const causes = (data.causes && data.causes.length)
      ? data.causes
      : (function () {
        const max = items.reduce((m, item) => Math.max(m, item.count), 0) || 1;
        return items.slice(0, 6).map(item => ({
          name: item.name,
          count: item.count,
          ratio: Math.round((item.count / max) * 100)
        }));
      })();
    const maxCount = items.reduce((m, item) => Math.max(m, item.count), 0) || 1;
    const total = data.totalWrong || 0;
    const fixRate = typeof data.fixRate === 'number' ? data.fixRate : 0;
    const focusKp = (sessions[0] && sessions[0].knowledgePointId) || 'kp1';

    const stats = ''
      + '<div class="qwe-stats">'
      + '  <div class="qwe-stat"><b>' + total + '</b><i>错误总次数</i></div>'
      + '  <div class="qwe-stat"><b>' + items.length + '</b><i>错因种类</i></div>'
      + '  <div class="qwe-stat"><b>' + sessions.length + '</b><i>待重讲记录</i></div>'
      + '  <div class="qwe-stat"><b>' + fixRate + '%</b><i>订正率</i></div>'
      + '</div>';

    const hero = ''
      + '<section class="qw-hero qw-err-hero qwe-hero">'
      + '  <div>'
      + '    <span class="qw-hero-chip">🕵️ 错因比答案重要</span>'
      + '    <h2>' + (items.length
        ? '先解决「' + esc(items[0].name) + '」，比再做十道题有用'
        : '目前还没有记录到错误') + '</h2>'
      + '    <p>' + esc(data.advice) + '</p>'
      + '  </div>'
      + '  <a class="qw-btn-primary" href="./agent.html?kp=' + esc(focusKp) + '">🤖 让错题侦探看看</a>'
      + '</section>';

    const book = ''
      + '<section class="qwe-card qwe-book">'
      + '  <div class="qwe-card-head"><h3>📚 错题本</h3>'
      + '    <span>按出现次数排序 · 点「去重讲」回到对应课堂</span></div>'
      + (items.length
        ? '<div class="qwe-items">' + items.map((item, index) =>
            bookItem(item, index, maxCount)).join('') + '</div>'
        : '<p class="qw-empty">还没有错因记录，去讲题课堂走一遍吧。</p>')
      + '</section>';

    const radar = ''
      + '<section class="qwe-card qwe-radar-card">'
      + '  <div class="qwe-card-head"><h3>🎯 错因雷达图</h3>'
      + '    <span>越靠外圈 = 越常犯</span></div>'
      + (causes.length >= 3
        ? '<div class="qwe-radar-wrap">' + causeRadar(causes) + '</div>'
        : '<p class="qw-empty">错因类型还不够 3 类，先攒几次讲题记录再来看雷达图。</p>')
      + (causes.length
        ? '<ul class="qwe-legend">' + causes.map(legendRow).join('') + '</ul>' : '')
      + '</section>';

    const sessionList = sessions.length
      ? '<div class="qw-section-head qw-err-sub"><h2>需要重讲的学习记录</h2>'
        + '<span>按最近更新排序 · 点一张回到当时的讲题课堂</span></div>'
        + '<div class="qw-err-sessions">' + sessions.map(item =>
          '<a class="qw-err-session" href="./classroom.html?kp=' + esc(item.knowledgePointId) + '">'
          + '  <span class="qw-err-session-icon">' + esc(item.knowledgePointIcon) + '</span>'
          + '  <div><b>' + esc(item.knowledgePointName) + '</b>'
          + '    <p>停在 第 ' + item.currentStep + '/' + item.totalSteps + ' 步 · ' + formatDate(item.updatedAt)
          + ' · 订正 ' + item.correctionCount + ' 次</p></div>'
          + '  <span class="qw-err-session-tags">' + (item.errorTypes || []).map(name =>
            '<i>' + esc(name) + '</i>').join('') + '</span>'
          + '</a>').join('') + '</div>'
      : '';

    return ''
      + '<div class="qw-section-head"><h2>错题订正</h2>'
      + '  <span>共 ' + total + ' 次错误记录 · ' + items.length + ' 类错因</span></div>'
      + hero
      + stats
      + '<div class="qwe-grid">' + book + radar + '</div>'
      + sessionList;
  }

  async function boot() {
    const root = $('#correctionApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在整理你的错题本…</div>';
    try {
      const data = (await AUTH.request('/api/learning/error-book')).data;
      root.innerHTML = renderError(data);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();