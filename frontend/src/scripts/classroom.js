/**
 * 问数 Web 平台 - 讲题课堂
 * 把每个知识点拆成「情境导入 → 概念精讲 → 例题演示 → 变式引导 → 课堂小结」等步骤，
 * 每一步都有对应黑板图形、讲解对话和互动检查点；答错只给引导与提示，不直接给答案。
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;
  const BOARD = window.QWBoard;

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message) {
    let node = $('.qw-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qw-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  const state = {
    kpId: 'kp1',
    lesson: null,
    dashboard: null,
    stepIndex: 0,
    maxReached: 0,
    phase: 'explain',
    revealed: 0,
    selected: null,
    hintIndex: 0,
    hintsUsed: 0,
    corrections: 0,
    attempts: 0,
    doneSteps: 0,
    startedAt: Date.now(),
    timer: null,
    revealTimer: null,
    completed: false
  };

  let agent = null;

  function step() { return state.lesson.steps[state.stepIndex]; }
  function stepCount() { return state.lesson.steps.length; }

  function elapsedText() {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // 页面骨架
  // ---------------------------------------------------------------------------
  function renderShell() {
    const user = AUTH.getUser() || {};
    const root = $('#classroomApp');
    root.innerHTML = ''
      + '<div class="qw-classroom">'
      + '  <header class="qw-classroom-top">'
      + '    <a href="./home.html" class="qw-back-link">'
      + '      <i data-lucide="arrow-left" class="w-4 h-4"></i><span>返回首页</span></a>'
      + '    <div class="qw-classroom-title">'
      + '      <span class="qw-classroom-kp">' + esc(state.lesson.title) + '</span>'
      + '      <span class="qw-classroom-grade">' + esc(state.lesson.grade) + '</span>'
      + '    </div>'
      + '    <div class="qw-classroom-meta">'
      + '      <span class="qw-chip"><i data-lucide="timer" class="w-3.5 h-3.5"></i><b id="qwElapsed">0:00</b></span>'
      + '      <span class="qw-chip"><i data-lucide="layers" class="w-3.5 h-3.5"></i><b id="qwStepCounter">1 / ' + stepCount() + '</b></span>'
      + '      <button type="button" class="qw-chip qw-chip-tour" id="qwTourBtn" title="重看一遍讲题课堂的使用引导">'
      + '        <i data-lucide="circle-help" class="w-3.5 h-3.5"></i><b>怎么用</b></button>'
      + '      <span class="qw-chip qw-chip-user">' + esc(AUTH.initials(user)) + '</span>'
      + '    </div>'
      + '  </header>'
      + '  <p class="qw-classroom-goal"><b>学习目标</b>' + esc(state.lesson.goal) + '</p>'
      + '  <div class="qw-classroom-grid">'
      + '    <section class="qw-board-panel">'
      + '      <div class="qw-board-head">'
      + '        <span class="qw-board-tag" id="qwBoardTag"></span>'
      + '        <span class="qw-board-minute" id="qwBoardMinute"></span>'
      + '      </div>'
      + '      <div class="qw-board-figure" id="qwBoardFigure"></div>'
      + '      <ol class="qw-step-rail" id="qwStepRail"></ol>'
      + '    </section>'
      + '    <section class="qw-chat-panel">'
      + '      <div class="qw-chat-stream" id="qwChatStream"></div>'
      + '      <div class="qw-chat-action" id="qwChatAction"></div>'
      + '      <div class="qw-agent-dock" id="qwAgentDock">'
      + '        <button type="button" class="qw-agent-toggle" id="qwAgentToggle">🤖 有疑问？问问问数智能体</button>'
      + '        <div class="qw-agent-panel" id="qwAgentPanel"></div>'
      + '      </div>'
      + '    </section>'
      + '  </div>'
      + '</div>';

    if (window.lucide) window.lucide.createIcons();
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      const node = $('#qwElapsed');
      if (node) node.textContent = elapsedText();
    }, 1000);
  }

  // ---------------------------------------------------------------------------
  // 黑板图形 + 步骤进度
  // ---------------------------------------------------------------------------
  function renderBoard() {
    const current = step();
    $('#qwBoardTag').textContent = '第 ' + (state.stepIndex + 1) + ' 步 · ' + current.name;
    $('#qwBoardMinute').textContent = '建议 ' + (current.minutes || 3) + ' 分钟';
    const figure = $('#qwBoardFigure');
    figure.innerHTML = BOARD.render(current.diagram);
    const svg = figure.querySelector('svg');
    if (svg) {
      svg.classList.add('qw-board-anim');
      setTimeout(() => svg.classList.add('in'), 30);
    }
    const note = document.createElement('p');
    note.className = 'qw-board-note';
    note.innerHTML = '<b>' + esc(current.tag || current.name) + '</b>' + esc(current.diagram && current.diagram.title ? current.diagram.title : '');
    figure.appendChild(note);
  }

  function renderRail() {
    const rail = $('#qwStepRail');
    rail.innerHTML = state.lesson.steps.map((item, index) => {
      const done = index < state.doneSteps;
      const current = index === state.stepIndex;
      const reachable = index <= state.maxReached;
      const cls = current ? 'current' : done ? 'done' : 'pending';
      return '<li class="qw-rail-item ' + cls + (reachable ? ' reachable' : '') + '" data-step="' + index + '">'
        + '<span class="qw-rail-dot">' + (done ? '✓' : index + 1) + '</span>'
        + '<span class="qw-rail-text"><b>' + esc(item.name) + '</b><i>' + esc(item.tag || '') + '</i></span>'
        + '</li>';
    }).join('');

    $$('#qwStepRail .qw-rail-item').forEach(node => {
      node.addEventListener('click', () => {
        const index = Number(node.dataset.step);
        if (index <= state.maxReached && index !== state.stepIndex) openStep(index);
      });
    });

    const counter = $('#qwStepCounter');
    if (counter) counter.textContent = (state.stepIndex + 1) + ' / ' + stepCount();
  }

  // ---------------------------------------------------------------------------
  // 讲解对话
  // ---------------------------------------------------------------------------
  function pushBubble(bubble) {
    const stream = $('#qwChatStream');
    const user = AUTH.getUser() || {};
    const isAi = bubble.role !== 'me';
    const node = document.createElement('div');
    node.className = 'qw-chat-row ' + (isAi ? 'ai' : 'me');
    node.innerHTML = '<div class="qw-chat-avatar">' + (isAi ? '问' : esc(AUTH.initials(user))) + '</div>'
      + '<div class="qw-bubble">' + esc(bubble.text)
      + (bubble.highlight ? '<span class="qw-bubble-key">' + esc(bubble.highlight) + '</span>' : '')
      + '</div>';
    stream.appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
    stream.scrollTop = stream.scrollHeight;
  }

  function startExplain() {
    state.phase = 'explain';
    state.revealed = 0;
    $('#qwChatStream').innerHTML = '';
    const action = $('#qwChatAction');
    action.innerHTML = '<button type="button" class="qw-btn-ghost qw-skip" id="qwSkipBtn">跳过讲解，直接作答 →</button>';
    $('#qwSkipBtn').addEventListener('click', revealAll);

    const bubbles = step().bubbles || [];
    const tick = () => {
      if (state.revealed >= bubbles.length) {
        renderCheckpoint();
        return;
      }
      pushBubble(bubbles[state.revealed]);
      state.revealed += 1;
      state.revealTimer = setTimeout(tick, 900);
    };
    tick();
  }

  function revealAll() {
    clearTimeout(state.revealTimer);
    const bubbles = step().bubbles || [];
    while (state.revealed < bubbles.length) {
      pushBubble(bubbles[state.revealed]);
      state.revealed += 1;
    }
    renderCheckpoint();
  }

  // ---------------------------------------------------------------------------
  // 互动检查点
  // ---------------------------------------------------------------------------
  function renderCheckpoint() {
    clearTimeout(state.revealTimer);
    state.phase = 'checkpoint';
    state.selected = null;
    state.hintIndex = 0;
    state.hintsUsed = 0;
    state.corrections = 0;
    state.attempts = 0;

    const current = step();
    const checkpoint = current.checkpoint;
    if (!checkpoint) return finishStep();

    const options = checkpoint.options.map((text, index) =>
      '<button type="button" class="qw-option" data-answer="' + index + '">'
      + '<span class="qw-option-key">' + String.fromCharCode(65 + index) + '</span>'
      + '<span class="qw-option-text">' + esc(text) + '</span></button>').join('');

    const action = $('#qwChatAction');
    action.innerHTML = ''
      + '<div class="qw-checkpoint">'
      + '  <div class="qw-checkpoint-head">'
      + '    <span class="qw-checkpoint-badge">动手试一试</span>'
      + '    <span class="qw-checkpoint-step">第 ' + (state.stepIndex + 1) + ' / ' + stepCount() + ' 步检查点</span>'
      + '  </div>'
      + '  <p class="qw-checkpoint-q">' + esc(checkpoint.question) + '</p>'
      + '  <div class="qw-options">' + options + '</div>'
      + '  <div class="qw-feedback" id="qwFeedback"></div>'
      + '  <div class="qw-chat-buttons">'
      + '    <button type="button" class="qw-btn-ghost" id="qwHintBtn">💡 给我一点提示</button>'
      + '    <button type="button" class="qw-btn-primary" id="qwSubmitBtn">提交答案</button>'
      + '  </div>'
      + '</div>';

    $$('#qwChatAction .qw-option').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#qwChatAction .qw-option').forEach(item => item.classList.remove('selected'));
        btn.classList.add('selected');
        state.selected = Number(btn.dataset.answer);
      });
    });

    $('#qwHintBtn').addEventListener('click', useHint);
    $('#qwSubmitBtn').addEventListener('click', submitAnswer);
    scrollChat();
  }

  function useHint() {
    const hints = step().checkpoint.hints || [];
    if (state.hintIndex >= hints.length) {
      toast('提示已经全部给出啦，动手选一个试试');
      return;
    }
    state.hintsUsed += 1;
    const text = hints[state.hintIndex];
    state.hintIndex += 1;
    const feedback = $('#qwFeedback');
    feedback.innerHTML = '<div class="qw-hint-note">💡 提示 ' + state.hintIndex + '：' + esc(text) + '</div>';
    if (state.hintIndex >= hints.length) {
      $('#qwHintBtn').disabled = true;
      $('#qwHintBtn').textContent = '提示已用完';
    }
    scrollChat();
  }

  function scrollChat() {
    const stream = $('#qwChatStream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function showFeedback(isCorrect, text) {
    const node = $('#qwFeedback');
    node.innerHTML = '<div class="qw-feedback-item ' + (isCorrect ? 'ok' : 'no') + '">'
      + '<span class="qw-feedback-icon">' + (isCorrect ? '✅' : '🤔') + '</span>'
      + '<div>' + esc(text) + '</div></div>';
    node.classList.add('pop');
    setTimeout(() => node.classList.remove('pop'), 420);
    scrollChat();
  }

  function shakeOptions() {
    const options = $('#qwFeedback');
    if (!options) return;
    const box = $('#qwChatAction .qw-options');
    if (!box) return;
    box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 460);
  }

  // 答错时按知识点归类错因，供家长端错因统计使用
  const KP_ERROR_TYPE = { kp1: '符号混淆', kp2: '概念不清', kp3: '公式错误' };

  async function recordProgress(completed) {
    const current = step();
    try {
      await AUTH.request('/api/learning/progress', {
        method: 'POST',
        body: {
          knowledgePointId: state.kpId,
          stepIndex: state.stepIndex,
          stepCount: stepCount(),
          hintsUsed: state.hintsUsed,
          corrected: state.corrections > 0,
          errorType: state.corrections > 0 ? KP_ERROR_TYPE[state.kpId] : null,
          completed: !!completed
        }
      });
    } catch (err) {
      console.warn('讲题进度上报失败：', err.message);
    }
  }

  async function submitAnswer() {
    const btn = $('#qwSubmitBtn');
    if (state.selected == null) {
      toast('先选一个你觉得正确的选项吧');
      return;
    }
    const current = step();
    btn.disabled = true;
    btn.textContent = '正在判断…';
    try {
      const res = (await AUTH.request('/api/learning/checkpoint', {
        method: 'POST',
        body: {
          lessonId: state.lesson.id,
          stepId: current.id,
          answer: state.selected,
          hintUsed: Math.max(state.hintIndex - 1, 0)
        }
      })).data;
      state.attempts += 1;

      if (res.isCorrect) {
        state.doneSteps = Math.max(state.doneSteps, state.stepIndex + 1);
        pushBubble({ role: 'me', text: '我选：' + current.checkpoint.options[state.selected] });
        pushBubble({ role: 'ai', text: res.feedback });
        $$('#qwChatAction .qw-option').forEach(item => { item.disabled = true; });
        showFeedback(true, '答对了，我们继续往下讲。');
        await finishStep();
      } else {
        state.corrections += 1;
        showFeedback(false, res.feedback);
        shakeOptions();
        btn.disabled = false;
        btn.textContent = state.attempts >= 2 ? '再试一次（建议先看提示）' : '再试一次';
        if (state.attempts >= 2 && state.hintIndex === 0) useHint();
      }
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = '提交答案';
    }
  }

  async function finishStep() {
    const current = step();
    const isLast = state.stepIndex >= stepCount() - 1;
    state.resolved = true;
    await recordProgress(false);
    renderRail();

    const action = $('#qwChatAction');
    action.innerHTML = ''
      + '<div class="qw-step-summary">'
      + '  <div class="qw-step-summary-head"><span>✅</span><b>第 ' + (state.stepIndex + 1) + ' 步「' + esc(current.name) + '」完成</b></div>'
      + '  <p class="qw-step-summary-text">' + esc(current.summary) + '</p>'
      + '  <div class="qw-step-summary-meta">本步使用提示 ' + state.hintsUsed + ' 次 · 纠正 ' + state.corrections + ' 次</div>'
      + (isLast
        ? '  <button type="button" class="qw-btn-primary qw-btn-wide" id="qwFinishBtn">完成本次讲题 🎉</button>'
        : '  <button type="button" class="qw-btn-primary qw-btn-wide" id="qwNextBtn">进入第 ' + (state.stepIndex + 2) + ' 步 · ' + esc(state.lesson.steps[state.stepIndex + 1].name) + ' →</button>')
      + '</div>';
    scrollChat();

    if (isLast) {
      $('#qwFinishBtn').addEventListener('click', completeLesson);
    } else {
      $('#qwNextBtn').addEventListener('click', () => openStep(state.stepIndex + 1));
    }
  }

  async function completeLesson() {
    if (state.completed) return;
    state.completed = true;
    clearInterval(state.timer);
    await recordProgress(true);

    const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
    const accuracy = Math.max(0, Math.round((state.doneSteps / (state.doneSteps + state.corrections)) * 100));
    const root = $('#classroomApp');
    root.innerHTML = ''
      + '<div class="qw-classroom-done">'
      + '  <div class="qw-confetti">' + ['🎉', '⭐', '✨', '🎊', '💡'].map((emoji, index) =>
        '<span style="--i:' + index + '">' + emoji + '</span>').join('') + '</div>'
      + '  <div class="qw-done-card">'
      + '    <div class="qw-done-badge">本次讲题完成</div>'
      + '    <h1>' + esc(state.lesson.title) + '</h1>'
      + '    <p class="qw-done-goal">' + esc(state.lesson.goal) + '</p>'
      + '    <div class="qw-done-stats">'
      + '      <div><b>' + state.doneSteps + '/' + stepCount() + '</b><span>讲题步骤</span></div>'
      + '      <div><b>' + minutes + '<i>分钟</i></b><span>本次用时</span></div>'
      + '      <div><b>' + state.hintsUsed + '</b><span>使用提示</span></div>'
      + '      <div><b>' + state.corrections + '</b><span>纠正次数</span></div>'
      + '    </div>'
      + '    <p class="qw-done-tip">' + (state.corrections
          ? '这次有 ' + state.corrections + ' 次走错方向，已经帮你记下来了，家长端可以看到对应的错因分析。'
          : '一路答对，思路很清晰！接下来去标准题检验一下掌握程度吧。') + '</p>'
      + '    <div class="qw-done-actions">'
      + '      <a class="qw-btn-primary" href="./quiz.html?kp=' + esc(state.kpId) + '">进入标准题 →</a>'
      + '      <button type="button" class="qw-btn-ghost" id="qwAgainBtn">再讲一遍</button>'
      + '      <a class="qw-btn-ghost" href="./home.html">返回首页</a>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    $('#qwAgainBtn').addEventListener('click', () => window.location.reload());
    if (window.lucide) window.lucide.createIcons();
  }

  // ---------------------------------------------------------------------------
  // 步骤切换与启动
  // ---------------------------------------------------------------------------
  function openStep(index) {
    clearTimeout(state.revealTimer);
    state.stepIndex = Math.max(0, Math.min(index, stepCount() - 1));
    state.maxReached = Math.max(state.maxReached, state.stepIndex);
    state.selected = null;
    state.completed = false;
    state.resolved = false;
    renderBoard();
    renderRail();
    startExplain();
    if (agent) agent.setContext({ kpId: state.kpId, stepIndex: state.stepIndex });
  }

  // ---------------------------------------------------------------------------
  // 智能体接入：学生在对话里问问题或直接作答，课堂同步做出反应
  // ---------------------------------------------------------------------------
  function mountAgent() {
    if (!window.QWAgent) return;
    agent = window.QWAgent.mount({
      root: '#qwAgentPanel',
      kpId: state.kpId,
      stepIndex: state.stepIndex,
      compact: true,
      greeting: true,
      onEvent: handleAgentEvent
    });

    const dock = $('#qwAgentDock');
    const toggle = $('#qwAgentToggle');
    toggle.addEventListener('click', () => {
      const open = dock.classList.toggle('open');
      toggle.textContent = open ? '⌄ 收起问数智能体' : '🤖 有疑问？问问问数智能体';
      if (open) {
        const box = $('#qwAgentText');
        if (box) box.focus();
      }
    });
  }

  function handleAgentEvent(meta) {
    if (!meta || !meta.effects) return;
    const answer = meta.effects.answer;
    if (answer && !state.resolved) {
      if (answer.isCorrect) {
        state.resolved = true;
        state.doneSteps = Math.max(state.doneSteps, state.stepIndex + 1);
        if (state.phase === 'checkpoint') {
          $$('#qwChatAction .qw-option').forEach(item => { item.disabled = true; });
          showFeedback(true, '你在对话里答对了：' + answer.chosen);
        }
        finishStep();
      } else {
        state.corrections += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 新手引导：把「这块是干什么的」一块一块讲清楚（QWTour）
  // ---------------------------------------------------------------------------
  const TOUR_STEPS = [
    { sel: '.qw-classroom-goal', title: '这节课要学什么',
      text: '每一课都从一个明确的学习目标开始，先看一眼，就知道这五步会把你带到哪里。' },
    { sel: '.qw-board-figure', title: '黑板会跟着步骤重画',
      text: '左边这块黑板不是一张静态插图：每往前走一步，图形就重新画一次，把抽象的关系直接画出来给你看。' },
    { sel: '.qw-step-rail', title: '五步讲题路线',
      text: '情境导入 → 概念精讲 → 例题演示 → 变式引导 → 课堂小结。走通过的步骤才会变成可点击，随时能倒回去复习。' },
    { sel: '.qw-chat-stream', title: '小问在这里一步一步讲',
      text: '讲解是一句一句冒出来的，别急着往下划。卡住了可以喊「提示一下」，但答案是留给你自己推出来的。' },
    { sel: '#qwChatAction', title: '轮到你动手了',
      text: '讲解结束会出现检查点，选一个答案提交。答错不会直接给答案，只会给你更具体的引导。点这里试试。',
      clickable: true },
    { sel: '#qwAgentDock', title: '随时可以喊小问',
      text: '还有没想通的地方，就展开智能体，把卡住的那一步直接问它。点这里看看。',
      clickable: true }
  ];

  function tourApi() { return window.QWTour || null; }

  function startTour() {
    const T = tourApi();
    if (!T) return;
    T.start(TOUR_STEPS, { key: 'classroom', label: '讲题课堂使用引导' });
  }

  function bindTour() {
    const btn = $('#qwTourBtn');
    if (btn) btn.addEventListener('click', startTour);
    const T = tourApi();
    // 第一次进讲题课堂自动走一遍，之后靠「怎么用」按钮手动重看
    if (T && !T.seen('classroom')) {
      setTimeout(function () { if (!T.isOpen()) T.autoStart('classroom', TOUR_STEPS, { label: '讲题课堂使用引导' }); }, 1100);
    }
  }

  function bindKeyboard() {
    document.addEventListener('keydown', event => {
      if (state.phase !== 'checkpoint') return;
      const options = $$('#qwChatAction .qw-option');
      if (event.key >= '1' && event.key <= String(options.length)) {
        const btn = options[Number(event.key) - 1];
        if (btn && !btn.disabled) btn.click();
      }
      if (event.key === 'Enter') {
        const submit = $('#qwSubmitBtn');
        if (submit && !submit.disabled) submit.click();
      }
    });
  }

  async function mount() {
    const root = $('#classroomApp');
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    state.kpId = params.get('kp') || 'kp1';
    root.innerHTML = '<div class="qw-classroom-loading"><span class="qw-spinner"></span><p>正在准备讲题课堂…</p></div>';

    try {
      const [lessonRes, dashRes] = await Promise.all([
        AUTH.request('/api/learning/lessons/' + state.kpId),
        AUTH.request('/api/dashboard')
      ]);
      state.lesson = lessonRes.data;
      state.dashboard = dashRes.data;
      const kp = (state.dashboard.knowledgePoints || []).find(item => item.id === state.kpId);
      const resume = kp && kp.status !== '已掌握' ? Math.min(kp.currentStep || 0, stepCount() - 1) : 0;

      renderShell();
      bindKeyboard();
      mountAgent();
      openStep(resume);
      bindTour();
      if (resume > 0) toast('已接着上次的进度，进入第 ' + (resume + 1) + ' 步');
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
