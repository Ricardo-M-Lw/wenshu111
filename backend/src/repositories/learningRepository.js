// 仓储层：知识点（qw_knowledge_point）与学习会话（qw_learning_session）
// 知识点树是典型的「热点列表」：读多写少，走缓存回填，避免重复查主库。

const mock = require('../models/mockData');
const db = require('../db/table');
const cache = require('../cache');

const knowledgePoints = db.register('qw_knowledge_point', mock.knowledgePoints);
const sessions = db.register('qw_learning_session', mock.learningSessions);

const HOT_KEY = cache.keys.hot('knowledge-points');

// 热点列表：60 秒内重复读取直接命中缓存
async function listKnowledgePoints() {
  return cache.wrap(HOT_KEY, 60, async function () {
    return knowledgePoints.all().map(function (kp) {
      return {
        id: kp.id,
        name: kp.name,
        subtitle: kp.subtitle,
        grade: kp.grade,
        totalSteps: kp.totalSteps
      };
    });
  });
}

function findKnowledgePoint(id) { return knowledgePoints.findById(id); }
function countKnowledgePoints() { return knowledgePoints.count(); }
function invalidateKnowledgePoints() { return cache.invalidate(HOT_KEY); }

function listSessionsByUser(userId) { return sessions.byIndex('idx_session_user', userId); }
function listSessionsByUserAndKnowledge(userId, knowledgePointId) {
  return sessions.byIndex('idx_session_user_kp', { user_id: userId, knowledge_point_id: knowledgePointId });
}
function findSession(id) { return sessions.findById(id); }
function listAllSessions() { return sessions.all(); }
function insertSession(row) { return sessions.insert(row); }
function updateSession(id, patch) { return sessions.update(id, patch); }

module.exports = {
  knowledgePoints, sessions,
  listKnowledgePoints, findKnowledgePoint, countKnowledgePoints, invalidateKnowledgePoints,
  listSessionsByUser, listSessionsByUserAndKnowledge, findSession, listAllSessions,
  insertSession, updateSession
};