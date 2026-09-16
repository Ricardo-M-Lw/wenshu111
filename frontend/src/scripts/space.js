/**
 * 问数星途 · 主题开关与星野脚本
 * —— 白天探索模式 / 夜航护眼模式双主题；负责深空星野的星星生成。
 * —— 需与 space.css 配套；在 </body> 前引入，DOM 就绪后自动生效。
 */
(function () {
  'use strict';

  var KEY = 'qw_mode';
  var STAR_COUNT_DEEP = 74;
  var STAR_COUNT_NIGHT = 58;

  var listeners = [];

  function readMode() {
    try {
      var saved = window.localStorage.getItem(KEY);
      if (saved === 'night' || saved === 'day') return saved;
    } catch (err) { /* 隐私模式下忽略 */ }
    var param = new URLSearchParams(window.location.search).get('mode');
    return param === 'night' ? 'night' : 'day';
  }

  function saveMode(mode) {
    try { window.localStorage.setItem(KEY, mode); } catch (err) { /* 忽略 */ }
  }

  function isStudentPage() {
    return window.location.pathname.indexOf('/pages/student/') !== -1;
  }

  function isDeepPage() {
    return document.body.classList.contains('qw-deep');
  }

  function fillSky(sky, count) {
    if (!sky || sky.getAttribute('data-filled') === '1') return;
    sky.setAttribute('data-filled', '1');
    // 轻量 DOM 环境（测试用）可能没有 DocumentFragment，降级为逐个挂载
    var frag = typeof document.createDocumentFragment === 'function'
      ? document.createDocumentFragment() : null;
    for (var i = 0; i < count; i += 1) {
      var star = document.createElement('i');
      var size = (Math.random() * 2.2 + 1).toFixed(1);
      star.style.cssText = 'left:' + (Math.random() * 100).toFixed(2) + '%;'
        + 'top:' + (Math.random() * 100).toFixed(2) + '%;'
        + 'width:' + size + 'px;height:' + size + 'px;'
        + '--dur:' + (Math.random() * 3.2 + 2).toFixed(1) + 's;'
        + '--delay:' + (Math.random() * 4).toFixed(1) + 's;';
      if (frag) frag.appendChild(star); else sky.appendChild(star);
    }
    if (frag) sky.appendChild(frag);
  }

  function ensureSky(count) {
    var sky = document.querySelector('.sq-sky');
    if (!sky) {
      sky = document.createElement('div');
      sky.className = 'sq-sky';
      sky.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(sky, document.body.firstChild);
    }
    fillSky(sky, count);
  }

  // ---------- 童趣宇宙装饰层：迷你星球 / 轨道 / 小火箭 / 流星 ----------
  // 全部贴着视口左右边缘摆放（固定像素），避免压到 1120px 版心内容
  var SCENE_PLANETS = [
    { c: '#FFC53D', top: '9%', edge: 'left:12px', s: 46, ring: false, delay: '0s' },
    { c: '#7C6CF5', top: '21%', edge: 'right:-20px', s: 78, ring: true, delay: '1.2s' },
    { c: '#35C5BE', top: '53%', edge: 'left:-14px', s: 44, ring: false, delay: '2.4s' },
    { c: '#FF7A59', top: '76%', edge: 'right:-12px', s: 58, ring: true, delay: '3.1s' },
    { c: '#4C7DF0', top: '13%', edge: 'right:34px', s: 26, ring: false, delay: '1.8s' }
  ];
  var SCENE_ORBITS = [
    { top: '31%', edge: 'left:-124px', s: 252 },
    { top: '59%', edge: 'right:-100px', s: 212 }
  ];
  // 星座连线：贴着视口左右边缘，避开中间版心
  var SCENE_CONSTELLATIONS = [
    { top: '6%', left: '2%', size: 170, color: 'rgba(124,108,245,.55)' },
    { top: '37%', left: '1%', size: 132, color: 'rgba(53,197,190,.50)' },
    { top: '63%', right: '2%', size: 150, color: 'rgba(255,197,61,.58)' },
    { top: '86%', left: '4%', size: 118, color: 'rgba(76,125,240,.50)' }
  ];
  // 螺旋星系：每颗星球 = 一个知识点，背景里飘几个星系更有"在宇宙里探索"的感觉
  var SCENE_GALAXIES = [
    { top: '62%', left: '-7%', size: 320, color: '#7C6CF5', tilt: -20, opacity: .34 },
    { top: '14%', right: '-9%', size: 380, color: '#4C7DF0', tilt: 14, opacity: .28 },
    { top: '90%', right: '14%', size: 220, color: '#35C5BE', tilt: -8, opacity: .22 }
  ];

  function ensureScene() {
    try {
      var scene = document.querySelector('.sq-scene');
      if (!scene) {
        scene = document.createElement('div');
        scene.className = 'sq-scene';
        scene.setAttribute('aria-hidden', 'true');
        var anchor = document.querySelector('.sq-sky');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(scene, anchor.nextSibling);
        else document.body.insertBefore(scene, document.body.firstChild);
      }
      if (scene.getAttribute('data-filled') === '1') return;
      scene.setAttribute('data-filled', '1');
      var i;
      var el;
      for (i = 0; i < SCENE_ORBITS.length; i += 1) {
        el = document.createElement('span');
        el.className = 'sq-orbit';
        el.style.cssText = 'top:' + SCENE_ORBITS[i].top + ';' + SCENE_ORBITS[i].edge + ';'
          + 'width:' + SCENE_ORBITS[i].s + 'px;height:' + SCENE_ORBITS[i].s + 'px;';
        scene.appendChild(el);
      }
      for (i = 0; i < SCENE_PLANETS.length; i += 1) {
        el = document.createElement('span');
        el.className = 'sq-mini-planet' + (SCENE_PLANETS[i].ring ? ' has-ring' : '');
        el.style.cssText = '--c:' + SCENE_PLANETS[i].c + ';--delay:' + SCENE_PLANETS[i].delay + ';'
          + 'top:' + SCENE_PLANETS[i].top + ';' + SCENE_PLANETS[i].edge + ';'
          + 'width:' + SCENE_PLANETS[i].s + 'px;height:' + SCENE_PLANETS[i].s + 'px;';
        scene.appendChild(el);
      }
      el = document.createElement('span');
      el.className = 'sq-mini-rocket';
      el.textContent = '🚀';
      el.style.cssText = 'top:23%;left:16px;';
      scene.appendChild(el);
      el = document.createElement('span');
      el.className = 'sq-shoot';
      el.style.cssText = 'top:5%;left:9%;';
      scene.appendChild(el);
      el = document.createElement('span');
      el.className = 'sq-shoot';
      el.style.cssText = 'top:34%;left:52%;animation-delay:4.2s;';
      scene.appendChild(el);

      // 星座连线（QWSpaceArt）：让背景多一点「能被认出来」的图案
      const WSA = window.QWSpaceArt;
      if (WSA && typeof WSA.galaxy === 'function') {
        for (i = 0; i < SCENE_GALAXIES.length; i += 1) {
          const g = SCENE_GALAXIES[i];
          const node = document.createElement('span');
          node.className = 'sq-galaxy';
          let pos = 'top:' + g.top + ';opacity:' + g.opacity + ';';
          if (g.left) pos += 'left:' + g.left + ';';
          if (g.right) pos += 'right:' + g.right + ';';
          node.style.cssText = pos;
          node.innerHTML = WSA.galaxy({ size: g.size, color: g.color, tilt: g.tilt });
          scene.appendChild(node);
        }
      }
      if (WSA && typeof WSA.constellation === 'function') {
        const CONSTELLATIONS = SCENE_CONSTELLATIONS;
        for (i = 0; i < CONSTELLATIONS.length; i += 1) {
          const spec = CONSTELLATIONS[i];
          const node = document.createElement('span');
          node.className = 'sq-constel';
          let pos = 'top:' + spec.top + ';';
          if (spec.left) pos += 'left:' + spec.left + ';';
          if (spec.right) pos += 'right:' + spec.right + ';';
          node.style.cssText = pos;
          node.innerHTML = WSA.constellation({ size: spec.size, color: spec.color });
          scene.appendChild(node);
        }
      }
    } catch (err) { /* 轻量 DOM（测试）环境忽略装饰层 */ }
  }
  function sync(mode) {
    var label = mode === 'night' ? '🌙 护眼夜空' : '🌤 白暖白天';
    var icon = mode === 'night' ? '🌙' : '🌤';

    var toggles = document.querySelectorAll('[data-qw-theme-toggle]');
    for (var i = 0; i < toggles.length; i += 1) {
      var btn = toggles[i];
      btn.setAttribute('title', mode === 'night' ? '切换到白天探索模式' : '切换到夜航护眼模式');
      var slot = btn.querySelector('[data-qw-theme-label]');
      if (slot) slot.textContent = slot.hasAttribute('data-qw-theme-icon') ? icon : label;
      else btn.textContent = label;
    }

    var phrases = document.querySelectorAll('[data-qw-mode-phrase]');
    for (var j = 0; j < phrases.length; j += 1) {
      var attr = mode === 'night' ? 'data-night' : 'data-day';
      var text = phrases[j].getAttribute(attr);
      if (text) phrases[j].textContent = text;
    }

    var swapped = document.querySelectorAll('[data-qw-day],[data-qw-night]');
    for (var k = 0; k < swapped.length; k += 1) {
      var want = swapped[k].hasAttribute('data-qw-day') ? 'day' : 'night';
      swapped[k].hidden = want !== mode;
    }
  }

  function apply(mode, initial) {
    var night = mode === 'night';
    document.body.classList.toggle('qw-night', night);
    if (isStudentPage() && !isDeepPage()) {
      document.body.classList.add('qw-space');
      if (night) ensureSky(STAR_COUNT_NIGHT);
    } else {
      ensureSky(STAR_COUNT_DEEP);
    }
    if (isStudentPage()) ensureScene();
    document.documentElement.setAttribute('data-qw-mode', mode);
    sync(mode);
    if (!initial) {
      for (var i = 0; i < listeners.length; i += 1) listeners[i](mode);
      document.dispatchEvent(new CustomEvent('qw-mode-change', { detail: { mode: mode } }));
    }
  }

  function setMode(mode) {
    var next = mode === 'night' ? 'night' : 'day';
    if (next === readMode()) { sync(next); return next; }
    saveMode(next);
    apply(next, false);
    return next;
  }

  var API = {
    mode: readMode,
    isNight: function () { return readMode() === 'night'; },
    label: function () { return readMode() === 'night' ? '🌙 护眼夜空' : '🌤 白暖白天'; },
    setMode: setMode,
    toggle: function () { return setMode(readMode() === 'night' ? 'day' : 'night'); },
    sync: function () { sync(readMode()); },
    onChange: function (cb) { if (typeof cb === 'function') listeners.push(cb); return API; }
  };
  window.QWSpace = API;

  document.addEventListener('click', function (event) {
    var node = event.target;
    var btn = node && node.closest ? node.closest('[data-qw-theme-toggle]') : null;
    if (!btn) return;
    event.preventDefault();
    API.toggle();
  });

  // ---------------------------------------------------------------------------
  // 断网提示：教室网络掉线时页面还能看，但讲题 / 对话 / 提交答案都会失败，
  // 与其让学生对着转圈的按钮干等，不如直接告诉他发生了什么。
  // 恢复联网后横幅自动收起，并给一次轻量的 /api/health 探活。
  // ---------------------------------------------------------------------------
  var netBound = false;

  function netBanner() {
    var node = document.querySelector('.sq-net-banner');
    if (!node) {
      node = document.createElement('div');
      node.className = 'sq-net-banner';
      node.setAttribute('role', 'status');
      node.innerHTML = '<span aria-hidden="true">📡</span>'
        + '<div><b>网络好像断了</b><i>页面还能看，但讲题、对话和提交答案会失败，连上网就自动恢复。</i></div>';
      document.body.appendChild(node);
    }
    return node;
  }

  function syncNet() {
    var offline = !!(window.navigator && window.navigator.onLine === false);
    var node = netBanner();
    node.classList.toggle('show', offline);
  }

  function bindNet() {
    if (netBound || typeof window.addEventListener !== 'function') return;
    netBound = true;
    window.addEventListener('offline', syncNet);
    window.addEventListener('online', function () {
      syncNet();
      // 顺手探一下后端是不是也活着：连着 WiFi 但后端挂了是很常见的情况
      if (typeof window.fetch === 'function') {
        window.fetch('/api/health', { cache: 'no-store' }).catch(function () {
          var node = netBanner();
          node.classList.add('show');
          node.querySelector('b').textContent = '连上了网，但连不上服务';
        });
      }
    });
    syncNet();
  }

  function boot() { apply(readMode(), true); bindNet(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();