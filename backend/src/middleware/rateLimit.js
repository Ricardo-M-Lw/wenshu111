// 频率计数限流：对应框架「六、Redis」的「频率计数 —— 防止频繁请求」
// 计数器放在缓存层，多实例部署时天然共享（换成 Redis 即可）。
// 用法：router.post('/send-code', rateLimit({ bucket: 'auth:code', ... }), handler)

const cache = require('../cache');

function defaultKey(req) {
  if (req.user && req.user.id) return req.user.id;
  return req.ip || (req.connection && req.connection.remoteAddress) || 'anonymous';
}

function rateLimit(options) {
  const opts = options || {};
  const bucket = opts.bucket || 'default';
  const limit = opts.limit || 60;
  const windowSec = opts.windowSec || 60;
  const keyOf = opts.keyOf || defaultKey;

  return function (req, res, next) {
    cache.hit(cache.keys.rate(bucket, keyOf(req)), windowSec).then(function (result) {
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - result.count));
      if (result.count > limit) {
        res.setHeader('Retry-After', result.ttl);
        return res.status(429).json({
          error: '操作太频繁啦，' + result.ttl + ' 秒后再试一次',
          retryAfter: result.ttl,
          bucket: bucket
        });
      }
      return next();
    }).catch(next);
  };
}

module.exports = { rateLimit, defaultKey };