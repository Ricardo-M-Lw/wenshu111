/**
 * 小问形象冒烟测试：在轻量 DOM 里真实运行 xiaowen.js，
 * 覆盖「30 个形象的素材是否齐全」「状态机切换 / 临时表情回落」
 * 「data-qw-xiaowen 元素跟随全局状态」「语音唤醒：喊小问 → 应答 → 让位给按住说话」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');

let pass = 0; const fails = [];
function check(label, ok, detail) {
  if (ok) pass += 1; else fails.push(label + (detail ? ' :: ' + detail : ''));
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    contains: c => set.has(c),
    toggle(c, on) {
      const next = on === undefined ? !set.has(c) : !!on;
      if (next) set.add(c); else set.delete(c);
      return next;
    }
  };
}

// 记录脚本真实创建出来的识别实例，方便断言「开 / 停 / 重启」
const recognitions = [];
function makeRecognitionClass() {
  return function FakeRecognition() {
    const self = {
      lang: '', continuous: false, interimResults: false, maxAlternatives: 1,
      started: false,
      start() { self.started = true; },
      stop() { self.started = false; if (self.onend) self.onend(); },
      emit(transcript) {
        const item = [{ transcript }];
        item.isFinal = false;
        if (self.onresult) self.onresult({ resultIndex: 0, results: [item] });
      }
    };
    recognitions.push(self);
    return self;
  };
}

const stateEvents = [];
const wakeEvents = [];
const documentListeners = {};
const images = [];

function makeImg() {
  const el = {
    dataset: {}, attributes: {},
    setAttribute(key, value) { el.attributes[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(el.attributes, key) ? el.attributes[key] : null; }
  };
  el.dataset.qwXiaowen = 'follow';
  images.push(el);
  return el;
}

const body = { classList: makeClassList() };
const document = {
  readyState: 'complete',
  body,
  querySelectorAll(selector) {
    if (selector !== '[data-qw-xiaowen]') return [];
    return images.filter(el => el.dataset.qwXiaowen !== undefined || el.attributes['data-qw-xiaowen']);
  },
  querySelector() { return null; },
  addEventListener(type, fn) { (documentListeners[type] = documentListeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent(event) {
    (documentListeners[event && event.type] || []).forEach(fn => fn(event));
    return true;
  }
};

function FakeCustomEvent(type, init) {
  this.type = type;
  this.detail = (init && init.detail) || {};
}

const followed = makeImg();     // 跟随全局状态
const pinned = makeImg();       // 钉死在 idle 的静帧品牌图
pinned.dataset.qwXiaowen = 'idle';
pinned.dataset.qwXiaowenStill = '1';

const spoken = [];
const sandbox = {
  console, setTimeout, clearTimeout,
  document,
  window: {
    CustomEvent: FakeCustomEvent,
    matchMedia: () => ({ matches: false }),
    SpeechRecognition: makeRecognitionClass(),
    navigator: { language: 'zh-CN' },
    QWVoice: {
      speakSupported: true,
      isSpeaking: () => false,
      speak(text, opts) { spoken.push(text); if (opts && opts.onEnd) opts.onEnd(); return true; },
      stopSpeaking() {}
    }
  }
};
sandbox.window.window = sandbox.window;
sandbox.window.document = document;
vm.createContext(sandbox);

const source = fs.readFileSync(path.join(FRONTEND, 'src', 'scripts', 'xiaowen.js'), 'utf8');
vm.runInContext(source, sandbox, { filename: 'xiaowen.js' });

const xw = sandbox.window.QWXiaowen;

(async () => {
  check('xiaowen.js 挂载 QWXiaowen', !!xw && typeof xw.set === 'function', '');
  check('形象状态一共 30 种', Object.keys(xw.STATES).length === 30, 'count=' + Object.keys(xw.STATES).length);

  // ---------- 素材是否齐全：每个状态的动图 / 静帧都要能在磁盘上找到 ----------
  const missing = [];
  Object.keys(xw.STATES).forEach(state => {
    [xw.url(state), xw.url(state, { still: true })].forEach(url => {
      const file = path.join(FRONTEND, url.replace(/^\//, ''));
      if (!fs.existsSync(file)) missing.push(url);
    });
  });
  check('每个状态的素材文件都存在', missing.length === 0,
    missing.length ? 'missing=' + missing.join(',') : 'checked=' + Object.keys(xw.STATES).length);
  check('动图状态走 .webp（更生动）', /idle\.webp$/.test(xw.url('idle')) && /thinking\.webp$/.test(xw.url('thinking')), xw.url('idle'));
  check('静帧状态走 .png', /proud\.png$/.test(xw.url('proud')) && /idle\.png$/.test(xw.url('idle', { still: true })), xw.url('proud'));

  // ---------- 状态机 ----------
  xw.set('thinking');
  check('set 切到「思考中」', xw.state() === 'thinking' && xw.base() === 'thinking', xw.state());
  check('跟随型图片换成了 thinking 动图',
    /thinking\.webp$/.test(followed.getAttribute('src') || '') && followed.dataset.qwXiaowenState === 'thinking',
    followed.getAttribute('src'));
  check('钉死的静帧品牌图不受影响', /idle\.png$/.test(pinned.getAttribute('src') || ''), pinned.getAttribute('src'));

  xw.flash('celebrate', 60);
  check('flash 立刻切到「庆祝」', xw.state() === 'celebrate' && /celebrate\.webp$/.test(followed.getAttribute('src') || ''), xw.state());
  await sleep(140);
  check('flash 到点自动回到基准状态', xw.state() === 'thinking', xw.state());

  check('react(correct) 映射到庆祝表情', xw.react('correct') === 'celebrate', '');
  check('react(stuck) 映射到疑惑表情', xw.react('stuck') === 'puzzled', '');
  check('未知状态名兜底成 idle', xw.set('不存在') === 'idle', xw.state());

  let stateEventCount = 0;
  document.addEventListener('qw-xiaowen-state', () => { stateEventCount += 1; });
  xw.set('expect');
  check('状态变化会广播 qw-xiaowen-state 事件', stateEventCount >= 1, 'count=' + stateEventCount);

  // ---------- 语音唤醒 ----------
  check('识别到浏览器支持语音唤醒', xw.wake.supported === true, '');

  const enabled = xw.wake.enable();
  check('enable() 打开唤醒并开始连续监听',
    enabled === true && xw.wake.isOn() === true && recognitions.length === 1
    && recognitions[0].started && recognitions[0].continuous && recognitions[0].interimResults,
    'instances=' + recognitions.length);
  check('唤醒开启后 body 挂上 qw-xiaowen-awake', body.classList.contains('qw-xiaowen-awake'), '');

  xw.on('wake', detail => wakeEvents.push(detail));
  const first = recognitions[0];
  first.emit('今天我们来讲一道几何题');
  check('说的不是唤醒词就不会误触发', wakeEvents.length === 0, 'wake=' + wakeEvents.length);

  first.emit('小文，这一步为什么要这样算');
  check('识别到近音词「小文」也能唤醒', wakeEvents.length === 1 && wakeEvents[0].hit === true && wakeEvents[0].phrase === '小文',
    JSON.stringify(wakeEvents[0] || null));
  check('唤醒词后面的半句会当成问题转发', wakeEvents[0] && wakeEvents[0].text === '这一步为什么要这样算', wakeEvents[0] && wakeEvents[0].text);
  check('命中唤醒词后小问会出声应答', spoken.length === 1 && spoken[0].indexOf('一起看看') !== -1, spoken.join(' / '));

  first.emit('小问');
  check('1.6 秒内连续喊只应答一次（防抖）', wakeEvents.length === 1, 'wake=' + wakeEvents.length);

  await sleep(1700);
  const beforeResume = recognitions.length;
  recognitions[beforeResume - 1].emit('小问');
  check('过了防抖窗口再喊能重新唤醒', wakeEvents.length === 2 && wakeEvents[1].text === '', JSON.stringify(wakeEvents[1] || null));

  xw.wake.pause();
  check('按住说话时唤醒引擎让位（暂停）', xw.wake.isPaused() === true, '');
  xw.wake.resume(0);
  await sleep(30);
  check('说完话后唤醒引擎自动接回麦克风', xw.wake.isPaused() === false && recognitions.length >= 3,
    'instances=' + recognitions.length);

  xw.wake.disable();
  check('disable() 关闭唤醒并摘掉 body 标记',
    xw.wake.isOn() === false && !body.classList.contains('qw-xiaowen-awake'), '');

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(err => { console.error('CRASH', err); process.exit(1); });