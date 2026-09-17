/**
 * 问数星途 · 星际天梯（异步 1v1 排位赛）
 * ---------------------------------------------------------------------------
 * 三个视图共用一个 <main>：
 *   home    段位卡 + 开始匹配 + 近 10 局 + 天梯榜 + 家长守护
 *   playing 对局：并排进度条 + 倒计时环 + 四选一 + 连击特效
 *   result  结算：积分变化 + 星尘奖励 + 逐题回放（结算后才揭晓答案）
 *
 * 关于判分：正确答案只存在服务端，前端拿到的题面里没有 answerIndex；
 * 每题的剩余时间也以服务端 match.seqStartedAt 为准，页面上的倒计时只是显示。
 * 数据源：/api/ladder/*（见 backend/src/routes/ladder.js）
 */
(function () {
  'use strict';

  var AUTH = window.QWAuth;
  var ART = null;
  var root = null;

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function signed(value) {
    var n = Number(value) || 0;
    return (n > 0 ? '+' : '') + n;
  }
  function art() {
    if (!ART && window.QWSpaceArt) ART = window.QWSpaceArt;
    return ART;
  }

  // 段位徽章：优先用星图美术库的手绘徽章，取不到就退回 emoji
  function tierEmblem(tier, size) {
    if (!tier) return '';
    var lib = art();
    if (!lib || !lib.emblem) return '<span class="sql-tier-emoji">' + esc(tier.icon) + '</span>';
    return lib.emblem({
      shape: 'hex', color: tier.color, symbol: tier.icon,
      size: size || 112, stars: 0, label: tier.name + '段位徽章'
    });
  }

  var state = {
    view: 'home',
    season: null, rules: null, me: null, board: null,
    match: null, questions: [], flash: null, feedback: null,
    picking: false, submitting: false, timer: null, deadline: 0
  };

  // ---------------------------------------------------------------------
  // 顶部提示（超时 / 答对 / 被拦）
  // ---------------------------------------------------------------------
  function toast(text, kind) {
    if (!text) return;
    var box = $('#sqlToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sqlToast';
      box.className = 'sql-toast';
      document.body.appendChild(box);
    }
    box.className = 'sql-toast is-on ' + (kind ? 'is-' + kind : '');
    box.textContent = text;
    window.clearTimeout(box._t);
    box._t = window.setTimeout(function () { box.className = 'sql-toast'; }, 2600);
  }

  function errorText(err) {
    if (!err) return '出了点小问题，再试一次';
    return err.message || '出了点小问题，再试一次';
  }

  // ---------------------------------------------------------------------
  // 首页：段位 / 赛季 / 每日场次 / 开始匹配
  // ---------------------------------------------------------------------
  function dailyPips(daily) {
    var total = daily.limit;
    var out = '';
    for (var i = 0; i < total; i += 1) {
      out += '<i class="' + (i < daily.remaining ? 'is-on' : '') + '"></i>';
    }
    return '<span class="sql-pips" title="今天还能打 ' + daily.remaining + ' 局">' + out + '</span>';
  }

  function heroHtml() {
    var me = state.me;
    if (!me) return '';
    var tier = me.tier;
    var next = tier.next;
    var blocked = me.guard && me.guard.enabled && !me.guard.allowed;
    var noQuota = me.daily.remaining <= 0;
    var disabled = blocked || noQuota;

    var startLabel = blocked ? '家长守护：暂时不能开打'
      : (noQuota ? '今天的 ' + me.daily.limit + ' 局已经打完了' : '开始匹配');

    return ''
      + '<section class="sql-hero">'
      + '  <div class="sql-hero-badge">' + tierEmblem(tier, 118)
      + '    <span class="sql-hero-rank">' + (me.rank ? '第 ' + me.rank + ' 名' : '待上榜') + '</span>'
      + '  </div>'
      + '  <div class="sql-hero-main">'
      + '    <div class="sql-hero-title">'
      + '      <h2>' + esc(tier.name) + '</h2>'
      + '      <span class="sql-hero-score">' + me.rating + '<i>分</i></span>'
      + '    </div>'
      + '    <div class="sql-bar"><span style="width:' + Math.max(4, tier.progress) + '%;background:' + esc(tier.color) + '"></span></div>'
      + '    <p class="sql-hero-next">' + (next
        ? '还差 <b>' + Math.max(0, next.min - me.rating) + '</b> 分升到 ' + esc(next.icon + ' ' + next.name)
        : '已经是最高段位，守住它吧') + '</p>'
      + '    <div class="sql-hero-stats">'
      + '      <span><b>' + me.record.wins + '</b>胜</span>'
      + '      <span><b>' + me.record.losses + '</b>负</span>'
      + '      <span><b>' + me.record.draws + '</b>平</span>'
      + '      <span>胜率 <b>' + me.record.winRate + '%</b></span>'
      + '      <span>连胜 <b>' + me.record.streak + '</b></span>'
      + '      <span>单局最高 <b>' + me.record.bestScore + '</b></span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="sql-hero-cta">'
      + '    <button type="button" class="sql-btn-play" data-sql-start' + (disabled ? ' disabled' : '') + '>🚀 ' + esc(startLabel) + '</button>'
      + '    <div class="sql-quota">' + dailyPips(me.daily)
      + '      <span>今日 ' + me.daily.used + '/' + me.daily.limit + ' 局</span></div>'
      + '    <div class="sql-hero-acts">'
      + '      <button type="button" class="sql-chip" data-sql-start="kp1">📘 一次函数</button>'
      + '      <button type="button" class="sql-chip" data-sql-start="kp2">🔺 内角和</button>'
      + '      <button type="button" class="sql-chip" data-sql-start="kp3">📐 勾股定理</button>'
      + '    </div>'
      + '    <a class="sql-chip is-link" href="./classroom.html">🎓 先去讲题课堂练一练</a>'
      + '  </div>'
      + '</section>';
  }

  function guardHtml() {
    var me = state.me;
    if (!me || !me.guard) return '';
    var g = me.guard;
    var win = g.studyWindow || {};
    var quiet = g.quietHours || {};
    return ''
      + '<section class="sql-card sql-guard">'
      + '  <header><h3>🛡 家长守护</h3>'
      + '    <button type="button" class="sql-switch' + (g.enabled ? ' is-on' : '') + '" data-sql-guard aria-pressed="' + (g.enabled ? 'true' : 'false') + '">'
      + '      <i></i></button></header>'
      + '  <p>' + esc(g.tip) + '</p>'
      + '  <ul class="sql-guard-list">'
      + '    <li><span>学习时段</span><b>' + (win.enabled ? esc(win.start + ' ~ ' + win.end) : '不限') + '</b></li>'
      + '    <li><span>免打扰</span><b>' + (quiet.enabled ? esc(quiet.start + ' ~ ' + quiet.end) : '不限') + '</b></li>'
      + '    <li><span>现在</span><b>' + esc(g.weekdayLabel + ' ' + g.now) + '</b></li>'
      + '  </ul>'
      + (g.enabled
        ? '<p class="sql-guard-now ' + (g.allowed ? 'is-ok' : 'is-no') + '">'
          + (g.allowed ? '✅ 现在可以开一局' : '⛔ 现在开不了：见下面的提示') + '</p>'
          + (g.allowed ? '' : '<p class="sql-guard-tip">' + esc(g.message) + '</p>')
        : '<p class="sql-guard-tip">打开后，只有「学习时段内、且不在免打扰时段」才能开一局。</p>')
      + '  <p class="sql-guard-note">时段跟着「学习报告 → 提醒设置」走，家长不用另外配一遍。</p>'
      + '</section>';
  }

  function rulesHtml() {
    var s = state.season || {};
    var r = state.rules || {};
    var tiers = (s.tiers || []).map(function (t) {
      return '<li style="--c:' + esc(t.color) + '"><i>' + esc(t.icon) + '</i><b>' + esc(t.name) + '</b><span>' + t.min + '+</span></li>';
    }).join('');
    return ''
      + '<section class="sql-card sql-rules">'
      + '  <header><h3>🛸 赛季规则</h3>' + (s.season ? '<span>' + esc(s.season.daysLeftLabel) + '</span>' : '') + '</header>'
      + '  <ul class="sql-rule-list">'
      + '    <li><span>每局题量</span><b>' + r.questionCount + ' 题</b></li>'
      + '    <li><span>每题限时</span><b>' + r.secondsPerQuestion + ' 秒</b></li>'
      + '    <li><span>胜 / 平 / 负</span><b>' + signed(r.win) + ' / ' + signed(r.draw) + ' / ' + r.lose + ' 分</b></li>'
      + '    <li><span>连胜加成</span><b>' + r.streakFrom + ' 连胜起，每场多 +' + r.streakBonus + '（最多 +' + r.streakBonusMax + '）</b></li>'
      + '    <li><span>星尘奖励</span><b>胜 ' + r.reward.win + ' / 平 ' + r.reward.draw + ' / 负 ' + r.reward.lose + '</b></li>'
      + '    <li><span>段位保护</span><b>' + esc(r.protect) + '</b></li>'
      + '  </ul>'
      + '  <h4 class="sql-sub">九段星阶 · 新账号从 ' + (r.startRating || 900) + ' 分起步</h4>'
      + '  <ul class="sql-tier-ladder">' + tiers + '</ul>'
      + '</section>';
  }

  function recordHtml() {
    var recent = (state.me && state.me.recent) || [];
    var rows = recent.map(function (item) {
      return '<li class="sql-rec sql-rec-' + esc(item.result || 'playing') + '">'
        + '<span class="sql-rec-ic">' + esc(item.resultIcon) + '</span>'
        + '<span class="sql-rec-opp">' + esc(item.opponent.avatar) + ' ' + esc(item.opponent.name) + '</span>'
        + '<span class="sql-rec-score">' + item.myScore + ' : ' + item.oppScore + '</span>'
        + '<span class="sql-rec-delta">' + (item.ratingDelta == null ? '—' : signed(item.ratingDelta)) + '</span>'
        + '<span class="sql-rec-dust">✨ ' + (item.reward || 0) + '</span>'
        + '</li>';
    }).join('');
    return ''
      + '<section class="sql-card sql-record">'
      + '  <header><h3>📜 我的近 10 局</h3><span>点开只看结果，答案在结算页回放</span></header>'
      + (rows ? '<ul class="sql-rec-list">' + rows + '</ul>'
        : '<p class="qw-empty">还没有对局记录，点上面的「开始匹配」打第一场吧。</p>')
      + '</section>';
  }

  function boardHtml() {
    var board = state.board;
    var items = (board && board.items) || [];
    var top = items.slice(0, 3);
    var podium = ['2', '1', '3'].map(function (rank) {
      var item = items[rank - 1];
      if (!item) return '<div class="sql-podium is-empty"></div>';
      return '<div class="sql-podium sql-podium-' + rank + (item.me ? ' is-me' : '') + '">'
        + '<span class="sql-podium-rank">' + rank + '</span>'
        + '<span class="sql-podium-av">' + esc(item.avatar) + '</span>'
        + '<b>' + esc(item.name) + '</b>'
        + '<i>' + esc(item.tier.icon + ' ' + item.tier.name) + '</i>'
        + '<em>' + item.rating + '</em>'
        + (item.demo ? '<u>演示</u>' : '')
        + '</div>';
    }).join('');
    var rest = items.slice(3).map(function (item) {
      return '<li class="sql-rank' + (item.me ? ' is-me' : '') + '">'
        + '<span class="sql-rank-no">' + item.rank + '</span>'
        + '<span class="sql-rank-av">' + esc(item.avatar) + '</span>'
        + '<b>' + esc(item.name) + '</b>'
        + '<span class="sql-rank-tier" style="--c:' + esc(item.tier.color) + '">' + esc(item.tier.icon + ' ' + item.tier.name) + '</span>'
        + '<span class="sql-rank-score">' + item.rating + '</span>'
        + (item.demo ? '<u>演示</u>' : '')
        + '</li>';
    }).join('');
    return ''
      + '<section class="sql-card sql-board">'
      + '  <header><h3>🏅 星际天梯榜</h3><span>'
      + (board && board.total ? '共 ' + board.total + ' 位挑战者' : '') + '</span></header>'
      + '<div class="sql-podiums">' + podium + '</div>'
      + (rest ? '<ul class="sql-rank-list">' + rest + '</ul>' : '')
      + (board && board.me ? '' : '<p class="sql-board-tip">打一局就能进榜。</p>')
      + '</section>';
  }

  function renderHome() {
    state.view = 'home';
    stopTimer();
    root.innerHTML = ''
      + '<div class="qw-section-head sql-head">'
      + '  <h2>🛸 星际天梯</h2>'
      + '  <span>' + (state.season && state.season.season
          ? esc(state.season.season.name + ' · ' + state.season.season.daysLeftLabel) : '异步 1v1 排位赛')
      + '  · 随时开一局，对手会陪你答完同样 8 题</span>'
      + '</div>'
      + heroHtml()
      + '<div class="sql-grid">'
      + '  <div class="sql-col">' + recordHtml() + boardHtml() + '</div>'
      + '  <div class="sql-col">' + guardHtml() + rulesHtml() + '</div>'
      + '</div>';
    if (window.lucide) window.lucide.createIcons();
    wireHome();
  }

  function wireHome() {
    root.querySelectorAll('[data-sql-start]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kp = btn.getAttribute('data-sql-start') || '';
        startMatch(kp && kp !== '' ? kp : '');
      });
    });
    var sw = $('[data-sql-guard]', root);
    if (sw) {
      sw.addEventListener('click', function () {
        var next = sw.getAttribute('aria-pressed') !== 'true';
        AUTH.request('/api/ladder/guard', { method: 'POST', body: { enabled: next } })
          .then(function () { toast(next ? '家长守护已打开' : '家长守护已关闭', 'ok'); return refresh(); })
          .catch(function (err) { toast(errorText(err), 'no'); });
      });
    }
  }

  // ---------------------------------------------------------------------
  // 对局视图
  // ---------------------------------------------------------------------
  function duelBar(match) {
    var total = match.total || 8;
    var mine = '', theirs = '';
    for (var i = 0; i < total; i += 1) {
      var done = i < match.answered;
      mine += '<i class="' + (done ? 'is-on' : '') + '"></i>';
      theirs += '<i class="' + (done ? 'is-on' : '') + '"></i>';
    }
    return ''
      + '<div class="sql-duel">'
      + '  <div class="sql-duel-side is-me">'
      + '    <span class="sql-duel-av">' + esc(state.avatar || '🙂') + '</span>'
      + '    <div><b>我</b><em>' + match.myScore + '</em></div>'
      + '    <span class="sql-duel-pips">' + mine + '</span>'
      + '  </div>'
      + '  <div class="sql-duel-vs">VS</div>'
      + '  <div class="sql-duel-side is-opp">'
      + '    <span class="sql-duel-av">' + esc(match.opponent.avatar) + '</span>'
      + '    <div><b>' + esc(match.opponent.name) + '</b><em>' + match.oppScore + '</em></div>'
      + '    <span class="sql-duel-pips">' + theirs + '</span>'
      + '  </div>'
      + '</div>';
  }

  function ringHtml(seconds) {
    return ''
      + '<div class="sql-ring" data-sql-ring> '
      + '  <svg viewBox="0 0 96 96" aria-hidden="true">'
      + '    <circle class="sql-ring-bg" cx="48" cy="48" r="41"></circle>'
      + '    <circle class="sql-ring-fg" cx="48" cy="48" r="41"></circle>'
      + '  </svg>'
      + '  <b data-sql-ring-num>' + seconds + '</b>'
      + '</div>';
  }

  function questionHtml() {
    var match = state.match;
    var seq = match.currentSeq || 1;
    var q = state.questions[seq - 1];
    if (!q) return '<p class="qw-empty">这一局的题目已经答完了，正在结算…</p>';
    var opts = q.options.map(function (text, index) {
      return '<button type="button" class="sql-opt" data-sql-pick="' + index + '">'
        + '<span class="sql-opt-no">' + 'ABCD'.charAt(index) + '</span>'
        + '<span class="sql-opt-text">' + esc(text) + '</span>'
        + '</button>';
    }).join('');
    return ''
      + '<div class="sql-quiz">'
      + '  <div class="sql-quiz-top">'
      + '    <span class="sql-quiz-no">第 ' + seq + ' / ' + match.total + ' 题</span>'
      + '    <span class="sql-quiz-kp">' + esc(q.knowledgePointName) + '</span>'
      + ringHtml(match.secondsPerQuestion)
      + '  </div>'
      + '  <h3 class="sql-question">' + esc(q.question) + '</h3>'
      + '  <div class="sql-options">' + opts + '</div>'
      + '  <p class="sql-hint">💡 ' + esc(q.hint || '先看清已知条件，再想用哪个公式') + '</p>'
      + '</div>';
  }

  function renderPlaying() {
    state.view = 'playing';
    root.innerHTML = ''
      + '<div class="qw-section-head sql-head">'
      + '  <h2>⚔️ 对局中</h2>'
      + '  <span>对手 ' + esc(state.match.opponent.avatar + ' ' + state.match.opponent.name)
      + '  · ' + esc(state.match.opponent.tier.name) + ' ' + state.match.opponent.rating + ' 分 · 双方同题，服务端判分</span>'
      + '</div>'
      + duelBar(state.match)
      + questionHtml();
    if (window.lucide) window.lucide.createIcons();
    root.querySelectorAll('[data-sql-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () { pick(Number(btn.getAttribute('data-sql-pick'))); });
    });
    startTimer();
  }

  function startTimer() {
    stopTimer();
    var limit = (state.match.secondsPerQuestion || 20) * 1000;
    state.deadline = Date.now() + limit;
    tick();
    state.timer = window.setInterval(tick, 200);
  }

  function stopTimer() {
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
  }

  function tick() {
    var ring = $('[data-sql-ring]', root);
    if (!ring) return;
    var limit = (state.match.secondsPerQuestion || 20) * 1000;
    var left = Math.max(0, state.deadline - Date.now());
    var ratio = left / limit;
    var num = $('[data-sql-ring-num]', ring);
    if (num) num.textContent = Math.ceil(left / 1000);
    var fg = $('.sql-ring-fg', ring);
    if (fg) {
      var c = 2 * Math.PI * 41;
      fg.style.strokeDasharray = c.toFixed(1);
      fg.style.strokeDashoffset = (c * (1 - ratio)).toFixed(1);
      fg.style.stroke = ratio > 0.5 ? '#34C759' : (ratio > 0.25 ? '#F5A623' : '#EE5A6F');
    }
    ring.classList.toggle('is-hurry', ratio <= 0.25);
    if (left <= 0 && !state.submitting) {
      stopTimer();
      toast('时间到，这题算超时啦', 'no');
      submit(-1);
    }
  }

  function pick(choice) {
    if (state.submitting) return;
    var btns = root.querySelectorAll('[data-sql-pick]');
    btns.forEach(function (b) { b.disabled = true; });
    var chosen = btns[choice];
    if (chosen) chosen.classList.add('is-chosen');
    submit(choice);
  }

  function submit(choice) {
    state.submitting = true;
    stopTimer();
    var match = state.match;
    var seq = match.currentSeq || 1;
    AUTH.request('/api/ladder/match/' + match.id + '/answer', {
      method: 'POST', body: { seq: seq, choice: choice }
    }).then(function (res) {
      var data = res.data;
      markAnswer(data);
      state.submitting = false;
      state.match = data.match;
      if (data.correct) {
        toast(data.message, 'ok');
        burstOnCard();
      } else {
        toast(data.message, 'no');
      }
      window.setTimeout(function () {
        if (data.finished) finish();
        else renderPlaying();
      }, data.correct ? 720 : 980);
    }).catch(function (err) {
      state.submitting = false;
      toast(errorText(err), 'no');
      renderPlaying();
    });
  }

  // 作答反馈：选中的按钮变绿 / 变红，让「对错」当场可见（但不揭晓正确答案）
  function markAnswer(data) {
    var btns = root.querySelectorAll('[data-sql-pick]');
    btns.forEach(function (b, index) {
      b.disabled = true;
      if (index === data.choice) b.classList.add(data.correct ? 'is-right' : 'is-wrong');
      if (data.timeout && index === data.choice) b.classList.add('is-timeout');
    });
  }

  function burstOnCard() {
    var lib = art();
    var host = $('.sql-quiz', root) || root;
    if (lib && lib.burst) lib.burst(host, { texts: ['+1', '✦', '+1', '★'], color: '#FFE16E' });
  }

  // ---------------------------------------------------------------------
  // 结算视图
  // ---------------------------------------------------------------------
  function replayHtml(replay) {
    var rows = (replay || []).map(function (q) {
      var cls = q.correct ? 'is-right' : 'is-wrong';
      var mine = q.choice >= 0 && q.options[q.choice] ? q.options[q.choice] : '（超时未选）';
      return '<li class="sql-rp ' + cls + '">'
        + '<div class="sql-rp-top">'
        + '  <span class="sql-rp-no">' + q.seq + '</span>'
        + '  <span class="sql-rp-kp">' + esc(q.knowledgePointName) + '</span>'
        + '  <span class="sql-rp-tag">' + (q.correct ? '✅ 答对' : (q.timeout ? '⏰ 超时' : '❌ 答错')) + '</span>'
        + '</div>'
        + '<p class="sql-rp-q">' + esc(q.question) + '</p>'
      + '<p class="sql-rp-a"><span>你的选择：' + esc(mine) + '</span>'
        + '<span class="is-answer">正确答案：' + esc(q.answerText) + '</span></p>'
        + (q.correct ? '' : '<p class="sql-rp-hint">💡 ' + esc(q.hint || '回讲题课堂再看一遍这个知识点') + '</p>')
        + '</li>';
    }).join('');
    return ''
      + '<section class="sql-card sql-replay">'
      + '  <header><h3>📝 逐题回放</h3><span>结算后才揭晓答案 · 错的题点「去重讲」回课堂</span></header>'
      + '<ul class="sql-rp-list">' + rows + '</ul>'
      + '</section>';
  }

  function renderResult(data) {
    state.view = 'result';
    stopTimer();
    var s = data.settlement;
    var up = s.ratingDelta > 0;
    var same = s.ratingDelta === 0;
    var deltaCls = same ? 'is-flat' : (up ? 'is-up' : 'is-down');
    root.innerHTML = ''
      + '<section class="sql-result ' + deltaCls + '">'
      + '  <div class="sql-result-head">'
      + '    <span class="sql-result-ic">' + esc(s.resultIcon) + '</span>'
      + '    <h2>' + esc(s.resultLabel) + '</h2>'
      + '    <p>' + s.myScore + ' : ' + s.oppScore + ' · 答对 ' + s.myCorrect + '/' + s.total + ' 题</p>'
      + '  </div>'
      + '  <div class="sql-result-badge">' + tierEmblem(s.tier, 96) + '</div>'
      + '  <div class="sql-result-rows">'
      + '    <div><i>积分</i><b>' + s.ratingBefore + ' <em>→</em> ' + s.ratingAfter + '</b></div>'
      + '    <div><i>本局变化</i><b class="sql-delta">' + signed(s.ratingDelta) + '</b></div>'
      + '    <div><i>星尘</i><b>✨ +' + s.reward + '</b></div>'
      + '    <div><i>段位</i><b>' + esc(s.tier.icon + ' ' + s.tier.name) + '</b></div>'
      + '  </div>'
      + (s.promoted ? '<p class="sql-promote">🎉 段位变化：' + esc(s.tierBefore.name) + ' → ' + esc(s.tier.name) + '</p>' : '')
      + '  <div class="sql-result-acts">'
      + '    <button type="button" class="sql-btn-play" data-sql-again>🔁 再来一局</button>'
      + '    <button type="button" class="sql-chip" data-sql-home>🏠 回到天梯首页</button>'
      + '  </div>'
      + '</section>'
      + '<div class="sql-grid">'
      + '  <div class="sql-col">' + replayHtml(data.replay) + '</div>'
      + '  <div class="sql-col">' + recordHtml() + '</div>'
      + '</div>';
    if (window.lucide) window.lucide.createIcons();
    var lib = art();
    if (lib && lib.celebrate && s.result === 'win') lib.celebrate(root, { texts: ['+25', '✨', '🏆'] });
    var again = $('[data-sql-again]', root);
    if (again) again.addEventListener('click', function () { startMatch(''); });
    var home = $('[data-sql-home]', root);
    if (home) home.addEventListener('click', function () { refresh(); });
  }

  // ---------------------------------------------------------------------
  // 接口
  // ---------------------------------------------------------------------
  function refresh() {
    return Promise.all([
      AUTH.request('/api/ladder/season'),
      AUTH.request('/api/ladder/me'),
      AUTH.request('/api/ladder/leaderboard?limit=20')
    ]).then(function (res) {
      state.season = res[0].data;
      state.rules = res[0].data.rules;
      state.me = res[1].data;
      state.board = res[2].data;
      var user = AUTH.getUser();
      state.avatar = (user && user.avatar) || '🙂';
      renderHome();
    });
  }

  function startMatch(kpId) {
    var body = kpId ? { kpId: kpId } : {};
    AUTH.request('/api/ladder/match', { method: 'POST', body: body }).then(function (res) {
      state.match = res.data.match;
      state.questions = res.data.questions;
      renderPlaying();
    }).catch(function (err) {
      var data = err && err.data ? err.data : {};
      if (err && err.status === 403 && data.code === 'LADDER_GUARD') {
        toast(data.error, 'no');
        if (state.me) state.me.guard = data.guard;
        renderHome();
        return;
      }
      if (err && err.status === 429) {
        toast(data.error, 'no');
        return refresh().catch(function () {});
      }
      toast(errorText(err), 'no');
    });
  }

  function finish() {
    AUTH.request('/api/ladder/match/' + state.match.id + '/finish', { method: 'POST' }).then(function (res) {
      loadRecordAndBoard().then(function () { renderResult(res.data); });
    }).catch(function (err) {
      toast(errorText(err), 'no');
      refresh().catch(function () {});
    });
  }

  function loadRecordAndBoard() {
    return Promise.all([
      AUTH.request('/api/ladder/me'),
      AUTH.request('/api/ladder/leaderboard?limit=20')
    ]).then(function (res) {
      state.me = res[0].data;
      state.board = res[1].data;
    });
  }

  function boot() {
    root = document.getElementById('ladderApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在连接星海赛区…</div>';
    refresh().catch(function (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(errorText(err)) + '</p>';
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
