// 仓储层：会员订单（qw_vip_order）与会员权益（qw_membership）
// 订单在内存里是数组（重启即清空），对应 qw_vip_order 表，走 uk_order_no / idx_order_user / idx_order_status。
// 会员权益目前挂在用户记录上（user.membership），对应 qw_membership 表；
// 落库时以 user_id 为主键独立成表，这里读写仍共用同一份数据源。
//
// 另外三张表（qw_lesson_step / qw_answer_record / qw_error_record / qw_checkin / qw_study_setting）
// 的内存数据还是嵌套结构，表结构已在 db/schema.js 定义好，落库时再拆。

const db = require('../db/table');

const orders = db.register('qw_vip_order', []);

// ---------------- 订单 ----------------
function insertOrder(row) { return orders.insert(row); }
function findOrder(orderNo) { return orderNo ? orders.findById(String(orderNo)) : null; }
function updateOrder(orderNo, patch) { return orders.update(orderNo, patch); }

function listOrdersByUser(userId, limit) {
  return orders.byIndex('idx_order_user', userId)
    .slice()
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, limit || 5);
}

function listOrders(options) {
  const opts = options || {};
  let rows = orders.all().slice();
  if (opts.status) rows = rows.filter(function (row) { return row.status === opts.status; });
  if (opts.channel) rows = rows.filter(function (row) { return row.channel === opts.channel; });
  if (opts.planId) rows = rows.filter(function (row) { return row.planId === opts.planId; });
  rows.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return rows.slice(0, opts.limit || 50);
}

function listPaidOrders() { return orders.byIndex('idx_order_status', 'paid'); }
function countOrders(predicate) { return orders.count(predicate); }

// 收入口径：已支付订单的实付金额合计
function totalRevenue() {
  return listPaidOrders().reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
}

// ---------------- 会员权益 ----------------
function readMembership(user) { return (user && user.membership) || null; }

function writeMembership(user, data) {
  if (!user) return null;
  user.membership = Object.assign({}, data, { updatedAt: new Date().toISOString() });
  return user.membership;
}

// 按到期时间判断是否有效（对应 idx_membership_end 的用途）
function isActive(user, nowMs) {
  const m = readMembership(user);
  if (!m || !m.endAt) return false;
  return new Date(m.endAt).getTime() > (nowMs || Date.now());
}

module.exports = {
  orders,
  insertOrder, findOrder, updateOrder, listOrdersByUser, listOrders, listPaidOrders, countOrders, totalRevenue,
  readMembership, writeMembership, isActive
};