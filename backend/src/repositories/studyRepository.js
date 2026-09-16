// 仓储层：学习提醒设置（qw_study_setting）
// 内存里是按用户 ID 索引的对象，落库后以 user_id 为主键，JSON 字段对应表里的 JSON 列。

const mock = require('../models/mockData');
const db = require('../db/table');

const table = db.register('qw_study_setting', db.fromMap(mock.studySettings, 'userId'));

function of(userId) { return table.findById(userId) || null; }
function all() { return table.all(); }
function save(userId, patch) { return table.update(userId, patch); }

function ensure(userId, seed) {
  const existing = of(userId);
  if (existing) return existing;
  return table.insert(Object.assign({ userId: userId }, seed || {}));
}

// 新学生的默认提醒设置
function defaultSetting() {
  return {
    studyWindow: { enabled: true, start: '18:30', end: '20:30', weekdays: [1, 2, 3, 4, 5] },
    quietHours: { enabled: true, start: '21:30', end: '07:00' },
    imagePolicy: 'session',
    reminders: { dailyReport: true, weeklyReport: true, weeklyReportDay: 0 },
    privacy: { shareRanking: false, shareToTeacher: true, analytics: true },
    updatedAt: new Date().toISOString()
  };
}

module.exports = { table, of, all, save, ensure, defaultSetting };