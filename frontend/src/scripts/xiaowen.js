/**
 * 问数星途 · 小问形象控制器（QWXiaowen）
 * ---------------------------------------------------------------------------
 * 小问是平台的伴学智能体：一只会变表情的奶酪猫。这个模块负责两件事。
 *
 * 一、形象状态机
 *   30 个状态：12 个带透明通道的动图（idle / wave / listen / thinking / explain / …）
 *   + 18 个静帧表情（proud / sad / shy / sleepy / …）。
 *   页面上任何写了 data-qw-xiaowen 的 <img> 都会自动跟着全局状态换图，
 *   所以顶栏品牌图、对话头像、右下角吉祥物永远和「小问现在在干什么」保持一致。
 *     小问形象状态：QWXiaowen.set('thinking')
 *     临时表情（到点自动回到基准状态）：QWXiaowen.flash('celebrate', 2200)
 *     按语义反应（答对 / 答错 / 卡住 / 打招呼）：QWXiaowen.react('correct')
 *
 * 二、语音唤醒
 *   喊一声「小问」它就答应：连续监听 → 命中唤醒词 → 播报应答 + 切 wave 状态 +
 *   抛出 qw-xiaowen-wake 事件（右下角小聊天框会自动展开）。
 *   带上下文也能用：「小问，这一步为什么这么算」会把后半句直接当成问题转发。
 *   浏览器权限、抬手即用：
 *     QWXiaowen.wake.enable()   // 必须由用户点击触发
 *     QWXiaowen.wake.disable()
 *
 * 浏览器不支持语音、或在没有 DOM 的轻量测试环境里运行时，全部降级为静默 no-op，绝不抛错。
 */
