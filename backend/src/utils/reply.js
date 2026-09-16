// 统一响应信封（对应框架「八、迁移不变量」的接口契约）
// 成功：{ data } 或业务字段；失败：{ error } + HTTP 状态码。
// 服务层统一返回 { status, body }，由路由层一次性写出。

function ok(body) { return { status: 200, body: body === undefined ? { data: null } : body }; }
function created(body) { return { status: 201, body: body === undefined ? { data: null } : body }; }
function fail(status, error) { return { status: status, body: { error: error } }; }

function reply(res, result) {
  const r = result || {};
  const status = r.status || 200;
  if (r.body === undefined) return res.status(status).json(r);
  return res.status(status).json(r.body);
}

module.exports = { ok, created, fail, reply };