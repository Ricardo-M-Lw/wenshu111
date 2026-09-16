/**
 * 问数星途 · 星空专注计时（QWFocus）
 * ---------------------------------------------------------------------------
 * 纯前端、零依赖：10 / 15 / 20 / 25 分钟四档，进度环 + 到点双通道提醒（提示条 + 语音）。
 * 设计约束：
 *  - 只往给定的挂载点里渲染，不碰页面其它 DOM；拿不到挂载点就安静退出
 *  - 选中的时长与「今日已专注」都落在 localStorage，刷新页面不丢
 *  - 倒计时用 Date.now() 差值算，切到后台再回来不会算错
 */
(function (global) {
  'use strict';

  var MIN_KEY = 'qw_focus_min';
  var LOG_KEY = 'qw_focus_log';
  var PRESETS = [10, 15, 20, 25];
  var RING_R = 52;
  var RING_LEN = 2 * Math.PI * RING_R;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function read(key, fallback) {
    try {
      var v = global.localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (err) { return fallback; }
  }

  function write(key, value) {
    try { global.localStorage.setItem(key, value); } catch (err) { /* 隐私模式下写不进去，忽略 */ }
  }

  function loadLog() {
    try {
      var raw = JSON.parse(read(LOG_KEY, '{}'));
      if (raw && raw.date === todayKey()) return { date: raw.date, seconds: Number(raw.seconds) || 0 };
    } catch (err) { /* 脏数据当没存过 */ }
    return { date: todayKey(), seconds: 0 };
  }

  function saveLog(log) { write(LOG_KEY, JSON.stringify(log)); }

  function fmt(seconds) {
    var s = Math.max(0, Math.round(seconds));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  function render(host) {
    host.classList.add('sq-focus');
    host.innerHTML = ''
      + '<div class="sq-focus-row">'
      + '  <div class="sq-focus-ring">'
      + '    <svg viewBox="0 0 120 120" aria-hidden="true">'
      + '      <circle class="sf-track" cx="60" cy="60" r="' + RING_R + '"/>'
      + '      <circle class="sf-bar" cx="60" cy="60" r="' + RING_R + '"'
      + '        stroke-dasharray="' + RING_LEN.toFixed(1) + '" stroke-dashoffset="' + RING_LEN.toFixed(1) + '"/>'
      + '    </svg>'
      + '    <b class="sq-focus-time">25:00</b>'
      + '  </div>'
      + '  <div class="sq-focus-side">'
      + '    <div class="sq-focus-presets">'
      + PRESETS.map(function (m) {
          return '<button type="button" data-min="' + m + '">' + m + ' 分</button>';
        }).join('')
      + '    </div>'
      + '    <button type="button" class="sq-focus-btn">开始专注</button>'
      + '  </div>'
      + '</div>'
      + '<p class="sq-focus-tip">今日已专注 <b>0</b> 分钟 · 到点会提醒你眺望远方</p>';
  }

  /**
   * 把计时器挂到某个容器上
   * @param {Element} host 挂载点（例如首页侧栏的一张卡片）
   * @returns {Object|null} 控制器；挂载点不可用时返回 null
   */
  function mount(host) {
    if (!host || !host.appendChild || typeof global.setInterval !== 'function') return null;
    if (host.getAttribute && host.getAttribute('data-qw-focus-ready') === '1') return null;

    render(host);
    if (host.setAttribute) host.setAttribute('data-qw-focus-ready', '1');
    host.classList.add('qw-dust-host');

    var timeNode = host.querySelector('.sq-focus-time');
    var barNode = host.querySelector('.sf-bar');
    var btnNode = host.querySelector('.sq-focus-btn');
    var tipNode = host.querySelector('.sq-focus-tip b');
    var presetNodes = [].slice.call(host.querySelectorAll('.sq-focus-presets button'));

    var log = loadLog();
    var minutes = PRESETS.indexOf(Number(read(MIN_KEY, 25))) >= 0 ? Number(read(MIN_KEY, 25)) : 25;
    var running = false;
    var deadline = 0;
    var left = minutes * 60;
    var timer = null;

    function paint() {
      if (timeNode) timeNode.textContent = fmt(left);
      if (barNode) {
        var done = 1 - left / (minutes * 60);
        barNode.setAttribute('stroke-dashoffset', (RING_LEN * Math.max(0, Math.min(1, done))).toFixed(1));
      }
      if (btnNode) btnNode.textContent = running ? '暂停一下' : (left < minutes * 60 ? '继续专注' : '开始专注');
      presetNodes.forEach(function (n) {
        var on = Number(n.getAttribute('data-min')) === minutes;
        if (on) n.classList.add('on'); else n.classList.remove('on');
        n.disabled = running;
      });
      host.classList.toggle('is-running', running);
      if (tipNode) tipNode.textContent = Math.floor(log.seconds / 60);
    }

    function stop() {
      running = false;
      if (timer) { global.clearInterval(timer); timer = null; }
      paint();
    }

    function finish() {
      var total = minutes * 60;
      left = 0;
      stop();
      left = total;
      paint();
      announce();
    }

    function announce() {
      var art = global.QWSpaceArt;
      if (art && art.burst) {
        art.burst(host, { texts: ['休息一下', '✦', '眺望远方', '★', '☕', '✧'], color: '#FFE16E' });
      }
      var notice = host.querySelector('.sq-focus-done');
      if (!notice) {
        notice = host.ownerDocument.createElement('p');
        notice.className = 'sq-focus-done';
        host.appendChild(notice);
      }
      notice.textContent = '🎉 专注 ' + minutes + ' 分钟完成！站起来看看远处，让眼睛歇一会儿。';
      notice.classList.add('show');
      setTimeout(function () { notice.classList.remove('show'); }, 8000);

      var voice = global.QWVoice;
      if (voice && voice.speak) voice.speak('专注时间到啦，休息一下，眺望远方，让眼睛放松一会儿。');
    }

    function tick() {
      var remain = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      var spent = left - remain;
      if (spent > 0) {
        log.seconds += spent;
        saveLog(log);
      }
      left = remain;
      if (left <= 0) { finish(); return; }
      paint();
    }

    function start() {
      if (running) return;
      running = true;
      deadline = Date.now() + left * 1000;
      timer = global.setInterval(tick, 1000);
      paint();
    }

    presetNodes.forEach(function (node) {
      node.addEventListener('click', function () {
        if (running) return;
        minutes = Number(node.getAttribute('data-min')) || 25;
        write(MIN_KEY, minutes);
        left = minutes * 60;
        paint();
      });
    });

    if (btnNode) {
      btnNode.addEventListener('click', function () {
        if (running) { tick(); stop(); } else { start(); }
      });
    }

    paint();
    return { minutes: function () { return minutes; }, isRunning: function () { return running; }, stop: stop };
  }

  global.QWFocus = { mount: mount, presets: PRESETS.slice(), format: fmt };
})(typeof window !== 'undefined' ? window : this);