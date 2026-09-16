/**
 * 问数星途 · 会员领航舱（VIP 充值）
 * —— 三档方案 + 支付渠道 + 随机付款码 + 开通成功弹窗
 * —— 演示环境没有真实支付网关：后端下单后返回随机付款码，演示账号付款直接成功。
 */
(function () {
  'use strict';

  const AUTH = window.QWAuth;
  const DEMO_HINT = '演示账号 · 无需真实扫码，系统自动确认到账';

  // 小问的「领航密语」，点「换一句嘱托」轮播
  const PILOT_WORDS = [
    '领航员，加入星际舰队后，每一道错题我都会陪你深挖逆向思维里最闪亮的那一颗星。',
    '开通之后，三个知识星系全部点亮，我们就不用再绕开那些还没解锁的角落啦。',
    '别急着要答案呀——我会一层层问你，直到你自己把那颗星星点亮。',
    '长航程最怕中途掉线，年度全通卡能让我们把整年的思维习惯一次养好。',
    '放心，退款通道全程敞开；先带你去勾股星看一场推导烟花怎么样？'
  ];

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(value) {
    const num = Number(value || 0);
    return num % 1 === 0 ? String(num) : num.toFixed(2);
  }

  let toastTimer = null;
  function toast(message) {
    let node = $('.qw-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qw-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------
  const state = {
    plans: [],
    channels: [],
    membership: null,
    dust: 0,
    demo: false,
    selectedPlanId: 'yearly',
    selectedChannel: 'wechat',
    order: null,
    orderKind: 'vip',
    paying: false,
    wordIndex: 0,
    // 钱包：星尘 / 星钻余额 + 收支流水 + 充值档位
    wallet: null,
    packs: [],
    selectedPackId: 'c30'
  };

  function packById(id) {
    return (state.packs || []).find(item => item.id === id) || null;
  }

  function planById(id) {
    return state.plans.find(item => item.id === id) || null;
  }

  function selectedPlan() {
    return planById(state.selectedPlanId) || planById('yearly') || state.plans[0] || null;
  }

  function identityLabel() {
    const m = state.membership;
    if (m && m.active) return m.planName;
    if (m && m.expired) return '已过期 · ' + m.planName;
    return '启航试学体验';
  }

  // ---------------------------------------------------------------------------
  // 付款码：用随机点阵画一张「像二维码」的图形（演示用，不承载可解析信息）
  // ---------------------------------------------------------------------------
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function buildQrGrid(size, seedText) {
    const grid = [];
    const fixed = [];
    for (let y = 0; y < size; y += 1) {
      grid.push(new Array(size).fill(false));
      fixed.push(new Array(size).fill(false));
    }
    const paint = (x, y, on) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      grid[y][x] = on;
      fixed[y][x] = true;
    };

    // 三个定位角 + 一圈分隔带
    [[0, 0], [size - 7, 0], [0, size - 7]].forEach(pair => {
      const ox = pair[0];
      const oy = pair[1];
      for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
          const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
          const on = inside && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          paint(ox + x, oy + y, on);
        }
      }
    });

    // 右下校正图形
    const ax = size - 9;
    const ay = size - 9;
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        paint(ax + x, ay + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }

    // 定时图形
    for (let i = 8; i < size - 8; i += 1) {
      paint(i, 6, i % 2 === 0);
      paint(6, i, i % 2 === 0);
    }

    // 数据区：由付款码文本派生的伪随机点阵（同一条码每次画出来都一样）
    let seed = 2166136261;
    for (let i = 0; i < seedText.length; i += 1) {
      seed ^= seedText.charCodeAt(i);
      seed = Math.imul(seed, 16777619) >>> 0;
    }
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (fixed[y][x]) continue;
        grid[y][x] = rnd() > 0.47;
      }
    }
    return grid;
  }

  function renderQr(canvas, seedText) {
    if (!canvas || !canvas.getContext) return;
    const MODULES = 33;
    const QUIET = 3;
    const total = MODULES + QUIET * 2;
    const box = canvas.clientWidth || 208;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);
    canvas.style.height = box + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box, box);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, box, box);

    const grid = buildQrGrid(MODULES, String(seedText || 'QWPAY'));
    const cell = box / total;
    ctx.fillStyle = '#16233F';
    for (let y = 0; y < MODULES; y += 1) {
      for (let x = 0; x < MODULES; x += 1) {
        if (!grid[y][x]) continue;
        roundRect(ctx, (x + QUIET) * cell, (y + QUIET) * cell, cell, cell, cell * 0.3);
        ctx.fill();
      }
    }

    // 中间留一块白底徽标，视觉上更像真实的付款码
    const badge = cell * 7;
    const bx = (box - badge) / 2;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, bx, bx, badge, badge, badge * 0.26);
    ctx.fill();
    const grad = ctx.createLinearGradient(bx, bx, bx + badge, bx + badge);
    grad.addColorStop(0, '#FFD75E');
    grad.addColorStop(1, '#F5A81F');
    ctx.fillStyle = grad;
    roundRect(ctx, bx + badge * 0.13, bx + badge * 0.13, badge * 0.74, badge * 0.74, badge * 0.24);
    ctx.fill();
    ctx.fillStyle = '#4A2400';
    ctx.font = '700 ' + Math.round(badge * 0.42) + 'px "Noto Sans SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('问', bx + badge / 2, bx + badge / 2 + badge * 0.02);
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  function headerHtml() {
    const user = AUTH.getUser() || {};
    return ''
      + '<div class="qw-vip-topbar">'
      + '  <a class="qw-vip-back" href="./home.html">← 返回宇宙首页</a>'
      + '  <span class="qw-vip-brand"><span class="qw-vip-brand-face">🐱</span>小问星际漫游 · 会员领航舱</span>'
      + '  <span class="qw-vip-topspacer"></span>'
      + '  <span class="qw-vip-chip"><b>👑</b>当前身份：<i id="vipIdentity">' + esc(identityLabel()) + '</i></span>'
      + '  <span class="qw-vip-chip"><b>✨</b><i id="vipDust">' + esc(user.dust || state.dust) + '</i> 星尘</span>'
      + '</div>';
  }

  function heroHtml() {
    return ''
      + '<section class="qw-vip-hero">'
      + '  <div class="qw-vip-hero-main">'
      + '    <span class="qw-vip-ribbon">✨ 星际探索无限加速 · 苏格拉底式启发体系全面点亮</span>'
      + '    <h1>开通领航员特权，点亮全宇宙数学星系</h1>'
      + '    <p>告别单点试学的局限！解锁一次函数、三角形内角和与勾股定理等全部知识星系，让孩子在手绘图形与启发式 AI 引导中，从「讲懂」到「改对」无拘漫游。</p>'
      + '  </div>'
      + '  <aside class="qw-vip-word">'
      + '    <div class="qw-vip-word-head"><span>小问领航密语</span><b>🐱</b></div>'
      + '    <p id="vipWord">' + esc(PILOT_WORDS[0]) + '</p>'
      + '    <button type="button" class="qw-vip-word-btn" id="vipWordBtn">换一句嘱托 ↻</button>'
      + '  </aside>'
      + '</section>';
  }

  function featureHtml(item) {
    return '<li class="' + (item.strong ? 'is-strong' : '') + '">'
      + '<i>' + (item.strong ? '★' : '✓') + '</i><span>' + esc(item.text) + '</span></li>';
  }

  function planCardHtml(plan) {
    const active = plan.id === state.selectedPlanId;
    const owned = !plan.buyable;
    const cls = ['qw-vip-plan'];
    if (active) cls.push('is-active');
    if (plan.popular) cls.push('is-popular');
    if (owned) cls.push('is-free');

    const priceHtml = plan.price === 0
      ? '<div class="qw-vip-price"><span class="qw-vip-cur">¥</span><b>0</b><em>' + esc(plan.unit) + '</em></div>'
      : '<div class="qw-vip-price"><span class="qw-vip-cur">¥</span><b>' + money(plan.price) + '</b><em>' + esc(plan.unit) + '</em></div>';

    const wasHtml = plan.origin > plan.price
      ? '<span class="qw-vip-was">原价 ¥' + money(plan.origin) + '</span>'
      : '';

    return ''
      + '<article class="' + cls.join(' ') + '" data-plan="' + esc(plan.id) + '">'
      + '  <header class="qw-vip-plan-head">'
      + '    <span class="qw-vip-tier">' + esc(plan.tier) + '</span>'
      + '    <span class="qw-vip-flag">' + esc(plan.badge) + '</span>'
      + '  </header>'
      + '  <h3>' + esc(plan.name) + '</h3>'
      + '  <p class="qw-vip-plan-desc">' + esc(plan.desc) + '</p>'
      + '  <div class="qw-vip-price-row">' + priceHtml + wasHtml + '</div>'
      + (plan.quota
          ? '<div class="qw-vip-plan-quota' + (plan.quotaKind === 'unlimited' ? ' is-unlimited' : '') + '">'
            + '<span>' + (plan.quotaKind === 'unlimited' ? '👑' : '⚡') + '</span><b>' + esc(plan.quota) + '</b></div>'
          : '')
      + '  <ul class="qw-vip-feats">' + (plan.features || []).map(featureHtml).join('') + '</ul>'
      + (plan.locked && plan.locked.length
          ? '<ul class="qw-vip-feats qw-vip-feats-locked">'
            + plan.locked.map(text => '<li><i>✕</i><span>' + esc(text) + '</span></li>').join('')
            + '</ul>'
          : '')
      + '  <button type="button" class="qw-vip-plan-cta" data-plan-cta="' + esc(plan.id) + '"' + (owned ? ' disabled' : '') + '>'
      +      esc(plan.cta)
      + '  </button>'
      + '</article>';
  }

  function channelHtml(channel) {
    const on = channel.id === state.selectedChannel;
    return '<button type="button" class="qw-vip-channel' + (on ? ' is-on' : '') + '" data-channel="' + esc(channel.id) + '">'
      + '<span class="qw-vip-channel-ic">' + esc(channel.icon) + '</span>' + esc(channel.name) + '</button>';
  }

  function payPanelHtml() {
    const plan = selectedPlan();
    if (!plan) return '';
    const discount = Math.max((plan.origin || 0) - (plan.price || 0), 0);
    return ''
      + '<section class="qw-vip-pay" id="vipPayPanel">'
      + '  <div class="qw-vip-pay-left">'
      + '    <span class="qw-vip-safe">🛡 官方安全支付通道 · 7 天无理由随心退</span>'
      + '    <h3>当前结算方案：<b id="vipPayPlanName">' + esc(plan.name) + (plan.days ? '（' + plan.days + ' 天）' : '') + '</b></h3>'
      + '    <p id="vipPayPlanDesc">' + esc(plan.desc) + '。开通后自动点亮对应知识星系，并与当前账号绑定。</p>'
      + '    <div class="qw-vip-channels" id="vipChannels">' + state.channels.map(channelHtml).join('') + '</div>'
      + '  </div>'
      + '  <div class="qw-vip-pay-right">'
      + '    <div class="qw-vip-bill">'
      + '      <div><span>方案原价</span><b>¥' + money(plan.origin || 0) + '</b></div>'
      + '      <div><span>限时星际立减</span><b class="is-cut">-' + (discount ? '¥' + money(discount) : '¥0') + '</b></div>'
      + '      <div class="qw-vip-bill-total"><span>应付实付</span><b id="vipPayAmount">¥' + money(plan.price) + '</b></div>'
      + '    </div>'
      + '    <button type="button" class="qw-vip-submit" id="vipPayBtn">🔒 确认协议并开通特权 →</button>'
      + '    <p class="qw-vip-terms">点击即代表已同意《星际漫游用户协议》与《自动续费条款》' + (state.demo ? ' · <b class="qw-vip-demo">演示账号免支付</b>' : '') + '</p>'
      + '  </div>'
      + '</section>';
  }

  const TRUSTS = [
    { icon: '🎓', title: '绝不直接给出答案', text: '小问严格遵循苏格拉底追问原则，层层设问引导孩子自主推导出公式与定理。' },
    { icon: '🌙', title: '睡前防眩光微护眼', text: '深空低蓝配色，每次学习限时提醒远眺，夜航模式守护视力健康。' },
    { icon: '📊', title: '量化思维成长雷达', text: '精准呈现孩子在概念理解、运算能力、几何直观等五个维度的掌握曲线。' },
    { icon: '💚', title: '7 天无理由随心退', text: '开通后 7 天内若孩子不适应学习节奏，支持一键申请全额极速退款。' }
  ];

  // 星钻充值 + 收支记录（星尘 / 星钻的每一笔进出都能对得上）
  function walletHtml() {
    const w = state.wallet;
    const packs = (w && w.packs) || state.packs || [];
    const items = (w && w.items) || [];
    const balance = (w && w.balance) || { dust: 0, gem: 0 };
    const dust = (w && w.dust) || { income: 0, expense: 0 };
    const gem = (w && w.gem) || { income: 0, expense: 0 };

    const packCards = packs.map(item => ''
      + '<button type="button" class="qw-wallet-pack' + (state.selectedPackId === item.id ? ' active' : '') + '" data-pack="' + esc(item.id) + '">'
      + (item.tag ? '<span class="qw-wallet-pack-tag">' + esc(item.tag) + '</span>' : '')
      + '  <b>¥' + money(item.price) + '</b>'
      + '  <span class="qw-wallet-pack-gem">💎 ' + item.crystal + ' 星钻</span>'
      + '  <i>' + esc(item.desc) + '</i>'
      + '</button>').join('');

    const rows = items.length ? items.slice(0, 12).map(row => ''
      + '<li class="qw-wallet-row ' + (row.income ? 'is-in' : 'is-out') + '">'
      + '  <span class="qw-wallet-row-ic">' + (row.wallet === 'gem' ? '💎' : '✨') + '</span>'
      + '  <div class="qw-wallet-row-main"><b>' + esc(row.reason || row.categoryLabel) + '</b>'
      + '    <i>' + esc(row.categoryLabel) + ' · ' + esc(fmtTime(row.createdAt)) + '</i></div>'
      + '  <div class="qw-wallet-row-val"><b class="' + (row.income ? 'is-in' : 'is-out') + '">' + esc(row.signed) + '</b>'
      + '    <i>余额 ' + row.balance + '</i></div>'
      + '</li>').join('') : '<li class="qw-wallet-empty">还没有收支记录，签到、答题、充值都会记在这里。</li>';

    return ''
      + '<section class="qw-wallet" id="qwWallet">'
      + '  <div class="qw-wallet-head">'
      + '    <div><h3>💎 星钻充值 · 收支记录</h3>'
      + '      <p>星钻由等值充值获得（1 元 = 1 星钻）；星尘靠学习挣。两者都能兑换小问的对话次数。</p></div>'
      + '    <div class="qw-wallet-balances">'
      + '      <span class="qw-wallet-bal"><i>✨</i><b>' + balance.dust + '</b><em>星尘</em></span>'
      + '      <span class="qw-wallet-bal is-gem"><i>💎</i><b>' + balance.gem + '</b><em>星钻</em></span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="qw-wallet-grid">'
      + '    <div class="qw-wallet-recharge">'
      + '      <div class="qw-wallet-sub"><b>等值充值</b><span>1 元 = 1 星钻 · 2 星钻可换 1 次小问对话</span></div>'
      + '      <div class="qw-wallet-packs">' + packCards + '</div>'
      + '      <button type="button" class="qw-wallet-buy" id="qwWalletBuy">💎 立即充值'
      + (state.selectedPackId ? '（¥' + money((packById(state.selectedPackId) || {}).price || 0) + ' → '
        + ((packById(state.selectedPackId) || {}).crystal || 0) + ' 星钻）' : '') + '</button>'
      + '      <p class="qw-wallet-tip">演示账号 ' + (state.demo ? '下单后自动到账' : '需要扫码支付') + '；充值只用于兑换小问对话次数。</p>'
      + '    </div>'
      + '    <div class="qw-wallet-logs">'
      + '      <div class="qw-wallet-sub"><b>收支记录</b><span>最近 ' + Math.min(items.length, 12) + ' 笔</span></div>'
      + '      <div class="qw-wallet-sum">'
      + '        <span>星尘收入 <b class="is-in">+' + dust.income + '</b></span>'
      + '        <span>星尘支出 <b class="is-out">' + dust.expense + '</b></span>'
      + '        <span>星钻收入 <b class="is-in">+' + gem.income + '</b></span>'
      + '        <span>星钻支出 <b class="is-out">' + gem.expense + '</b></span>'
      + '      </div>'
      + '      <ul class="qw-wallet-list">' + rows + '</ul>'
      + '    </div>'
      + '  </div>'
      + '</section>';
  }

  function fmtTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 '
      + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function trustHtml() {
    return ''
      + '<section class="qw-vip-trust">'
      + '  <h3>让孩子每一分钟都花在思维成长上的「领航保障」</h3>'
      + '  <p>拒绝死记硬背，把好奇心转化为终身受益的几何与代数思维逻辑</p>'
      + '  <div class="qw-vip-trust-grid">'
      + TRUSTS.map(item => ''
          + '<article class="qw-vip-trust-card">'
          + '  <span class="qw-vip-trust-ic">' + item.icon + '</span>'
          + '  <b>' + esc(item.title) + '</b>'
          + '  <p>' + esc(item.text) + '</p>'
          + '</article>').join('')
      + '  </div>'
      + '</section>';
  }

  function render() {
    const root = $('#vipApp');
    if (!root) return;
    root.innerHTML = headerHtml()
      + '<div class="qw-vip-banner">🚀 星际探索无限加速 · 苏格拉底式启发体系全面点亮</div>'
      + heroHtml()
      + '<section class="qw-vip-plans">' + state.plans.map(planCardHtml).join('') + '</section>'
      + payPanelHtml()
      + walletHtml()
      + trustHtml()
      + payModalHtml()
      + successModalHtml();
    bind();
  }

  // ---------------------------------------------------------------------------
  // 弹窗
  // ---------------------------------------------------------------------------
  function payModalHtml() {
    return ''
      + '<div class="qw-vip-mask" id="vipPayMask" hidden>'
      + '  <div class="qw-vip-modal qw-vip-modal-pay" role="dialog" aria-modal="true" aria-label="扫码支付">'
      + '    <button type="button" class="qw-vip-close" id="vipPayClose" aria-label="关闭">✕</button>'
      + '    <h2>扫码支付</h2>'
      + '    <p class="qw-vip-modal-sub" id="vipPaySub">请使用对应 App 扫描下方付款码</p>'
      + '    <div class="qw-vip-qrwrap"><canvas class="qw-vip-qr" id="vipQr" width="208" height="208"></canvas></div>'
      + '    <div class="qw-vip-paymeta">'
      + '      <div><span>订单号</span><b id="vipOrderNo">--</b></div>'
      + '      <div><span>支付渠道</span><b id="vipOrderChannel">--</b></div>'
      + '      <div><span>应付金额</span><b class="qw-vip-amount" id="vipOrderAmount">--</b></div>'
      + '      <div><span>付款码尾号</span><b id="vipOrderTail">--</b></div>'
      + '    </div>'
      + '    <p class="qw-vip-scanhint" id="vipScanHint">正在等待支付结果…</p>'
      + '    <div class="qw-vip-modal-actions">'
      + '      <button type="button" class="qw-vip-submit" id="vipPaidBtn">我已完成支付</button>'
      + '      <button type="button" class="qw-btn-ghost" id="vipCancelBtn">稍后再付</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function successModalHtml() {
    return ''
      + '<div class="qw-vip-mask" id="vipOkMask" hidden>'
      + '  <div class="qw-vip-modal qw-vip-modal-ok" role="dialog" aria-modal="true" aria-label="开通成功">'
      + '    <div class="qw-vip-ok-badge">🎉</div>'
      + '    <h2>恭喜领航员！特权开通成功</h2>'
      + '    <p class="qw-vip-ok-sub" id="vipOkSub">全部知识星球与变式训练库已点亮，小问领航员已全速就位！</p>'
      + '    <div class="qw-vip-receipt">'
      + '      <div><span>开通账号</span><b id="vipOkAccount">--</b></div>'
      + '      <div><span>生效周期</span><b id="vipOkPeriod">--</b></div>'
      + '      <div><span>解锁特权</span><b class="is-open" id="vipOkPrivileges">--</b></div>'
      + '    </div>'
      + '    <button type="button" class="qw-vip-submit" id="vipOkGo">开始星际探险 🚀</button>'
      + '    <button type="button" class="qw-vip-stay" id="vipOkStay">留在本页查看我的权益</button>'
      + '  </div>'
      + '</div>';
  }

  function openMask(node) { if (node) node.hidden = false; }
  function closeMask(node) { if (node) node.hidden = true; }

  // ---------------------------------------------------------------------------
  // 交互
  // ---------------------------------------------------------------------------
  function selectPlan(id, scroll) {
    const plan = planById(id);
    if (!plan || !plan.buyable) return;
    state.selectedPlanId = id;
    render();
    if (scroll) {
      const panel = $('#vipPayPanel');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function selectChannel(id) {
    state.selectedChannel = id;
    $$('.qw-vip-channel').forEach(btn => btn.classList.toggle('is-on', btn.dataset.channel === id));
  }

  function bind() {
    $$('.qw-vip-plan').forEach(card => {
      card.addEventListener('click', () => selectPlan(card.dataset.plan, false));
    });
    $$('[data-plan-cta]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        selectPlan(btn.dataset.planCta, true);
      });
    });
    $$('.qw-vip-channel').forEach(btn => {
      btn.addEventListener('click', () => selectChannel(btn.dataset.channel));
    });

    const wordBtn = $('#vipWordBtn');
    if (wordBtn) {
      wordBtn.addEventListener('click', () => {
        state.wordIndex = (state.wordIndex + 1) % PILOT_WORDS.length;
        const node = $('#vipWord');
        if (node) node.textContent = PILOT_WORDS[state.wordIndex];
      });
    }

    const payBtn = $('#vipPayBtn');
    if (payBtn) payBtn.addEventListener('click', startOrder);

    const payClose = $('#vipPayClose');
    if (payClose) payClose.addEventListener('click', () => closeMask($('#vipPayMask')));
    const cancelBtn = $('#vipCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeMask($('#vipPayMask')));
    const paidBtn = $('#vipPaidBtn');
    if (paidBtn) paidBtn.addEventListener('click', () => confirmPay(false));

    $$('.qw-wallet-pack').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedPackId = btn.dataset.pack;
        $$('.qw-wallet-pack').forEach(node => node.classList.toggle('active', node === btn));
        const buy = $('#qwWalletBuy');
        const pack = packById(state.selectedPackId);
        if (buy && pack) buy.textContent = '💎 立即充值（¥' + money(pack.price) + ' → ' + pack.crystal + ' 星钻）';
      });
    });
    const buyBtn = $('#qwWalletBuy');
    if (buyBtn) buyBtn.addEventListener('click', startRecharge);

    const okGo = $('#vipOkGo');
    if (okGo) okGo.addEventListener('click', () => { window.location.href = './home.html'; });
    const okStay = $('#vipOkStay');
    if (okStay) okStay.addEventListener('click', () => {
      closeMask($('#vipOkMask'));
      loadStatus().then(render).catch(() => {});
    });
  }

  // 下单 -> 展示付款码
  async function startOrder() {
    const plan = selectedPlan();
    if (!plan || !plan.buyable) { toast('该方案无需支付'); return; }
    const btn = $('#vipPayBtn');
    if (btn) { btn.disabled = true; btn.textContent = '正在生成付款码…'; }
    try {
      const res = await AUTH.request('/api/vip/order', {
        method: 'POST',
        body: { planId: plan.id, channel: state.selectedChannel }
      });
      state.order = res.data.order;
      state.orderKind = 'vip';
      state.demo = !!res.data.demo;
      fillPayModal(state.order, !!res.data.instant);
      openMask($('#vipPayMask'));
      if (res.data.instant) {
        // 演示账号：直接成功，不用等扫码
        setTimeout(() => confirmPay(true), 1600);
      }
    } catch (err) {
      toast(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔒 确认协议并开通特权 →'; }
    }
  }

  // 星钻充值：下单 -> 付款码弹窗（演示账号直接到账）
  async function startRecharge() {
    const pack = packById(state.selectedPackId);
    if (!pack) { toast('先选一个充值档位'); return; }
    const btn = $('#qwWalletBuy');
    if (btn) { btn.disabled = true; btn.textContent = '正在生成付款码…'; }
    try {
      const res = await AUTH.request('/api/wallet/recharge', {
        method: 'POST',
        body: { packId: pack.id, channel: state.selectedChannel }
      });
      state.order = res.data.order;
      state.orderKind = 'crystal';
      fillPayModal(state.order, !!res.data.instant);
      openMask($('#vipPayMask'));
      if (res.data.instant) setTimeout(() => confirmPay(true), 1200);
    } catch (err) {
      toast(err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💎 立即充值（¥' + money(pack.price) + ' → ' + pack.crystal + ' 星钻）';
      }
    }
  }

  // 充值到账后：刷新钱包与余额，不弹会员成功弹窗
  async function finishRecharge(receipt) {
    closeMask($('#vipPayMask'));
    toast('💎 充值成功：+' + receipt.crystal + ' 星钻（余额 ' + receipt.balance.gem + ' 星钻）');
    await loadWallet();
    render();
    if (window.location.hash === '#wallet') scrollToWallet();
    window.dispatchEvent(new CustomEvent('qw-wallet-change', { detail: { balance: receipt.balance } }));
  }

  function fillPayModal(order, instant) {
    const set = (sel, text) => { const node = $(sel); if (node) node.textContent = text; };
    set('#vipOrderNo', order.orderNo);
    set('#vipOrderChannel', order.channelIcon + ' ' + order.channelName);
    set('#vipOrderAmount', '¥' + money(order.amount));
    set('#vipOrderTail', '**** ' + order.codeTail);
    set('#vipPaySub', instant ? '演示账号已就绪，' + DEMO_HINT : '请使用「' + order.channelName + '」扫描下方付款码');
    const hint = $('#vipScanHint');
    if (hint) hint.textContent = instant ? '⚡ 演示账号：正在自动确认到账…' : '正在等待支付结果…';
    const paidBtn = $('#vipPaidBtn');
    if (paidBtn) paidBtn.disabled = false;
    renderQr($('#vipQr'), order.code);
  }

  function showSuccess(receipt, membership) {
    const set = (sel, text) => { const node = $(sel); if (node) node.textContent = text; };
    set('#vipOkAccount', receipt.account + '（' + receipt.accountLabel + '）');
    set('#vipOkPeriod', receipt.period);
    set('#vipOkPrivileges', receipt.privileges.join(' + '));
    set('#vipOkSub', '您已成功激活【' + receipt.planName + '（' + receipt.days + ' 天）】，全部知识星球与变式训练库已点亮，小问领航员已全速就位！');
    closeMask($('#vipPayMask'));
    openMask($('#vipOkMask'));
    state.membership = membership;
    // 刷新本地登录态：顶栏皇冠与「我的」页立刻能看到领航员身份
    if (AUTH && typeof AUTH.me === 'function') {
      AUTH.me().then(user => {
        window.dispatchEvent(new CustomEvent('qw-user-change', { detail: { user: user } }));
      }).catch(() => {});
    }
    toast('👑 会员已开通：' + receipt.planName);
  }

  async function confirmPay(auto) {
    const order = state.order;
    if (!order || state.paying) return;
    state.paying = true;
    const btn = $('#vipPaidBtn');
    if (btn) { btn.disabled = true; btn.textContent = auto ? '正在确认到账…' : '确认中…'; }
    try {
      const res = state.orderKind === 'crystal'
        ? await AUTH.request('/api/wallet/recharge/pay', { method: 'POST', body: { orderNo: order.orderNo } })
        : await AUTH.request('/api/vip/pay', { method: 'POST', body: { orderNo: order.orderNo } });
      if (state.orderKind === 'crystal') await finishRecharge(res.data.receipt);
      else showSuccess(res.data.receipt, res.data.membership);
    } catch (err) {
      toast(err.message);
    } finally {
      state.paying = false;
      if (btn) { btn.disabled = false; btn.textContent = '我已完成支付'; }
    }
  }

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------
  async function loadStatus() {
    try {
      const res = await AUTH.request('/api/vip/status');
      state.membership = res.data.membership;
      state.demo = !!res.data.demo;
    } catch (err) {
      state.membership = null;
    }
  }

  // 收支记录：余额 + 流水 + 充值档位
  async function loadWallet() {
    try {
      const res = await AUTH.request('/api/wallet/logs?limit=40');
      state.wallet = res.data;
      state.packs = res.data.packs || state.packs;
      if (!packById(state.selectedPackId) && state.packs.length) {
        state.selectedPackId = (state.packs.find(item => item.tag) || state.packs[0]).id;
      }
    } catch (err) {
      state.wallet = null;
    }
  }

  function scrollToWallet() {
    const node = $('#qwWallet');
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function boot() {
    const root = $('#vipApp');
    if (!root) return;
    root.innerHTML = '<div class="qw-empty"><span class="qw-spinner"></span>正在加载会员方案…</div>';
    try {
      const [planRes, statusRes, gameRes, packRes, walletRes] = await Promise.all([
        AUTH.request('/api/vip/plans'),
        AUTH.request('/api/vip/status').catch(() => null),
        AUTH.request('/api/gamification/status').catch(() => null),
        AUTH.request('/api/wallet/packs').catch(() => null),
        AUTH.request('/api/wallet/logs?limit=40').catch(() => null)
      ]);
      state.plans = planRes.data.plans || [];
      state.channels = planRes.data.channels || [];
      state.demo = !!planRes.data.demo;
      state.selectedChannel = planRes.data.defaultChannel || 'wechat';
      state.membership = (statusRes && statusRes.data && statusRes.data.membership) || planRes.data.membership || null;
      state.dust = (gameRes && gameRes.data && gameRes.data.points) || 0;
      state.packs = (packRes && packRes.data && packRes.data.packs) || [];
      state.wallet = (walletRes && walletRes.data) || null;
      if (state.wallet && state.wallet.packs) state.packs = state.wallet.packs;
      const tagged = state.packs.find(item => item.tag);
      state.selectedPackId = tagged ? tagged.id : (state.packs[0] ? state.packs[0].id : 'c30');
      const hasYearly = state.plans.some(item => item.id === 'yearly' && item.buyable);
      state.selectedPlanId = hasYearly ? 'yearly' : ((state.plans.find(item => item.buyable) || {}).id || 'yearly');
      render();
      // 智能体那边的「收支记录」链接直接落到这一节
      if (window.location.hash === '#wallet') setTimeout(scrollToWallet, 120);
    } catch (err) {
      root.innerHTML = '<p class="qw-empty">' + esc(err.message) + '</p>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();