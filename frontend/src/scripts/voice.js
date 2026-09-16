/**
 * 问数星途 · 语音对话模块（QWVoice）
 * ---------------------------------------------------------------------------
 * 让学生「按住说话」和伴学导师交流：听 = Web Speech Recognition，说 = Speech Synthesis。
 * 全部走浏览器原生能力，不依赖后端；浏览器不支持时特性检测为 false，
 * 调用方自动回退到键盘输入，页面绝不报错（轻量 DOM 测试环境同样安全）。
 *
 * 用法：
 *   if (QWVoice.recognizeSupported) QWVoice.listen({ onInterim, onEnd });
 *   if (QWVoice.speakSupported) QWVoice.speak('你好呀，小宇航员');
 *   QWVoice.onVoices(list => console.log(list));   // 声音列表就绪
 *   QWVoice.onChange(state => console.log(state.listening, state.speaking));
 */
(function () {
  'use strict';

  var Recognition = null;
  try {
    Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  } catch (err) { Recognition = null; }

  var synth = null;
  try { synth = window.speechSynthesis || null; } catch (err) { synth = null; }

  var recognizeSupported = !!Recognition;
  var speakSupported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';

  var VOICE_KEY = 'qw_voice';
  var RATE_KEY = 'qw_voice_rate';

  var listeners = [];
  var voiceListeners = [];
  var listening = false;
  var speaking = false;
  var current = null;
  var cachedVoices = [];

  function emit() {
    var state = { listening: listening, speaking: speaking };
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](state); } catch (err) { /* 单个监听器出错不影响其他 */ }
    }
  }

  function pickLang() {
    var nav = window.navigator || {};
    var lang = nav.language || nav.userLanguage || 'zh-CN';
    return /^zh/i.test(lang) ? 'zh-CN' : lang;
  }

  function readPref(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (err) { return fallback; }
  }

  function writePref(key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (err) { /* 隐私模式忽略 */ }
  }

  // ---------------------------------------------------------------------------
  // 声音列表：浏览器首次可能返回空数组，靠 voiceschanged 事件补上
  // ---------------------------------------------------------------------------
  function isZh(voice) { return /^zh/i.test(voice && voice.lang ? voice.lang : ''); }

  function refreshVoices() {
    if (!speakSupported) return cachedVoices;
    try { cachedVoices = synth.getVoices() || []; } catch (err) { cachedVoices = []; }
    return cachedVoices;
  }

  function voiceList() {
    if (!cachedVoices.length) refreshVoices();
    // 中文优先、本地优先，方便学生直接挑到能用的声音
    return cachedVoices.slice().sort(function (a, b) {
      var az = isZh(a) ? 0 : 1;
      var bz = isZh(b) ? 0 : 1;
      if (az !== bz) return az - bz;
      if (!!a.localService !== !!b.localService) return a.localService ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    }).map(function (voice) {
      return {
        uri: voice.voiceURI || voice.name,
        name: voice.name,
        lang: voice.lang,
        local: !!voice.localService,
        zh: isZh(voice)
      };
    });
  }

  function findVoice(uri) {
    if (!uri) return null;
    for (var i = 0; i < cachedVoices.length; i += 1) {
      var voice = cachedVoices[i];
      if ((voice.voiceURI || voice.name) === uri || voice.name === uri) return voice;
    }
    return null;
  }

  function currentVoice() {
    var saved = findVoice(readPref(VOICE_KEY, ''));
    if (saved) return saved;
    // 没挑过就自动挑一个最合适的中文声音，避免默认英文声音念中文
    if (!cachedVoices.length) refreshVoices();
    for (var i = 0; i < cachedVoices.length; i += 1) {
      if (isZh(cachedVoices[i])) return cachedVoices[i];
    }
    return null;
  }

  function setVoice(uri) {
    writePref(VOICE_KEY, uri || '');
    return currentVoice();
  }

  function rate() {
    var value = parseFloat(readPref(RATE_KEY, '1'));
    if (!value || value < 0.5 || value > 1.6) value = 1;
    return value;
  }

  function setRate(value) {
    var next = Math.max(0.5, Math.min(1.6, parseFloat(value) || 1));
    writePref(RATE_KEY, next);
    return next;
  }

  function emitVoices() {
    var list = voiceList();
    for (var i = 0; i < voiceListeners.length; i += 1) {
      try { voiceListeners[i](list); } catch (err) { /* 忽略 */ }
    }
  }

  function onVoices(cb) {
    if (typeof cb === 'function') {
      voiceListeners.push(cb);
      if (cachedVoices.length) cb(voiceList());
    }
    return window.QWVoice;
  }

  if (speakSupported) {
    refreshVoices();
    try {
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', function () { refreshVoices(); emitVoices(); });
      } else {
        synth.onvoiceschanged = function () { refreshVoices(); emitVoices(); };
      }
    } catch (err) { /* 部分实现不支持事件，保持现状 */ }
  }

  // 念出来之前先洗一遍：去掉 emoji、Markdown 符号，把换行变成停顿
  var EMOJI = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF\uFE0F]/g;
  function cleanText(text) {
    return String(text == null ? '' : text)
      .replace(EMOJI, '')
      .replace(/[*_`#>~|]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '。')
      .replace(/\n/g, '，')
      .replace(/^[，。、\s]+/, '')
      .trim();
  }

  function speak(text, options) {
    if (!speakSupported) return false;
    var opts = options || {};
    var content = cleanText(text);
    if (!content) return false;
    try { synth.cancel(); } catch (err) { /* 忽略 */ }

    var utter = new window.SpeechSynthesisUtterance(content);
    var voice = currentVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang || opts.lang || pickLang();
    } else {
      utter.lang = opts.lang || pickLang();
    }
    utter.rate = typeof opts.rate === 'number' ? opts.rate : rate();
    utter.pitch = typeof opts.pitch === 'number' ? opts.pitch : 1.02;
    utter.volume = typeof opts.volume === 'number' ? opts.volume : 1;
    utter.onend = function () {
      speaking = false;
      emit();
      if (opts.onEnd) opts.onEnd();
    };
    utter.onerror = function () {
      speaking = false;
      emit();
      if (opts.onEnd) opts.onEnd();
    };
    try {
      synth.speak(utter);
      speaking = true;
      emit();
      return true;
    } catch (err) {
      speaking = false;
      return false;
    }
  }

  function stopSpeaking() {
    if (!speakSupported) return;
    try { synth.cancel(); } catch (err) { /* 忽略 */ }
    speaking = false;
    emit();
  }

  // 按住说话：返回 { stop() }，不支持时返回 null
  function listen(options) {
    if (!recognizeSupported || listening) return null;
    var opts = options || {};
    var recog;
    try { recog = new Recognition(); } catch (err) { return null; }

    var finalText = '';
    var closed = false;

    function close(reason) {
      if (closed) return;
      closed = true;
      listening = false;
      current = null;
      emit();
      if (opts.onEnd) opts.onEnd(finalText, reason);
    }

    try {
      recog.lang = opts.lang || pickLang();
      recog.continuous = false;
      recog.interimResults = !!opts.interim;
      recog.maxAlternatives = 1;
    } catch (err) { /* 部分实现对这几个属性只读，忽略即可 */ }

    recog.onstart = function () {
      listening = true;
      emit();
      if (opts.onStart) opts.onStart();
    };
    recog.onresult = function (event) {
      var results = (event && event.results) || [];
      var parts = [];
      for (var i = 0; i < results.length; i += 1) {
        var item = results[i];
        var first = item && item[0];
        if (first && first.transcript) parts.push(first.transcript);
      }
      finalText = parts.join(' ').trim();
      if (opts.onInterim) opts.onInterim(finalText);
    };
    recog.onerror = function (event) {
      var code = (event && event.error) || 'unknown';
      if (opts.onError) opts.onError(code);
      close(code);
    };
    recog.onend = function () { close('end'); };

    try { recog.start(); } catch (err) { return null; }

    current = {
      stop: function () { try { recog.stop(); } catch (err) { close('stop'); } }
    };
    return current;
  }

  function stopListening() {
    if (current && current.stop) current.stop();
  }

  window.QWVoice = {
    recognizeSupported: recognizeSupported,
    speakSupported: speakSupported,
    cleanText: cleanText,
    speak: speak,
    stopSpeaking: stopSpeaking,
    listen: listen,
    stopListening: stopListening,
    voiceList: voiceList,
    currentVoice: function () { return currentVoice(); },
    setVoice: setVoice,
    rate: rate,
    setRate: setRate,
    onVoices: onVoices,
    isListening: function () { return listening; },
    isSpeaking: function () { return speaking; },
    state: function () { return { listening: listening, speaking: speaking }; },
    onChange: function (cb) {
      if (typeof cb === 'function') listeners.push(cb);
      return window.QWVoice;
    }
  };
})();