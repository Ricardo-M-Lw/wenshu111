/**
 * 问数星途 · 管理控制台（教师 / 运营）
 * 对应框架「二、分层框架总览」的管理端一层，只做「取数据 + 渲染」：
 *   - 权限一律由后端 /api/admin/* 的 requirePermission 判定，前端只做「受限」提示；
 *   - 题库接口本来就不下发正确答案，管理端同样看不到，「不泄答案」不变量在后台也成立。
 * 以后换成若依 RuoYi 内置后台，只需要替换这一层页面，接口契约不用改。
 */
(function () {
  'use strict';

  var AUTH = window.QWAuth;
  var app = document.getElementById('adminApp');
  if (!AUTH || !app) return;

  var MODULES = [
    { id: 'overview', icon: '🛰', label: '经营概览', title: '经营与学情概览', sub: '用户、学习、积分与会员的一屏快照', url: '/api/admin/overview', permission: 'admin:overview:read', roles: ['teacher', 'ops'] },
    { id: 'questions', icon: '📚', label: '题库管理', title: '题库浏览', sub: '题干、选项与提示可见；正确答案只留在服务端', url: '/api/admin/questions', permission: 'admin:question:list', roles: ['teacher', 'ops'] },
    { id: 'errors', icon: '🧭', label: '错因字典', title: '错因字典', sub: '错因释义 + 真实命中次数，用来改进讲题脚本', url: '/api/admin/error-types', permission: 'admin:error-type:list', roles: ['teacher', 'ops'] },
    { id: 'orders', icon: '💳', label: '会员订单', title: '会员订单', sub: '下单、支付与收入 —— 仅运营角色可见', url: '/api/admin/orders', permission: 'admin:order:list', roles: ['ops'] },
    { id: 'members', icon: '👑', label: '会员成员', title: '会员成员', sub: '已开通领航舱的学员与有效期', url: '/api/admin/members', permission: 'admin:member:list', roles: ['teacher', 'ops'] }
  ];

  var state = { user: AUTH.getUser(), module: 'overview', knowledgePoints: [], questionFilter: '' };

  function esc(value) { return AUTH.escapeText(value); }
  function num(value) { return typeof value === 'number' ? value.toLocaleString('zh-CN') : esc(value == null ? '—' : value); }
  function roleName(role) { return { student: '学生', teacher: '教师', ops: '运营' }[role] || role || '未知'; }

  function findModule(id) {
    for (var i = 0; i < MODULES.length; i += 1) {
      if (MODULES[i].id === id) return MODULES[i];
    }
    return MODULES[0];
  }

  function moduleLocked(module) {
    if (!module.roles || !state.user) return false;
    return module.roles.indexOf(state.user.role) === -1;
  }

  function fmtTime(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    function pad(x) { return String(x).padStart(2, '0'); }
    return (date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function kpName(kpId) {
    for (var i = 0; i < state.knowledgePoints.length; i += 1) {
      if (state.knowledgePoints[i].id === kpId) return state.knowledgePoints[i].name;
    }
    return kpId || '未分类';
  }

  // ---------------------------------------------------------------- 渲染零件
  function card(title, note, body) {
    return '<section class="ad-card"><h2>' + esc(title) + '</h2>'
      + (note ? '<p class="ad-note">' + note + '</p>' : '')
      + body + '</section>';
  }
  function grid(items) { return '<div class="ad-grid">' + items.join('') + '</div>'; }
  function kpi(label, value, hint, mod) {
    return '<div class="ad-kpi' + (mod ? ' ' + mod : '') + '"><span>' + esc(label) + '</span>'
      + '<b>' + value + '</b>' + (hint ? '<i>' + esc(hint) + '</i>' : '') + '</div>';
  }
  function emptyBox(text) { return '<div class="ad-empty">' + esc(text) + '</div>'; }
  function table(headers, rows, colSpan) {
    return '<div class="ad-scroll"><table class="ad-table"><thead><tr>'
      + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + (rows.length ? rows.join('') : '<tr><td colspan="' + colSpan + '">' + emptyBox('暂无数据') + '</td></tr>')
      + '</tbody></table></div>';
  }
  function tag(text, mod) { return '<span class="ad-tag' + (mod ? ' ' + mod : '') + '">' + esc(text) + '</span>'; }

  // ---------------------------------------------------------------- 各模块
  var RENDER = {
    overview: function (d) {
      var u = d.users || {}, l = d.learning || {}, g = d.gamification || {}, m = d.membership || {}, p = d.platform || {};
      var ranking = g.ranking || [];
      return card('用户与角色', '平台注册账号与内部人员构成', grid([
          kpi('用户总数', num(u.total), '学生 / 教师 / 运营'),
          kpi('学生', num(u.student), '学习端账号'),
          kpi('教师', num(u.teacher), '可见题库与错因字典'),
          kpi('运营', num(u.ops), '可见会员订单与收入')
        ]))
        + card('学习与内容', '知识点、题库与学习会话完成情况', grid([
          kpi('知识点', num(l.knowledgePoints), '讲题脚本覆盖'),
          kpi('题库', num(l.questions), '标准题'),
          kpi('学习会话', num(l.sessions), '累计次数'),
          kpi('完成率', num(l.completionRate) + '%', '已完成 ' + num(l.completed) + ' 次', 'is-sun')
        ]))
        + card('积分与会员', '星尘总量、订单与收入（演示环境）', grid([
          kpi('星尘总量', num(g.totalPoints), '学生积分合计', 'is-gem'),
          kpi('订单数', num(m.orders), '含待支付'),
          kpi('已支付', num(m.paid), '订单数'),
          kpi('收入合计', '¥' + num(m.revenue), '演示数据', 'is-sun')
        ]))
        + card('星尘榜 · 前 5', '按累计积分排序', ranking.length
          ? '<ol class="ad-list">' + ranking.map(function (row, index) {
              return '<li><span class="ad-rank">' + (index + 1) + '</span><b>' + esc(row.name) + '</b>'
                + tag(num(row.points) + ' 星尘') + '</li>';
            }).join('') + '</ol>'
          : emptyBox('还没有积分记录'))
        + card('平台自检', '当前跑在哪套驱动上、数据表落地到什么程度',
          '<div class="ad-pending">'
            + '<span>env: ' + esc(p.env) + '</span>'
            + '<span>数据库: ' + esc(p.dbDriver) + '</span>'
            + '<span>缓存: ' + esc(p.cacheDriver) + '</span>'
            + '<span>AI: ' + esc(p.llm) + '</span>'
          + '</div>'
          + '<p class="ad-note" style="margin-top:14px">已落地数据表（' + ((p.tables || []).length) + '）</p>'
          + '<div class="ad-pending">' + (p.tables || []).map(function (t) {
              return '<span>' + esc(t.table) + ' · ' + num(t.rows) + ' 行 · ' + num(t.indexes) + ' 索引</span>';
            }).join('') + '</div>'
          + '<p class="ad-note" style="margin-top:14px">仍留在嵌套结构、落库时才拆的表（' + ((p.pendingTables || []).length) + '）</p>'
          + '<div class="ad-pending">' + (p.pendingTables || []).map(function (name) {
              return '<span>' + esc(name) + '</span>';
            }).join('') + '</div>');
    },

    questions: function (d) {
      var items = d.items || [];
      var kpId = state.questionFilter;
      var shown = kpId ? items.filter(function (q) { return q.knowledgePointId === kpId; }) : items;
      var chips = '<div class="ad-chips">'
        + '<button type="button" data-kp="" class="' + (kpId ? '' : 'active') + '">全部 ' + items.length + '</button>'
        + state.knowledgePoints.map(function (kp) {
            var count = items.filter(function (q) { return q.knowledgePointId === kp.id; }).length;
            return '<button type="button" data-kp="' + esc(kp.id) + '" class="' + (kpId === kp.id ? 'active' : '') + '">'
              + esc(kp.name) + ' ' + count + '</button>';
          }).join('')
        + '</div>';
      var rows = shown.map(function (q) {
        var options = (q.options || []).map(function (text, index) { return 'ABCD'[index] + '. ' + esc(text); }).join('　');
        return '<tr><td><b>' + esc(q.id) + '</b></td>'
          + '<td>' + esc(kpName(q.knowledgePointId)) + '</td>'
          + '<td>' + esc(q.question) + '</td>'
          + '<td class="ad-options">' + options + '</td>'
          + '<td>' + esc(q.hint || '—') + '</td></tr>';
      });
      return card('题库浏览', '共 ' + num(d.total) + ' 道题 · 当前显示 ' + num(shown.length) + ' 道 · 正确答案不下发，管理端同样看不到',
        chips + table(['编号', '知识点', '题干', '选项', '提示'], rows, 5));
    },

    errors: function (d) {
      var items = d.items || [];
      var max = items.reduce(function (acc, item) { return Math.max(acc, item.count || 0); }, 1);
      var rows = items.map(function (item) {
        var pct = Math.round((item.count || 0) / max * 100);
        return '<tr><td><b>' + esc(item.name) + '</b></td>'
          + '<td>' + esc(item.description) + '</td>'
          + '<td>' + esc(item.advice) + '</td>'
          + '<td>' + tag(num(item.count) + ' 次', item.count ? '' : 'is-ok')
          + '<div class="ad-bar"><i style="width:' + Math.max(pct, item.count ? 6 : 0) + '%"></i></div></td></tr>';
      });
      return card('错因字典', '共 ' + num(d.total) + ' 类错因 · 真实命中 ' + num(d.totalHits) + ' 次',
        table(['错因', '说明', '干预建议', '出现次数'], rows, 4));
    },

    orders: function (d) {
      var rows = (d.items || []).map(function (o) {
        return '<tr><td><b>' + esc(o.orderNo) + '</b></td>'
          + '<td>' + esc(o.planName) + '</td>'
          + '<td>¥' + num(o.amount) + '</td>'
          + '<td>' + esc((o.channelIcon || '') + ' ' + (o.channelName || o.channel)) + '</td>'
          + '<td>' + tag(o.status === 'paid' ? '已支付' : '待支付', o.status === 'paid' ? 'is-ok' : 'is-warn') + '</td>'
          + '<td>' + fmtTime(o.createdAt) + '</td>'
          + '<td>' + (o.paidAt ? fmtTime(o.paidAt) : '—') + '</td></tr>';
      });
      return card('订单与收入', '共 ' + num(d.total) + ' 笔订单', grid([
          kpi('订单总数', num(d.total)),
          kpi('已支付', num(d.paid), '演示环境下单即支付', 'is-gem'),
          kpi('待支付', num(d.pending)),
          kpi('收入合计', '¥' + num(d.revenue), '演示数据', 'is-sun')
        ]))
        + card('订单明细', '最近 50 笔', table(['订单号', '方案', '金额', '渠道', '状态', '下单时间', '支付时间'], rows, 7));
    },

    members: function (d) {
      var rows = (d.items || []).map(function (row) {
        return '<tr><td><b>' + esc(row.nickname || row.name) + '</b></td>'
          + '<td>' + esc(row.phone) + '</td>'
          + '<td>' + esc(roleName(row.role)) + '</td>'
          + '<td>' + esc(row.planName) + '</td>'
          + '<td>' + tag(row.active ? '有效' : '已过期', row.active ? 'is-ok' : 'is-warn') + '</td>'
          + '<td>' + esc(row.endAtLabel || '—') + '</td></tr>';
      });
      return card('会员成员', '按到期时间倒序', grid([
          kpi('开通过会员', num(d.total), '含已过期'),
          kpi('有效中', num(d.active), '未过期', 'is-gem')
        ]))
        + card('成员明细', '账号已脱敏', table(['学员', '账号', '角色', '方案', '状态', '到期日'], rows, 6));
    }
  };

  // ---------------------------------------------------------------- 骨架
  function renderNav() {
    var nav = document.getElementById('adNav');
    if (!nav) return;
    nav.innerHTML = MODULES.map(function (module) {
      var active = module.id === state.module;
      return '<button type="button" data-module="' + module.id + '"' + (active ? ' class="active"' : '') + '>'
        + '<em>' + module.icon + '</em><span>' + esc(module.label) + '</span>'
        + (moduleLocked(module) ? '<small>受限</small>' : '')
        + '</button>';
    }).join('');
  }

  function renderHead() {
    var module = findModule(state.module);
    var title = document.getElementById('adTitle');
    var sub = document.getElementById('adSub');
    if (title) title.textContent = module.title;
    if (sub) sub.textContent = module.sub;
  }

  function renderUser() {
    var user = state.user || {};
    var role = document.getElementById('adRole');
    if (role) role.textContent = roleName(user.role) + ' · ' + (user.nickname || user.name || '未知账号');

    var who = document.getElementById('adWho');
    if (!who) return;
    who.innerHTML = '';
    var avatar = document.createElement('span');
    avatar.className = 'ad-avatar';
    AUTH.fillAvatar(avatar, user.avatar, '🙂');
    who.appendChild(avatar);
    var info = document.createElement('div');
    info.innerHTML = '<b>' + esc(user.nickname || user.name || '未登录') + '</b>'
      + '<i>' + esc(roleName(user.role) + ' · ' + (user.phone || '')) + '</i>';
    who.appendChild(info);
  }

  function load(id) {
    var module = findModule(id);
    app.innerHTML = '<div class="ad-loading">正在加载「' + esc(module.label) + '」…</div>';
    AUTH.request(module.url).then(function (res) {
      var data = (res && res.data) || {};
      app.innerHTML = RENDER[module.id] ? RENDER[module.id](data) : '';
    }).catch(function (err) {
      app.innerHTML = card(module.title, '', '<div class="ad-empty is-lock">'
        + '🔒 ' + esc(err.message || '加载失败') + '<br>'
        + '<small>当前角色：' + esc(roleName(state.user && state.user.role)) + ' · 该模块需要权限码 ' + esc(module.permission) + '</small>'
        + '</div>');
    });
  }

  function go(id) {
    var next = findModule(id);
    state.module = next.id;
    renderNav();
    renderHead();
    load(next.id);
  }

  function route() {
    var hash = (window.location && window.location.hash ? window.location.hash : '').replace('#', '');
    var known = MODULES.some(function (module) { return module.id === hash; });
    go(known ? hash : MODULES[0].id);
  }

  // ---------------------------------------------------------------- 事件
  var nav = document.getElementById('adNav');
  if (nav) {
    nav.addEventListener('click', function (event) {
      var target = event.target;
      var btn = target && target.closest ? target.closest('[data-module]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-module');
      if (id === state.module) return;
      if (window.location) window.location.hash = id;
      else go(id);
    });
  }

  app.addEventListener('click', function (event) {
    var target = event.target;
    var btn = target && target.closest ? target.closest('[data-kp]') : null;
    if (!btn) return;
    state.questionFilter = btn.getAttribute('data-kp') || '';
    load('questions');
  });

  var logout = document.getElementById('adLogout');
  if (logout) logout.addEventListener('click', function () { AUTH.logout(); });

  // 轻量 DOM（测试）环境可能没有事件总线，有就挂上哈希路由
  if (typeof window.addEventListener === 'function') window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- 启动
  renderUser();
  renderNav();
  renderHead();
  route();

  // 知识点名称用于题库分组；取不到就退回显示 kpId
  AUTH.request('/api/learning/knowledge-points').then(function (res) {
    state.knowledgePoints = (res && res.data) || [];
    if (state.module === 'questions') load('questions');
  }).catch(function () { state.knowledgePoints = []; });

  // 会员 / 角色以服务端为准：本地缓存可能是上一次登录的快照
  if (AUTH.isLoggedIn()) {
    AUTH.me().then(function (user) {
      if (!user) return;
      state.user = user;
      renderUser();
      renderNav();
    }).catch(function () {});
  }
})();