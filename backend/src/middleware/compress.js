/**
 * 问数星途 · 极简 gzip 中间件
 * ---------------------------------------------------------------------------
 * 为什么不直接用 compression 包：本项目后端刻意保持「零新增依赖」，
 * 而 Node 自带的 zlib 已经足够做这件事。
 *
 * 工作方式：
 *   1. 请求头里没有 gzip 就直接放行，不做任何多余计算
 *   2. 拦截 res.write / res.end，把响应体先攒在内存里（本项目没有大文件流，
 *      最大的资源是 146 KB 的 space.css，攒内存完全没问题）
 *   3. 只有「2xx + 文本类 MIME + 超过 1 KB」才压缩，
 *      否则原样吐回去 —— 图片、字体、woff2 这些本来就压过了，再压反而更大
 *   4. 静态资源（带 ETag 的）会把 gzip 结果缓存起来，
 *      CSS / JS 反复被请求时不再重复压缩，不吃 CPU
 *
 * 注意：如果哪天前面挂了 Nginx，建议在 Nginx 开 gzip 并把这里关掉，
 * 让 Nginx 承担压缩，省下 Node 的 CPU。
 */

const zlib = require('zlib');

// 只有这些类型值得压；文本类压缩比通常能到 20%~30%。
// text/event-stream（SSE）刻意排除：它必须逐条实时推，攒起来压等于把流式废掉。
const COMPRESSIBLE = /^(?:text\/(?!event-stream)|application\/(?:javascript|json|xml|manifest\+json|x-javascript)|image\/svg\+xml|font\/ttf|application\/(?:x-font-ttf|vnd\.ms-fontobject))/i;

// 小于这个大小就不折腾了：压缩后的头部开销可能比省下的还多
const MIN_BYTES = 1024;
// 缓存条数上限，超了就整体清空（比起写 LRU，这点小缓存不值得）
const CACHE_MAX = 200;

module.exports = function compress(options) {
  const opts = options || {};
  const minBytes = Number(opts.threshold) > 0 ? Number(opts.threshold) : MIN_BYTES;
  const level = Number(opts.level) >= 0 ? Number(opts.level) : zlib.constants.Z_DEFAULT_COMPRESSION;
  const gzipCache = new Map();

  function cacheOf(key) {
    const hit = gzipCache.get(key);
    return hit || null;
  }

  function remember(key, buf) {
    if (gzipCache.size >= CACHE_MAX) gzipCache.clear();
    gzipCache.set(key, buf);
  }

  function mergeVary(current, value) {
    const now = String(current || '').trim();
    if (!now) return value;
    return now.toLowerCase().indexOf(value.toLowerCase()) === -1 ? now + ', ' + value : now;
  }

  return function gzipMiddleware(req, res, next) {
    const accept = String(req.headers['accept-encoding'] || '');
    // 只处理明确说了支持 gzip 的客户端；HEAD 没有响应体
    if (!/\bgzip\b/i.test(accept) || req.method === 'HEAD') return next();
    // 已经有人压过了就别压第二遍
    if (res.getHeader && res.getHeader('Content-Encoding')) return next();

    const rawWrite = res.write.bind(res);
    const rawEnd = res.end.bind(res);
    const chunks = [];
    let total = 0;
    let bypass = false;

    // 已经把攒下的内容原样吐出去（异步写之前顺序不能乱，所以要从旧的到新的依次写）
    function releaseBuffer() {
      if (!chunks.length) return;
      const body = Buffer.concat(chunks, total);
      chunks.length = 0;
      total = 0;
      rawWrite(body);
    }

    // 响应头已经发出去了（比如路由里主动 res.flushHeaders() 开流），
    // 这时既加不了 Content-Encoding，也不能再攒着 —— 立刻切成透传，
    // 否则那些已经写进 chunks 的分片会永远发不出去（表现为响应体为空）。
    function switchToPassthrough() {
      if (bypass) return;
      bypass = true;
      releaseBuffer();
    }

    res.write = function (chunk, encoding, callback) {
      if (bypass) return rawWrite(chunk, encoding, callback);
      if (typeof chunk === 'function') { callback = chunk; chunk = null; encoding = null; }
      if (res.headersSent) {
        switchToPassthrough();
        return rawWrite(chunk, encoding, callback);
      }
      if (typeof encoding === 'function') { callback = encoding; encoding = null; }
      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
        chunks.push(buf);
        total += buf.length;
      }
      if (typeof callback === 'function') callback();
      return true;
    };

    res.end = function (chunk, encoding, callback) {
      if (typeof chunk === 'function') { callback = chunk; chunk = null; encoding = null; }
      else if (typeof encoding === 'function') { callback = encoding; encoding = null; }

      if (bypass || res.writableEnded) return rawEnd(chunk, encoding, callback);
      if (res.headersSent) {
        switchToPassthrough();
        return rawEnd(chunk, encoding, callback);
      }

      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
        chunks.push(buf);
        total += buf.length;
      }

      const body = Buffer.concat(chunks, total);
      const type = String(res.getHeader('Content-Type') || '');
      const status = res.statusCode || 200;
      const worth = status >= 200 && status < 300 && total >= minBytes && COMPRESSIBLE.test(type);

      if (!worth) {
        bypass = true;
        return rawEnd(body, callback);
      }

      // 静态资源带 ETag，可以用它当缓存键；动态接口不缓存，避免串数据
      const etag = res.getHeader('ETag');
      const key = etag ? req.url + '|' + etag : null;
      const cached = key ? cacheOf(key) : null;

      const finish = function (gz) {
        bypass = true;
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', mergeVary(res.getHeader('Vary'), 'Accept-Encoding'));
        // 压缩后长度变了，必须重算，否则浏览器会截断
        res.setHeader('Content-Length', String(gz.length));
        return rawEnd(gz, callback);
      };

      if (cached) return finish(cached);

      zlib.gzip(body, { level: level }, function (err, gz) {
        if (err) {
          // 压缩失败不能把请求弄挂：老老实实回原始内容
          res.removeHeader('Content-Encoding');
          bypass = true;
          return rawEnd(body, callback);
        }
        if (key) remember(key, gz);
        return finish(gz);
      });
      return undefined;
    };

    next();
  };
};