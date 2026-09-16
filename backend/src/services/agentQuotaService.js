// 服务层：AI 对话配额（免费版每天 N 次 / 星尘·星钻兑换加次 / 会员不限次）
//
// 口径说明（产品规则，改这里就够）：
//   · 一次「对话」= 学生发给小问的一条消息（/api/agent/chat 与 /api/agent/chat/stream 各算一次）
//   · 免费额度每天 0 点重置；兑换到的次数记在「今天」，同样当天有效
//   · 会员（月度 / 年度且未过期）不限次：不扣额度，也不允许再兑换
//   · 星尘是余额（可扣），星钻是成就折算值 —— 所以扣星钻记的是 crystal_used 偏移量，
//     这样「解锁新徽章 → 星钻变多」和「兑换 → 星钻变少」两件事不会互相打架
//
// 数据落点：qw_gamification 的 agent_date / agent_used / agent_extra / crystal_used 四列，
// 和「星尘」同一行，兑换扣分和扣钻在一个事务里完成。

const config = require('../config');
const repos = require('../repositories');
const gamificationService = require('./gamificationService');
const walletService = require('./walletService');
const { ok, fail } = require('../utils/reply');

const FREE_DAILY = config.agentQuota.freeDaily;
const REDEEM = config.agentQuota.redeem;

function today() { return new Date().toISOString().split('T')[0]; }

function redeemOptions() {
  return REDEEM.map(function (item) {
    return {
      id: item.id,
      unit: item.unit,
      icon: item.icon,
      cost: item.cost,
      rounds: item.rounds,
      desc: item.desc,
      label: item.cost + ' ' + item.unit + ' = ' + item.rounds + ' 次'
    };
  });
}

function optionById(id) {
  return REDEEM.find(function (item) { return item.id === id; }) || null;
}

// 取配额行；没有就按模板初始化一条（新注册学生正常走 gamificationService.initFor）
function rowOf(userId) {
  const existing = repos.gamification.of(userId);
  if (existing) return existing;
  const template = repos.gamification.of('u1') || { badges: [] };
  return repos.gamification.ensure(userId, {
    badges: (template.badges || []).map(function (badge) { return Object.assign({}, badge, { unlockedAt: null }); }),
    checkinHistory: []
  });
}

// 跨天重置：昨天用掉的额度不带进今天
function rollover(row) {
  const date = today();
  if (row.agentDate === date) return row;
  repos.gamification.update(row.userId, { agentDate: date, agentUsed: 0, agentExtra: 0 });
  return repos.gamification.of(row.userId);
}

function membershipOf(user) {
  const active = repos.vip.isActive(user);
  const m = repos.vip.readMembership(user);
  return {
    vip: active,
    planId: active && m ? m.planId : 'free',
    planName: active && m ? m.planName : '启航试学体验',
    tier: active && m ? m.tier : '基础层级'
  };
}

function balanceOf(userId) {
  const row = rowOf(userId);
  const crystals = gamificationService.crystalsOf(userId, row);
  return { dust: row.points || 0, gem: crystals.available, gemEarned: crystals.total, gemSpent: crystals.spent };
}

function state(user) {
  const membership = membershipOf(user);
  const row = rollover(rowOf(user.id));
  const extra = row.agentExtra || 0;
  const used = row.agentUsed || 0;
  const unlimited = membership.vip;
  const limit = FREE_DAILY + extra;
  const balance = balanceOf(user.id);

  return {
    date: today(),
    vip: membership.vip,
    planId: membership.planId,
    planName: membership.planName,
    tier: membership.tier,
    unlimited: unlimited,
    freeDaily: FREE_DAILY,
    extra: extra,
    limit: unlimited ? null : limit,
    used: used,
    remaining: unlimited ? null : Math.max(0, limit - used),
    balance: { dust: balance.dust, gem: balance.gem },
    redeem: redeemOptions().map(function (item) {
      return Object.assign({}, item, { affordable: balance[item.id] >= item.cost });
    })
  };
}

// 扣一次额度：返回 { allowed, quota }
function consume(user) {
  const membership = membershipOf(user);
  if (membership.vip) return { allowed: true, unlimited: true, quota: state(user) };

  const row = rollover(rowOf(user.id));
  const limit = FREE_DAILY + (row.agentExtra || 0);
  if ((row.agentUsed || 0) >= limit) {
    return { allowed: false, unlimited: false, reason: 'exhausted', quota: state(user) };
  }
  repos.gamification.update(user.id, { agentUsed: (row.agentUsed || 0) + 1 });
  return { allowed: true, unlimited: false, quota: state(user) };
}

// 把刚扣掉的一次还回去：只在「额度已经扣了、但这次调用失败」时用
function refund(user) {
  const row = repos.gamification.of(user.id);
  if (!row || row.agentDate !== today()) return;
  repos.gamification.update(user.id, { agentUsed: Math.max(0, (row.agentUsed || 0) - 1) });
}

// 兑换：星尘直接扣余额，星钻扣 crystal_used 偏移
function redeem(user, methodId) {
  if (!user) return fail(401, '请先登录');
  if (membershipOf(user).vip) return fail(400, '你已经是领航员啦，小问不限次，不用再兑换');

  const option = optionById(methodId);
  if (!option) return fail(400, '兑换方式不存在，请重新选择');

  const balance = balanceOf(user.id);
  if (balance[option.id] < option.cost) {
    const lack = option.cost - balance[option.id];
    return fail(400, option.unit + '不够啦，还差 ' + lack + ' ' + option.unit
      + '。签到、答题、完成讲题课堂都能攒星尘；星钻由等值充值获得（1 元 = 1 星钻）。');
  }

  const row = rollover(rowOf(user.id));
  const patch = { agentExtra: (row.agentExtra || 0) + option.rounds };
  if (option.id === 'dust') patch.points = Math.max(0, (row.points || 0) - option.cost);
  else patch.crystalUsed = (row.crystalUsed || 0) + option.cost;
  repos.gamification.update(user.id, patch);
  // 收支记录：兑换是一次支出，写进流水，前端「收支记录」能看到
  walletService.record(user.id, option.id, -option.cost, 'redeem',
    '兑换小问对话 ' + option.rounds + ' 次（' + option.cost + ' ' + option.unit + '）');

  return ok({
    data: {
      redeemed: true,
      method: option.id,
      unit: option.unit,
      cost: option.cost,
      rounds: option.rounds,
      label: option.cost + ' ' + option.unit + ' = ' + option.rounds + ' 次',
      quota: state(user)
    }
  });
}

module.exports = { FREE_DAILY, redeemOptions, membershipOf, state, consume, refund, redeem };