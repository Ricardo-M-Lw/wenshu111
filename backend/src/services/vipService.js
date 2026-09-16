// 服务层：会员领航舱（方案 / 下单 / 支付 / 权益 / 管理端订单）
// 演示环境不接真实支付网关：下单生成随机付款码，支付接口按业务规则判定成功。
// 数据访问走仓储层（订单表 qw_vip_order、权益表 qw_membership）。

const crypto = require('crypto');
const repos = require('../repositories');
const { ok, created, fail } = require('../utils/reply');

const DAY = 24 * 60 * 60 * 1000;

// 演示账号：下单后无需扫码，直接支付成功
const DEMO_ACCOUNTS = ['13800000001'];

const CHANNELS = {
  wechat: { id: 'wechat', name: '微信支付', icon: '💚' },
  alipay: { id: 'alipay', name: '支付宝', icon: '💙' },
  unionpay: { id: 'unionpay', name: '银联 / 云闪付', icon: '❤️' }
};
const DEFAULT_CHANNEL = 'wechat';

const PLANS = [
  {
    id: 'free',
    tier: '基础层级',
    badge: '永久免费',
    name: '启航试学体验',
    desc: '适合新领航员初探宇宙，体验苏格拉底式讲题对话',
    price: 0,
    origin: 0,
    unit: '/ 永久有效',
    days: 0,
    buyable: false,
    cta: '当前已拥有该权益',
    quota: '小问对话每天 10 次',
    quotaKind: 'limited',
    features: [
      { text: '1 个核心知识星球（一次函数启航篇）', strong: true },
      { text: '3 讲沉浸式课堂（讲题 / 练会 / 改对各 1 讲）' },
      { text: '基础学情速览（用时与掌握度速报）' },
      { text: '小问对话每天 10 次，星尘 / 星钻可兑换加次' }
    ],
    locked: ['三角形内角和大星系解锁', '无限变式题库 + 错因漂流']
  },
  {
    id: 'monthly',
    tier: '灵活进阶',
    badge: '月度订阅',
    name: '星际月度领航舱',
    desc: '适合针对近期单元重难点做针对性攻坚',
    price: 29,
    origin: 40,
    unit: '/ 月（随时可退可续）',
    days: 30,
    buyable: true,
    cta: '选择月度方案（¥29）',
    quota: '小问对话不限次',
    quotaKind: 'unlimited',
    features: [
      { text: '全部知识星球解锁（一次函数 / 内角和 / 勾股定理）', strong: true },
      { text: '全阶梯训练关卡（基础直觉 + 变式题库）' },
      { text: '错因纠正闭环（错因诊断 + 订正追踪）' },
      { text: '完整学情看板与五维能力雷达' },
      { text: '小问不限次苏格拉底式启发' }
    ],
    locked: []
  },
  {
    id: 'yearly',
    tier: '终极全通',
    badge: '最受欢迎 · 省 ¥89',
    name: '星际年度全通舰长',
    desc: '完整打通全年段数学底层思维，陪伴长期成长',
    price: 259,
    origin: 348,
    unit: '/ 年',
    days: 365,
    buyable: true,
    popular: true,
    cta: '立即开通年度全通卡（¥259）',
    quota: '小问对话不限次',
    quotaKind: 'unlimited',
    features: [
      { text: '全年全部知识星球 100% 畅玩（含后续更新）', strong: true },
      { text: '海量实战关卡与变式题库无限制刷练' },
      { text: '错因推演不限次运行 + 错题亮点册永久沉淀' },
      { text: '学情周报 / 月度趋势深度导出' },
      { text: '专属权益：小问四态表情包 + 睡前柔光白噪音电台' }
    ],
    locked: []
  }
];

function planById(id) { return PLANS.find(function (item) { return item.id === id; }) || null; }
function channelList() { return Object.keys(CHANNELS).map(function (key) { return CHANNELS[key]; }); }
function isDemoUser(user) { return !!user && DEMO_ACCOUNTS.indexOf(String(user.phone)) !== -1; }

function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length < 7) return value || '未知账号';
  return value.slice(0, 3) + '****' + value.slice(-4);
}

function fmtDate(value) {
  const d = new Date(value);
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
}

