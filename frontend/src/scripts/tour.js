/**
 * 问数星途 · 新手引导 / 步骤高亮（QWTour）
 * ---------------------------------------------------------------------------
 * 用「遮罩挖洞 + 聚光灯 + 气泡」把页面一块一块讲清楚：
 *   - 洞的位置每帧都用 getBoundingClientRect 现算，窗口缩放 / 滚动都不会跑偏
 *   - 气泡优先放在目标下方，下方放不下就自动翻到上方，横向贴边会收回来
 *   - 非当前步骤用一层透明遮罩锁住点击，逼着学生按顺序看；clickable 的步骤放开点击
 *   - 看过的引导记在 localStorage，除非用户点「怎么用」否则不再自动弹
 *
 * 用法：
 *   QWTour.start([{ sel: '.qw-board-figure', title: '黑板', text: '...', clickable: true }], { key: 'classroom' });
 *   QWTour.seen('classroom');  QWTour.reset();  QWTour.close();
 */
(function (global) {
  'use strict';

  var doc = global.document || null;
  var STYLE_ID = 'qw-tour-style';
  var SEEN_KEY = 'qw_tour_seen_v1';

  var CSS = [
    '@keyframes qwtRingPulse {',
    '  0%, 100% { box-shadow: 0 0 0 9999px rgba(9, 17, 34, .68), 0 0 0 3px rgba(255, 255, 255, .92); }',
    '  50% { box-shadow: 0 0 0 9999px rgba(9, 17, 34, .68), 0 0 0 7px rgba(255, 197, 61, .88); }',
    '}',
    '@keyframes qwtTipIn { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }',
    '.qwt-root { position: fixed; inset: 0; z-index: 9600; }',
    '.qwt-root.qwt-clickable .qwt-mask { pointer-events: none !important; }',
    '.qwt-mask { position: fixed; inset: 0; pointer-events: auto; }',
    '.qwt-hole {',
    '  position: fixed;',
    '  pointer-events: none;',
    '  border-radius: 18px;',
    '  transition: left .3s cubic-bezier(.4, 0, .2, 1), top .3s cubic-bezier(.4, 0, .2, 1),',
    '    width .3s cubic-bezier(.4, 0, .2, 1), height .3s cubic-bezier(.4, 0, .2, 1), border-radius .3s;',
    '  animation: qwtRingPulse 2.6s ease-in-out infinite;',
    '}',
    '.qwt-hole.qwt-hole-off { display: none; }',
    '.qwt-tip {',
    '  position: fixed;',
    '  z-index: 9602;',
    '  width: min(366px, calc(100vw - 26px));',
    '  padding: 16px 18px 13px;',
    '  border-radius: 18px;',
    '  background: linear-gradient(160deg, #FFFFFF, #F3F8FF);',
    '  border: 1px solid rgba(43, 164, 160, .26);',
    '  box-shadow: 0 26px 64px rgba(9, 17, 34, .34);',
    '  color: #1A2A3A;',
    '  transition: left .28s ease, top .28s ease;',
    '  animation: qwtTipIn .28s ease-out both;',
    '}',
    '.qwt-tip-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }',
    '.qwt-count {',
    '  padding: 3px 10px; border-radius: 999px; font-size: 11.4px; font-weight: 800; letter-spacing: .03em;',
    '  color: #0C5450; background: rgba(43, 164, 160, .16);',
    '}',
    '.qwt-close {',
    '  width: 26px; height: 26px; border: 0; border-radius: 50%; cursor: pointer;',
    '  font-size: 13px; line-height: 1; color: #6B7C90; background: rgba(26, 42, 58, .07);',
    '}',
    '.qwt-close:hover { background: rgba(26, 42, 58, .14); }',
    '.qwt-title { margin: 10px 0 6px; font-size: 16.5px; font-weight: 800; line-height: 1.35; }',
    '.qwt-text { margin: 0; font-size: 13.2px; line-height: 1.75; color: #55677B; }',
    '.qwt-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }',
    '.qwt-dots { display: flex; gap: 5px; margin: 0 auto 0 2px; }',
    '.qwt-dot { width: 7px; height: 7px; border: 0; padding: 0; border-radius: 50%; cursor: pointer; background: rgba(26, 42, 58, .18); }',
    '.qwt-dot.on { background: #F5A623; transform: scale(1.28); }',
    '.qwt-btn {',
    '  border: 0; cursor: pointer; border-radius: 999px; font-weight: 800; font-size: 12.6px;',
    '  padding: 8px 15px; transition: filter .18s, background .18s;',
    '}',
    '.qwt-ghost { color: #55677B; background: rgba(26, 42, 58, .08); }',
    '.qwt-ghost:hover { background: rgba(26, 42, 58, .15); }',
    '.qwt-primary { color: #fff; background: linear-gradient(135deg, #35C5BE, #2BA4A0); box-shadow: 0 8px 20px rgba(43, 164, 160, .3); }',
    '.qwt-primary:hover { filter: brightness(1.06); }',
    '.qwt-ghost[disabled] { opacity: .42; cursor: default; }',
    'body.qw-night .qwt-tip { background: linear-gradient(160deg, #1B2D44, #14243C); border-color: rgba(120, 190, 200, .28); color: #EAF1FF; }',
    'body.qw-night .qwt-text { color: rgba(200, 214, 240, .76); }',
    'body.qw-night .qwt-count { color: #B6F0EA; background: rgba(53, 197, 190, .22); }',
    'body.qw-night .qwt-close { color: #C4D4EC; background: rgba(255, 255, 255, .1); }',
    'body.qw-night .qwt-ghost { color: #C4D4EC; background: rgba(255, 255, 255, .1); }',
    'body.qw-night .qwt-dot { background: rgba(255, 255, 255, .24); }'
  ].join('\n');

  function injectStyle() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function readSeen() {
    try {
      var raw = global.localStorage.getItem(SEEN_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    } catch (err) { return []; }
  }

  function seen(key) {
    if (!key) return false;
    return readSeen().indexOf(String(key)) !== -1;
  }

  function markSeen(key) {
    if (!key) return;
    try {
      var list = readSeen();
      if (list.indexOf(String(key)) === -1) list.push(String(key));
      global.localStorage.setItem(SEEN_KEY, JSON.stringify(list));
    } catch (err) { /* 隐私模式忽略 */ }
  }

  function reset() {
    try { global.localStorage.removeItem(SEEN_KEY); } catch (err) { /* 忽略 */ }
  }

  // 轻量 DOM（node 测试环境）没有 window.addEventListener，这种环境下引导直接不启动，
  // 而不是抛错把页面拖垮
  function supported() {
    return !!(doc && doc.body
      && typeof global.addEventListener === 'function'
      && typeof global.removeEventListener === 'function');
  }

  function on(target, type, fn, capture) {
    if (target && typeof target.addEventListener === 'function') target.addEventListener(type, fn, capture);
  }

  function off(target, type, fn, capture) {
    if (target && typeof target.removeEventListener === 'function') target.removeEventListener(type, fn, capture);
  }

  function raf(fn) {
    if (typeof global.requestAnimationFrame === 'function') return global.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var live = null;

  function close(markDone) {
    if (!live) return;
    if (markDone !== false && live.opts.key) markSeen(live.opts.key);
    var snapshot = live;
    live = null;
    off(global, 'keydown', snapshot.onKey, true);
    off(global, 'resize', snapshot.onResize);
    off(global, 'scroll', snapshot.onResize, true);
    if (snapshot.raf && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(snapshot.raf);
    if (snapshot.timer) clearInterval(snapshot.timer);
    if (snapshot.unbindClick) snapshot.unbindClick();
    if (snapshot.root && snapshot.root.parentNode) snapshot.root.parentNode.removeChild(snapshot.root);
    if (typeof snapshot.opts.onClose === 'function') {
      try { snapshot.opts.onClose(); } catch (err) { /* 回调出错不影响页面 */ }
    }
  }

  function place() {
    if (!live) return;
    var item = live.list[live.index] || {};
    var el = live.target;
    var hole = live.hole;
    var tip = live.tip;

    if (!el || !el.getBoundingClientRect) {
      // 目标元素不在这一页：藏掉洞口，气泡居中显示，别让用户看见一个乱飞的方框
      hole.classList.add('qwt-hole-off');
      tip.style.left = '50%';
      tip.style.top = '50%';
      tip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    hole.classList.remove('qwt-hole-off');
    tip.style.transform = '';

    var rect = el.getBoundingClientRect();
    var pad = num(item.pad, 10);
    var w = Math.max(rect.width + pad * 2, 34);
    var h = Math.max(rect.height + pad * 2, 34);
    var x = rect.left - pad;
    var y = rect.top - pad;

    hole.style.left = Math.round(x) + 'px';
    hole.style.top = Math.round(y) + 'px';
    hole.style.width = Math.round(w) + 'px';
    hole.style.height = Math.round(h) + 'px';
    hole.style.borderRadius = num(item.radius, 18) + 'px';

    var vw = global.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 1024;
    var vh = global.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 768;
    var tipW = tip.offsetWidth || 366;
    var tipH = tip.offsetHeight || 176;
    var GAP = 14;

    var spaceBelow = vh - (rect.bottom + pad + GAP);
    var above = rect.top - pad - GAP - tipH;
    var top;
    var flipped = false;
    if (spaceBelow >= tipH + 8) {
      top = rect.bottom + pad + GAP;
    } else if (above >= 12) {
      top = above;
      flipped = true;
    } else {
      // 上下都塞不下（目标很高）：贴着视口中心，别把气泡顶出屏幕
      top = clamp(rect.bottom + pad + GAP, 12, Math.max(12, vh - tipH - 12));
    }

    var left = clamp(x + w / 2 - tipW / 2, 14, Math.max(14, vw - tipW - 14));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.classList.toggle('qwt-tip-above', flipped);
  }

  function schedulePlace() {
    if (!live || live.raf) return;
    live.raf = raf(function () {
      if (!live) return;
      live.raf = 0;
      place();
    });
  }

  function resolve(spec) {
    if (!spec || !spec.sel) return null;
    try { return doc.querySelector(spec.sel); } catch (err) { return null; }
  }

  function show(index) {
    if (!live) return;
    live.index = clamp(index, 0, live.list.length - 1);
    var item = live.list[live.index];

    if (live.unbindClick) { live.unbindClick(); live.unbindClick = null; }

    // 先把目标滚进视野再定位，否则量到的坐标是屏幕外的
    var el = resolve(item);
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); }
      catch (err) { try { el.scrollIntoView(); } catch (err2) { /* 忽略 */ } }
    }
    live.target = el;

    live.root.querySelector('.qwt-count').textContent = (live.index + 1) + ' / ' + live.list.length;
    live.root.querySelector('.qwt-title').textContent = item.title || '';
    live.root.querySelector('.qwt-text').textContent = item.text || '';

    var dots = live.root.querySelectorAll('.qwt-dot');
    for (var i = 0; i < dots.length; i += 1) dots[i].classList.toggle('on', i === live.index);

    var prev = live.root.querySelector('.qwt-prev');
    var next = live.root.querySelector('.qwt-next');
    prev.disabled = live.index === 0;
    next.textContent = live.index === live.list.length - 1 ? '开始学习' : '下一步';

    // 可点击的步骤：放开遮罩，学生点到高亮区域就自动进入下一步
    live.mask.style.pointerEvents = item.clickable ? 'none' : 'auto';
    live.root.classList.toggle('qwt-clickable', !!item.clickable);
    if (item.clickable && el) {
      var onClick = function (event) {
        if (el === event.target || el.contains(event.target)) {
          if (live) show(live.index + 1);
        }
      };
      on(doc, 'click', onClick, true);
      live.unbindClick = function () { off(doc, 'click', onClick, true); };
    }

    // 高亮区域变化会让气泡尺寸变化，量两次保证位置准
    place();
    raf(function () { if (live) place(); });
  }

  function next() {
    if (!live) return;
    if (live.index >= live.list.length - 1) { close(true); return; }
    show(live.index + 1);
  }

  function prev() {
    if (!live) return;
    if (live.index <= 0) return;
    show(live.index - 1);
  }

  /**
   * 启动引导
   * @param {Array} steps [{ sel, title, text, clickable, pad, radius }]
   * @param {Object} options { key, onClose }
   */
  function start(steps, options) {
    if (!supported()) return null;
    var list = [];
    var raw = steps || [];
    for (var i = 0; i < raw.length; i += 1) {
      var spec = raw[i];
      if (!spec) continue;
      if (spec.sel && !resolve(spec)) continue;   // 这一页没有的元素直接跳过
      list.push(spec);
    }
    if (!list.length) return null;

    close(false);
    injectStyle();

    var opts = options || {};
    var root = doc.createElement('div');
    root.className = 'qwt-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', opts.label || '新手引导');
    root.innerHTML = ''
      + '<div class="qwt-mask"></div>'
      + '<div class="qwt-hole qwt-hole-off"></div>'
      + '<div class="qwt-tip">'
      + '  <div class="qwt-tip-head"><span class="qwt-count"></span>'
      + '    <button type="button" class="qwt-close" aria-label="关闭引导">✕</button></div>'
      + '  <h4 class="qwt-title"></h4>'
      + '  <p class="qwt-text"></p>'
      + '  <div class="qwt-foot">'
      + '    <button type="button" class="qwt-btn qwt-ghost qwt-skip">跳过</button>'
      + '    <div class="qwt-dots"></div>'
      + '    <button type="button" class="qwt-btn qwt-ghost qwt-prev">上一步</button>'
      + '    <button type="button" class="qwt-btn qwt-primary qwt-next">下一步</button>'
      + '  </div>'
      + '</div>';
    doc.body.appendChild(root);

    var dotsBox = root.querySelector('.qwt-dots');
    for (var d = 0; d < list.length; d += 1) {
      var dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'qwt-dot';
      dot.setAttribute('aria-label', '跳到第 ' + (d + 1) + ' 步');
      (function (target) {
        dot.addEventListener('click', function () { show(target); });
      })(d);
      dotsBox.appendChild(dot);
    }

    live = {
      root: root,
      list: list,
      index: 0,
      opts: opts,
      target: null,
      raf: 0,
      timer: 0,
      hole: root.querySelector('.qwt-hole'),
      tip: root.querySelector('.qwt-tip'),
      mask: root.querySelector('.qwt-mask'),
      unbindClick: null,
      onKey: null,
      onResize: null
    };

    live.onKey = function (event) {
      if (!live) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); next(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); prev(); }
    };
    live.onResize = schedulePlace;

    root.querySelector('.qwt-next').addEventListener('click', next);
    root.querySelector('.qwt-prev').addEventListener('click', prev);
    root.querySelector('.qwt-skip').addEventListener('click', function () { close(true); });
    root.querySelector('.qwt-close').addEventListener('click', function () { close(true); });

    on(global, 'keydown', live.onKey, true);
    on(global, 'resize', live.onResize);
    on(global, 'scroll', live.onResize, true);
    // 页面里动态出现/消失的区块（比如答题区）会让坐标漂移，低频重算兜底
    live.timer = setInterval(place, 700);

    show(0);
    if (typeof opts.onOpen === 'function') {
      try { opts.onOpen(); } catch (err) { /* 忽略 */ }
    }
    return root;
  }

  /** 只在没看过的时候自动跑一次 */
  function autoStart(key, steps, options) {
    if (seen(key)) return null;
    var opts = options || {};
    opts.key = key;
    return start(steps, opts);
  }

  var API = {
    start: start,
    autoStart: autoStart,
    close: close,
    seen: seen,
    markSeen: markSeen,
    reset: reset,
    isOpen: function () { return !!live; }
  };

  global.QWTour = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);