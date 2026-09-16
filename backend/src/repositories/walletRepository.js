// 仓储层：星尘 / 星钻钱包（qw_wallet_log 收支流水 + qw_crystal_order 充值订单）
// 内存里是数组，重启即清空；落库后走 idx_wallet_user / idx_crystal_user 两个索引查询。

const mock = require('../models/mockData');
const db = require('../db/table');

const logs = db.register('qw_wallet_log', mock.walletLogs || []);
const crystalOrders = db.register('qw_crystal_order', mock.crystalOrders || []);

// ---------------- 收支流水 ----------------
function insertLog(row) { return logs.insert(row); }

function listLogsByUser(userId, limit) {
  return logs.byIndex('idx_wallet_user', userId)
    .slice()
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, limit || 30);
}

function countLogs(predicate) { return logs.count(predicate); }

// 按钱包类型汇总收入 / 支出（正负号已经写在 amount 里）
function sumByWallet(userId, wallet) {
  const rows = logs.byIndex('idx_wallet_user', userId)
    .filter(function (row) { return row.wallet === wallet; });
  const income = rows.filter(function (row) { return row.amount > 0; })
    .reduce(function (sum, row) { return sum + row.amount; }, 0);
  const expense = rows.filter(function (row) { return row.amount < 0; })
    .reduce(function (sum, row) { return sum + row.amount; }, 0);
  return { income: income, expense: expense, net: income + expense, count: rows.length };
}

// ---------------- 充值订单 ----------------
function insertOrder(row) { return crystalOrders.insert(row); }
function findOrder(orderNo) { return orderNo ? crystalOrders.findById(String(orderNo)) : null; }
function updateOrder(orderNo, patch) { return crystalOrders.update(orderNo, patch); }

function listOrdersByUser(userId, limit) {
  return crystalOrders.byIndex('idx_crystal_user', userId)
    .slice()
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, limit || 5);
}

function listPaidOrders() { return crystalOrders.byIndex('idx_crystal_status', 'paid'); }

// 充值收入口径：已支付订单的实付金额合计
function totalRecharge() {
  return listPaidOrders().reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
}

function totalCrystal() {
  return listPaidOrders().reduce(function (sum, row) { return sum + Number(row.crystal || 0); }, 0);
}

module.exports = {
  logs, crystalOrders,
  insertLog, listLogsByUser, countLogs, sumByWallet,
  insertOrder, findOrder, updateOrder, listOrdersByUser, listPaidOrders, totalRecharge, totalCrystal
};