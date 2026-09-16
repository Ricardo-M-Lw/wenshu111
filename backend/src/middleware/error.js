// 接入层：统一异常处理（对应框架「二、分层框架总览」的接入层）
// 业务异常用 ApiError 抛出；未预期的异常兜底成 500，不把堆栈暴露给前端。

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 包一层，让 async 路由里的 reject 也能进入统一错误处理
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function notFoundJson(req, res) {
  res.status(404).json({ error: '接口不存在', path: req.originalUrl });
}

function errorHandler(err, req, res, next) {
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err && err.stack ? err.stack : err);

  if (status >= 500) {
    return res.status(500).json({ error: '服务器内部错误', message: err && err.message });
  }
  return res.status(status).json({ error: (err && err.message) || '请求有误' });
}

module.exports = { ApiError, asyncHandler, notFoundJson, errorHandler };