(function () {
  'use strict';

  var ASSET_BASE = '/assets/images/mascot/xiaowen/';

  // 有动图的 12 个状态（透明通道 WebP）
  var ANIM = {
    idle: 1, wave: 1, expect: 1, listen: 1, thinking: 1, curious: 1, confused: 1,
    explain: 1, aha: 1, celebrate: 1, comfort: 1, encourage: 1
  };
  // 有静帧的状态（动图的 12 个里只有 4 个配了静帧，其余用 idle 兜底）
  var STILL = {
    idle: 1, curious: 1, thinking: 1, focused: 1, puzzled: 1, celebrate: 1,
    angry: 1, awkward: 1, cry: 1, determined: 1, discouraged: 1, like: 1, nervous: 1,
    proud: 1, sad: 1, scared: 1, shocked: 1, shy: 1, sleepy: 1, sorry: 1, speechless: 1, wronged: 1
  };

  var STATES = {
    idle: { label: '待机', tip: '小问在旁边待命', anim: 1 },
    wave: { label: '打招呼', tip: '小问在跟你打招呼', anim: 1 },
    expect: { label: '等待互动', tip: '等你说说自己的想法', anim: 1 },
    listen: { label: '聆听中', tip: '小问正在听你说', anim: 1 },
    thinking: { label: '思考中', tip: '小问正在想办法', anim: 1 },
    curious: { label: '好奇', tip: '这个问题有点意思', anim: 1 },
    confused: { label: '没听懂', tip: '换个说法再讲一次', anim: 1 },
    explain: { label: '讲解中', tip: '小问正在讲这一步', anim: 1 },
    aha: { label: '顿悟', tip: '原来是这样！', anim: 1 },
    celebrate: { label: '庆祝', tip: '答对啦，太棒了', anim: 1 },
    encourage: { label: '加油', tip: '差一点，再来一次', anim: 1 },
    comfort: { label: '安慰', tip: '错了也没关系，我们一起看', anim: 1 },
    focused: { label: '专注' },
    puzzled: { label: '疑惑' },
    like: { label: '点赞' },
    proud: { label: '骄傲' },
    sad: { label: '难过' },
    shy: { label: '害羞' },
    sleepy: { label: '困了' },
    sorry: { label: '抱歉' },
    shocked: { label: '惊讶' },
    nervous: { label: '紧张' },
    discouraged: { label: '泄气' },
    determined: { label: '下定决心' },
    awkward: { label: '尴尬' },
    cry: { label: '哭了' },
    scared: { label: '害怕' },
    speechless: { label: '无语' },
    wronged: { label: '委屈' },
    angry: { label: '生气' }
  };

  // 语义 → 表情：调用方不用记状态名，直接说「学生答对了」就行
  var REACTIONS = {
    greet: { state: 'wave', hold: 2600 },
    correct: { state: 'celebrate', hold: 2600 },
    wrong: { state: 'comfort', hold: 2600 },
    retry: { state: 'encourage', hold: 2400 },
    stuck: { state: 'puzzled', hold: 2600 },
    lost: { state: 'confused', hold: 2600 },
    idea: { state: 'aha', hold: 2400 },
    done: { state: 'proud', hold: 2600 },
    tired: { state: 'sleepy', hold: 3000 },
    sorry: { state: 'sorry', hold: 2400 },
    praise: { state: 'like', hold: 2000 },
    panic: { state: 'nervous', hold: 2400 }
  };

  var current = 'idle';
  var base = 'idle';
  var generation = 0;
  var handlers = { state: [], wake: [] };

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function all(sel, scope) { return (scope || document).querySelectorAll(sel); }

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) { return false; }
  }

  function known(name) { return Object.prototype.hasOwnProperty.call(STATES, name) ? name : 'idle'; }

  // 动图优先（更生动）；系统开了「减少动态效果」或调用方明确要静帧时退回 PNG
  function url(name, options) {
    var state = known(name);
    var opts = options || {};
    if (ANIM[state] && !opts.still && !reducedMotion()) return ASSET_BASE + state + '.webp';
    if (STILL[state]) return ASSET_BASE + state + '.png';
    return ASSET_BASE + 'idle.png';
  }

  function safeEvent(type, detail) {
    try {
      if (typeof window.CustomEvent === 'function') return new window.CustomEvent(type, { detail: detail });
      if (document.createEvent) {
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(type, false, false, detail);
        return evt;
      }
    } catch (err) { /* 轻量测试环境没有事件构造器 */ }
    return { type: type, detail: detail };
  }

  function fire(type, detail) {
    var list = handlers[type] || [];
    for (var i = 0; i < list.length; i += 1) {
      try { list[i](detail); } catch (err) { /* 单个监听器出错不影响其他人 */ }
    }
    var name = type === 'state' ? 'qw-xiaowen-state' : 'qw-xiaowen-wake';
    try { document.dispatchEvent(safeEvent(name, detail)); } catch (err) { /* 忽略 */ }
  }

  function attrOf(el) {
    if (el.dataset && el.dataset.qwXiaowen) return el.dataset.qwXiaowen;
    if (el.getAttribute) {
      var value = el.getAttribute('data-qw-xiaowen');
      if (value) return value;
    }
    return '';
  }

  function paintElement(el) {
    var state = current;
    var wanted = attrOf(el);
    // data-qw-xiaowen="follow"（或留空）表示跟随全局状态；写死状态名则固定不变
    if (wanted && wanted !== 'follow') state = known(wanted);
    var still = el.dataset ? el.dataset.qwXiaowenStill === '1' : false;
    var next = url(state, { still: still });
    // 状态一定要标出来：CSS 和外部脚本都靠 data-qw-xiaowen-state 判断小问在干什么，
    // 哪怕这次 src 没变（初始就是 idle），也要把标记写上。
    if (el.dataset) el.dataset.qwXiaowenState = state;
    if (el.getAttribute && el.getAttribute('src') === next) return;
    el.setAttribute('src', next);
  }

  function paint() {
    var list = all('[data-qw-xiaowen]');
    for (var i = 0; i < list.length; i += 1) {
      try { paintElement(list[i]); } catch (err) { /* 忽略单个元素 */ }
    }
    fire('state', { state: current, label: (STATES[current] || {}).label || '', tip: (STATES[current] || {}).tip || '' });
  }

  function scan(root) {
    var scope = root || document;
    if (scope.querySelectorAll) {
      var list = scope.querySelectorAll('[data-qw-xiaowen]');
      for (var i = 0; i < list.length; i += 1) {
        try { paintElement(list[i]); } catch (err) { /* 忽略 */ }
      }
    }
    return window.QWXiaowen;
  }

  // 持久状态：一直保持，直到下一次 set
  function set(name, options) {
    base = known(name);
    generation += 1;
    current = base;
    paint();
    var opts = options || {};
    if (opts.then !== undefined) {
      // set('thinking', { then: 'expect' }) ：先思考，再自动回到等待互动
      var token = generation;
      setTimeout(function () { if (token === generation) set(opts.then); }, opts.hold || 1200);
    }
    return current;
  }

  // 临时表情：到点自动回到基准状态（不会覆盖调用方设定的基准）
  function flash(name, hold) {
    var next = known(name);
    var token = ++generation;
    current = next;
    paint();
    setTimeout(function () {
      if (token !== generation) return;
      current = base;
      paint();
    }, hold || 1800);
    return next;
  }

  function react(kind) {
    var preset = REACTIONS[kind];
    if (!preset) return null;
    return flash(preset.state, preset.hold);
  }

  // 边讲边摆出「讲解中」的表情；念完回到基准状态
  function say(text, options) {
    var opts = options || {};
    var voice = window.QWVoice || null;
    if (!voice || !voice.speakSupported) {
      if (typeof opts.onEnd === 'function') opts.onEnd();
      return false;
    }
    var token = ++generation;
    current = known(opts.state || 'explain');
    paint();
    var done = false;
    function finish() {
      // 播报过程中调用方又改了状态的话，就把控制权让给它，不要硬拽回旧状态
      if (token === generation) {
        current = base;
        paint();
      }
      if (done) return;
      done = true;
      if (typeof opts.onEnd === 'function') opts.onEnd();
    }
    var started = voice.speak(text, { onEnd: finish });
    if (!started) finish();
    // 兜底：有的语音实现不回调 onEnd，按字数估个上限，免得一直卡在「讲解中」
    setTimeout(finish, 1500 + String(text || '').length * 320);
    return started;
  }

  // ---------------------------------------------------------------------------
  // 语音唤醒：喊「小问」就答应
  // ---------------------------------------------------------------------------
  var Recognition = null;
  try {
    Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  } catch (err) { Recognition = null; }

  // 语音识别常把「小问」听成同音字，这里一并认下（宁可多认几个近音，也别喊三遍没反应）
  var WAKE_PATTERN = /(小问|小文|小雯|晓雯|小纹|小问儿)/;
  var WAKE_TRIMMER = /^[\s，,。.、！!？?~～:：-]+/;
  var wakeOn = false;
  var wakePaused = false;
  var recog = null;
  var restartTimer = null;
  var failures = 0;
  var lastHit = 0;

  function pickLang() {
    var nav = window.navigator || {};
    return /^zh/i.test(nav.language || '') ? 'zh-CN' : 'zh-CN';
  }

  function stopInstance() {
    var instance = recog;
    recog = null;
    if (!instance) return;
    instance.onend = null;
    instance.onresult = null;
    instance.onerror = null;
    try { instance.stop(); } catch (err) { /* 已经停了 */ }
  }

  function scheduleRestart(delay) {
    if (!wakeOn || wakePaused || restartTimer) return;
    restartTimer = setTimeout(function () {
      restartTimer = null;
      startInstance();
    }, delay || 400);
  }

  function speakable() {
    return !!(window.QWVoice && window.QWVoice.isSpeaking && window.QWVoice.isSpeaking());
  }

  function handleWake(phrase, text, transcript) {
    var now = Date.now();
    if (now - lastHit < 1600) return;
    lastHit = now;
    stopInstance();
    fire('wake', { hit: true, phrase: phrase, text: text, transcript: transcript });
    var reply = text ? '好，我们一起看看' : '我在呀！有什么想一起想的？';
    say(reply, {
      state: text ? 'listen' : 'wave',
      onEnd: function () { scheduleRestart(600); }
    });
    // say() 的 onEnd 不一定触发（语音引擎差异），这里再兜一层
    setTimeout(function () { scheduleRestart(600); }, 4200);
  }

  function onResult(event) {
    if (!wakeOn || wakePaused) return;
    // 小问自己说话的时候先别听，免得把自己的声音当成唤醒词
    if (speakable()) return;
    var results = (event && event.results) || [];
    var from = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
    for (var i = from; i < results.length; i += 1) {
      var item = results[i];
      var text = (item && item[0] && item[0].transcript) || '';
      if (!text) continue;
      var match = WAKE_PATTERN.exec(text);
      if (!match) continue;
      var command = text.slice(match.index + match[0].length).replace(WAKE_TRIMMER, '').trim();
      handleWake(match[0], command.length >= 2 ? command : '', text.trim());
      return;
    }
  }

  function startInstance() {
    if (!wakeOn || wakePaused || recog || !Recognition) return;
    var instance;
    try { instance = new Recognition(); } catch (err) { return; }
    recog = instance;
    try {
      instance.lang = pickLang();
      instance.continuous = true;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
    } catch (err) { /* 某些实现这几个属性只读 */ }

    instance.onresult = onResult;
    instance.onerror = function (event) {
      var code = (event && event.error) || 'unknown';
      if (code === 'not-allowed' || code === 'service-not-allowed') disable(code);
      else if (code === 'network' || code === 'audio-capture') failures += 1;
    };
    instance.onend = function () {
      if (recog !== instance) return;
      recog = null;
      if (!wakeOn || wakePaused) return;
      if (failures > 4) { disable('unstable'); return; }
      scheduleRestart(420);
    };
    try {
      instance.start();
    } catch (err) {
      recog = null;
      scheduleRestart(900);
    }
  }

  function enable() {
    if (!Recognition) return false;
    if (wakeOn) return true;
    wakeOn = true;
    wakePaused = false;
    failures = 0;
    setAwakeClass(true);
    startInstance();
    fire('wake', { phrase: '', text: '', enabled: true, supported: true });
    return true;
  }

  function disable(reason) {
    wakeOn = false;
    setAwakeClass(false);
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    stopInstance();
    fire('wake', { phrase: '', text: '', enabled: false, reason: reason || 'off', supported: !!Recognition });
    return false;
  }

  function setAwakeClass(on) {
    try {
      if (document.body && document.body.classList) document.body.classList.toggle('qw-xiaowen-awake', !!on);
    } catch (err) { /* 忽略 */ }
  }

  function pause() {
    wakePaused = true;
    stopInstance();
  }

  function resume(delay) {
    setTimeout(function () {
      wakePaused = false;
      startInstance();
    }, Math.max(0, delay || 0));
  }

  var wake = {
    supported: !!Recognition,
    enable: enable,
    disable: disable,
    toggle: function () { return wakeOn ? disable('off') : enable(); },
    isOn: function () { return wakeOn; },
    isPaused: function () { return wakePaused; },
    pause: pause,
    resume: resume,
    pattern: WAKE_PATTERN
  };

  window.QWXiaowen = {
    ASSET_BASE: ASSET_BASE,
    STATES: STATES,
    REACTIONS: REACTIONS,
    url: url,
    state: function () { return current; },
    base: function () { return base; },
    set: set,
    flash: flash,
    react: react,
    say: say,
    scan: scan,
    paint: paint,
    label: function (name) { return (STATES[known(name)] || {}).label || ''; },
    tip: function (name) { return (STATES[known(name)] || {}).tip || ''; },
    reducedMotion: reducedMotion,
    wake: wake,
    on: function (type, handler) {
      if (handlers[type] && typeof handler === 'function') handlers[type].push(handler);
      return window.QWXiaowen;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }
})();