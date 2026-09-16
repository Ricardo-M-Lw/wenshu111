#!/usr/bin/env node
/**
 * 小问形象素材构建脚本（零依赖）
 * ---------------------------------------------------------------------------
 * 把设计稿源目录里的「小问」素材整理成前端能直接用的资源：
 *   · 动图（.webp，带透明通道）原样拷贝 —— idle / wave / listen / thinking 等 12 个状态；
 *   · 静帧 PNG 由脚本解码 → 裁到角色边缘（去掉大片透明留白）→ 等比缩到最长边 320 → 重新编码，
 *     体积通常只有原图的十分之一，而且每个状态的角色大小一致，切换状态时不会“跳大小”。
 *
 * 用法：node tools/prepare-xiaowen-assets.js [源目录]
 * 默认源目录：E:\企业实训\素材图\素材图\小问形象设计
 * 输出目录：frontend/assets/images/mascot/xiaowen/
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || 'E:\\企业实训\\素材图\\素材图\\小问形象设计';
const OUT = path.join(ROOT, 'frontend', 'assets', 'images', 'mascot', 'xiaowen');
const MAX_SIDE = 320;
const EDGE_THRESHOLD = 12;
const EDGE_PAD = 2;

// 动图状态：源文件已经是带透明通道的动图 WebP，直接拷贝
const ANIM = {
  idle: '01-问候待机/xiao-wen-idle.webp',
  wave: '01-问候待机/xiao-wen-wave.webp',
  expect: '02-等待互动/xiao-wen-expect.webp',
  listen: '02-等待互动/xiao-wen-listen.webp',
  thinking: '03-思考探索/xiao-wen-thinking.webp',
  curious: '03-思考探索/xiao-wen-curious.webp',
  confused: '03-思考探索/xiao-wen-confused.webp',
  explain: '04-讲解引导/xiao-wen-explain.webp',
  aha: '05-情绪反馈/xiao-wen-aha.webp',
  celebrate: '05-情绪反馈/xiao-wen-celebrate.webp',
  comfort: '05-情绪反馈/xiao-wen-comfort.webp',
  encourage: '05-情绪反馈/xiao-wen-encourage.webp'
};

// 静帧状态：源文件是带透明通道的真 PNG（设计稿里那些 .png 后缀其实是 JPEG 的版本一律不用，
// 因为它们没有透明通道，贴到深色星空底上会露出一块白底）
const STILL = {
  idle: '01-问候待机/xiao-wen-idle.png',
  curious: '03-思考探索/xiao-wen-curious.png',
  thinking: '03-思考探索/xiao-wen-thinking.png',
  focused: '03-思考探索/xiao-wen-focused.png',
  puzzled: '03-思考探索/xiao-wen-puzzled.png',
  celebrate: '05-情绪反馈/xiao-wen-celebrate.png',
  angry: '06-情绪表情/xiao-wen-angry.png',
  awkward: '06-情绪表情/xiao-wen-awkward.png',
  cry: '06-情绪表情/xiao-wen-cry.png',
  determined: '06-情绪表情/xiao-wen-determined.png',
  discouraged: '06-情绪表情/xiao-wen-discouraged.png',
  like: '06-情绪表情/xiao-wen-like.png',
  nervous: '06-情绪表情/xiao-wen-nervous.png',
  proud: '06-情绪表情/xiao-wen-proud.png',
  sad: '06-情绪表情/xiao-wen-sad.png',
  scared: '06-情绪表情/xiao-wen-scared.png',
  shocked: '06-情绪表情/xiao-wen-shocked.png',
  shy: '06-情绪表情/xiao-wen-shy.png',
  sleepy: '06-情绪表情/xiao-wen-sleepy.png',
  sorry: '06-情绪表情/xiao-wen-sorry.png',
  speechless: '06-情绪表情/xiao-wen-speechless.png',
  wronged: '06-情绪表情/xiao-wen-wronged.png'
};

// ---------------------------------------------------------------------------
// PNG 解码：只支持 8bit / 非隔行的真彩色（含 alpha），设计稿正好都是这一类
// ---------------------------------------------------------------------------
function decodePng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        depth: body[8], color: body[9], interlace: body[12]
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('缺少 IHDR');
  if (header.depth !== 8 || header.interlace !== 0) throw new Error('只支持 8bit 非隔行 PNG');
  const channels = header.color === 6 ? 4 : header.color === 2 ? 3 : 0;
  if (!channels) throw new Error('不支持的色彩类型 ' + header.color);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const width = header.width;
  const height = header.height;
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    if (filter !== 0) {
      for (let i = 0; i < stride; i += 1) {
        const left = i >= channels ? line[i - channels] : 0;
        const up = previous[i];
        const upLeft = i >= channels ? previous[i - channels] : 0;
        let add = 0;
        if (filter === 1) add = left;
        else if (filter === 2) add = up;
        else if (filter === 3) add = (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        } else throw new Error('未知的行过滤器 ' + filter);
        line[i] = (line[i] + add) & 0xff;
      }
    }
    line.copy(pixels, y * stride);
    previous = line;
  }
  return { width, height, channels, pixels };
}

// ---------------------------------------------------------------------------
// 抠出角色外接框（只看 alpha 通道）
// ---------------------------------------------------------------------------
function contentBox(image) {
  const width = image.width;
  const height = image.height;
  if (image.channels !== 4) return { x: 0, y: 0, width, height };
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (image.pixels[(y * width + x) * 4 + 3] > EDGE_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  const x = Math.max(0, minX - EDGE_PAD);
  const y = Math.max(0, minY - EDGE_PAD);
  return {
    x, y,
    width: Math.min(width, maxX + 1 + EDGE_PAD) - x,
    height: Math.min(height, maxY + 1 + EDGE_PAD) - y
  };
}

// 裁切并按 alpha 预乘转成浮点，方便后面缩放时不留白边
function cropPremultiplied(image, box) {
  const out = new Float32Array(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const source = ((box.y + y) * image.width + (box.x + x)) * image.channels;
      const target = (y * box.width + x) * 4;
      const alpha = image.channels === 4 ? image.pixels[source + 3] / 255 : 1;
      out[target] = image.pixels[source] * alpha;
      out[target + 1] = image.pixels[source + 1] * alpha;
      out[target + 2] = image.pixels[source + 2] * alpha;
      out[target + 3] = alpha * 255;
    }
  }
  return out;
}

// 面积平均缩放（缩小时比双线性干净），横向纵向各一次
function areaWeights(sourceLength, targetLength) {
  const scale = sourceLength / targetLength;
  const table = [];
  for (let target = 0; target < targetLength; target += 1) {
    const start = target * scale;
    const end = (target + 1) * scale;
    const from = Math.floor(start);
    const to = Math.min(Math.ceil(end), sourceLength);
    const row = [];
    let total = 0;
    for (let i = from; i < to; i += 1) {
      const overlap = Math.min(end, i + 1) - Math.max(start, i);
      if (overlap <= 0) continue;
      row.push(i, overlap);
      total += overlap;
    }
    for (let i = 1; i < row.length; i += 2) row[i] /= total;
    table.push(row);
  }
  return table;
}

function resample(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const horizontal = areaWeights(sourceWidth, targetWidth);
  const vertical = areaWeights(sourceHeight, targetHeight);
  const middle = new Float32Array(targetWidth * sourceHeight * 4);
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const row = horizontal[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < row.length; k += 2) {
        const sourceIndex = (y * sourceWidth + row[k]) * 4;
        const weight = row[k + 1];
        r += source[sourceIndex] * weight;
        g += source[sourceIndex + 1] * weight;
        b += source[sourceIndex + 2] * weight;
        a += source[sourceIndex + 3] * weight;
      }
      const targetIndex = (y * targetWidth + x) * 4;
      middle[targetIndex] = r;
      middle[targetIndex + 1] = g;
      middle[targetIndex + 2] = b;
      middle[targetIndex + 3] = a;
    }
  }
  const out = new Float32Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const row = vertical[y];
    for (let x = 0; x < targetWidth; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < row.length; k += 2) {
        const sourceIndex = (row[k] * targetWidth + x) * 4;
        const weight = row[k + 1];
        r += middle[sourceIndex] * weight;
        g += middle[sourceIndex + 1] * weight;
        b += middle[sourceIndex + 2] * weight;
        a += middle[sourceIndex + 3] * weight;
      }
      const targetIndex = (y * targetWidth + x) * 4;
      out[targetIndex] = r;
      out[targetIndex + 1] = g;
      out[targetIndex + 2] = b;
      out[targetIndex + 3] = a;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG 编码
// ---------------------------------------------------------------------------
const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function clampByte(value) {
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

function filterLine(type, line, previous, channels) {
  const out = Buffer.alloc(line.length);
  for (let i = 0; i < line.length; i += 1) {
    const left = i >= channels ? line[i - channels] : 0;
    const up = previous ? previous[i] : 0;
    const upLeft = previous && i >= channels ? previous[i - channels] : 0;
    let value;
    if (type === 0) value = line[i];
    else if (type === 1) value = line[i] - left;
    else if (type === 2) value = line[i] - up;
    else if (type === 3) value = line[i] - ((left + up) >> 1);
    else {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      value = line[i] - (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
    }
    out[i] = value & 0xff;
  }
  return out;
}

function encodePng(width, height, premultiplied) {
  const stride = width * 4;
  const rgba = Buffer.alloc(height * stride);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = clampByte(premultiplied[i * 4 + 3]);
    rgba[i * 4 + 3] = alpha;
    if (!alpha) continue;
    const factor = alpha / 255;
    rgba[i * 4] = clampByte(premultiplied[i * 4] / factor);
    rgba[i * 4 + 1] = clampByte(premultiplied[i * 4 + 1] / factor);
    rgba[i * 4 + 2] = clampByte(premultiplied[i * 4 + 2] / factor);
  }

  // 五filter 各压一遍，取最小的那版，卡通色块用 Sub / Up 通常能再省一半
  let best = null;
  for (const type of [0, 1, 2, 3, 4]) {
    const raw = Buffer.alloc(height * (stride + 1));
    let previous = null;
    for (let y = 0; y < height; y += 1) {
      const line = rgba.subarray(y * stride, (y + 1) * stride);
      raw[y * (stride + 1)] = type;
      filterLine(type, line, previous, 4).copy(raw, y * (stride + 1) + 1);
      previous = line;
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    if (!best || compressed.length < best.length) best = compressed;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', best),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(SRC)) {
    console.error('找不到素材源目录：' + SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  let copied = 0;
  for (const state of Object.keys(ANIM)) {
    const from = path.join(SRC, ANIM[state].split('/').join(path.sep));
    if (!fs.existsSync(from)) { console.warn('跳过缺失动图：' + ANIM[state]); continue; }
    fs.copyFileSync(from, path.join(OUT, state + '.webp'));
    copied += 1;
  }

  const rows = [];
  for (const state of Object.keys(STILL)) {
    const from = path.join(SRC, STILL[state].split('/').join(path.sep));
    if (!fs.existsSync(from)) { console.warn('跳过缺失静帧：' + STILL[state]); continue; }
    const image = decodePng(fs.readFileSync(from));
    const box = contentBox(image);
    const cropped = cropPremultiplied(image, box);
    const scale = MAX_SIDE / Math.max(box.width, box.height);
    const width = scale < 1 ? Math.max(1, Math.round(box.width * scale)) : box.width;
    const height = scale < 1 ? Math.max(1, Math.round(box.height * scale)) : box.height;
    const pixels = scale < 1 ? resample(cropped, box.width, box.height, width, height) : cropped;
    const png = encodePng(width, height, pixels);
    fs.writeFileSync(path.join(OUT, state + '.png'), png);
    rows.push({
      state,
      source: box.width + 'x' + box.height,
      out: width + 'x' + height,
      size: Math.round(png.length / 1024) + 'KB',
      anim: !!ANIM[state]
    });
  }

  console.log('动图拷贝 ' + copied + ' 个，静帧生成 ' + rows.length + ' 个 → ' + path.relative(ROOT, OUT));
  console.log('');
  for (const row of rows) {
    console.log('  ' + (row.state + (row.anim ? ' (动图+静帧)' : '')).padEnd(22)
      + '裁切 ' + row.source.padEnd(10) + '→ ' + row.out.padEnd(10) + row.size);
  }
}

main();