function makeOrderNo() {
  const d = new Date();
  const stamp = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'QW' + stamp + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// 付款码：每次下单随机生成，前端把它画成二维码图形
function makePayCode(channel, orderNo) {
  return 'QWPAY:' + channel + ':' + orderNo + ':' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

// 会员视图：口径与前端皇冠角标、我的页入口卡一致
function membershipOf(user) {
  const m = user && user.membership;
  if (!m) {
    return { active: false, planId: 'free', planName: '启航试学体验', tier: '基础层级', endAt: null };
  }
  const active = new Date(m.endAt).getTime() > Date.now();
  return Object.assign({}, m, {
    active: active,
    expired: !active,
    endAtLabel: fmtDate(m.endAt),
    startAtLabel: fmtDate(m.startAt)
  });
}

// 开通 / 续期：已有未过期会员则在原到期日上顺延
function activate(user, plan, order) {
  const now = Date.now();
  const prev = user.membership && new Date(user.membership.endAt).getTime() > now ? user.membership : null;
  const startAt = prev ? new Date(prev.startAt) : new Date(now);
  const base = prev ? new Date(prev.endAt).getTime() : now;
  const endAt = new Date(base + plan.days * DAY);

  repos.vip.writeMembership(user, {
    planId: plan.id,
    planName: plan.name,
    tier: plan.tier,
    days: plan.days,
    autoRenew: plan.id === 'monthly',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    activatedAt: new Date(now).toISOString(),
    orderNo: order.orderNo,
    channel: order.channel,
    renewFromPrev: !!prev
  });
  return membershipOf(user);
}

function publicOrder(order) {
  return {
    orderNo: order.orderNo,
    planId: order.planId,
    planName: order.planName,
    tier: order.tier,
    amount: order.amount,
    origin: order.origin,
    discount: order.discount,
    channel: order.channel,
    channelName: order.channelName,
    channelIcon: order.channelIcon,
    code: order.code,
    codeTail: order.codeTail,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null
  };
}

// 方案列表（未登录也能看价格页）
function plans(user) {
  return ok({
    data: {
      plans: PLANS,
      channels: channelList(),
      defaultChannel: DEFAULT_CHANNEL,
      demo: isDemoUser(user),
      membership: user ? membershipOf(user) : null
    }
  });
}

function status(user) {
  if (!user) return fail(401, '请先登录');
  return ok({
    data: {
      membership: membershipOf(user),
      demo: isDemoUser(user),
      orders: repos.vip.listOrdersByUser(user.id, 5).map(publicOrder)
    }
  });
}

function createOrder(user, body) {
  if (!user) return fail(401, '请先登录');
  const input = body || {};

  const plan = planById(input.planId);
  if (!plan) return fail(400, '方案不存在，请重新选择');
  if (!plan.buyable) return fail(400, '该方案无需支付，可直接使用');

  const channelId = CHANNELS[input.channel] ? input.channel : DEFAULT_CHANNEL;
  const channel = CHANNELS[channelId];
  const orderNo = makeOrderNo();
  const code = makePayCode(channelId, orderNo);

  const order = repos.vip.insertOrder({
    orderNo: orderNo,
    userId: user.id,
    planId: plan.id,
    planName: plan.name,
    tier: plan.tier,
    origin: plan.origin,
    discount: Math.max(plan.origin - plan.price, 0),
    amount: plan.price,
    days: plan.days,
    channel: channelId,
    channelName: channel.name,
    channelIcon: channel.icon,
    code: code,
    codeTail: code.slice(-4),
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  const demo = isDemoUser(user);
  return created({ data: { order: publicOrder(order), demo: demo, instant: demo } });
}

function pay(user, body) {
  if (!user) return fail(401, '请先登录');
  const input = body || {};

  const order = repos.vip.findOrder(String(input.orderNo || ''));
  if (!order || order.userId !== user.id) return fail(404, '订单不存在或已失效，请重新下单');
  if (order.status === 'paid') return fail(400, '这笔订单已经支付过啦');

  const plan = planById(order.planId);
  if (!plan) return fail(400, '方案不存在，请重新下单');

  const transactionId = 'TX' + crypto.randomBytes(6).toString('hex').toUpperCase();
  repos.vip.updateOrder(order.orderNo, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    transactionId: transactionId
  });

  const membership = activate(user, plan, order);

  return ok({
    data: {
      paid: true,
      instant: isDemoUser(user),
      order: publicOrder(order),
      membership: membership,
      receipt: {
        account: maskPhone(user.phone),
        accountLabel: (user.nickname || user.name || '同学') + '（少年领航员）',
        planName: plan.name,
        period: fmtDate(membership.startAt) + ' - ' + fmtDate(membership.endAt),
        days: plan.days,
        privileges: ['全星系知识点', '无限变式训练'],
        transactionId: transactionId
      }
    }
  });
}

// ---------------- 管理端（教师 / 运营）----------------
function adminOrders() {
  const items = repos.vip.listOrders({ limit: 50 }).map(publicOrder);
  const paid = repos.vip.listPaidOrders();
  return ok({
    data: {
      total: repos.vip.countOrders(),
      paid: paid.length,
      pending: repos.vip.countOrders(function (row) { return row.status === 'pending'; }),
      revenue: repos.vip.totalRevenue(),
      items: items
    }
  });
}

function adminMembers() {
  const items = repos.user.list()
    .filter(function (user) { return !!repos.vip.readMembership(user); })
    .map(function (user) {
      const m = membershipOf(user);
      return {
        id: user.id,
        name: user.name,
        nickname: user.nickname,
        phone: maskPhone(user.phone),
        role: user.role,
        planId: m.planId,
        planName: m.planName,
        active: m.active,
        days: m.days,
        endAt: m.endAt,
        endAtLabel: m.endAtLabel
      };
    })
    .sort(function (a, b) { return new Date(b.endAt || 0) - new Date(a.endAt || 0); });

  return ok({
    data: {
      total: items.length,
      active: items.filter(function (item) { return item.active; }).length,
      items: items
    }
  });
}

module.exports = {
  DAY, PLANS, CHANNELS, DEFAULT_CHANNEL, DEMO_ACCOUNTS,
  planById, channelList, isDemoUser, maskPhone, fmtDate, makeOrderNo, makePayCode,
  membershipOf, activate, publicOrder,
  plans, status, createOrder, pay, adminOrders, adminMembers
};