// 服务层：星尘 / 星钻钱包（等值充值 + 收支流水）
//
// 口径说明（产品规则，改这里就够）：
//   · 星尘（dust）= 学习挣来的通用积分：签到 / 答对题 / 完成任务都会加
//   · 星钻（gem） = 充值买来的钻石：1 元 = 1 星钻，等值充值，不做赠送
//   · 两者都能兑换小问的对话次数（见 agentQuotaService 的兑换表）
//   · 每一次加减都写一条 qw_wallet_log，前端「收支记录」直接读这张表
//
// 数据落点：qw_gamification 记余额（points / crystal_recharge / crystal_used），
// qw_wallet_log 记流水，qw_crystal_order 记充值订单。

const crypto = require('crypto');
const repos = require('../repositories');
const gamificationService = require('./gamificationService');
const { ok, fail } = require('../utils/reply');

// 等值充值档位：付多少元就到账多少星钻
const PACKS = [
  { id: 'c6', price: 6, crystal: 6, tag: '', desc: '6 星钻 · 够换 3 次小问对话' },
  { id: 'c30', price: 30, crystal: 30, tag: '常充', desc: '30 星钻 · 够换 15 次小问对话' },
  { id: 'c68', price: 68, crystal: 68, tag: '超值', desc: '68 星钻 · 够换 34 次小问对话' },
  { id: 'c128', price: 128, crystal: 128, tag: '舰长', desc: '128 星钻 · 够换 64 次小问对话' }
];

const CHANNELS = {
  wechat: { id: 'wechat', name: '微信支付', icon: '💚' },
  alipay: { id: 'alipay', name: '支付宝', icon: '💙' },
  unionpay: { id: 'unionpay', name: '银联 / 云闪付', icon: '❤️' }
};

const WALLET_LABEL = { dust: '星尘', gem: '星钻' };
const CATEGORY_LABEL = {
  checkin: '每日签到',
  quiz: '答对标准题',
  lesson: '完成讲题课堂',
  ladder: '星际天梯',
  badge: '解锁徽章',
  redeem: '兑换小问对话',
  recharge: '星钻充值',
  seed: '历史记录'
};

function packById(id) { return PACKS.find(function (item) { return item.id === id; }) || null; }
function channelList() { return Object.keys(CHANNELS).map(function (key) { return CHANNELS[key]; }); }
function channelOf(id) { return CHANNELS[id] || CHANNELS.wechat; }

