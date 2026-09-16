// 服务层：趣味化（等级 / 星尘 / 签到 / 徽章 / 星钻）
// 只写业务规则，数据访问交给仓储层；星钻口径与 /api/dashboard 保持一致。

const mock = require('../models/mockData');
const repos = require('../repositories');
const { ok, fail } = require('../utils/reply');

function today() { return new Date().toISOString().split('T')[0]; }

// 已「掌握」的知识点：只要有一条已完成会话，或最新会话的步骤已经走满
function masteredCount(userId) {
  const sessions = repos.learning.listSessionsByUser(userId);
  return repos.learning.knowledgePoints.all().filter(function (kp) {
    const list = sessions.filter(function (item) { return item.knowledgePointId === kp.id; });
    if (!list.length) return false;
    if (list.some(function (item) { return item.status === 'completed'; })) return true;
    const latest = list.slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); })[0];
    const total = latest.totalSteps || kp.totalSteps || 5;
    return (latest.currentStep || 0) >= total;
  }).length;
}

// 星钻 = 充值买来的钻石：1 元 = 1 星钻（等值充值，不做赠送）
// 星钻可以在智能体页兑换 AI 对话次数，花掉的部分记在 crystal_used（偏移量），
// 所以 available = 累计充值 - 已消耗。徽章与掌握度只作为成就展示，不再折算星钻。
function crystalsOf(userId, data) {
  const badges = (data.badges || []).filter(function (item) { return item.unlockedAt; }).length;
  const mastered = masteredCount(userId);
  const recharge = data.crystalRecharge || 0;
  const spent = Math.min(data.crystalUsed || 0, recharge);
  const available = Math.max(0, recharge - spent);
  return {
    total: recharge,
    spent: spent,
    available: available,
    recharge: recharge,
    badges: badges,
    mastered: mastered,
    rate: '1 元 = 1 星钻',
    note: '星钻由等值充值获得（1 元 = 1 星钻）：累计充值 ' + recharge + ' 星钻'
      + (spent ? '，已花掉 ' + spent + '，可用 ' + available : '，当前全部可用') + '。'
      + '已解锁 ' + badges + ' 枚徽章、掌握 ' + mastered + ' 个知识点。'
  };
}

// 新注册学生：初始化趣味化数据与学习提醒设置
function initFor(user) {
  if (!user || user.role !== 'student') return null;
  const template = repos.gamification.of('u1') || { badges: [] };
  const row = repos.gamification.ensure(user.id, {
    badges: (template.badges || []).map(function (badge) { return Object.assign({}, badge, { unlockedAt: null }); }),
    checkinHistory: [],
    level: mock.resolveLevel(0)
  });
  repos.study.ensure(user.id, repos.study.defaultSetting());
  return row;
}

function dataOf(userId) {
  return repos.gamification.of(userId) || repos.gamification.of('u1');
}

function status(userId) {
  const data = dataOf(userId);
  return ok({ data: Object.assign({}, data, { crystals: crystalsOf(userId, data) }) });
}

function checkin(userId) {
  const data = dataOf(userId);
  const date = today();
  if (data.checkinHistory.some(function (item) { return item.date === date; })) {
    return fail(400, '今日已签到');
  }
  data.checkinHistory.push({ date: date, points: 2 });
  data.points += 2;
  data.streakDays += 1;
  data.totalCheckins += 1;
  if (data.streakDays >= 7 && data.streakDays % 7 === 0) data.points += 10;
  return ok({ data: { checked: true, points: 2, streakDays: data.streakDays, totalPoints: data.points } });
}

function badges(userId) { return ok({ data: dataOf(userId).badges }); }

function levels(userId) {
  const data = dataOf(userId);
  return ok({
    data: {
      levels: mock.LEVELS,
      expRules: mock.EXP_RULES,
      current: data.level || mock.resolveLevel(data.exp || 0),
      exp: data.exp || 0
    }
  });
}

module.exports = { masteredCount, crystalsOf, initFor, status, checkin, badges, levels };