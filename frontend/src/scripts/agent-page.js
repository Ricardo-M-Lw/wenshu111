/**
 * 问数 Web 平台 - 智能体独立页面
 * 学生可以脱离讲题课堂单独和智能体对话、切换角色，并查看自己的学习画像
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;
  const KP_TABS = [
    { id: 'kp1', name: '一次函数', icon: '△' },
    { id: 'kp2', name: '三角形内角和', icon: '∠' },
    { id: 'kp3', name: '勾股定理', icon: '√' }
  ];

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let kpId = 'kp1';
  let stepIndex = 0;
  let lesson = null;
  let agent = null;
  let personas = [];

  function renderTabs(activeKp) {
    kpId = activeKp;
    $('#agentKpTabs').innerHTML = KP_TABS.map(tab =>
      '<button type="button" class="qw-kp-tab' + (tab.id === kpId ? ' active' : '') + '" data-kp="' + tab.id + '">'
      + tab.icon + ' ' + esc(tab.name) + '</button>').join('');
    Array.from(document.querySelectorAll('.qw-kp-tab')).forEach(btn => {
      btn.addEventListener('click', () => switchKp(btn.dataset.kp));
    });
  }

  function renderSteps() {
    const steps = (lesson && lesson.steps) || [];
    $('#agentStepTabs').innerHTML = steps.map((step, index) =>
      '<button type="button" class="qw-step-tab' + (index === stepIndex ? ' active' : '') + '" data-step="' + index + '">'
      + '<b>' + (index + 1) + '</b>' + esc(step.name) + '</button>').join('');
    Array.from(document.querySelectorAll('.qw-step-tab')).forEach(btn => {
      btn.addEventListener('click', () => {
        stepIndex = Number(btn.dataset.step);
        renderSteps();
        if (agent) agent.setContext({ kpId: kpId, stepIndex: stepIndex });
      });
    });
  }

  function renderAbilities(persona) {
    const target = persona || personas.find(item => item.id === (agent ? agent.getPersona() : 'tutor')) || personas[0];
    if (!target) return;
    $('#agentAbilities').innerHTML = '<h3>' + esc(target.icon) + ' ' + esc(target.name) + ' 能帮你做什么</h3>'
      + '<ul class="qw-agent-abilities">' + (target.abilities || []).map(item =>
        '<li><span>' + esc(item.icon) + '</span><div><b>' + esc(item.title) + '</b><p>' + esc(item.text) + '</p></div></li>').join('')
      + '</ul>';
  }

  function renderProfile(profile) {
    const errorTypes = (profile.errorTypes || []).length
      ? profile.errorTypes.map(name => '<span class="qw-problem-tag">' + esc(name) + '</span>').join('')
      : '<span class="qw-problem-tag qw-problem-none">暂时还没有明显错因</span>';
    $('#agentProfile').innerHTML = ''
      + '<h3>本次对话画像</h3>'
      + '<ul class="qw-side-list">'
      + '  <li><span>对话轮数</span><b>' + (profile.turnCount || 0) + '</b></li>'
      + '  <li><span>使用提示</span><b>' + (profile.hintCount || 0) + ' 次</b></li>'
      + '  <li><span>答对</span><b>' + (profile.correctCount || 0) + ' 次</b></li>'
      + '  <li><span>答错</span><b>' + (profile.wrongCount || 0) + ' 次</b></li>'
      + '  <li><span>觉得有帮助</span><b>' + (profile.helpfulCount || 0) + ' 次</b></li>'
      + '  <li><span>表示还没懂</span><b>' + (profile.confusedCount || 0) + ' 次</b></li>'
      + '  <li><span>索要答案被拦</span><b>' + (profile.blockedCount || 0) + ' 次</b></li>'
      + '</ul>'
      + '<h3 class="qw-side-sub">易错类型</h3>'
      + '<div class="qw-problem-tags">' + errorTypes + '</div>';
  }

  async function switchKp(nextKp) {
    kpId = nextKp;
    stepIndex = 0;
    renderTabs(kpId);
    try {
      lesson = (await AUTH.request('/api/learning/lessons/' + kpId)).data;
    } catch (err) {
      lesson = null;
    }
    renderSteps();
    if (agent) {
      agent.setContext({ kpId: kpId, stepIndex: stepIndex });
      agent.pushMessage('agent', '我们切换到「' + (lesson ? lesson.title : kpId) + '」啦，你想从哪一步开始？');
    }
    bindQuickBar();
    refreshProfile();
    // 兜底：onReady 之外也尝试搬一次（DOM 已经就绪时）
    setTimeout(relocateChrome, 0);
    setTimeout(relocateChrome, 600);
  }

  async function refreshProfile() {
    try {
      const data = (await AUTH.request('/api/agent/session?kpId=' + kpId + '&persona=' + (agent ? agent.getPersona() : 'tutor'))).data;
      renderProfile(data.profile);
      const chip = $('#agentProviderChip');
      if (chip) {
        chip.textContent = data.provider.name === 'openai'
          ? '大模型讲题老师 · ' + data.provider.model
          : '内置规则引擎 · 离线可用';
      }
    } catch (err) {
      console.warn('画像加载失败', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 一键自动生成：学习报告 / 错题记录 / 安全边界
  // 这三条直接读服务端已经算好的数据，不依赖大模型，点一下就能出结果
  // ---------------------------------------------------------------------------
  async function showStudyReport(range) {
    if (!agent) return;
    agent.pushMessage('user', range === 'week' ? '帮我生成近一周的学习报告' : '帮我生成学习报告');
    try {
      const data = (await AUTH.request('/api/agent/study-report?kpId=' + kpId + '&range=' + (range || 'session'))).data;
      agent.showReport(data);
      refreshProfile();
    } catch (err) {
      agent.pushMessage('agent', '报告生成失败了：' + err.message);
    }
  }

  async function showErrorBook() {
    if (!agent) return;
    agent.pushMessage('user', '看看我的错题记录');
    try {
      const data = (await AUTH.request('/api/agent/error-book?kpId=' + kpId)).data;
      agent.showErrorBook(data);
      refreshProfile();
    } catch (err) {
      agent.pushMessage('agent', '错题记录读取失败了：' + err.message);
    }
  }

  async function showGuardrails() {
    if (!agent) return;
    agent.pushMessage('user', '你的安全边界是什么？');
    try {
      const data = (await AUTH.request('/api/agent/guardrails')).data;
      agent.pushCard('qw-agent-guard',
        '<b>🛡 安全边界 · 共 ' + data.total + ' 条规则</b>'
        + '<p class="qw-report-lead">下面这些内容会在进入大模型之前就被拦下来，不会出现在对话里，也不会浪费一次模型调用。</p>'
        + '<div class="qw-guard-list">' + data.categories.map(item =>
          '<span class="qw-guard-chip qw-guard-' + esc(item.severity) + '">' + esc(item.label) + '<i>' + item.rules + ' 条</i></span>').join('')
        + '</div>'
        + '<p class="qw-report-lead">无论哪种角色，共同的底线都是：<b>永远不直接说答案</b>。</p>');
    } catch (err) {
      agent.pushMessage('agent', '安全边界读取失败了：' + err.message);
    }
  }

  function bindQuickBar() {
    const bar = $('#agentQuickBar');
    if (!bar) return;
    bar.addEventListener('click', event => {
      const btn = event.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'report') showStudyReport('session');
      else if (act === 'report-week') showStudyReport('week');
      else if (act === 'errors') showErrorBook();
      else if (act === 'guard') showGuardrails();
    });
  }
  // 角色切换条 / 五步闭环条：从右侧对话栏搬到左栏，右侧专心做「对话」
  function relocateChrome() {
    const personaSlot = $('#agentPersonaSlot');
    const stageSlot = $('#agentStageSlot');
    const card = $('#agentChrome');
    if (!personaSlot || !stageSlot) return;
    const personasBox = document.querySelector('#qwAgentPersonas');
    const stageBox = document.querySelector('#qwAgentStage');
    let moved = false;
    if (personasBox && personasBox.parentNode !== personaSlot) { personaSlot.appendChild(personasBox); moved = true; }
    if (stageBox && stageBox.parentNode !== stageSlot) { stageSlot.appendChild(stageBox); moved = true; }
    if (card && moved) card.hidden = false;
  }

  async function boot() {
    const root = $('#agentApp');
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    kpId = params.get('kp') || 'kp1';

    root.innerHTML = ''
      + '<header class="qw-agent-page-head">'
      + '  <div>'
      + '    <p class="qw-parent-date">讲题老师的 AI 版</p>'
      + '    <h1>问数智能体</h1>'
      + '  </div>'
      + '  <div class="qw-agent-head-side">'
      + '    <span class="qw-agent-provider" id="agentProviderChip">正在连接智能体…</span>'
      + '    <p class="qw-agent-tip">三位 AI 角色陪你把每一步想明白，永远不会直接说答案。</p>'
      + '  </div>'
      + '</header>'
      + '<div class="qw-agent-page-grid">'
      + '  <aside class="qw-agent-side">'
      + '    <div class="qw-card qw-side-card" id="agentChrome" hidden>'
      + '      <h3>切换 AI 角色</h3>'
      + '      <div id="agentPersonaSlot"></div>'
      + '      <h3 class="qw-side-sub">引导式教学五步</h3>'
      + '      <div id="agentStageSlot"></div>'
      + '    </div>'
      + '    <div class="qw-card qw-side-card qw-agent-context">'
      + '      <h3>选择知识点</h3>'
      + '      <div class="qw-agent-kp" id="agentKpTabs"></div>'
      + '      <h3 class="qw-side-sub">讲题步骤</h3>'
      + '      <div class="qw-agent-steps" id="agentStepTabs"></div>'
      + '      <h3 class="qw-side-sub">一键生成</h3>'
      + '      <div class="qw-agent-quickbar" id="agentQuickBar">'
      + '        <button type="button" data-act="report">📊 一键生成学习报告</button>'
      + '        <button type="button" data-act="report-week">🗓 近一周报告</button>'
      + '        <button type="button" data-act="errors">📕 错题记录</button>'
      + '        <button type="button" data-act="guard">🛡 安全边界</button>'
      + '      </div>'
      + '    </div>'
      + '    <div class="qw-card qw-side-card" id="agentProfile"></div>'
      + '    <div class="qw-card qw-side-card" id="agentAbilities"></div>'
      + '  </aside>'
      + '  <section class="qw-card qw-agent-main" id="agentMain">'
      + '    <div id="agentPanel"></div>'
      + '  </section>'
      + '</div>';

    renderTabs(kpId);
    try {
      lesson = (await AUTH.request('/api/learning/lessons/' + kpId)).data;
    } catch (err) {
      lesson = null;
    }
    renderSteps();

    agent = window.QWAgent.mount({
      root: '#agentPanel',
      kpId: kpId,
      stepIndex: stepIndex,
      compact: false,
      greeting: true,
      // 主动建议卡占掉对话框顶部一大块，学生反馈「对话框太小」——这里关掉，
      // 把高度全留给对话；组件本身还支持 suggest，课堂内嵌面板仍在用
      suggest: false,
      onEvent: () => refreshProfile(),
      onPersona: info => {
        renderAbilities(info.info);
        refreshProfile();
      },
      onReady: ready => {
        personas = ready.personas || [];
        renderAbilities();
        relocateChrome();
      }
    });
    bindQuickBar();
    refreshProfile();
    // 兜底：onReady 之外也尝试搬一次（DOM 已经就绪时）
    setTimeout(relocateChrome, 0);
    setTimeout(relocateChrome, 600);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();