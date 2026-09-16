// 仓储层：用户表（qw_user）
// 方法按 SQL 语义命名，实现暂时落在内存表引擎上；
// 落库时把这几个方法换成 MyBatis Mapper 调用即可，服务层与路由层不用改。

const mock = require('../models/mockData');
const db = require('../db/table');

const table = db.register('qw_user', mock.users);

function findById(id) { return table.findById(id); }

// 走唯一索引 uk_user_phone / uk_user_username
function findByPhone(phone) {
  return phone ? table.findOneByIndex('uk_user_phone', String(phone)) : null;
}
function findByUsername(username) {
  return username ? table.findOneByIndex('uk_user_username', String(username)) : null;
}
// 账号既可能是手机号也可能是用户名，登录时依次尝试
function findByAccount(account) {
  return findByPhone(account) || findByUsername(account);
}

function findByRole(role) { return table.byIndex('idx_user_role', role); }
function list() { return table.all(); }
function count() { return table.count(); }

function insert(user) { return table.insert(user); }
function update(id, patch) { return table.update(id, patch); }
function nextId() { return table.nextId('u'); }

// 登录辅助：保持与旧接口一致的「按手机号或用户名找账号」
function search(account) {
  const value = String(account == null ? '' : account).trim();
  return value ? findByAccount(value) : null;
}

module.exports = {
  table,
  findById, findByPhone, findByUsername, findByAccount, findByRole,
  list, count, insert, update, nextId, search
};