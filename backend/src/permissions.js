// 权限与基座（对应框架「二、分层框架总览」中的权限与基座一层）
// 现在用「权限码 -> 允许的角色」表实现；接入若依 RuoYi 后由菜单与按钮权限表下发，
// 接口层只需继续调用 requirePermission，不用改业务代码。

const ROLES = {
  student: { code: 'student', name: '学生', desc: '学习、讲题、答题、查看自己的报告' },
  teacher: { code: 'teacher', name: '教师', desc: '查看班级学情、题库与错因字典' },
  ops: { code: 'ops', name: '运营', desc: '题库、错因字典、会员订单与经营看板' }
};

// 权限码命名对齐若依的 模块:资源:动作
const PERMISSIONS = {
  'admin:overview:read': ['teacher', 'ops'],
  'admin:question:list': ['teacher', 'ops'],
  'admin:error-type:list': ['teacher', 'ops'],
  'admin:member:list': ['teacher', 'ops'],
  'admin:order:list': ['ops']
};

function roleOf(user) {
  return (user && user.role) || 'student';
}

function can(user, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.indexOf(roleOf(user)) !== -1;
}

function permissionsOf(user) {
  return Object.keys(PERMISSIONS).filter(function (code) { return can(user, code); });
}

function isStaff(user) {
  const role = roleOf(user);
  return role === 'teacher' || role === 'ops';
}

module.exports = { ROLES, PERMISSIONS, roleOf, can, permissionsOf, isStaff };