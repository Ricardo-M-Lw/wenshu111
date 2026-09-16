// 问数智能体 - 记忆层
// 短期记忆：会话消息（按 学生 + 知识点 归档）；长期记忆：学生画像（用于个性化引导）

const MAX_MESSAGES = 24;

const sessions = new Map();
const profiles = new Map();

function key(userId, kpId) {
  return String(userId) + ':' + String(kpId || 'general');
}

function getSession(userId, kpId) {
  const id = key(userId, kpId);
  if (!sessions.has(id)) {
    sessions.set(id, { id, userId, kpId: kpId || 'general', messages: [], startedAt: Date.now(), updatedAt: Date.now() });
  }
  return sessions.get(id);
}

function appendMessage(userId, kpId, role, text, extra) {
  const session = getSession(userId, kpId);
  session.messages.push(Object.assign({ role, text, at: Date.now() }, extra || {}));
  if (session.messages.length > MAX_MESSAGES) session.messages = session.messages.slice(-MAX_MESSAGES);
  session.updatedAt = Date.now();
  return session;
}

function getProfile(userId) {
  const id = String(userId);
  if (!profiles.has(id)) {
    profiles.set(id, {
      userId: id,
      turnCount: 0,
      hintCount: 0,
      correctCount: 0,
      wrongCount: 0,
      blockedCount: 0,
      helpfulCount: 0,
      confusedCount: 0,
      errorTypes: [],
      weakSteps: [],
      variantIds: [],
      consecutiveWrong: 0,
      consecutiveRight: 0,
      lastIntent: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    });
  }
  return profiles.get(id);
}

function pushUnique(list, value, limit) {
  if (!value || list.indexOf(value) !== -1) return list;
  list.push(value);
  if (limit && list.length > limit) list.shift();
  return list;
}

// 记录一次事件，持续更新学生画像
function recordEvent(userId, event) {
  const profile = getProfile(userId);
  profile.lastActiveAt = Date.now();
  if (!event) return profile;

  switch (event.type) {
    case 'turn':
      profile.turnCount += 1;
      profile.lastIntent = event.intent || profile.lastIntent;
      break;
    case 'hint':
      profile.hintCount += 1;
      break;
    case 'answer-correct':
      profile.correctCount += 1;
      profile.consecutiveRight += 1;
      profile.consecutiveWrong = 0;
      break;
    case 'answer-wrong':
      profile.wrongCount += 1;
      profile.consecutiveWrong += 1;
      profile.consecutiveRight = 0;
      pushUnique(profile.errorTypes, event.errorType, 5);
      pushUnique(profile.weakSteps, event.stepName, 5);
      break;
    case 'variant':
      pushUnique(profile.variantIds, event.variantId, 12);
      break;
    case 'blocked':
      profile.blockedCount += 1;
      break;
    case 'helpful':
      profile.helpfulCount += 1;
      break;
    case 'confused':
      profile.confusedCount += 1;
      pushUnique(profile.weakSteps, event.stepName, 5);
      break;
    default:
      break;
  }
  return profile;
}

// 学生点「有帮助 / 还没懂」后，把反馈记进画像，作为后续提示级别的依据
function recordFeedback(userId, payload) {
  const data = payload || {};
  const helpful = data.rating !== 'confused';
  recordEvent(userId, helpful ? { type: 'helpful' } : { type: 'confused', stepName: data.stepName });
  const profile = getProfile(userId);
  profile.lastFeedback = { rating: helpful ? 'helpful' : 'confused', kpId: data.kpId || null, at: Date.now() };
  return profile;
}

function resetSession(userId, kpId) {
  sessions.delete(key(userId, kpId));
}

function history(userId, kpId) {
  return getSession(userId, kpId).messages.map(item => ({ role: item.role, text: item.text, at: item.at }));
}

module.exports = { getSession, appendMessage, getProfile, recordEvent, recordFeedback, resetSession, history };