function makeOrderNo() {
  const d = new Date();
  const stamp = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'CR' + stamp + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function makePayCode(channel, orderNo) {
  return 'QWPAY:' + channel + ':' + orderNo + ':' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

// 取钱包行；没有就初始化
function rowOf(userId) {
  return repos.gamification.of(userId) || repos.gamification.ensure(userId, { badges: [], checkinHistory: [] });
}

function balanceOf(userId) {
  const row = rowOf(userId);
  const crystals = gamificationService.crystalsOf(userId, row);
  return { dust: row.points || 0, gem: crystals.available };
}

// 记一条流水（正数收入 / 负数支出），顺带把变动后的余额写进去
function record(userId, wallet, amount, category, reason, when) {
  if (!userId || !amount) return null;
  const balance = balanceOf(userId)[wallet];
  return repos.wallet.insertLog({
    id: 'wl' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    userId: userId,
    wallet: wallet,
    amount: amount,
    balance: balance,
    category: category || 'seed',
    reason: reason || CATEGORY_LABEL[category] || '',
    createdAt: when || new Date().toISOString()
  });
}

function decorate(row) {
  return Object.assign({}, row, {
    walletLabel: WALLET_LABEL[row.wallet] || row.wallet,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    signed: (row.amount > 0 ? '+' : '') + row.amount,
    income: row.amount > 0
  });
}

function packs() {
  return ok({
    data: {
      packs: PACKS,
      channels: channelList(),
      defaultChannel: 'wechat',
      rate: '1 元 = 1 星钻',
      wallets: [
        { id: 'dust', label: '星尘', icon: '✨', how: '签到、答对标准题、完成讲题课堂都能攒' },
        { id: 'gem', label: '星钻', icon: '💎', how: '等值充值获得（1 元 = 1 星钻），也可以在会员领航舱充值' }
      ]
    }
  });
}

// 收支记录：余额 + 汇总 + 最近流水
function overview(user, limit) {
  if (!user) return fail(401, '请先登录');
  const rows = repos.wallet.listLogsByUser(user.id, limit || 40);
  const balance = balanceOf(user.id);
  const crystals = gamificationService.crystalsOf(user.id, rowOf(user.id));
  return ok({
    data: {
      balance: balance,
      crystals: crystals,
      dust: Object.assign({ wallet: 'dust', label: '星尘', icon: '✨', balance: balance.dust },
        repos.wallet.sumByWallet(user.id, 'dust')),
      gem: Object.assign({ wallet: 'gem', label: '星钻', icon: '💎', balance: balance.gem },
        repos.wallet.sumByWallet(user.id, 'gem')),
      items: rows.map(decorate),
      packs: PACKS
    }
  });
}

function createRecharge(user, body) {
  if (!user) return fail(401, '请先登录');
  const input = body || {};
  const pack = packById(input.packId);
  if (!pack) return fail(400, '充值档位不存在，请重新选择');

  const channelId = CHANNELS[input.channel] ? input.channel : 'wechat';
  const orderNo = makeOrderNo();
  const code = makePayCode(channelId, orderNo);
  const order = repos.wallet.insertOrder({
    orderNo: orderNo,
    userId: user.id,
    packId: pack.id,
    amount: pack.price,
    crystal: pack.crystal,
    channel: channelId,
    payCode: code,
    // 和会员订单保持同样的字段名，前端付款码弹窗可以复用
    code: code,
    codeTail: code.slice(-4),
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  const demo = isDemoUser(user);
  return ok({
    data: {
      order: Object.assign({}, order, {
        channelName: channelOf(channelId).name,
        channelIcon: channelOf(channelId).icon,
        planName: '星钻充值 ¥' + pack.price
      }),
      demo: demo,
      instant: demo
    }
  });
}

function isDemoUser(user) { return !!user && String(user.phone) === '13800000001'; }

function payRecharge(user, body) {
  if (!user) return fail(401, '请先登录');
  const input = body || {};
  const order = repos.wallet.findOrder(String(input.orderNo || ''));
  if (!order || order.userId !== user.id) return fail(404, '充值订单不存在或已失效，请重新下单');
  if (order.status === 'paid') return fail(400, '这笔充值已经到账啦');

  const pack = packById(order.packId);
  if (!pack) return fail(400, '充值档位不存在，请重新下单');

  repos.wallet.updateOrder(order.orderNo, { status: 'paid', paidAt: new Date().toISOString() });

  const row = rowOf(user.id);
  repos.gamification.update(user.id, { crystalRecharge: (row.crystalRecharge || 0) + pack.crystal });
  record(user.id, 'gem', pack.crystal, 'recharge', '充值 ¥' + pack.price + ' 获得 ' + pack.crystal + ' 星钻');

  const balance = balanceOf(user.id);
  const receipt = {
    account: String(user.phone || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
    packId: pack.id,
    amount: pack.price,
    crystal: pack.crystal,
    channelName: channelOf(order.channel).name,
    balance: balance
  };
  return ok({ data: { paid: true, instant: isDemoUser(user), receipt: receipt, balance: balance } });
}

// 新注册学生：把「充值 0 / 花掉 0」显式落下，避免后面出现 undefined
function initFor(user) {
  if (!user || user.role !== 'student') return null;
  const row = rowOf(user.id);
  repos.gamification.update(user.id, {
    crystalRecharge: row.crystalRecharge || 0,
    crystalUsed: row.crystalUsed || 0
  });
  return row;
}

module.exports = {
  PACKS, CHANNELS, WALLET_LABEL, CATEGORY_LABEL,
  packById, channelList, balanceOf, record, packs, overview, createRecharge, payRecharge, initFor, rowOf
};