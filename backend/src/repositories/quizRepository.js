// 仓储层：标准题库（qw_question）
// 「不泄答案」不变量：correct_answer 只留在服务端，所有对外接口一律经 safe() 剥离。

const mock = require('../models/mockData');
const db = require('../db/table');

const table = db.register('qw_question', mock.quizzes);

function list(knowledgePointId) {
  return knowledgePointId ? table.byIndex('idx_question_kp', knowledgePointId) : table.all();
}
function findById(id) { return table.findById(id); }
function count() { return table.count(); }
function types() { return Array.from(new Set(table.all().map(function (row) { return row.type; }))); }

// 面向外部：去掉答案
function safe(row) {
  const copy = Object.assign({}, row);
  delete copy.correctAnswer;
  copy.hasAnswer = true;
  return copy;
}
function safeList(knowledgePointId) { return list(knowledgePointId).map(safe); }

module.exports = { table, list, findById, count, types, safe, safeList };