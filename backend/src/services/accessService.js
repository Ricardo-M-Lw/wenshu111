// 服务层：知识星球访问权限（免费版 / 领航员的差异只写在这里）
//
// 产品规则：
//   · 免费版（普通登录用户）= 只开放学习顺序里的**第一颗星球**，也就是「一次函数」
//   · 领航员（月度 / 年度会员未过期）= 全部星球解锁
//   · 拦截点：首页「知识星系」与答题复习（/api/dashboard 标 locked、/api/quiz/* 直接 403）
//   · 「讲题课堂」不锁：免费版本身含 3 讲沉浸式课堂，是留给试学的钩子
//
// 星球顺序以 models/mockData 的 knowledgePoints 顺序为准（一次函数 → 内角和 → 勾股定理），
// 前期锁后期：前面的知识点先开放，后面的显示为待解锁。

const repos = require('../repositories');
const mock = require('../models/mockData');

const FREE_PLANET_COUNT = 1;

function allIds() { return mock.knowledgePoints.map(function (kp) { return kp.id; }); }

function isVip(user) { return repos.vip.isActive(user); }

// 当前用户能进的星球 id 列表
function unlockedIds(user) {
  const ids = allIds();
  return isVip(user) ? ids : ids.slice(0, FREE_PLANET_COUNT);
}

function isUnlocked(user, kpId) { return unlockedIds(user).indexOf(kpId) !== -1; }

// 汇总给前端用的「当前开放情况」
function summary(user) {
  const ids = allIds();
  const unlocked = unlockedIds(user);
  const vip = isVip(user);
  return {
    vip: vip,
    total: ids.length,
    unlockedCount: unlocked.length,
    unlockedIds: unlocked,
    freeCount: FREE_PLANET_COUNT,
    label: vip ? '领航员 · 全部星球已解锁' : '免费版 · 已开放 ' + unlocked.length + ' / ' + ids.length + ' 颗星球',
    tip: vip ? '全部知识星球畅玩中' : '开通领航员解锁全部知识星球',
    upgradeText: '免费版只开放「一次函数」星球；开通领航员后，内角和与勾股定理星系的讲题、练题、改错会一起解锁。'
  };
}

// 挂到 dashboard 的每个知识点上
function decorate(user, kp) {
  const locked = !isUnlocked(user, kp.id);
  return Object.assign({}, kp, {
    locked: locked,
    unlockLabel: locked ? '🔒 领航员解锁' : ''
  });
}

// 接口层拦截用：返回 null 表示放行，否则返回 { status, body }
function block(user, kpId) {
  if (isUnlocked(user, kpId)) return null;
  const kp = mock.knowledgePoints.find(function (item) { return item.id === kpId; });
  return {
    status: 403,
    body: {
      code: 'KP_LOCKED',
      error: '「' + (kp ? kp.name : '这颗星球') + '」还在领航员的航线里，开通后就能一起解锁。',
      unlock: summary(user)
    }
  };
}

module.exports = { FREE_PLANET_COUNT, allIds, isVip, unlockedIds, isUnlocked, summary, decorate, block };