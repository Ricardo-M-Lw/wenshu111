// 仓储层：趣味化数据（qw_gamification）
// 内存里这份数据是「按用户 ID 索引的对象」，用 fromMap 适配成表的形态；
// 落库后 qw_gamification 以 user_id 为主键，签到流水拆到 qw_checkin。

const mock = require('../models/mockData');
const db = require('../db/table');

const table = db.register('qw_gamification', db.fromMap(mock.gamification, 'userId'));

function of(userId) { return table.findById(userId) || null; }

// 没有记录时按模版初始化一条（新注册学生走这里）
function ensure(userId, seed) {
  const existing = of(userId);
  if (existing) return existing;
  return table.insert(Object.assign({ userId: userId, exp: 0, points: 0, streakDays: 0, totalCheckins: 0 }, seed || {}));
}

function update(userId, patch) { return table.update(userId, patch); }
function list() { return table.all(); }

// 积分榜：走 idx_gami_points 的思路（排序 + 截断）
function ranking(limit) {
  return table.all().slice()
    .sort(function (a, b) { return (b.points || 0) - (a.points || 0); })
    .slice(0, limit || 10);
}

function totalPoints() {
  return table.all().reduce(function (sum, row) { return sum + (row.points || 0); }, 0);
}

module.exports = { table, of, ensure, update, list, ranking, totalPoints };