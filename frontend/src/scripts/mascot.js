/**
 * 问数星途 · 小问吉祥物（奶酪猫）
 * ---------------------------------------------------------------------------
 * 每个学生端页面右下角都常驻一只奶酪小猫：
 *   · 点一下小猫 → 展开一个小聊天框，随时能问小问；
 *   · 再点一下（或按 Esc、点 ✕）→ 收起来，不打扰看题；
 *   · 形象跟着 QWXiaowen 的全局状态走：你说话时它竖耳朵听，等大模型时它转眼睛；
 *   · 打开语音唤醒后，喊一声「小问」它会自己冒出来答应，后半句直接当成问题发出去；
 *   · 页面没有引入 xiaowen.js / voice.js / agent.js 时按需按顺序补加载，加载失败也不会报错。
 */
(function () {
  'use strict';

  if (window.__qwMascotMounted) return;
  window.__qwMascotMounted = true;

  var agent = null;
  var mounting = false;
  var opened = false;
  var panel = null;
  var btn = null;
  var bubble = null;
  var waiting = [];   // 唤醒时喊出来的问题，等智能体挂载好再补发

  function qs(sel) { return document.querySelector(sel); }

  function faceUrl(state) {
    var xiaowen = window.QWXiaowen;
    if (xiaowen) return xiaowen.url(state || 'idle');
    return '/assets/images/mascot/xiaowen/idle.png';
  }

  function kpFromUrl() {
    try {
      var kp = new URLSearchParams(window.location.search).get('kp');
      return kp || 'kp1';
    } catch (err) { return 'kp1'; }
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'qw-mascot';
    wrap.innerHTML = ''
      + '<div class="qw-mascot-panel" id="qwMascotPanel" role="dialog" aria-label="小问快问" hidden>'
      + '  <header class="qw-mascot-head">'
      + '    <span class="qw-mascot-face"><img src="' + faceUrl('idle') + '" data-qw-xiaowen="follow" alt=""></span>'
      + '    <div class="qw-mascot-id"><b>小问快问</b><i>随时问我，但绝不直接说答案</i></div>'
      + '    <button type="button" class="qw-mascot-wake" id="qwMascotWake" aria-pressed="false" hidden>🔔</button>'
      + '    <button type="button" class="qw-mascot-close" id="qwMascotClose" aria-label="收起小问">✕</button>'
      + '  </header>'
      + '  <div class="qw-mascot-body" id="qwMascotBody"></div>'
      + '</div>'
      + '<button type="button" class="qw-mascot-btn" id="qwMascotBtn" aria-label="点我问小问" aria-expanded="false" aria-controls="qwMascotPanel">'
      + '  <img src="' + faceUrl('idle') + '" data-qw-xiaowen="follow" alt="小问">'
      + '  <span class="qw-mascot-bubble" id="qwMascotBubble">有问题？点我呀</span>'
      + '</button>';
    document.body.appendChild(wrap);
    if (window.QWXiaowen) window.QWXiaowen.scan(wrap);
    return wrap;
  }

  function say(text, hold) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove('is-hidden');
    clearTimeout(bubble.__qwTimer);
    bubble.__qwTimer = setTimeout(function () { bubble.classList.add('is-hidden'); }, hold || 9000);
  }

  // 按顺序补加载脚本：xiaowen.js 要先于 agent.js，agent.js 要在 voice.js 之后
  function ensureScripts(sources, done) {
    if (!sources.length) { done(); return; }
    var head = document.head || document.body;
    var index = 0;
    function next() {
      if (index >= sources.length) { done(); return; }
      var script = document.createElement('script');
      script.src = sources[index];
      index += 1;
      var settled = false;
      function step() { if (settled) return; settled = true; next(); }
      script.onload = step;
      script.onerror = step;
      head.appendChild(script);
    }
    next();
  }

  function flushWaiting() {
    if (!agent || !agent.send || !waiting.length) return;
    while (waiting.length) agent.send(waiting.shift());
  }

  function mountAgent() {
    if (agent || mounting) return;
    mounting = true;
    var missing = [];
    if (!window.QWXiaowen) missing.push('/src/scripts/xiaowen.js');
    if (!window.QWVoice) missing.push('/src/scripts/voice.js');
    if (!window.QWAgent) missing.push('/src/scripts/agent.js');

    ensureScripts(missing, function () {
      mounting = false;
      var body = qs('#qwMascotBody');
      if (!window.QWAgent) {
        if (body) body.innerHTML = '<p class="qw-mascot-fallback">小问这会儿没在线，稍后再点我试试～</p>';
        return;
      }
      agent = window.QWAgent.mount({
        root: '#qwMascotBody',
        kpId: kpFromUrl(),
        stepIndex: 0,
        compact: true,
        greeting: true
      });
      if (window.QWXiaowen) window.QWXiaowen.scan(qs('#qwMascotBody'));
      flushWaiting();
    });
  }

  // 唤醒时喊出来的问题：小问要先出声，再让智能体接着回答
  function speakBack() {
    var voice = window.QWVoice;
    if (voice && voice.speakSupported) {
      voice.speak('我在呀！有什么想一起想的？');
    }
  }

  function openPanel(silent) {
    if (!panel) return;
    panel.hidden = false;
    opened = true;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (bubble) bubble.hidden = true;
    mountAgent();
    if (!silent) {
      var input = qs('#qwMascotBody #qwAgentText');
      // preventScroll：别让浏览器为了露出输入框把整个小面板滚上去
      if (input) setTimeout(function () {
        try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
        if (panel.scrollTop) panel.scrollTop = 0;
      }, 140);
    }
    if (panel.scrollTop) panel.scrollTop = 0;
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    opened = false;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (agent && agent.voice && agent.voice.stop) { try { agent.voice.stop(); } catch (err) { /* 忽略 */ } }
  }

  // 语音提问就该有语音回答：唤醒进来时顺手把「语音播报」打开
  function ensureVoiceOn() {
    if (!agent || !agent.voice) return;
    if (agent.voice.isOn()) return;
    var speakBtn = qs('#qwMascotBody #qwAgentSpeak');
    if (speakBtn) speakBtn.click();
  }

  function wireWake() {
    var wakeBtn = qs('#qwMascotWake');
    var xiaowen = window.QWXiaowen;
    var wakeApi = xiaowen && xiaowen.wake;
    if (wakeBtn && wakeApi && wakeApi.supported) {
      wakeBtn.hidden = false;
      var sync = function () {
        var on = wakeApi.isOn();
        wakeBtn.classList.toggle('on', on);
        wakeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        wakeBtn.setAttribute('title', on ? '语音唤醒已开启：喊一声「小问」' : '开启语音唤醒：喊一声「小问」');
      };
      wakeBtn.addEventListener('click', function () {
        var on = wakeApi.toggle();
        sync();
        if (on) {
          if (xiaowen) xiaowen.react('greet');
          say('我听着呢～喊「小问」就行', 6000);
        } else {
          say('语音唤醒关掉了', 3000);
        }
      });
      xiaowen.on('wake', sync);
      sync();
    }

    document.addEventListener('qw-xiaowen-wake', function (event) {
      var detail = (event && event.detail) || {};
      if (!detail.hit) return;
      openPanel(true);
      var question = String(detail.text || '').trim();
      if (question) {
        say('你说：' + question, 6000);
        ensureVoiceOn();
        if (agent && agent.send) agent.send(question);
        else {
          waiting.push(question);
          setTimeout(flushWaiting, 500);
        }
      } else {
        say('我在呀～', 5000);
        speakBack();
      }
    });
  }

  function boot() {
    if (!qs('body.student-page')) return;
    build();
    panel = qs('#qwMascotPanel');
    btn = qs('#qwMascotBtn');
    bubble = qs('#qwMascotBubble');

    if (btn) {
      btn.addEventListener('click', function () { opened ? closePanel() : openPanel(); });
    }
    var closeBtn = qs('#qwMascotClose');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && opened) closePanel();
    });

    // 招呼气泡只待 8 秒，滚动页面也会自动让位，免得长期挡住内容
    if (bubble) {
      setTimeout(function () { bubble.classList.add('is-hidden'); }, 8000);
      window.addEventListener('scroll', function () { bubble.classList.add('is-hidden'); }, { passive: true });
    }

    wireWake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();