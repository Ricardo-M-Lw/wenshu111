/**
 * 问数 Web 平台 · 学习报告页脚本
 * 说明：原「家长端」的学习总览 / 掌握概览 / 学习记录 / 提醒设置，
 * 现已压缩进学生端这一个页面 —— 主人公就是学生自己，不再有独立的家长端。
 * 数据全部来自 /api/report/*，日期与数值由服务端按「今天」动态推算。
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;

  const TABS = [
    { id: 'overview', label: '学习总览' },
    { id: 'mastery', label: '掌握概览' },
    { id: 'sessions', label: '学习记录' },
    { id: 'settings', label: '提醒设置' }
  ];

  const STEP_FLAG = {
    completed: '已完成',
    corrected: '曾出错',
    current: '进行中',
    pending: '未开始'
  };

  const STEP_ICON = { completed: '✓', corrected: '!', current: '▶', pending: '' };

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const IMAGE_POLICY = [
    { id: 'always', label: '每一步都生成图形', desc: '讲题时每一步都画出黑板图形，画面最丰富' },
    { id: 'session', label: '只在需要的步骤生成（推荐）', desc: '概念与图形推导的步骤才生成，其余用文字讲解' },
    { id: 'never', label: '关闭图形生成', desc: '只保留文字讲题，最省流量' }
  ];

  const state = {
    tab: 'overview',
    sessionId: '',
    cache: {},
    settings: null,
    errorAdvice: null,
    saving: false
  };

  // ---------------------------------------------------------------- 基础工具
  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function api(url, options) { return AUTH.request(url, options); }

  function toast(message) {
    let node = $('.qw-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qw-toast qw-toast-parent';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.classList.remove('show'); }, 2400);
  }

  function loading(text) {
    return '<div class="qw-empty"><span class="qw-spinner"></span>' + esc(text || '正在加载学习数据…') + '</div>';
  }

  function failed(message) {
    return '<div class="qw-empty">' + esc(message || '数据暂时取不到，稍后刷新试试。') + '</div>';
  }

  function num(value) {
    return Number(value) || 0;
  }

  function todayLabel() {
    const now = new Date();
    return now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEKDAYS[now.getDay()];
  }

  function clockLabel(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }

  function stampLabel(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + clockLabel(value);
  }

  function statusPill(status) {
    const map = {
      '已掌握': 'ok', '进行中': 'doing', '需加强': 'warn', '未开始': 'idle',
      completed: 'ok', in_progress: 'doing'
    };
    const labelMap = { completed: '已完成', in_progress: '进行中' };
    const label = labelMap[status] || status;
    return '<span class="qw-status qw-status-' + (map[status] || 'idle') + '">' + esc(label) + '</span>';
  }

  // ---------------------------------------------------------------- 通用图形
  function stepTimeline(steps, compact) {
    const list = (steps || []).map(function (step, index) {
      const status = step.status || 'pending';
      const flag = STEP_FLAG[status] || STEP_FLAG.pending;
      const hint = step.hint ? '<i>' + esc(step.hint) + '</i>' : '';
      const tag = step.tag ? ' · ' + esc(step.tag) : '';
      return '<div class="qw-step ' + esc(status) + '">'
        + '<span class="qw-step-dot">' + STEP_ICON[status] + '</span>'
        + '<div class="qw-step-main">'
        + '<b>第 ' + (step.step || index + 1) + ' 步 · ' + esc(step.title || step.name || '讲题步骤') + '</b>'
        + '<p>' + esc(step.name || step.title || '') + tag + (step.minutes ? ' · 约 ' + step.minutes + ' 分钟' : '') + '</p>'
        + hint
        + '</div>'
        + '<span class="qw-step-flag">' + flag + '</span>'
        + '</div>';
    }).join('');
    return '<div class="qw-steps' + (compact ? ' qw-steps-compact' : '') + '">' + list + '</div>';
  }

  function calendarStrip(calendar) {
    const days = (calendar || []).map(function (day) {
      return '<div class="qw-cal-day ' + esc(day.status) + (day.isToday ? ' today' : '') + '"'
        + ' title="' + esc(day.date + ' · ' + day.minutes + ' 分钟 · ' + day.sessionCount + ' 次学习') + '">'
        + '<span>' + esc(String(day.weekday || '').replace('周', '')) + '</span>'
        + '<b>' + esc(day.label) + '</b>'
        + '<em>' + (day.minutes ? day.minutes + ' 分' : '—') + '</em>'
        + '<i class="qw-cal-dot"></i>'
        + '</div>';
    }).join('');
    return '<div class="qw-cal-strip">' + days + '</div>'
      + '<div class="qw-cal-legend">'
      + '<span><i class="ok"></i>完成</span>'
      + '<span><i class="doing"></i>进行中</span>'
      + '<span><i class="idle"></i>未学习</span>'
      + '</div>';
  }

  function lineChart(series, labels, aria) {
    const W = 640, H = 220, L = 40, R = 18, T = 16, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const all = series.reduce(function (acc, item) { return acc.concat(item.values); }, [0]);
    const peak = Math.max.apply(null, all.concat([100]));
    const max = Math.max(100, Math.ceil(peak / 20) * 20);
    function x(i) { return labels.length <= 1 ? L + iw / 2 : L + (iw * i) / (labels.length - 1); }
    function y(v) { return T + ih - (ih * Math.min(num(v), max)) / max; }

    const grid = [0, 25, 50, 75, 100].map(function (p) {
      const gy = T + ih - (ih * p) / 100;
      return '<line x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"'
        + ' stroke="rgba(138,155,174,.18)" stroke-width="1" stroke-dasharray="4 6"/>'
        + '<text x="' + (L - 10) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#A8B6C2">' + p + '%</text>';
    }).join('');

    const paths = series.map(function (item) {
      const d = item.values.map(function (v, i) {
        return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join(' ');
      const dots = item.values.map(function (v, i) {
        return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.4" fill="#fff"'
          + ' stroke="' + item.color + '" stroke-width="2.4"/>';
      }).join('');
      return '<path d="' + d + '" fill="none" stroke="' + item.color + '" stroke-width="2.6"'
        + ' stroke-linecap="round" stroke-linejoin="round"/>' + dots;
    }).join('');

    const axis = labels.map(function (label, i) {
      return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="#8A9BAE">'
        + esc(label) + '</text>';
    }).join('');

    return '<div class="qw-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria || '趋势图') + '">'
      + grid + paths + axis + '</svg></div>';
  }

  function barChart(items) {
    if (!items || !items.length) {
      return '<div class="qw-empty">暂时还没有记录到错因，保持这个状态就好。</div>';
    }
    const max = Math.max.apply(null, items.map(function (item) { return num(item.count); }).concat([1]));
    return '<div class="qw-bars">' + items.map(function (item) {
      const pct = Math.max(6, Math.round((num(item.count) / max) * 100));
      return '<div class="qw-bar-row">'
        + '<span class="qw-bar-label" title="' + esc(item.name) + '">' + esc(item.name) + '</span>'
        + '<span class="qw-bar-track"><i style="width:' + pct + '%;background:linear-gradient(90deg,#F5A623,#EE5A6F)"></i></span>'
        + '<span class="qw-bar-value">' + num(item.count) + ' 次</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function kpiCard(kind, icon, value, unit, label) {
    return '<div class="qw-kpi qw-kpi-' + kind + '">'
      + '<span class="qw-kpi-icon">' + icon + '</span>'
      + '<b>' + esc(value) + (unit ? '<i>' + esc(unit) + '</i>' : '') + '</b>'
      + '<span>' + esc(label) + '</span>'
      + '</div>';
  }
  // ---------------------------------------------------------------- 学习总览
  function renderOverview(data) {
    const today = data.today || {};
    const summary = data.summary || {};
    const mastery = data.mastery || [];
    const problems = data.problems || [];
    const suggestions = data.suggestions || [];
    const tips = data.tips || [];
    const recent = data.recentSessions || [];
    const focus = today.focus || null;

    const kpis = '<div class="qw-parent-kpis">'
      + kpiCard('teal', '⏱️', num(today.minutes), '分钟', '今日学习时长')
      + kpiCard('blue', '🎯', num(today.correctRate), '%', '今日答题正确率')
      + kpiCard('green', '🏅', num(summary.mastered) + ' / ' + num(summary.totalKnowledgePoints), '', '已掌握知识点')
      + kpiCard('amber', '📚', num(summary.totalMinutes), '分钟', '累计学习 ' + num(summary.sessionCount) + ' 次')
      + '</div>';

    const focusCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>今日学习摘要</h2><span>' + esc(data.dateLabel || todayLabel()) + '</span></div>'
      + (focus
        ? '<div class="qw-focus-body">'
          + '<div class="qw-focus-kp"><span>' + esc(focus.knowledgePointName) + '</span>'
          + '<i>' + esc(focus.grade || '') + '</i>'
          + statusPill(focus.status === 'completed' ? '已掌握' : '进行中') + '</div>'
          + '<ul class="qw-focus-stats">'
          + '<li><span>讲题进度</span><b>' + num(focus.currentStep) + ' / ' + num(focus.totalSteps) + ' 步</b></li>'
          + '<li><span>本次时长</span><b>' + num(focus.duration) + ' 分钟</b></li>'
          + '<li><span>提示次数</span><b>' + num(focus.hintCount) + ' 次</b></li>'
          + '<li><span>正确率</span><b>' + (focus.quiz && focus.quiz.total ? Math.round((focus.quiz.correct / focus.quiz.total) * 100) + '%' : '—') + '</b></li>'
          + '</ul>'
          + '<a class="qw-btn-ghost" href="./classroom.html?kp=' + esc(focus.knowledgePointId) + '">回到讲题课堂继续 →</a>'
          + '</div>'
        : '<div class="qw-empty">今天还没有开始学习，去讲题课堂走完第一步吧。</div>')
      + '</section>';

    const masteryCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>知识点掌握概览</h2><span>共 ' + mastery.length + ' 个知识点</span></div>'
      + '<div class="qw-mastery-grid">'
      + mastery.map(function (kp) {
        return '<a class="qw-mastery-card" href="./report.html?tab=mastery#' + esc(kp.id) + '">'
          + '<div class="qw-mastery-cover' + (kp.cover ? ' has-cover' : '') + '" style="--c:' + esc(kp.accent) + '">'
          + (kp.cover ? '<img src="' + esc(kp.cover) + '" alt="' + esc(kp.name) + '" loading="lazy">' : '')
          + '<span>' + esc(kp.icon) + '</span>'
          + '</div>'
          + '<div class="qw-mastery-body">'
          + '<div class="qw-mastery-head"><h3>' + esc(kp.name) + '</h3>' + statusPill(kp.status) + '</div>'
          + '<p>' + esc(kp.description || '') + '</p>'
          + '<div class="qw-mastery-foot"><span>进度 ' + num(kp.currentStep) + '/' + num(kp.totalSteps) + ' 步</span>'
          + '<b>' + num(kp.progress) + '%</b></div>'
          + '</div>'
          + '</a>';
      }).join('')
      + '</div></section>';

    const calendarCard = '<section class="qw-card qw-calendar-card">'
      + '<div class="qw-calendar-head"><h3>近 7 天学习日历</h3><span>数据更新于 ' + esc(clockLabel(data.updatedAt) || '刚刚') + '</span></div>'
      + calendarStrip(data.calendar)
      + '</section>';

    const trend = data.trend || [];
    const trendCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>4 周掌握趋势</h2><span>总体 vs 各知识点</span></div>'
      + lineChart([
        { color: '#2BA4A0', values: trend.map(function (item) { return item.overall; }) },
        { color: '#667EEA', values: trend.map(function (item) { return item.kp1; }) },
        { color: '#EE5A6F', values: trend.map(function (item) { return item.kp2; }) },
        { color: '#F5A623', values: trend.map(function (item) { return item.kp3; }) }
      ], trend.map(function (item) { return item.label; }), '掌握趋势折线图')
      + '<div class="qw-legend">'
      + '<span class="qw-legend-item"><i style="background:#2BA4A0"></i>总体</span>'
      + '<span class="qw-legend-item"><i style="background:#667EEA"></i>一次函数</span>'
      + '<span class="qw-legend-item"><i style="background:#EE5A6F"></i>三角形内角和</span>'
      + '<span class="qw-legend-item"><i style="background:#F5A623"></i>勾股定理</span>'
      + '</div></section>';

    const suggestCard = '<section class="qw-card qw-suggest-card">'
      + '<div class="qw-card-head"><h2>接下来这样学</h2><span>' + suggestions.length + ' 条建议</span></div>'
      + '<ul class="qw-suggest-list">'
      + (suggestions.length
        ? suggestions.map(function (item, index) {
          return '<li><span class="qw-suggest-index">' + (index + 1) + '</span>'
            + '<div><b>' + esc(item.title) + '</b><p>' + esc(item.text) + '</p></div></li>';
        }).join('')
        : '<li><span class="qw-suggest-index">✓</span><div><b>保持节奏</b><p>当前学习状态稳定，按计划每天完成一个讲题步骤即可。</p></div></li>')
      + '</ul></section>';

    const problemCard = '<section class="qw-card qw-problem-card">'
      + '<div class="qw-card-head"><h2>主要问题</h2><span>按出现次数排序</span></div>'
      + barChart(problems)
      + '</section>';

    const recentCard = '<section class="qw-card">'
      + '<div class="qw-card-head" style="padding:20px 22px 0;margin-bottom:8px"><h2>最近学习记录</h2>'
      + '<a class="qw-btn-ghost" href="./report.html?tab=sessions" style="padding:8px 14px;font-size:12.5px">查看全部</a></div>'
      + (recent.length
        ? recent.map(function (item) {
          return '<a class="qw-parent-recent" href="./report.html?tab=sessions&id=' + esc(item.id) + '">'
            + '<span class="qw-kp-badge" style="--c:' + esc(item.accent) + ';width:40px;height:40px;border-radius:13px;font-size:18px">' + esc(item.knowledgePointIcon) + '</span>'
            + '<span class="qw-recent-main"><b>' + esc(item.knowledgePointName) + '</b>'
            + '<i>' + esc(stampLabel(item.updatedAt)) + ' · ' + num(item.duration) + ' 分钟 · 第 ' + num(item.currentStep) + '/' + num(item.totalSteps) + ' 步</i></span>'
            + statusPill(item.status === 'completed' ? '已掌握' : '进行中')
            + '</a>';
        }).join('')
        : '<div class="qw-empty">还没有学习记录。</div>')
      + '</section>';

    const tipCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>学习小贴士</h2><span>给坚持学习的你</span></div>'
      + '<ul class="qw-tip-list">'
      + tips.map(function (tip) {
        return '<li><span>' + esc(tip.icon) + '</span><div><b>' + esc(tip.title) + '</b><p>' + esc(tip.text) + '</p></div></li>';
      }).join('')
      + '</ul></section>';

    return kpis
      + '<div class="qw-parent-grid">'
      + '<div class="qw-parent-main">' + focusCard + masteryCard + trendCard + calendarCard + '</div>'
      + '<div class="qw-parent-side">' + suggestCard + problemCard + recentCard + tipCard + '</div>'
      + '</div>';
  }
  // ---------------------------------------------------------------- 掌握概览
  function renderMastery(data) {
    const mastery = data.mastery || [];
    const trend = data.trend || [];
    const errorStats = data.errorStats || [];
    const details = data.details || [];

    const trendCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>4 周掌握趋势</h2><span>数值越高越熟练</span></div>'
      + lineChart([
        { color: '#2BA4A0', values: trend.map(function (item) { return item.overall; }) },
        { color: '#667EEA', values: trend.map(function (item) { return item.kp1; }) },
        { color: '#EE5A6F', values: trend.map(function (item) { return item.kp2; }) },
        { color: '#F5A623', values: trend.map(function (item) { return item.kp3; }) }
      ], trend.map(function (item) { return item.label; }), '掌握趋势折线图')
      + '<div class="qw-legend">'
      + '<span class="qw-legend-item"><i style="background:#2BA4A0"></i>总体</span>'
      + '<span class="qw-legend-item"><i style="background:#667EEA"></i>一次函数</span>'
      + '<span class="qw-legend-item"><i style="background:#EE5A6F"></i>三角形内角和</span>'
      + '<span class="qw-legend-item"><i style="background:#F5A623"></i>勾股定理</span>'
      + '</div></section>';

    const errorCard = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>错误类型分布</h2><span>共 ' + errorStats.reduce(function (s, i) { return s + num(i.count); }, 0) + ' 次</span></div>'
      + barChart(errorStats)
      + '</section>';

    const cards = '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>知识点掌握明细</h2><span>点开卡片查看 5 步讲题时间轴</span></div>'
      + '<div class="qw-mastery-grid">'
      + mastery.map(function (kp) {
        return '<a class="qw-mastery-card" href="#' + esc(kp.id) + '">'
          + '<div class="qw-mastery-cover' + (kp.cover ? ' has-cover' : '') + '" style="--c:' + esc(kp.accent) + '">'
          + (kp.cover ? '<img src="' + esc(kp.cover) + '" alt="' + esc(kp.name) + '" loading="lazy">' : '')
          + '<span>' + esc(kp.icon) + '</span></div>'
          + '<div class="qw-mastery-body">'
          + '<div class="qw-mastery-head"><h3>' + esc(kp.name) + '</h3>' + statusPill(kp.status) + '</div>'
          + '<p>' + esc(kp.description || '') + '</p>'
          + '<div class="qw-mastery-foot"><span>学到第 ' + num(kp.currentStep) + '/' + num(kp.totalSteps) + ' 步</span><b>' + num(kp.progress) + '%</b></div>'
          + '</div></a>';
      }).join('')
      + '</div></section>';

    const timeline = details.map(function (item) {
      return '<section class="qw-card qw-mastery-detail" id="' + esc(item.id) + '">'
        + '<div class="qw-mastery-detail-head">'
        + '<span class="qw-kp-badge" style="--c:' + esc(item.accent) + '">' + esc(item.icon) + '</span>'
        + '<div class="qw-mastery-detail-title"><b style="font-size:16px;color:#1A2A3A">' + esc(item.name) + '</b>'
        + '<p>' + esc(item.status) + ' · 讲题步骤时间轴</p></div>'
        + '<span class="qw-mastery-percent">' + num(item.progress) + '%</span>'
        + '</div>'
        + stepTimeline(item.steps, false)
        + '</section>';
    }).join('');

    return '<div class="qw-two-col" style="margin-bottom:16px">' + trendCard + errorCard + '</div>'
      + cards + timeline;
  }

  // ---------------------------------------------------------------- 学习记录
  function renderSessions(data) {
    const summary = data.summary || {};
    const sessions = data.sessions || [];

    const kpis = '<div class="qw-parent-kpis">'
      + kpiCard('teal', '📘', num(data.total), '次', '学习记录总数')
      + kpiCard('blue', '⏱️', num(summary.totalMinutes), '分钟', '累计学习时长')
      + kpiCard('green', '✅', num(summary.completed), '次', '完整走完五步')
      + kpiCard('amber', '🎯', num(summary.correctRate), '%', '标准题正确率')
      + '</div>';

    const list = sessions.length
      ? '<div class="qw-session-list">' + sessions.map(function (item) {
        const quiz = item.quiz || { correct: 0, total: 0 };
        const rate = quiz.total ? Math.round((quiz.correct / quiz.total) * 100) : 0;
        return '<a class="qw-session-card" href="./report.html?tab=sessions&id=' + esc(item.id) + '">'
          + '<div class="qw-mastery-cover' + (item.cover ? ' has-cover' : '') + '" style="--c:' + esc(item.accent) + '">'
          + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.knowledgePointName) + '" loading="lazy">' : '')
          + '<span>' + esc(item.knowledgePointIcon) + '</span></div>'
          + '<div class="qw-session-body">'
          + '<div class="qw-mastery-head"><h3>' + esc(item.knowledgePointName) + '</h3>'
          + statusPill(item.status === 'completed' ? '已掌握' : '进行中') + '</div>'
          + '<p>' + esc(item.dateLabel) + ' ' + esc(item.timeLabel) + ' · ' + esc(item.grade) + '</p>'
          + '<div class="qw-session-meta">'
          + '<span>第 ' + num(item.currentStep) + '/' + num(item.totalSteps) + ' 步</span>'
          + '<span>' + num(item.duration) + ' 分钟</span>'
          + '<span>提示 ' + num(item.hintCount) + ' 次</span>'
          + '<span>正确率 ' + rate + '%</span>'
          + '</div>'
          + (item.errorTypes && item.errorTypes.length
            ? '<div class="qw-err-tags">' + item.errorTypes.map(function (name) { return '<i>' + esc(name) + '</i>'; }).join('') + '</div>'
            : '')
          + '</div></a>';
      }).join('') + '</div>'
      : '<div class="qw-empty">还没有学习记录，先去讲题课堂走完第一步吧。</div>';

    return kpis + '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>全部学习记录</h2><span>共 ' + num(data.total) + ' 条 · 点开查看单次详情</span></div>'
      + list + '</section>';
  }

  function readingFor(detail) {
    const kp = detail.knowledgePoint || {};
    const quiz = detail.quiz || { correct: 0, total: 0 };
    const lines = [];
    const name = kp.name || '这个知识点';
    if (detail.status === 'completed') {
      lines.push('这一次把《' + name + '》的 5 个讲题步骤完整走通了，属于「学完一轮」的完整记录。');
    } else {
      lines.push('这一次《' + name + '》走到第 ' + num(detail.currentStep) + '/' + num(detail.totalSteps) + ' 步就停了，中途停下也很正常，下次接着往下讲。');
    }
    if (quiz.total) {
      lines.push('标准题做了 ' + num(quiz.total) + ' 道，一次做对 ' + num(quiz.correct) + ' 道，正确率 ' + Math.round((num(quiz.correct) / num(quiz.total)) * 100) + '%。');
    }
    if (num(detail.hintCount)) {
      lines.push('过程中用了 ' + num(detail.hintCount) + ' 次提示 —— 卡住时先要方法而不是要答案，这个习惯要保持。');
    }
    if (num(detail.correctionCount)) {
      lines.push('有 ' + num(detail.correctionCount) + ' 处错误是在引导后自己改过来的，「先错后改」比直接看答案记得牢。');
    }
    if ((detail.errorTypes || []).length) {
      lines.push('这次记录到的错因是「' + detail.errorTypes.join('、') + '」，可以按下面的错因记录做一次专项练习。');
    } else {
      lines.push('这次没有记录到错因。可以试着换个数字或场景再讲一遍，确认是真的会迁移。');
    }
    return lines;
  }

  function renderSessionDetail(detail) {
    const kp = detail.knowledgePoint || {};
    const errors = detail.errorTypes || [];
    const adviceOf = function (name) {
      const found = (state.errorAdvice || []).find(function (item) { return item.name === name; });
      return found ? found.advice : '针对这一类问题做 2–3 道专项练习，做完再讲一遍思路。';
    };

    return '<section class="qw-card qw-mastery-detail" style="margin-bottom:16px">'
      + '<div class="qw-card-head"><h2>单次学习详情</h2>'
      + '<a class="qw-btn-ghost" href="./report.html?tab=sessions" style="padding:8px 14px;font-size:12.5px">← 返回记录列表</a></div>'
      + '<div class="qw-mastery-detail-head">'
      + '<span class="qw-kp-badge" style="--c:' + esc(kp.accent || '#2BA4A0') + '">' + esc(kp.icon || '△') + '</span>'
      + '<div class="qw-mastery-detail-title"><b style="font-size:16px;color:#1A2A3A">' + esc(kp.name || '知识点') + '</b>'
      + '<p>' + esc(detail.dateLabel) + ' · ' + num(detail.duration) + ' 分钟 · 第 ' + num(detail.currentStep) + '/' + num(detail.totalSteps) + ' 步</p></div>'
      + statusPill(detail.status === 'completed' ? '已掌握' : '进行中')
      + '</div>'
      + stepTimeline(detail.steps, true)
      + '</section>'
      + '<div class="qw-two-col" style="margin-bottom:16px">'
      + '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>这次学习怎么看</h2><span>自动解读</span></div>'
      + '<ul class="qw-reading">' + readingFor(detail).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul>'
      + '</section>'
      + '<section class="qw-card qw-focus-card">'
      + '<div class="qw-card-head"><h2>错因记录</h2><span>' + errors.length + ' 类</span></div>'
      + (errors.length
        ? '<ul class="qw-suggest-list">' + errors.map(function (name, index) {
          return '<li><span class="qw-suggest-index">' + (index + 1) + '</span>'
            + '<div><b>' + esc(name) + '</b><p>' + esc(adviceOf(name)) + '</p></div></li>';
        }).join('') + '</ul>'
        : '<div class="qw-empty">这次没有记录到错因，很棒。</div>')
      + '</section></div>'
      + '<section class="qw-card qw-focus-card" style="margin-bottom:16px">'
      + '<div class="qw-card-head"><h2>相关标准题</h2><span>检验是否真的掌握</span></div>'
      + '<div class="qw-quick qw-quick-col" style="display:grid;gap:10px">'
      + '<a class="qw-btn-ghost" style="justify-content:flex-start" href="./classroom.html?kp=' + esc(kp.id || '') + '">🎬 回讲题课堂把这五步重讲一遍</a>'
      + '<a class="qw-btn-ghost" style="justify-content:flex-start" href="./quiz.html?kp=' + esc(kp.id || '') + '">🔁 练一组《' + esc(kp.name || '知识点') + '》标准题</a>'
      + '</div></section>';
  }
  // ---------------------------------------------------------------- 提醒设置
  function get(obj, path) {
    return String(path).split('.').reduce(function (acc, key) {
      return acc == null ? acc : acc[key];
    }, obj);
  }

  function set(obj, path, value) {
    const parts = String(path).split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function switchButton(path, label) {
    const on = !!get(state.settings, path);
    return '<button type="button" class="qw-switch' + (on ? ' on' : '') + '" data-switch="' + esc(path) + '"'
      + ' role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '"></button>';
  }

  function timeInput(path, label) {
    return '<span class="qw-time-input"><i>' + esc(label) + '</i>'
      + '<input type="time" data-time="' + esc(path) + '" value="' + esc(get(state.settings, path) || '') + '"></span>';
  }

  function renderSettings(settings) {
    state.settings = JSON.parse(JSON.stringify(settings || {}));
    const sw = state.settings.studyWindow || {};
    const quiet = state.settings.quietHours || {};
    const reminders = state.settings.reminders || {};
    const privacy = state.settings.privacy || {};

    const weekdays = [1, 2, 3, 4, 5, 6, 0].map(function (day) {
      const active = (sw.weekdays || []).indexOf(day) !== -1;
      return '<button type="button" class="qw-weekday-chip' + (active ? ' active' : '') + '" data-weekday="' + day + '">'
        + esc(WEEKDAYS[day].replace('周', '周')) + '</button>';
    }).join('');

    return '<div class="qw-two-col" style="margin-bottom:16px">'
      + '<section class="qw-card qw-setting-card">'
      + '<div class="qw-card-head"><h2>学习时段</h2><span>到点提醒你开始讲题</span></div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>启用学习时段</b>'
      + '<p>只在这个时间段内推送学习提醒，其余时间保持安静。</p></div>' + switchButton('studyWindow.enabled', '启用学习时段') + '</div>'
      + '<div class="qw-setting-time">' + timeInput('studyWindow.start', '开始') + timeInput('studyWindow.end', '结束') + '</div>'
      + '<div class="qw-setting-weekdays"><span>提醒日</span><div class="qw-weekday-chips">' + weekdays + '</div></div>'
      + '</section>'

      + '<section class="qw-card qw-setting-card">'
      + '<div class="qw-card-head"><h2>免打扰</h2><span>休息时间不打扰</span></div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>启用免打扰</b>'
      + '<p>这个时间段内不推送任何提醒，第二天再继续。</p></div>' + switchButton('quietHours.enabled', '启用免打扰') + '</div>'
      + '<div class="qw-setting-time">' + timeInput('quietHours.start', '开始') + timeInput('quietHours.end', '结束') + '</div>'
      + '</section>'
      + '</div>'

      + '<div class="qw-two-col" style="margin-bottom:16px">'
      + '<section class="qw-card qw-setting-card">'
      + '<div class="qw-card-head"><h2>题图生成</h2><span>控制讲题时生成多少张图</span></div>'
      + '<div class="qw-choice" style="margin-top:6px">'
      + IMAGE_POLICY.map(function (option) {
        const active = (state.settings.imagePolicy || 'session') === option.id;
        return '<button type="button" class="qw-choice-btn' + (active ? ' active' : '') + '"'
          + ' data-choice="imagePolicy" data-value="' + esc(option.id) + '">'
          + esc(option.label) + '<br><span style="font-weight:600;font-size:12px;color:#8A9BAE">' + esc(option.desc) + '</span></button>';
      }).join('')
      + '</div></section>'

      + '<section class="qw-card qw-setting-card">'
      + '<div class="qw-card-head"><h2>学习报告</h2><span>定时把学习情况汇总给你</span></div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>每日学习小结</b>'
      + '<p>当天有学习记录时，晚上推送一份小结。</p></div>' + switchButton('reminders.dailyReport', '每日学习小结') + '</div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>每周学习报告</b>'
      + '<p>每周固定一天推送掌握趋势与错因汇总。</p></div>' + switchButton('reminders.weeklyReport', '每周学习报告') + '</div>'
      + '<div class="qw-setting-time"><label for="reportWeekday">周报推送日</label>'
      + '<span class="qw-time-input"><select id="reportWeekday" data-select="reminders.weeklyReportDay">'
      + WEEKDAYS.map(function (label, day) {
        return '<option value="' + day + '"' + (Number(reminders.weeklyReportDay) === day ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('')
      + '</select></span></div>'
      + '</section>'
      + '</div>'

      + '<section class="qw-card qw-setting-card">'
      + '<div class="qw-card-head"><h2>隐私与共享</h2><span>由你决定哪些数据可以被看到</span></div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>参与星系排行榜</b>'
      + '<p>关闭后，你的名字不会出现在天梯榜与任何排行榜里。</p></div>' + switchButton('privacy.shareRanking', '参与星系排行榜') + '</div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>共享学习报告给家长</b>'
      + '<p>开启后，绑定你账号的家长可以看到掌握趋势与错因汇总。</p></div>' + switchButton('privacy.shareToFamily', '共享学习报告给家长') + '</div>'
      + '<div class="qw-setting-row"><div class="qw-setting-text"><b>匿名数据改进教学</b>'
      + '<p>只统计题型与错因，不包含姓名等身份信息。</p></div>' + switchButton('privacy.analytics', '匿名数据改进教学') + '</div>'
      + '</section>'

      + '<div class="qw-save-bar"><span id="reportSaveHint">已保存 · ' + esc(stampLabel(state.settings.updatedAt) || '刚刚') + '</span>'
      + '<button type="button" class="qw-btn-primary" id="reportSave">保存设置</button></div>';
  }

  function markDirty() {
    const hint = $('#reportSaveHint');
    if (hint) hint.textContent = '有修改还没保存';
  }

  function bindSettings(panel) {
    if (!panel || !panel.addEventListener) return;

    panel.addEventListener('click', function (event) {
      const target = event.target;
      if (!target || !target.closest) return;

      const sw = target.closest('[data-switch]');
      if (sw && state.settings) {
        const path = sw.getAttribute('data-switch');
        const next = !get(state.settings, path);
        set(state.settings, path, next);
        sw.classList.toggle('on', next);
        sw.setAttribute('aria-checked', next ? 'true' : 'false');
        markDirty();
        return;
      }

      const choice = target.closest('[data-choice]');
      if (choice && state.settings) {
        const group = choice.getAttribute('data-choice');
        const value = choice.getAttribute('data-value');
        set(state.settings, group, value);
        $$('[data-choice="' + group + '"]', panel).forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-value') === value);
        });
        markDirty();
        return;
      }

      const chip = target.closest('[data-weekday]');
      if (chip && state.settings) {
        const day = Number(chip.getAttribute('data-weekday'));
        const list = (state.settings.studyWindow && state.settings.studyWindow.weekdays) || [];
        const index = list.indexOf(day);
        if (index === -1) list.push(day); else list.splice(index, 1);
        list.sort(function (a, b) { return a - b; });
        state.settings.studyWindow.weekdays = list;
        chip.classList.toggle('active', index === -1);
        markDirty();
        return;
      }

      const save = target.closest('#reportSave');
      if (save) saveSettings();
    });

    panel.addEventListener('change', function (event) {
      const input = event.target;
      if (!input || !input.getAttribute || !state.settings) return;
      const path = input.getAttribute('data-time') || input.getAttribute('data-select');
      if (!path) return;
      set(state.settings, path, input.value);
      markDirty();
    });
  }

  async function saveSettings() {
    if (state.saving || !state.settings) return;
    state.saving = true;
    const btn = $('#reportSave');
    if (btn) { btn.disabled = true; btn.textContent = '正在保存…'; }
    try {
      const res = await api('/api/report/settings', { method: 'PUT', body: state.settings });
      state.settings = res.data.settings;
      const hint = $('#reportSaveHint');
      if (hint) hint.textContent = '已保存 · ' + (stampLabel(state.settings.updatedAt) || '刚刚');
      toast('提醒设置已保存');
    } catch (err) {
      toast(err.message || '保存失败，请稍后再试');
    } finally {
      state.saving = false;
      if (btn) { btn.disabled = false; btn.textContent = '保存设置'; }
    }
  }
  // ---------------------------------------------------------------- 页面骨架
  function describeUser() {
    const user = (AUTH && AUTH.getUser()) || {};
    const name = user.nickname || user.name || '同学';
    const meta = [user.grade, user.school].filter(Boolean).join(' · ');
    return name + (meta ? ' · ' + meta : '') + ' · 数据来自讲题课堂与标准题训练';
  }

  function headMarkup(dateLabel, updatedLabel) {
    return '<section class="qw-parent-head">'
      + '<div>'
      + '<span class="qw-parent-date">' + esc(dateLabel || todayLabel()) + '</span>'
      + '<h1>学习报告</h1>'
      + '<p class="qw-parent-sub">' + esc(describeUser()) + '</p>'
      + '</div>'
      + '<span class="qw-parent-updated"><span class="qw-live-dot"></span>数据更新于 ' + esc(updatedLabel || '刚刚') + '</span>'
      + '</section>';
  }

  function setHead(data) {
    const head = $('#reportHead');
    if (!head) return;
    head.innerHTML = headMarkup((data && data.dateLabel) || '', clockLabel(data && data.updatedAt) || '刚刚');
  }

  function buildPnav() {
    if ($('.qw-pnav')) return;
    const user = (AUTH && AUTH.getUser()) || {};
    const name = user.nickname || user.name || '同学';
    const initial = String(name).trim().slice(-1) || '学';
    const meta = [user.grade, user.school].filter(Boolean).join(' · ') || '学生';

    const nav = document.createElement('nav');
    nav.className = 'qw-pnav';
    nav.setAttribute('aria-label', '学习报告导航');
    nav.innerHTML = '<div class="qw-pnav-inner">'
      + '<a class="qw-pnav-brand" href="./home.html">'
      + '<span class="qw-pnav-logo">问</span>'
      + '<span class="qw-pnav-title">问数 · 学习报告</span>'
      + '<span class="qw-pnav-badge">学生</span>'
      + '</a>'
      + '<div class="qw-pnav-tabs">'
      + TABS.map(function (tab) {
        return '<a href="./report.html?tab=' + tab.id + '" class="qw-pnav-tab" data-tab="' + tab.id + '">' + esc(tab.label) + '</a>';
      }).join('')
      + '</div>'
      + '<div class="qw-pnav-right">'
      + '<div class="qw-pnav-user">'
      + '<span class="qw-pnav-avatar">' + esc(initial) + '</span>'
      + '<span class="qw-pnav-name"><b>' + esc(name) + '</b><i>' + esc(meta) + '</i></span>'
      + '</div>'
      + '<a class="qw-pnav-icon" href="./level.html" aria-label="我的账号"><i data-lucide="user"></i></a>'
      + '<button type="button" id="reportLogout" class="qw-pnav-logout">退出</button>'
      + '</div>'
      + '</div>';

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('report-page');

    $$('.qw-pnav-tab', nav).forEach(function (tab) {
      tab.addEventListener('click', function (event) {
        event.preventDefault();
        switchTab(tab.getAttribute('data-tab'));
      });
    });
    const logout = $('#reportLogout', nav);
    if (logout) logout.addEventListener('click', function () { AUTH.logout(); });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function setActiveTab(tab) {
    $$('.qw-pnav-tab').forEach(function (node) {
      node.classList.toggle('active', node.getAttribute('data-tab') === tab);
    });
  }

  function switchTab(next) {
    if (!next || TABS.every(function (tab) { return tab.id !== next; })) return;
    state.tab = next;
    state.sessionId = '';
    setActiveTab(next);
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', './report.html?tab=' + next);
    }
    loadTab(next);
  }

  function scrollToHash() {
    const hash = String((window.location && window.location.hash) || '').replace('#', '');
    if (!hash) return;
    setTimeout(function () {
      const node = document.getElementById(hash);
      if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function ensureErrorAdvice() {
    if (state.errorAdvice) return;
    try {
      const res = await api('/api/learning/error-types');
      state.errorAdvice = res.data || [];
    } catch (err) {
      state.errorAdvice = [];
    }
  }

  async function loadTab(tab) {
    const panel = $('#reportPanel');
    if (!panel) return;
    panel.innerHTML = loading();
    try {
      if (tab === 'mastery') {
        const data = (await api('/api/report/mastery')).data;
        panel.innerHTML = renderMastery(data);
        scrollToHash();
      } else if (tab === 'sessions') {
        const data = (await api('/api/report/sessions')).data;
        await ensureErrorAdvice();
        if (state.sessionId) {
          const detail = (await api('/api/report/session/' + encodeURIComponent(state.sessionId))).data;
          panel.innerHTML = renderSessionDetail(detail) + renderSessions(data);
        } else {
          panel.innerHTML = renderSessions(data);
        }
      } else if (tab === 'settings') {
        const data = (await api('/api/report/settings')).data;
        panel.innerHTML = renderSettings(data.settings);
        bindSettings(panel);
      } else {
        const data = (await api('/api/report/overview')).data;
        setHead(data);
        panel.innerHTML = renderOverview(data);
      }
    } catch (err) {
      panel.innerHTML = failed(err.message);
    }
  }

  function boot() {
    const root = $('#reportApp');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('tab');
    state.tab = TABS.some(function (tab) { return tab.id === wanted; }) ? wanted : 'overview';
    state.sessionId = params.get('id') || '';

    root.innerHTML = '<header id="reportHead">' + headMarkup(todayLabel(), '刚刚') + '</header>'
      + '<div id="reportPanel">' + loading() + '</div>';
    buildPnav();
    setActiveTab(state.tab);
    loadTab(state.tab);

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  window.QWReport = { refresh: function () { loadTab(state.tab); } };
  document.addEventListener('DOMContentLoaded', boot);
})();