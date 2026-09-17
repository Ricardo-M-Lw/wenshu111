// 仓储层：星际天梯（qw_ladder_season / qw_ladder_profile / qw_ladder_match / qw_ladder_answer）
//
// 数据落点：
//   · qw_ladder_season   赛季（目前只有 S1，落库后按 idx_lseason_status 取「进行中的那个」）
//   · qw_ladder_profile  天梯档案，以 user_id 为主键：积分 / 段位 / 战绩 / 每日场次 / 家长守护开关
//   · qw_ladder_match    对局。questions 与 opponent_plan 是 JSON 列，正确答案只存在这里，
//                        任何接口下发前都必须先剥离（见 services/ladderService.js 的 questionView）
//   · qw_ladder_answer   逐题作答，uk_lanswer_match_seq 保证「同一局同一题只记一次」

const mock = require('../models/mockData');
const db = require('../db/table');

const seasons = db.register('qw_ladder_season', mock.ladderSeasons || []);
const profiles = db.register('qw_ladder_profile', db.fromMap(mock.ladderProfiles || {}, 'userId'));
const matches = db.register('qw_ladder_match', mock.ladderMatches || []);
const answers = db.register('qw_ladder_answer', mock.ladderAnswers || []);

// 星海对手是静态演示数据（不落表，落库后是一份配置表 / 活动配置）
const rivals = (mock.ladderRivals || []).slice();
function listRivals() { return rivals; }

// ---------------- 赛季 ----------------
function listSeasons() { return seasons.all().slice(); }
function findSeason(id) { return id ? seasons.findById(id) : null; }

// 进行中的赛季：状态是 active 里开始时间最晚的那个；一个都没有就退回第一行，保证页面不空
function activeSeason() {
  const open = seasons.byIndex('idx_lseason_status', 'active');
  if (!open.length) return seasons.all()[0] || null;
  return open.slice().sort(function (a, b) { return new Date(b.startAt) - new Date(a.startAt); })[0];
}

function insertSeason(row) { return seasons.insert(row); }

// ---------------- 天梯档案 ----------------
function ofProfile(userId) { return profiles.findById(userId) || null; }

function ensureProfile(userId, seed) {
  const existing = ofProfile(userId);
  if (existing) return existing;
  return profiles.insert(Object.assign({ userId: userId }, seed || {}));
}

function updateProfile(userId, patch) { return profiles.update(userId, patch); }
function allProfiles() { return profiles.all().slice(); }
function countProfiles(predicate) { return profiles.count(predicate); }

// 天梯榜：走 idx_lprofile_rating 的思路（排序 + 截断）
function ranking(limit) {
  return profiles.all().slice()
    .sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); })
    .slice(0, limit || 30);
}

// 名次（1 起）；没上榜返回 null
function rankOf(userId) {
  const rows = ranking(profiles.count());
  const index = rows.findIndex(function (row) { return String(row.userId) === String(userId); });
  return index === -1 ? null : index + 1;
}

// ---------------- 对局 ----------------
function insertMatch(row) { return matches.insert(row); }
function findMatch(id) { return id ? matches.findById(String(id)) : null; }
function updateMatch(id, patch) { return matches.update(id, patch); }

function listMatchesByUser(userId, limit) {
  return matches.byIndex('idx_lmatch_user', userId)
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
    .slice(0, limit || 10);
}

function countMatches(predicate) { return matches.count(predicate); }

// 巡检用：卡在 playing 的对局（服务重启后可以把它们标成 abandoned）
function listPlaying() { return matches.byIndex('idx_lmatch_status', 'playing'); }

// ---------------- 逐题作答 ----------------
function insertAnswer(row) { return answers.insert(row); }

// 注意：uk_lanswer_match_seq 是两列联合索引，byIndex 的等值查询要求两列都给值，
// 只按对局查的时候直接用 filter 更稳。
function listAnswersByMatch(matchId) {
  return answers.filter(function (row) { return String(row.matchId) === String(matchId); })
    .sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
}

function findAnswer(matchId, seq) {
  return answers.find(function (row) {
    return String(row.matchId) === String(matchId) && Number(row.seq) === Number(seq);
  }) || null;
}

function countAnswers(predicate) { return answers.count(predicate); }

// ---------------- 星海对手 ----------------
function rivalsOf(rating) {
  return rivals.slice().sort(function (a, b) {
    return Math.abs((a.rating || 0) - rating) - Math.abs((b.rating || 0) - rating);
  });
}

module.exports = {
  seasons, profiles, matches, answers,
  listSeasons, findSeason, activeSeason, insertSeason,
  ofProfile, ensureProfile, updateProfile, allProfiles, countProfiles, ranking, rankOf,
  insertMatch, findMatch, updateMatch, listMatchesByUser, countMatches, listPlaying,
  insertAnswer, listAnswersByMatch, findAnswer, countAnswers,
  rivals: listRivals, rivalsOf
};