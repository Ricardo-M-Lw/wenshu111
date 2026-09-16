/**
 * 问数 Web 平台 - 智能体对话组件
 * 用法：QWAgent.mount({ root: '#agentPanel', kpId: 'kp1', stepIndex: 0, persona: 'tutor' })
 * 特性：多角色切换、流式打字、工具调用轨迹、快捷追问、变式题卡片、学习报告、主动建议、回复反馈
 *      语音对话（按住说话 / 自动播报）、对话时间戳与说话人标签、推荐灵感快捷问题
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

  const TOOL_LABELS = {
    get_lesson_status: '查看学习进度',
    get_step_detail: '翻看这一步的讲义',
    get_hint: '整理提示',
    check_answer: '判题',
    explain_concept: '查概念卡',
    generate_variant: '出变式题',
    classify_error: '归类错因',
    evaluate_expression: '计算',
    summarize_lesson: '写学习小结',
    get_error_book: '翻错题本',
    generate_report: '生成学习报告',
    make_plan: '排学习计划'
  };

  const TOOL_RUNNING = {
    get_lesson_status: '正在查看学习进度…',
    get_step_detail: '正在翻看这一步的讲义…',
    get_hint: '正在整理提示…',
    check_answer: '正在判题…',
    explain_concept: '正在翻概念卡…',
    generate_variant: '正在出变式题…',
    classify_error: '正在归类错因…',
    evaluate_expression: '正在计算…',
    summarize_lesson: '正在写学习小结…',
    get_error_book: '正在翻你的错题本…',
    generate_report: '正在汇总学习数据…',
    make_plan: '正在排接下来三天的计划…'
  };

  const DEFAULT_QUICK = [
    { label: '💡 给我提示', text: '给我一点提示' },
    { label: '❓ 为什么这样想', text: '为什么要这样想' },
    { label: '🔁 换一道变式题', text: '换一道变式题吧' },
    { label: '📌 我在第几步', text: '我学到哪一步了' }
  ];

  // ---------- 小问形象（QWXiaowen）----------
  // 形象控制器可能还没加载（比如轻量测试环境），所有调用都要能安全跳过。
  const XIAOWEN = window.QWXiaowen || null;
  function xwUrl(state) {
    return XIAOWEN ? XIAOWEN.url(state) : '/assets/images/mascot/xiaowen/idle.png';
  }
  function xwSet(state, options) { if (XIAOWEN) XIAOWEN.set(state, options); }
  function xwFlash(state, hold) { if (XIAOWEN) XIAOWEN.flash(state, hold); }
  function xwReact(kind) { if (XIAOWEN) XIAOWEN.react(kind); }
  function xwWake(action) {
    if (!XIAOWEN || !XIAOWEN.wake) return;
    try { XIAOWEN.wake[action](); } catch (err) { /* 唤醒引擎不可用时忽略 */ }
  }

  // ---------- 语音对话（Web Speech API）----------
  // 浏览器不支持时：麦克风按钮自动隐藏，只保留键盘输入，绝不报错。
  const VOICE = window.QWVoice || null;
  const AGENT_VERBS = ['轻声提问', '继续启发', '给你线索', '陪你检查'];

  function speechText(text) {
    if (VOICE && typeof VOICE.cleanText === 'function') return VOICE.cleanText(text);
    return String(text == null ? '' : text);
  }

  function mount(options) {
    const opts = Object.assign({ kpId: 'kp1', stepIndex: 0, compact: false, greeting: true, suggest: false }, options || {});
    const root = typeof opts.root === 'string' ? $(opts.root) : opts.root;
    if (!root) return null;

    let kpId = opts.kpId;
    let stepIndex = opts.stepIndex;
    let persona = opts.persona || 'tutor';
    let personas = Array.isArray(opts.personas) ? opts.personas : [];
    let busy = false;
    // 小问还在回答时用户又发了一条：排队等这一轮说完再发，不能静默丢掉
    // （接上大模型后单轮比规则引擎慢，丢掉会让用户以为自己的话没发出去）
    const queue = [];
    let agentTurn = 0;   // 小问说话动词轮换：轻声提问 / 继续启发 / 给你线索 / 陪你检查

    root.classList.add('qw-agent');
    if (opts.compact) root.classList.add('qw-agent-compact');
    root.innerHTML = ''
      + (opts.compact ? '' :
        '<div class="qw-agent-head">'
        + '  <span class="qw-agent-avatar" id="qwAgentAvatar"><img src="' + xwUrl('idle')
        + '" data-qw-xiaowen="follow" alt="小问"></span>'
        + '  <div class="qw-agent-id"><b id="qwAgentName">问数智能体</b><i id="qwAgentProvider">讲题老师 · 在线</i></div>'
        + '  <button type="button" class="qw-agent-quota" id="qwAgentQuota" hidden></button>'
        + '  <button type="button" class="qw-agent-clear" id="qwAgentClear">清空对话</button>'
        + '</div>')
      + (opts.compact ? '' : '<div class="qw-agent-personas" id="qwAgentPersonas"></div>')
      + (opts.compact ? '' : '<div class="qw-agent-stage" id="qwAgentStage"></div>')
      + '<div class="qw-agent-stream" id="qwAgentStream"></div>'
      + '<div class="qw-agent-status" id="qwAgentStatus"></div>'
      + '<div class="qw-agent-quick" id="qwAgentQuick"></div>'
      + '<div class="qw-agent-voice" id="qwAgentVoice">'
      + '  <button type="button" class="qw-agent-mic" id="qwAgentMic" hidden>🎤 <b>按住说话</b><i>，和小问交流</i></button>'
      + '  <button type="button" class="qw-agent-kbd" id="qwAgentKbd">⌨ 键盘输入</button>'
      + '  <button type="button" class="qw-agent-speak" id="qwAgentSpeak" aria-pressed="false" hidden>🔇 语音播报</button>'
      + '  <button type="button" class="qw-agent-vset" id="qwAgentVSet" aria-expanded="false" hidden>⚙ 语音设置</button>'
      + '  <button type="button" class="qw-agent-wake" id="qwAgentWake" aria-pressed="false" hidden>🔔 喊“小问”唤醒</button>'
      + '  <span class="qw-agent-voice-hint" id="qwAgentVoiceHint"></span>'
      + '  <div class="qw-agent-voicepick" id="qwAgentVoicePick" hidden>'
      + '    <label class="qw-agent-pick"><span class="qw-agent-pick-icon">🗣</span><span class="qw-agent-pick-label">声音</span>'
      + '      <select id="qwAgentVoiceSelect" aria-label="选择语音播报的声音"></select></label>'
      + '    <label class="qw-agent-pick qw-agent-pick-rate"><span class="qw-agent-pick-icon">⏩</span><span class="qw-agent-pick-label">语速</span>'
      + '      <input type="range" id="qwAgentVoiceRate" min="0.6" max="1.4" step="0.05" value="1" aria-label="调整语速">'
      + '      <b id="qwAgentVoiceRateVal">1.0×</b></label>'
      + '    <button type="button" class="qw-agent-try" id="qwAgentVoiceTry">🎧 试听</button>'
      + '  </div>'
      + '</div>'
      + '<form class="qw-agent-input" id="qwAgentForm">'
      + '  <input type="text" id="qwAgentText" autocomplete="off" placeholder="问我：这一步为什么要这样做？">'
      + '  <button type="submit" class="qw-agent-send" id="qwAgentSend">发送</button>'
      + '</form>';

    // 新挂上的形象元素立刻对齐当前状态（默认「待机」）
    if (XIAOWEN) XIAOWEN.scan(root);

    const streamBox = $('#qwAgentStream', root);
    const statusBox = $('#qwAgentStatus', root);
    const quickBox = $('#qwAgentQuick', root);
    const input = $('#qwAgentText', root);
    // 发送按钮不置灰：默认按钮 disabled 时浏览器不会隐式提交表单（回车失效），
    // 而小问还在回答时用户接着说的话要排队发出去，不能被挡在门外。
    const sendBtn = $('#qwAgentSend', root);
    if (sendBtn && sendBtn.setAttribute) sendBtn.setAttribute('title', '小问还在回答时也可以继续发，消息会排队');

    // ---------- 语音对话接线：按住说话 + 语音播报 ----------
    const micBtn = $('#qwAgentMic', root);
    const kbdBtn = $('#qwAgentKbd', root);
    const speakBtn = $('#qwAgentSpeak', root);
    const voiceHint = $('#qwAgentVoiceHint', root);
    let voiceOn = false;
    let listenHandle = null;

    function clockText() {
      const now = new Date();
      return ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    }

    function speakerVerb(role) {
      if (role !== 'agent') return '的回答';
      const verb = AGENT_VERBS[agentTurn % AGENT_VERBS.length];
      agentTurn += 1;
      return verb;
    }

    function setVoiceHint(text) {
      if (voiceHint) voiceHint.textContent = text || '';
    }

    function speakReply(text) {
      if (!voiceOn || !VOICE || !VOICE.speakSupported) return;
      const content = speechText(text);
      if (!content) return;
      setVoiceHint('🔊 小问正在念给你听…');
      // 交给形象控制器播报：说的时候小问的嘴和眼睛会一直动（explain 状态）
      if (XIAOWEN) XIAOWEN.say(content, { onEnd: () => setVoiceHint('') });
      else VOICE.speak(content, { onEnd: () => setVoiceHint('') });
    }

    function stopListening() {
      if (listenHandle && listenHandle.stop) listenHandle.stop();
      listenHandle = null;
    }

    function startListening() {
      if (!VOICE || !VOICE.recognizeSupported || listenHandle) return;
      if (VOICE.speakSupported) VOICE.stopSpeaking();
      // 唤醒词引擎和按住说话共用一个麦克风，先让它让位，说完再交还
      xwWake('pause');
      listenHandle = VOICE.listen({
        onStart: () => {
          if (micBtn) micBtn.classList.add('on');
          setVoiceHint('🎙 正在聆听…说完松开，小问就来接话');
          xwSet('listen');
        },
        onInterim: text => { if (text) setVoiceHint('🎙 ' + text); },
        onEnd: (text, reason) => {
          listenHandle = null;
          if (micBtn) micBtn.classList.remove('on');
          xwSet(busy ? 'thinking' : 'expect');
          xwWake('resume');
          const said = String(text || '').trim();
          if (said) { setVoiceHint('你说的是：' + said); send(said); return; }
          setVoiceHint(reason === 'not-allowed' || reason === 'service-not-allowed'
            ? '麦克风没有拿到权限，用键盘输入也完全没问题 ✍️'
            : '这次没听清，再说一次或用键盘输入都可以');
        }
      });
      if (!listenHandle) {
        setVoiceHint('语音识别没能启动，用键盘输入一样可以 ✍️');
        xwWake('resume');
      }
    }

    if (micBtn) {
      if (VOICE && VOICE.recognizeSupported) {
        micBtn.hidden = false;
        micBtn.setAttribute('data-supported', '1');
        const press = event => {
          if (event && event.preventDefault) event.preventDefault();
          startListening();
        };
        const release = () => stopListening();
        ['pointerdown', 'touchstart', 'mousedown'].forEach(type => micBtn.addEventListener(type, press));
        ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'mouseup', 'mouseleave']
          .forEach(type => micBtn.addEventListener(type, release));
      } else {
        micBtn.hidden = true;
        setVoiceHint('当前浏览器不支持语音，用键盘输入也一样方便 ✍️');
      }
    }

    if (speakBtn) {
      if (VOICE && VOICE.speakSupported) {
        speakBtn.hidden = false;
        speakBtn.addEventListener('click', () => {
          voiceOn = !voiceOn;
          speakBtn.textContent = voiceOn ? '🔊 语音播报开' : '🔇 语音播报';
          speakBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
          speakBtn.classList.toggle('on', voiceOn);
          if (voiceOn) setVoiceHint('语音播报已打开，小问的回复会自动念出来');
          else { VOICE.stopSpeaking(); setVoiceHint(''); }
        });
      } else {
        speakBtn.hidden = true;
      }
    }

    if (kbdBtn) {
      kbdBtn.addEventListener('click', () => {
        stopListening();
        setVoiceHint('');
        if (input && input.focus) input.focus();
      });
    }

    // ---------- 语音唤醒：喊一声「小问」它就答应 ----------
    // 浏览器要用户点一下才肯给麦克风，所以只做开关，不自动开启。
    const wakeBtn = $('#qwAgentWake', root);
    if (wakeBtn) {
      const wakeApi = XIAOWEN && XIAOWEN.wake;
      if (wakeApi && wakeApi.supported) {
        const syncWake = () => {
          const on = wakeApi.isOn();
          wakeBtn.classList.toggle('on', on);
          wakeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
          wakeBtn.textContent = on ? '🔔 正在听 · 喊「小问」' : '🔔 喊“小问”唤醒';
        };
        wakeBtn.hidden = false;
        wakeBtn.addEventListener('click', () => {
          const enabled = wakeApi.toggle();
          syncWake();
          if (enabled) {
            xwReact('greet');
            setVoiceHint('已打开语音唤醒：直接喊「小问」就行，比如「小问，这题怎么做」');
          } else {
            setVoiceHint('语音唤醒已关闭');
          }
        });
        XIAOWEN.on('wake', detail => {
          syncWake();
          // 麦克风被拒 / 识别服务不稳定：说清楚原因，别让学生以为是按钮坏了
          if (detail && detail.reason === 'not-allowed') {
            setVoiceHint('麦克风没有拿到权限，语音唤醒先关掉了；用键盘输入也一样可以 ✍️');
          } else if (detail && detail.reason === 'unstable') {
            setVoiceHint('语音识别服务这会儿连不上，稍后再试一次～');
          }
        });
        syncWake();
      } else {
        wakeBtn.hidden = true;
      }
    }

    // ---------- 声音选择：挑一个更顺耳的中文嗓音，还能调语速、随时试听 ----------
    const pickBox = $('#qwAgentVoicePick', root);
    const vsetBtn = $('#qwAgentVSet', root);
    const voiceSelect = $('#qwAgentVoiceSelect', root);
    const rateInput = $('#qwAgentVoiceRate', root);
    const rateVal = $('#qwAgentVoiceRateVal', root);
    const tryBtn = $('#qwAgentVoiceTry', root);
    const VOICE_SAMPLE = '你好呀，我是小问，我们一起来探索数学星球吧。';

    function rateText(value) {
      return Number(value).toFixed(2).replace(/0$/, '') + '×';
    }

    function voiceUriOf(voice) {
      if (!voice) return '';
      return voice.voiceURI || voice.name || '';
    }

    function fillVoiceOptions(list) {
      if (!pickBox || !voiceSelect || !list || !list.length) return;
      const currentUri = VOICE && typeof VOICE.currentVoice === 'function' ? voiceUriOf(VOICE.currentVoice()) : '';
      voiceSelect.innerHTML = list.map(item => {
        const tags = (item.zh ? ' · 中文' : '') + (item.local ? '' : ' · 云端');
        return '<option value="' + esc(item.uri) + '"' + (item.uri === currentUri ? ' selected' : '') + '>'
          + esc(item.name) + tags + '</option>';
      }).join('');
      if (vsetBtn) vsetBtn.hidden = false;
    }

    if (pickBox && VOICE && VOICE.speakSupported) {
      if (typeof VOICE.onVoices === 'function') VOICE.onVoices(fillVoiceOptions);
      if (typeof VOICE.voiceList === 'function') fillVoiceOptions(VOICE.voiceList());

      // 「⚙ 语音设置」是个可收起的浮层：不点开就不占用对话区高度
      if (vsetBtn) {
        const closePick = ev => {
          if (pickBox.hidden) return;
          if (ev.type === 'keydown') { if (ev.key !== 'Escape') return; }
          else if (pickBox.contains(ev.target) || vsetBtn.contains(ev.target)) return;
          pickBox.hidden = true;
          vsetBtn.classList.remove('on');
          vsetBtn.setAttribute('aria-expanded', 'false');
        };
        vsetBtn.addEventListener('click', () => {
          const open = pickBox.hidden;
          pickBox.hidden = !open;
          vsetBtn.classList.toggle('on', open);
          vsetBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.addEventListener('click', closePick);
        document.addEventListener('keydown', closePick);
      }

      if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
          VOICE.setVoice(voiceSelect.value);
          const picked = (VOICE.voiceList() || []).filter(item => item.uri === voiceSelect.value)[0];
          setVoiceHint(picked ? '已换成「' + picked.name + '」' : '声音已切换');
          VOICE.speak(VOICE_SAMPLE, { onEnd: () => setVoiceHint('') });
        });
      }

      if (rateInput) {
        const initialRate = typeof VOICE.rate === 'function' ? VOICE.rate() : 1;
        rateInput.value = initialRate;
        if (rateVal) rateVal.textContent = rateText(initialRate);
        rateInput.addEventListener('input', () => {
          const value = VOICE.setRate(rateInput.value);
          if (rateVal) rateVal.textContent = rateText(value);
        });
        rateInput.addEventListener('change', () => {
          VOICE.speak(VOICE_SAMPLE, { onEnd: () => setVoiceHint('') });
        });
      }

      if (tryBtn) {
        tryBtn.addEventListener('click', () => {
          setVoiceHint('🎧 试听中…');
          VOICE.speak(VOICE_SAMPLE, { onEnd: () => setVoiceHint('') });
        });
      }
    }

    // ---------- 引导式教学五步闭环：把「脚本骨架」显示给学生看 ----------
    let stageLoop = null;

    function renderStage(stage) {
      const box = $('#qwAgentStage');
      if (!box || !stageLoop || !stageLoop.length) return;
      const current = stage && stage.step ? stage.step : 1;
      box.style.display = '';
      box.innerHTML = '<span class="qw-agent-stage-label">引导式教学五步</span>'
        + stageLoop.map(item =>
          '<span class="qw-agent-stage-pill' + (item.step === current ? ' on' : '')
          + (item.step < current ? ' done' : '') + '" title="' + esc(item.goal || '') + '">'
          + '<b>' + item.step + '</b>' + esc(item.short || item.name) + '</span>').join('');
    }

    async function loadStage() {
      const box = $('#qwAgentStage');
      if (!box) return;
      try {
        const data = (await AUTH.request('/api/agent/scaffold?kpId=' + kpId + '&stepIndex=' + stepIndex)).data;
        stageLoop = data.loop || [];
        renderStage(data.stage);
      } catch (err) {
        box.style.display = 'none';
      }
    }

    function scroll() {
      streamBox.scrollTop = streamBox.scrollHeight;
      // 追加节点/灵感条变化的当下浏览器还没重排，scrollHeight 偏小，最新一条会被裁掉；
      // 下一帧再贴一次底（同一轮任务里的后续布局变化也能补上）
      requestAnimationFrame(() => { streamBox.scrollTop = streamBox.scrollHeight; });
      if (opts.onScroll) opts.onScroll();
    }

    function setStatus(text) {
      statusBox.textContent = text || '';
      statusBox.classList.toggle('show', !!text);
    }

    // -------------------------------------------------------------------------
    // AI 对话配额：免费版每天 N 次，用完可以用星尘 / 星钻兑换；会员不限次
    // -------------------------------------------------------------------------
    const quotaChip = $('#qwAgentQuota', root);
    let quota = null;

    function renderQuota(next) {
      if (!next) return;
      quota = next;
      if (!quotaChip) return;
      quotaChip.hidden = false;
      if (next.unlimited) {
        quotaChip.className = 'qw-agent-quota is-vip';
        quotaChip.innerHTML = '👑 <b>不限次</b>';
        quotaChip.setAttribute('title', next.planName + ' · 小问对话不限次');
      } else {
        quotaChip.className = 'qw-agent-quota'
          + (next.remaining === 0 ? ' is-empty' : (next.remaining <= 2 ? ' is-low' : ''));
        quotaChip.innerHTML = '⚡ <b>' + next.remaining + '</b> / ' + next.limit;
        quotaChip.setAttribute('title', '今天还能免费对话 ' + next.remaining + ' 次（免费 '
          + next.freeDaily + ' 次 + 兑换 ' + next.extra + ' 次），点一下看怎么加次');
      }
    }

    function quotaCardHtml(q, message) {
      const rows = (q.redeem || []).map(item =>
        '<button type="button" class="qw-quota-redeem' + (item.affordable ? '' : ' is-locked') + '" data-method="' + esc(item.id) + '">'
        + '<span class="qw-quota-redeem-icon">' + esc(item.icon) + '</span>'
        + '<b>' + esc(item.label) + '</b>'
        + '<i>你有 ' + (q.balance[item.id] || 0) + ' ' + esc(item.unit) + '</i>'
        + '</button>').join('');
      return '<div class="qw-quota-head"><span>⚡</span><div><b>' + esc(message || '今天的免费对话次数用完了')
        + '</b><p>免费版每天 ' + q.freeDaily + ' 次；不够可以用星尘或星钻兑换，也可以开通领航员不限次。</p></div></div>'
        + '<div class="qw-quota-balances"><span>✨ 星尘 <b>' + q.balance.dust + '</b></span>'
        + '<span>💎 星钻 <b>' + q.balance.gem + '</b></span></div>'
        + (rows ? '<div class="qw-quota-redeems">' + rows + '</div>'
          : '<p class="qw-quota-tip">现在还没有星尘 / 星钻 —— 每天签到、答题、完成任务都能攒星尘。</p>')
        + '<p class="qw-quota-foot"><span>兑换到的次数当天有效，和免费次数一起用。</span>'
        + '<a class="qw-quota-link" href="./vip.html#wallet">📜 收支记录 / 星钻充值</a>'
        + '<a href="./vip.html">开通领航员不限次 →</a></p>';
    }

    function bindRedeem(card) {
      Array.from(card.querySelectorAll('.qw-quota-redeem')).forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.dataset.busy) return;
          btn.dataset.busy = '1';
          const original = btn.innerHTML;
          btn.innerHTML = '<span class="qw-quota-redeem-icon">⏳</span><b>兑换中…</b><i>马上就好</i>';
          try {
            const res = await AUTH.request('/api/agent/quota/redeem', {
              method: 'POST', body: { method: btn.dataset.method }
            });
            const next = res.data.quota;
            renderQuota(next);
            card.innerHTML = '<div class="qw-quota-head"><span>🎉</span><div><b>兑换成功，本次 +'
              + res.data.rounds + ' 次对话</b><p>' + esc(res.data.label)
              + '。今天还能对话 <b>' + next.remaining + '</b> 次，接着问吧。</p></div></div>';
            xwReact('celebrate');
            setStatus('');
            // 星尘 / 星钻花掉了，顶栏钱包立刻同步
            window.dispatchEvent(new CustomEvent('qw-wallet-change', { detail: { quota: next } }));
          } catch (err) {
            btn.dataset.busy = '';
            btn.innerHTML = original;
            setStatus(err.message);
            xwReact('sorry');
          }
        });
      });
      return card;
    }

    function showQuotaCard(q, message) {
      // 同一张配额卡只留一张：反复点角标不应该在对话里越堆越多
      const old = streamBox.querySelector('.qw-quota-card');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      const card = document.createElement('div');
      card.className = 'qw-agent-card qw-quota-card';
      card.innerHTML = quotaCardHtml(q, message);
      streamBox.appendChild(card);
      bindRedeem(card);
      scroll();
      return card;
    }

    if (quotaChip) {
      quotaChip.addEventListener('click', () => {
        if (quota && quota.unlimited) {
          setStatus('你已经是领航员，小问对话不限次 🎉');
          return;
        }
        showQuotaCard(quota, '今天的 AI 对话配额');
      });
    }

    function push(role, text, typing) {
      const row = document.createElement('div');
      row.className = 'qw-agent-row ' + role;
      row.innerHTML = '<span class="qw-agent-bubble-avatar">' + (role === 'agent' ? '🤖' : esc(AUTH.initials(AUTH.getUser()))) + '</span>'
        + '<div class="qw-agent-bubble"><span class="qw-agent-text"></span>'
        + '<span class="qw-agent-meta">' + clockText() + ' · ' + esc((role === 'agent' ? '小问' : '你') + speakerVerb(role)) + '</span></div>';
      const textNode = $('.qw-agent-text', row);
      if (typing) {
        row.classList.add('typing');
        textNode.innerHTML = '<i class="qw-dot"></i><i class="qw-dot"></i><i class="qw-dot"></i>';
      } else {
        textNode.textContent = text || '';
      }
      streamBox.appendChild(row);
      requestAnimationFrame(() => row.classList.add('in'));
      scroll();
      return { row, text: textNode };
    }

    function renderPersonas() {
      const box = $('#qwAgentPersonas');
      if (!box) return;
      if (!personas.length) {
        box.style.display = 'none';
        return;
      }
      box.style.display = '';
      box.innerHTML = personas.map(item =>
        '<button type="button" class="qw-persona-tab' + (item.id === persona ? ' active' : '') + '" data-persona="' + esc(item.id) + '">'
        + '<i>' + esc(item.icon) + '</i>' + esc(item.name) + '</button>').join('');
      Array.from(box.querySelectorAll('.qw-persona-tab')).forEach(btn => {
        btn.addEventListener('click', () => switchPersona(btn.dataset.persona));
      });
      const avatar = $('#qwAgentAvatar', root);
      const current = personas.find(item => item.id === persona);
      // 头像固定用「小问」奶酪猫，角色图标放到名字前面，避免把品牌形象覆盖掉
      if (avatar && current && !avatar.querySelector('img')) avatar.textContent = current.icon;
      const idBox = $('#qwAgentName', root);
      if (idBox && current) idBox.textContent = current.icon + ' ' + current.name;
    }

    function renderQuick(list) {
      const source = (list && list.length ? list : DEFAULT_QUICK).slice(0, 4);
      quickBox.innerHTML = '<span class="qw-agent-quick-label">推荐灵感</span>' + source.map(item =>
        '<button type="button" class="qw-agent-chip" data-text="' + esc(item.text || item.label) + '"'
        + (item.persona ? ' data-persona="' + esc(item.persona) + '"' : '') + '>'
        + esc(item.label) + '</button>').join('');
      Array.from(quickBox.querySelectorAll('.qw-agent-chip')).forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.persona && btn.dataset.persona !== persona) switchPersona(btn.dataset.persona);
          send(btn.dataset.text);
        });
      });
    }

    // 工具调用轨迹：让「智能体到底做了什么」对学生可见
    function renderThoughts(names) {
      if (!names || !names.length) return;
      const box = document.createElement('div');
      box.className = 'qw-agent-thoughts';
      box.innerHTML = names.map(name =>
        '<span class="qw-agent-thought">' + esc(TOOL_LABELS[name] || name) + '</span>').join('');
      streamBox.appendChild(box);
      scroll();
    }

    function renderFeedbackRow() {
      const row = document.createElement('div');
      row.className = 'qw-agent-follow';
      row.innerHTML = '<span>这条回答</span>'
        + '<button type="button" class="qw-agent-fb" data-rating="helpful">👍 有帮助</button>'
        + '<button type="button" class="qw-agent-fb" data-rating="confused">🤔 还没懂</button>';
      Array.from(row.querySelectorAll('.qw-agent-fb')).forEach(btn => {
        btn.addEventListener('click', async () => {
          if (row.dataset.done) return;
          row.dataset.done = '1';
          Array.from(row.querySelectorAll('.qw-agent-fb')).forEach(item => { item.disabled = true; });
          btn.classList.add('on');
          try {
            await AUTH.request('/api/agent/feedback', {
              method: 'POST',
              body: { rating: btn.dataset.rating, kpId, stepIndex }
            });
          } catch (err) {
            /* 反馈失败不影响对话 */
          }
          if (btn.dataset.rating === 'confused') {
            push('agent', '收到，那我们把这一步再讲细一点。');
            send('我还是不太懂，换一种方式讲讲');
          }
          if (opts.onFeedback) opts.onFeedback(btn.dataset.rating);
        });
      });
      streamBox.appendChild(row);
      scroll();
    }

    // ---------- 学习报告卡片（兼容「智能体工具版」与「一键生成版」两种数据结构） ----------
    function reportCard(report) {
      if (!report) return null;
      const card = document.createElement('div');
      card.className = 'qw-agent-card qw-agent-report';

      if (report.stages) {
        const ov = report.overview || {};
        card.innerHTML = '<b>📊 ' + esc(report.scope ? report.scope.lessonTitle : report.lesson || '')
          + ' · ' + esc(report.range || '学习报告') + '</b>'
          + '<div class="qw-report-grid">'
          + '  <div><b>' + (ov.mastery || 0) + '%</b><span>知识点掌握</span></div>'
          + '  <div><b>' + (ov.correctRate || 0) + '%</b><span>答题正确率</span></div>'
          + '  <div><b>' + (ov.minutes || 0) + '</b><span>累计分钟</span></div>'
          + '  <div><b>' + (ov.corrections || 0) + '</b><span>主动订正</span></div>'
          + '</div>'
          + '<div class="qw-stage-list">' + report.stages.map(stage =>
            '<div class="qw-stage">'
            + '<div class="qw-stage-head"><span>' + esc(stage.icon || '') + ' ' + esc(stage.label) + '</span><b>' + stage.value + '%</b></div>'
            + '<div class="qw-stage-bar"><span style="width:' + Math.max(0, Math.min(100, stage.value)) + '%"></span></div>'
            + '<p>' + esc(stage.detail || '') + '　' + esc(stage.note || '') + '</p>'
            + '</div>').join('') + '</div>'
          + '<ul class="qw-report-list">' + (report.highlights || []).map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>'
          + ((report.suggestions || []).length
            ? '<ul class="qw-report-list qw-report-advice">' + report.suggestions.map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>'
            : '')
          + '<div class="qw-report-next"><b>下一步</b>' + esc(report.nextAction || '') + '</div>'
          + '<span class="qw-report-stamp">自动生成于 ' + esc(report.generatedAt || '') + '</span>';
      } else {
        const stats = report.stats || {};
        card.innerHTML = '<b>📊 ' + esc(report.lesson || '') + ' · ' + esc(report.range || '学习报告') + '</b>'
          + '<div class="qw-report-grid">'
          + '  <div><b>' + (stats.doneSteps || 0) + '/' + (stats.totalSteps || 0) + '</b><span>讲题步骤</span></div>'
          + '  <div><b>' + (stats.accuracy || 0) + '%</b><span>正确率</span></div>'
          + '  <div><b>' + (stats.hintCount || 0) + '</b><span>使用提示</span></div>'
          + '  <div><b>' + (stats.wrongCount || 0) + '</b><span>纠正次数</span></div>'
          + '</div>'
          + '<ul class="qw-report-list">' + (report.highlights || []).map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>'
          + '<div class="qw-report-next"><b>下一步</b>' + esc(report.nextAction || '') + '</div>';
      }
      streamBox.appendChild(card);
      scroll();
      return card;
    }

    // ---------- 错题记录卡片 ----------
    function errorBookCard(book) {
      if (!book) return null;
      const items = book.items || [];
      const card = document.createElement('div');
      card.className = 'qw-agent-card qw-agent-report';

      if (!items.length) {
        card.innerHTML = '<b>📕 错题记录</b><p class="qw-report-lead">'
          + esc(book.headline || '还没有错题记录，继续保持 👍') + '</p>';
        streamBox.appendChild(card);
        scroll();
        return card;
      }

      card.innerHTML = '<b>📕 错题记录 · 共 ' + (book.totalWrong || items.length) + ' 次</b>'
        + '<p class="qw-report-lead">' + esc(book.headline || '') + '</p>'
        + '<div class="qw-err-list">' + items.map(item =>
          '<div class="qw-err-block">'
          + '<div class="qw-err-block-head"><b>' + esc(item.type) + '</b><span>×' + (item.times || 1) + '</span></div>'
          + '<p class="qw-err-block-desc">' + esc(item.description || '') + '</p>'
          + '<p class="qw-err-block-advice">下次先做：' + esc(item.advice || '') + '</p>'
          + ((item.samples || []).length
            ? '<div class="qw-err-samples">' + item.samples.map(s =>
              '<div class="qw-err-sample"><span>你当时写的是</span><b>' + esc(s.answer || '') + '</b>'
              + '<i>' + esc(s.kpName || '') + (s.stepName ? ' · ' + esc(s.stepName) : '') + (s.at ? ' · ' + esc(s.at) : '') + '</i></div>').join('')
              + '</div>'
            : '')
          + ((item.steps || []).length ? '<div class="qw-err-tags">' + item.steps.map(s => '<span>' + esc(s) + '</span>').join('') + '</div>' : '')
          + '</div>').join('') + '</div>'
        + ((book.recent || []).length
          ? '<div class="qw-plan-day"><b>最近这几次</b><ul class="qw-report-list">'
            + book.recent.map(r => '<li>' + esc(r.at) + ' ' + esc(r.kpName) + (r.stepName ? ' · ' + esc(r.stepName) : '')
              + '　错因：' + esc(r.errorType) + (r.answer ? '　你写的是「' + esc(r.answer) + '」' : '') + '</li>').join('')
            + '</ul></div>'
          : '')
        + '<div class="qw-report-next"><b>订正动作</b>' + esc(items[0].advice || '') + '</div>';
      streamBox.appendChild(card);
      scroll();
      return card;
    }
    function renderEffects(effects) {
      if (!effects) return;
      // 形象跟着结果走：答对庆祝、答错安慰、给变式题好奇、出报告骄傲、排计划下定决心
      if (effects.answer) xwReact(effects.answer.isCorrect ? 'correct' : 'wrong');
      else if (effects.variant) xwFlash('curious', 2400);
      else if (effects.hint) xwFlash('aha', 2400);
      else if (effects.report) xwFlash('proud', 2600);
      else if (effects.plan) xwFlash('determined', 2600);
      else if (effects.errorbook) xwFlash('focused', 2600);
      if (effects.variant) {
        const card = document.createElement('div');
        card.className = 'qw-agent-card qw-agent-variant';
        card.innerHTML = '<b>变式题</b><p>' + esc(effects.variant.question) + '</p>'
          + '<div class="qw-agent-options">' + effects.variant.options.map((option, index) =>
            '<button type="button" data-answer="' + String.fromCharCode(65 + index) + '">'
            + String.fromCharCode(65 + index) + '. ' + esc(option) + '</button>').join('') + '</div>';
        streamBox.appendChild(card);
        Array.from(card.querySelectorAll('button')).forEach(btn => {
          btn.addEventListener('click', () => {
            card.classList.add('answered');
            send(btn.dataset.answer);
          });
        });
        scroll();
      }
      if (effects.hint) {
        const chip = document.createElement('div');
        chip.className = 'qw-agent-card qw-agent-hint';
        chip.innerHTML = '<b>已给出第 ' + effects.hint.level + ' 级提示 · ' + esc(effects.hint.levelName) + '</b>';
        streamBox.appendChild(chip);
        scroll();
      }
      if (effects.report) reportCard(effects.report);
      if (effects.plan) {
        const card = document.createElement('div');
        card.className = 'qw-agent-card qw-agent-report';
        card.innerHTML = '<b>🗺️ ' + esc(effects.plan.lesson || '') + ' · ' + effects.plan.days + ' 天计划</b>'
          + (effects.plan.plan || []).map(day =>
            '<div class="qw-plan-day"><b>' + esc(day.title) + '</b><ul class="qw-report-list">'
            + day.tasks.map(task => '<li>' + esc(task) + '</li>').join('') + '</ul></div>').join('');
        streamBox.appendChild(card);
        scroll();
      }
      if (effects.errorbook) errorBookCard(effects.errorbook);
    }

    // 清空服务端会话记忆；界面清空是同步的，避免和发送请求打架
    async function resetServer() {
      try {
        await AUTH.request('/api/agent/reset', { method: 'POST', body: { kpId } });
      } catch (err) {
        /* 忽略 */
      }
    }

    function switchPersona(next) {
      if (!next || next === persona) return;
      persona = next;
      renderPersonas();
      const current = personas.find(item => item.id === persona);
      streamBox.innerHTML = '';
      greet(current ? current.intro : '我们换个方式继续。');
      const providerChip = $('#qwAgentProvider', root);
      if (current && providerChip) providerChip.textContent = current.name + ' · 在线';
      resetServer();
      if (opts.onPersona) opts.onPersona({ persona, info: current || null });
    }

    async function send(text) {
      const message = String(text || '').trim();
      if (!message) return;
      if (busy) {
        input.value = '';
        queue.push(message);
        setStatus('小问正在回答，这条消息排在后面…');
        return;
      }
      busy = true;
      input.value = '';
      xwSet('thinking');
      root.classList.add('has-msgs');
      push('user', message);
      const node = push('agent', '', true);
      const body = { message, kpId, stepIndex, persona };
      let full = '';
      let received = false;
      const usedTools = [];

      try {
        const meta = await AUTH.stream('/api/agent/chat/stream', body, event => {
          if (event.type === 'tool') {
            usedTools.push(event.name);
            setStatus(TOOL_RUNNING[event.name] || '正在思考…');
          } else if (event.type === 'delta') {
            if (!received) {
              received = true;
              node.row.classList.remove('typing');
              node.text.textContent = '';
              setStatus('');
              xwSet('explain');
            }
            full += event.text;
            node.text.textContent = full;
            scroll();
          }
        });
        node.row.classList.remove('typing');
        node.text.textContent = full || '（智能体这次没有说出内容，再问一次试试）';
        setStatus('');
        speakReply(node.text.textContent);
        renderThoughts(usedTools);
        if (meta) {
          if (meta.quota) renderQuota(meta.quota);
          renderQuick(meta.quickReplies);
          renderEffects(meta.effects);
          renderFeedbackRow();
          xwSet('expect');
          renderStage(meta.stage);
          const provider = $('#qwAgentProvider', root);
          if (provider && meta.personaName) {
            provider.textContent = meta.personaName + (meta.provider === 'openai' ? ' · 大模型在线' : ' · 离线可用');
          }
          if (opts.onEvent) opts.onEvent(meta, { message });
        }
      } catch (err) {
        // 配额用完：不再走降级重试（否则会再扣一次额度），直接把兑换卡推给ta
        if (err && err.status === 429 && err.data && err.data.quota) {
          const q = err.data.quota;
          node.row.classList.remove('typing');
          node.text.textContent = '今天的免费对话次数用完了 —— 可以用星尘 / 星钻换几次，或者开通领航员不限次，我们接着讲。';
          setStatus('');
          xwReact('sorry');
          renderQuota(q);
          showQuotaCard(q, '今天的 ' + q.freeDaily + ' 次免费对话已经用完');
          renderQuick(DEFAULT_QUICK);
          if (opts.onEvent) opts.onEvent({ quota: q, quotaBlocked: true }, { message });
          return;
        }
        try {
          const fallback = (await AUTH.request('/api/agent/chat', { method: 'POST', body })).data;
          node.row.classList.remove('typing');
          node.text.textContent = fallback.reply;
          setStatus('');
          if (fallback.quota) renderQuota(fallback.quota);
          speakReply(node.text.textContent);
          renderThoughts((fallback.toolCalls || []).map(item => item.name));
          renderQuick(fallback.quickReplies);
          renderEffects(fallback.effects);
          renderFeedbackRow();
          xwSet('expect');
          renderStage(fallback.stage);
          if (opts.onEvent) opts.onEvent(fallback, { message });
        } catch (err2) {
          node.row.classList.remove('typing');
          node.text.textContent = '智能体暂时联系不上，请稍后再试一次。';
          setStatus('');
          xwSet('idle');
          xwReact('sorry');
        }
      } finally {
        busy = false;
        scroll();
        // 排队的消息接着发，保证用户说的话一条都不丢
        if (queue.length) send(queue.shift());
      }
    }

    $('#qwAgentForm', root).addEventListener('submit', event => {
      event.preventDefault();
      send(input.value);
    });

    const clearBtn = $('#qwAgentClear', root);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        streamBox.innerHTML = '';
        greet();
        resetServer();
      });
    }

    function greet(text) {
      const current = personas.find(item => item.id === persona);
      xwReact('greet');
      push('agent', text || (current ? current.intro
        : '你好，我是问数智能体 🤖\n\n卡住的时候直接问我，我会给你提示和方向 —— 但不会直接说答案，因为那样这道题就白做啦。'));
      const quick = current && current.quickReplies ? current.quickReplies : DEFAULT_QUICK;
      renderQuick(quick);
    }

    // 主动建议：打开智能体时先告诉学生「现在最值得做的事」
    async function loadSuggest() {
      try {
        const data = (await AUTH.request('/api/agent/suggest?kpId=' + kpId + '&persona=' + persona)).data;
        const card = document.createElement('div');
        card.className = 'qw-agent-suggest';
        card.innerHTML = '<span>' + (data.tone === 'warn' ? '⚠️' : data.tone === 'good' ? '🎉' : '👋') + '</span>'
          + '<div><b>' + esc(data.title) + '</b><p>' + esc(data.text) + '</p>'
          + '<button type="button">' + esc(data.action.label) + '</button></div>';
        streamBox.appendChild(card);
        card.querySelector('button').addEventListener('click', () => {
          if (data.action.persona && data.action.persona !== persona) switchPersona(data.action.persona);
          send(data.action.text);
        });
        scroll();
      } catch (err) {
        /* 建议失败不影响正常对话 */
      }
    }

    // 一次性拉取角色列表与画像
    (async function bootstrap() {
      if (!personas.length) {
        try {
          const data = (await AUTH.request('/api/agent/personas')).data;
          personas = data || [];
        } catch (err) {
          personas = [];
        }
      }
      renderPersonas();
      try {
        renderQuota((await AUTH.request('/api/agent/quota')).data);
      } catch (err) {
        /* 配额拿不到不影响对话 */
      }
      await loadStage();
      if (opts.suggest && persona === 'tutor') await loadSuggest();
      if (opts.greeting) greet();
      else renderQuick(personas.find(item => item.id === persona) ? personas.find(item => item.id === persona).quickReplies : DEFAULT_QUICK);
      if (opts.onReady) opts.onReady({ personas, persona });
    })();

    return {
      send: send,
      pushMessage: (role, text) => push(role, text),
      pushCard: (className, html) => {
        const card = document.createElement('div');
        card.className = 'qw-agent-card ' + (className || '');
        card.innerHTML = html;
        streamBox.appendChild(card);
        scroll();
        return card;
      },
      showReport: report => reportCard(report),
      showErrorBook: book => errorBookCard(book),
      scroll: scroll,
      setContext: context => {
        if (context.kpId) kpId = context.kpId;
        if (typeof context.stepIndex === 'number') stepIndex = context.stepIndex;
        if (context.persona) switchPersona(context.persona);
        loadStage();
      },
      switchPersona: switchPersona,
      getPersona: () => persona,
      voice: {
        supported: !!(VOICE && VOICE.recognizeSupported),
        isOn: () => voiceOn,
        setOn: on => { voiceOn = !!on; },
        speak: text => speakReply(text),
        stop: () => { if (VOICE && VOICE.speakSupported) VOICE.stopSpeaking(); }
      },
      element: root
    };
  }

  window.QWAgent = {
    mount: mount,
    TOOL_LABELS: TOOL_LABELS,
    TOOL_RUNNING: TOOL_RUNNING,
    DEFAULT_QUICK: DEFAULT_QUICK
  };
})();