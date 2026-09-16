/**
 * 问数星途 · 星图美术库（QWSpaceArt）
 * ---------------------------------------------------------------------------
 * 纯函数式的手绘风 SVG 图案生成器，不依赖任何第三方库与网络资源。
 * 覆盖：带表情的手绘星球 / 星座连线 / 数形结合作图 / 粒子特效 / 轨道残影。
 *
 * 设计约束：
 *  - 每个函数只返回字符串，不做 DOM 操作（便于测试与复用）
 *  - 所有 id 都带 uid 后缀，避免同页多实例时 <defs> 冲突
 *  - 配色走 CSS 变量（--sq-sun / --sq-violet / --sq-blue / --sq-teal / --sq-coral），
 *    没取到值时回退到内置常量，保证脱离 space.css 也能出图
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'qw-space-art-style';
  var uidSeq = 0;

  function uid(prefix) {
    uidSeq += 1;
    return (prefix || 'a') + uidSeq;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  /* -------------------------------------------------------------------------
     1 · 样式注入（动画与画笔风格），全页只注入一次
     ------------------------------------------------------------------------- */
  function injectStyle(doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || d.getElementById(STYLE_ID)) return;
    var style = d.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '@keyframes qwOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      '@keyframes qwTwinkle { 0%,100% { opacity: .25; transform: scale(.82); } 50% { opacity: 1; transform: scale(1.12); } }',
      '@keyframes qwBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }',
      '@keyframes qwDashRun { to { stroke-dashoffset: -240; } }',
      '@keyframes qwPopUp { 0% { opacity: 0; transform: translate(-50%,0) scale(.6); } 18% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx,0px)), -74px) scale(1.12); } }',
      '@keyframes qwSpark { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.3); } 25% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx,0px)), calc(-50% + var(--dy,0px))) scale(1.2); } }',
      '.qw-art { display: block; overflow: visible; }',
      '.qw-art .qa-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.4; }',
      '.qw-art .qa-dash { stroke-dasharray: 7 7; animation: qwDashRun 9s linear infinite; }',
      '.qw-art .qa-thin { stroke-width: 1.8; opacity: .78; }',
      '.qw-art .qa-spark { animation: qwTwinkle 3.4s ease-in-out infinite; transform-origin: center; }',
      '.qw-art .qa-tag { font-weight: 800; paint-order: stroke; stroke-width: 3.6px; stroke-linejoin: round; }',
      '.qw-orb-art { animation: qwBob 7.5s ease-in-out infinite; }',
      '.qw-dust-layer { position: absolute; inset: -18px; pointer-events: none; overflow: visible; z-index: 6; }',
      '.qw-dust-layer span { position: absolute; left: 50%; top: 18%; font-weight: 800; text-shadow: 0 0 10px rgba(255,221,83,.9); animation: qwPopUp 900ms ease-out forwards; }',
      '.qw-dust-layer span.qw-spark { left: 50%; top: 50%; text-shadow: 0 0 8px rgba(255,221,83,.85); animation: qwSpark 760ms ease-out forwards; }',
      /* 首页星球卡：用手绘星球替换 CSS 笑脸，去掉圆形底色与 ::after 虚线环 */
      '.sq-planet-orb.has-art { width: 150px; height: 150px; border-radius: 0; background: none; box-shadow: none; }',
      '.sq-planet-orb.has-art::after { display: none; }',
      '.sq-planet-orb.has-art .qa-planet { width: 100%; height: 100%; animation: none; }',
      /* 答题星球页：同上 */
      '.qwp-body.has-art { background: none; box-shadow: none; }',
      '.qwp-body.has-art .qa-planet { width: 106%; height: 106%; animation: none; }',
      /* 勋章 / 纹章 / 星系图案 */
      '.qw-emblem { display: block; margin: 0 auto; overflow: visible; }',
      '.qw-emblem.is-locked { filter: grayscale(.86); opacity: .55; }',
      '.qw-galaxy { display: block; overflow: visible; opacity: .5; }',
      '.qw-dust-host { position: relative; }',
      '.qw-badge-icon.has-emblem { font-size: 0; line-height: 0; }',
      '.qw-level-badge.has-emblem { width: 58px; height: 69px; border-radius: 0; background: none; font-size: 0; }'
    ].join('\n');
    (d.head || d.documentElement).appendChild(style);
  }

  /* -------------------------------------------------------------------------
     2 · 手绘星球
     ------------------------------------------------------------------------- */

  // 知识点专属配色与「手持道具」
  var PLANET_KIT = {
    kp1: { color: '#7C6CF5', deep: '#4B3DC4', ink: '#3A2E8F', tag: 'y = kx + b', tagColor: '#7C6CF5' },
    kp2: { color: '#2BA4A0', deep: '#14726F', ink: '#0C5450', tag: 'A+B+C = 180°', tagColor: '#2BA4A0' },
    kp3: { color: '#FFC53D', deep: '#E08A0B', ink: '#A2610A', tag: 'a² + b² = c²', tagColor: '#A2610A' },
    def: { color: '#4C7DF0', deep: '#2C4FB8', ink: '#1E3A8A', tag: '', tagColor: '#4C7DF0' }
  };

  var MOOD_KIT = {
    happy:    { eye: 1,   smile: 'M86 114 Q100 127 114 114', blush: .34 },
    curious:  { eye: 1.12, smile: 'M88 116 Q100 124 112 116', blush: .26 },
    proud:    { eye: .86, smile: 'M84 113 Q100 130 116 113', blush: .42 },
    sleepy:   { eye: .3,  smile: 'M90 117 Q100 124 110 117', blush: .30 }
  };

  // 星球背面的光环（后半段）
  function ringBack(c, id) {
    return '<path d="M26 108 A74 26 0 0 1 174 108" fill="none" stroke="' + c + '" stroke-width="7" '
      + 'stroke-linecap="round" opacity=".55" transform="rotate(-16 100 100)"/>';
  }
  // 星球正面的光环（前半段，压在球体上，制造穿插感）
  function ringFront(c) {
    return '<path d="M174 108 A74 26 0 0 1 26 108" fill="none" stroke="' + c + '" stroke-width="7" '
      + 'stroke-linecap="round" opacity=".85" transform="rotate(-16 100 100)"/>';
  }

  function craters(c) {
    return '<g fill="' + c + '" opacity=".20">'
      + '<ellipse cx="70" cy="72" rx="11" ry="8.5" transform="rotate(-22 70 72)"/>'
      + '<ellipse cx="132" cy="132" rx="8" ry="6" transform="rotate(14 132 132)"/>'
      + '<ellipse cx="126" cy="66" rx="5.5" ry="4.5"/>'
      + '</g>';
  }

  function face(mood) {
    var m = MOOD_KIT[mood] || MOOD_KIT.happy;
    var eyeW = 6.6 * m.eye;
    var eyeH = 8.4 * m.eye;
    return '<g>'
      + '<ellipse cx="82" cy="97" rx="' + eyeW.toFixed(1) + '" ry="' + eyeH.toFixed(1) + '" fill="#2C2A3E"/>'
      + '<ellipse cx="118" cy="97" rx="' + eyeW.toFixed(1) + '" ry="' + eyeH.toFixed(1) + '" fill="#2C2A3E"/>'
      + '<circle cx="84.4" cy="93.6" r="2.1" fill="#FFFFFF"/>'
      + '<circle cx="120.4" cy="93.6" r="2.1" fill="#FFFFFF"/>'
      + '<ellipse cx="67" cy="110" rx="9" ry="5.4" fill="#FF7A59" opacity="' + m.blush + '"/>'
      + '<ellipse cx="133" cy="110" rx="9" ry="5.4" fill="#FF7A59" opacity="' + m.blush + '"/>'
      + '<path d="' + m.smile + '" fill="none" stroke="#2C2A3E" stroke-width="2.8" stroke-linecap="round"/>'
      + '</g>';
  }

  function sparkles(c) {
    var pts = [[40, 44], [162, 58], [46, 156], [158, 150]];
    return pts.map(function (p, i) {
      var s = i % 2 ? 5.4 : 7;
      return '<path class="qa-spark" style="animation-delay:' + (i * 0.7).toFixed(1) + 's" '
        + 'd="M' + p[0] + ' ' + (p[1] - s) + ' L' + (p[0] + s * 0.34) + ' ' + (p[1] - s * 0.34)
        + ' L' + (p[0] + s) + ' ' + p[1] + ' L' + (p[0] + s * 0.34) + ' ' + (p[1] + s * 0.34)
        + ' L' + p[0] + ' ' + (p[1] + s) + ' L' + (p[0] - s * 0.34) + ' ' + (p[1] + s * 0.34)
        + ' L' + (p[0] - s) + ' ' + p[1] + ' L' + (p[0] - s * 0.34) + ' ' + (p[1] - s * 0.34)
        + ' Z" fill="' + c + '" opacity=".85"/>';
    }).join('');
  }

  // 三个知识点各自的「手持道具」——画在球体外圈，不遮脸
  var ACCESSORY = {
    // 一次函数：坐标系 + 上升直线 + 小卫星
    kp1: function (k) {
      return '<g>'
        + '<g class="qa-line qa-thin" stroke="' + k.ink + '" opacity=".55">'
        + '<path d="M22 178V122M22 178h58"/>'
        + '<path d="M22 122l-4 9M22 122l4 9M80 178l-9-4M80 178l-9 4"/></g>'
        + '<path class="qa-line qa-dash" stroke="#FF7A59" d="M28 172 L76 130"/>'
        + '<circle cx="76" cy="130" r="5" fill="#FFC53D"/>'
        + '</g>';
    },
    // 内角和：环着球体的虚线三角形 + 三个角的弧
    kp2: function (k) {
      return '<g>'
        + '<path class="qa-line qa-dash" stroke="' + k.color + '" opacity=".8" d="M100 16 L16 168 H184 Z"/>'
        + '<g class="qa-line qa-thin" stroke="' + k.color + '">'
        + '<path d="M100 40a22 22 0 0 0-11 19"/>'
        + '<path d="M40 152a19 19 0 0 0 16 11"/>'
        + '<path d="M160 152a19 19 0 0 1-16 11"/></g>'
        + '</g>';
    },
    // 勾股：直角三角 + 三边正方形（赵爽弦图的简化示意）
    kp3: function (k) {
      return '<g>'
        + '<path d="M12 184 h56 v-56 z" fill="#FFC53D" opacity=".22"/>'
        + '<path class="qa-line" stroke="' + k.color + '" d="M12 184 h56 v-56 z"/>'
        + '<path class="qa-line qa-thin" stroke="' + k.ink + '" d="M12 172h12v12"/>'
        + '<path class="qa-dash qa-line" stroke="#FF7A59" d="M12 184 L68 128"/>'
        + '<circle cx="68" cy="128" r="5" fill="#FF7A59"/>'
        + '</g>';
    },
    def: function () { return ''; }
  };

  /**
   * 生成一颗手绘表情星球
   * @param {Object} spec { id, color, deep, mood, ring, size, tag, className }
   * @returns {string} SVG 字符串
   */
  function planet(spec) {
    var s = spec || {};
    var kit = PLANET_KIT[s.id] || PLANET_KIT.def;
    var color = s.color || kit.color;
    var deep = s.deep || kit.deep;
    var ink = s.ink || kit.ink;
    var mood = MOOD_KIT[s.mood] ? s.mood : 'happy';
    var size = num(s.size, 160);
    var withRing = s.ring !== false;
    var tag = s.tag === undefined ? kit.tag : s.tag;
    var tagColor = s.tagColor || kit.tagColor;
    var cls = 'qw-art qa-planet ' + (s.className || 'qw-orb-art');

    var bodyId = uid('qaBody');
    var glowId = uid('qaGlow');

    var out = '<svg class="' + esc(cls) + '" viewBox="0 0 200 200" width="' + size + '" height="' + size + '" '
      + 'role="img" aria-label="' + esc(s.label || '数学星球') + '">'
      + '<defs>'
      + '<radialGradient id="' + bodyId + '" cx="0.34" cy="0.26" r="0.82">'
      + '<stop offset="0" stop-color="#FFFFFF" stop-opacity=".62"/>'
      + '<stop offset=".38" stop-color="' + color + '"/>'
      + '<stop offset="1" stop-color="' + deep + '"/>'
      + '</radialGradient>'
      + '<filter id="' + glowId + '" x="-40%" y="-40%" width="180%" height="180%">'
      + '<feGaussianBlur stdDeviation="9"/>'
      + '</filter>'
      + '</defs>';

    // 外发光
    out += '<circle cx="100" cy="100" r="72" fill="' + color + '" opacity=".22" filter="url(#' + glowId + ')"/>';
    if (withRing) out += ringBack(color, bodyId);
    // 球体
    out += '<circle cx="100" cy="100" r="64" fill="url(#' + bodyId + ')"/>';
    out += '<circle cx="100" cy="100" r="64" fill="none" stroke="' + ink + '" stroke-opacity=".18" stroke-width="1.6"/>';
    out += craters(ink);
    out += face(mood);
    if (withRing) out += ringFront(color);
    out += (ACCESSORY[s.id] || ACCESSORY.def)(PLANET_KIT[s.id] || PLANET_KIT.def);
    out += sparkles(color);

    if (tag) {
      out += '<text class="qa-tag" x="100" y="21" text-anchor="middle" font-size="14" '
        + 'fill="' + tagColor + '" stroke="rgba(255,255,255,.96)">' + esc(tag) + '</text>';
    }
    out += '</svg>';
    return out;
  }

  /* -------------------------------------------------------------------------
     3 · 星座连线（背景装饰）
     ------------------------------------------------------------------------- */
  function constellation(spec) {
    var s = spec || {};
    var stars = s.stars || [[10, 60], [42, 22], [78, 48], [120, 16], [156, 52], [96, 84], [40, 96]];
    var color = s.color || 'rgba(255,255,255,.62)';
    var size = num(s.size, 180);
    var path = stars.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
    return '<svg class="qw-art qa-constel" viewBox="0 0 170 110" width="' + size + '" height="' + Math.round(size * 110 / 170) + '" aria-hidden="true">'
      + '<path class="qa-line qa-thin" stroke="' + color + '" stroke-dasharray="3 5" d="' + path + '"/>'
      + stars.map(function (p, i) {
          return '<circle class="qa-spark" style="animation-delay:' + (i * 0.42).toFixed(2) + 's" '
            + 'cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i % 3 === 0 ? 3 : 2) + '" fill="' + color + '"/>';
        }).join('')
      + '</svg>';
  }

  /* -------------------------------------------------------------------------
     4 · 数形结合作图（借鉴「按数量画点」的思路，重写为可复用组件）
     ------------------------------------------------------------------------- */

  /**
   * 在一条线段上均匀画 n 个小圆点 —— 把「长度」变成「数量」，让 a²+b²=c² 看得见
   */
  function sideDots(x1, y1, x2, y2, n, color, r) {
    var count = Math.max(1, Math.min(60, Math.round(num(n, 1))));
    var radius = num(r, 3.6);
    var out = '';
    for (var i = 1; i <= count; i += 1) {
      var t = i / (count + 1);
      out += '<circle cx="' + (x1 + (x2 - x1) * t).toFixed(1) + '" cy="' + (y1 + (y2 - y1) * t).toFixed(1)
        + '" r="' + radius + '" fill="' + color + '"/>';
    }
    return out;
  }

  /**
   * 单位方格阵（「星尘格子」）—— 把「面积」画成可以一格一格数出来的小方块
   * 这是整个讲题可视化里最直观的一张图：a²=9 就是 3×3 九块、b²=16 就是 4×4 十六块。
   * 用 SVG 而不是位图，所以任何尺寸都清晰，也不花钱、不联网。
   * @param {Object} spec {
   *   x, y,        未旋转时正方形的左上角
   *   side,        正方形边长（像素）
   *   n,           每边格数（边长是几就传几，例如 a=3 传 3）
   *   color,       主色；格子按棋盘格做深浅交替
   *   gap,         格与格之间的缝（默认 1.8）
   *   radius,      每个小方块的圆角（默认按格子大小自适应）
   *   tilt,        整体绕中心旋转的角度，斜边上的正方形用得到
   *   mark,        每格中心的记号：star | dot | none
   *   opacity,     整块方格的不透明度（默认 1，浅色/复杂底图上可以调低一点）
   *   className, label
   * }
   */
  function cellGrid(spec) {
    var s = spec || {};
    var x = num(s.x, 0);
    var y = num(s.y, 0);
    var side = Math.max(4, num(s.side, 120));
    var n = Math.max(1, Math.min(12, Math.round(num(s.n, 3))));
    var color = s.color || "#FFC53D";
    var gap = Math.max(0, num(s.gap, 1.8));
    var unit = side / n;
    var radius = Math.max(0, num(s.radius, Math.min(4, unit / 5)));
    var tilt = num(s.tilt, 0);
    var alpha = Math.max(0, Math.min(1, num(s.opacity, 1)));
    var mark = s.mark === undefined ? "star" : s.mark;
    var cell = Math.max(1, unit - gap);
    var line = shade(color, 0.34);
    var dark = shade(color, 0.16);
    var body = "";
    var row, col, px, py, mx, my, mr;

    for (row = 0; row < n; row += 1) {
      for (col = 0; col < n; col += 1) {
        px = x + col * unit + gap / 2;
        py = y + row * unit + gap / 2;
        body += "<rect x=\"" + px.toFixed(1) + "\" y=\"" + py.toFixed(1) + "\" width=\"" + cell.toFixed(1)
          + "\" height=\"" + cell.toFixed(1) + "\" rx=\"" + radius.toFixed(1) + "\" fill=\""
          + ((row + col) % 2 ? tint(color, 0.46) : tint(color, 0.14))
          + "\" stroke=\"" + line + "\" stroke-width=\"1\"/>";
        mx = px + cell / 2;
        my = py + cell / 2;
        mr = Math.min(5.4, cell * 0.26);
        if (mark === "star" && cell > 9) {
          body += "<path d=\"" + starPath(mx, my, mr) + "\" fill=\"" + dark + "\" opacity=\".52\"/>";
        } else if (mark === "dot" && cell > 7) {
          body += "<circle cx=\"" + mx.toFixed(1) + "\" cy=\"" + my.toFixed(1) + "\" r=\""
            + (mr * 0.46).toFixed(1) + "\" fill=\"" + dark + "\" opacity=\".48\"/>";
        }
      }
    }

    var out = "<g class=\"qa-cells\">" + body
      + "<rect x=\"" + x.toFixed(1) + "\" y=\"" + y.toFixed(1) + "\" width=\"" + side.toFixed(1)
      + "\" height=\"" + side.toFixed(1) + "\" rx=\"6\" fill=\"none\" stroke=\"" + color
      + "\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/></g>";

    if (tilt) {
      out = "<g transform=\"rotate(" + tilt.toFixed(2) + " " + (x + side / 2).toFixed(1) + " "
        + (y + side / 2).toFixed(1) + ")\">" + out + "</g>";
    }
    if (alpha < 1) out = "<g opacity=\"" + alpha.toFixed(2) + "\">" + out + "</g>";
    return out;
  }

  /**
   * 勾股定理「数形结合」整图：两直角边上按数量打点，斜边虚线脉冲，三边挂方糖

   * @param {Object} spec { a, b, size, showSquares }
   */
  function pythagorasArt(spec) {
    var s = spec || {};
    var a = Math.max(1, Math.min(12, Math.round(num(s.a, 3))));
    var b = Math.max(1, Math.min(14, Math.round(num(s.b, 4))));
    var box = num(s.size, 340);
    var showSquares = s.showSquares !== false;

    var pad = 46;
    var scale = Math.min((box - pad * 2) / b, (box - pad * 2) / a, 30);
    var w = b * scale;
    var h = a * scale;
    var ox = pad + (box - pad * 2 - w) / 2;
    var oy = pad + h + (box - pad * 2 - h) / 2;
    var topX = ox, topY = oy - h;
    var rightX = ox + w, rightY = oy;

    var c = Math.sqrt(a * a + b * b);
    var dash = uid('qaGrad');

    var out = '<svg class="qw-art qa-pythagoras" viewBox="0 0 ' + box + ' ' + box + '" width="100%" height="auto" '
      + 'role="img" aria-label="勾股定理数形结合示意图">'
      + '<defs><linearGradient id="' + dash + '" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#58D6F1"/><stop offset="1" stop-color="#FF7A59"/></linearGradient></defs>';

    if (showSquares) {
      // a 边正方形（贴在左侧）
      out += '<rect x="' + (ox - h) + '" y="' + (oy - h) + '" width="' + h + '" height="' + h
        + '" rx="9" fill="#FFC53D" opacity=".18" stroke="#FFC53D" stroke-width="2" stroke-dasharray="6 5"/>';
      // b 边正方形（贴在下方）
      out += '<rect x="' + ox + '" y="' + oy + '" width="' + w + '" height="' + w
        + '" rx="9" fill="#58D6F1" opacity=".16" stroke="#58D6F1" stroke-width="2" stroke-dasharray="6 5"/>';
    }

    // 直角三角本体
    out += '<polygon points="' + ox + ',' + oy + ' ' + ox + ',' + topY + ' ' + rightX + ',' + rightY
      + '" fill="rgba(255,255,255,.06)" stroke="#E8EEFF" stroke-width="3" stroke-linejoin="round"/>';
    // 直角标记
    var mk = 15;
    out += '<path d="M' + ox + ' ' + (oy - mk) + ' L' + (ox + mk) + ' ' + (oy - mk) + ' L' + (ox + mk) + ' ' + oy
      + '" fill="none" stroke="#98907B" stroke-width="2.4" stroke-linecap="round"/>';
    // 三边 + 打点
    out += '<line x1="' + ox + '" y1="' + oy + '" x2="' + topX + '" y2="' + topY + '" stroke="#FFC53D" stroke-width="4.5" stroke-linecap="round"/>';
    out += sideDots(ox, oy, topX, topY, a, '#FFF3CE');
    out += '<line x1="' + ox + '" y1="' + oy + '" x2="' + rightX + '" y2="' + rightY + '" stroke="#58D6F1" stroke-width="4.5" stroke-linecap="round"/>';
    out += sideDots(ox, oy, rightX, rightY, b, '#DDF7F5');
    out += '<line class="qa-line qa-dash" x1="' + topX + '" y1="' + topY + '" x2="' + rightX + '" y2="' + rightY
      + '" stroke="url(#' + dash + ')" stroke-width="4.5" stroke-dasharray="9 8"/>';
    // 顶点
    out += '<circle cx="' + topX + '" cy="' + topY + '" r="6" fill="#FFC53D"/>'
      + '<circle cx="' + rightX + '" cy="' + rightY + '" r="6" fill="#58D6F1"/>'
      + '<circle cx="' + ox + '" cy="' + oy + '" r="6" fill="#E1DAFF"/>';
    // 边长标签
    out += '<text class="qa-tag" x="' + (ox - 18) + '" y="' + (oy - h / 2) + '" text-anchor="end" font-size="17" fill="#A2610A" stroke="rgba(255,255,255,.94)">a=' + a + '</text>';
    out += '<text class="qa-tag" x="' + (ox + w / 2) + '" y="' + (oy + 24) + '" text-anchor="middle" font-size="17" fill="#0B6E8C" stroke="rgba(255,255,255,.94)">b=' + b + '</text>';
    out += '<text class="qa-tag" x="' + ((topX + rightX) / 2 + 14) + '" y="' + ((topY + rightY) / 2 - 12) + '" text-anchor="middle" font-size="17" fill="#B33A1E" stroke="rgba(255,255,255,.94)">c²=' + (c * c).toFixed(0) + '</text>';
    out += '</svg>';
    return out;
  }

  /* -------------------------------------------------------------------------
     5 · 勋章 / 纹章 / 星系图案（徽章页、等级页、结果页、星系图都能用）
     ------------------------------------------------------------------------- */

  function parseHex(c) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c == null ? '' : c).trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  /** 把两个颜色按比例混合（t=0 取 a，t=1 取 b），色值解析失败时原样返回 a */
  function mix(a, b, t) {
    var A = parseHex(a);
    var B = parseHex(b);
    if (!A || !B) return a;
    var k = num(t, 0.5);
    return toHex([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
  }

  function shade(c, t) { return mix(c, "#000000", t == null ? 0.4 : t); }
  function tint(c, t) { return mix(c, "#FFFFFF", t == null ? 0.4 : t); }

  /** 五角星的 path，中心 (cx,cy)、半径 r —— 徽章上的星数刻度用它画 */
  function starPath(cx, cy, r) {
    var d = "";
    for (var i = 0; i < 10; i += 1) {
      var ang = -Math.PI / 2 + (i * Math.PI) / 5;
      var rr = i % 2 ? r * 0.46 : r;
      d += (i ? "L" : "M") + (cx + Math.cos(ang) * rr).toFixed(1) + " " + (cy + Math.sin(ang) * rr).toFixed(1);
    }
    return d + "Z";
  }

  // 徽章底座造型：都画在 0..120 × 0..128 的盒子里，中心 (60,64)
  var EMBLEM_SHAPE = {
    hex: "M60 8 L110 36 V92 L60 120 L10 92 V36 Z",
    shield: "M60 6 L110 24 V70 Q110 104 60 122 Q10 104 10 70 V24 Z",
    round: "M60 10 A50 50 0 1 1 59.9 10 Z",
    diamond: "M60 6 L112 64 L60 122 L8 64 Z"
  };

  /** 等级配色：1 级灰蓝 → 5 级金色，逐级升温 */
  var LEVEL_TIER = ["#8CAAD4", "#35C5BE", "#4C7DF0", "#7C6CF5", "#F5A623"];

  function tierColor(level) {
    var i = Math.max(0, Math.min(LEVEL_TIER.length - 1, Math.round(num(level, 3)) - 1));
    return LEVEL_TIER[i];
  }

  /**
   * 勋章 / 等级纹章
   * @param {Object} spec {
   *   shape: "hex"|"shield"|"round"|"diamond",  底座造型
   *   color, deep,      主色与暗部（不给就按 level 取等级色）
   *   level,            1..5，决定默认配色
   *   symbol,           中心符号（emoji 或 1 个字）
   *   stars,            0..5，徽章下沿的星数刻度
   *   size,             像素宽（高度按 120:142 自适应）
   *   ribbon,           是否画绶带（默认画）
   *   locked,           未解锁时整体灰阶
   *   className, label
   * }
   */
  function emblem(spec) {
    var s = spec || {};
    var shape = EMBLEM_SHAPE[s.shape] ? s.shape : "hex";
    var level = Math.round(num(s.level, 3));
    var color = s.color || tierColor(level);
    var deep = s.deep || shade(color, 0.42);
    var size = num(s.size, 96);
    var locked = s.locked === true;
    var symbol = s.symbol == null ? "" : String(s.symbol);
    var stars = Math.max(0, Math.min(5, Math.round(num(s.stars, 0))));
    var gradId = uid("qaEmbFill");
    var glowId = uid("qaEmbGlow");
    var cls = "qw-art qw-emblem " + (s.className || "") + (locked ? " is-locked" : "");
    var body = EMBLEM_SHAPE[shape];
    var out = "";

    // 绶带：画在底座后面垂下来
    if (s.ribbon !== false) {
      out += "<path d=\"M31 100 L53 111 L46 136 L32 127 Z\" fill=\"" + deep + "\" opacity=\".92\"/>"
        + "<path d=\"M89 100 L67 111 L74 136 L88 127 Z\" fill=\"" + shade(color, 0.58) + "\" opacity=\".9\"/>"
        + "<path d=\"M46 136 L53 111 L60 116 L60 140 Z\" fill=\"" + shade(color, 0.7) + "\" opacity=\".55\"/>"
        + "<path d=\"M74 136 L67 111 L60 116 L60 140 Z\" fill=\"" + shade(color, 0.7) + "\" opacity=\".55\"/>";
    }
    // 外发光
    out += "<path d=\"" + body + "\" fill=\"" + color + "\" opacity=\".34\" filter=\"url(#" + glowId + ")\"/>";
    // 底座
    out += "<path d=\"" + body + "\" fill=\"url(#" + gradId + ")\" stroke=\"" + deep + "\" stroke-width=\"2.2\" stroke-linejoin=\"round\"/>";
    // 内圈虚线
    out += "<g transform=\"translate(60 64) scale(.76) translate(-60 -64)\">"
      + "<path d=\"" + body + "\" fill=\"none\" stroke=\"rgba(255,255,255,.7)\" stroke-width=\"3\" stroke-dasharray=\"8 6\" stroke-linejoin=\"round\"/>"
      + "</g>";
    // 顶部高光
    out += "<ellipse cx=\"60\" cy=\"32\" rx=\"25\" ry=\"9\" fill=\"#FFFFFF\" opacity=\".24\"/>";
    // 中心符号
    if (symbol) {
      out += "<text x=\"60\" y=\"" + (stars ? 68 : 74) + "\" text-anchor=\"middle\" dominant-baseline=\"middle\" "
        + "font-size=\"" + (stars ? 34 : 38) + "\" >" + esc(symbol) + "</text>";
    }
    // 星数刻度
    if (stars) {
      var gap = 13;
      var startX = 60 - ((stars - 1) * gap) / 2;
      for (var i = 0; i < stars; i += 1) {
        out += "<path d=\"" + starPath(startX + i * gap, 95, 6.4) + "\" fill=\"#FFF3CE\" stroke=\"rgba(0,0,0,.18)\" stroke-width=\".7\"/>";
      }
    }

    return "<svg class=\"" + esc(cls) + "\" viewBox=\"0 0 120 142\" width=\"" + size + "\" height=\""
      + Math.round((size * 142) / 120) + "\" role=\"img\" aria-label=\"" + esc(s.label || "成就徽章") + "\">"
      + "<defs>"
      + "<linearGradient id=\"" + gradId + "\" x1=\"0\" y1=\"0\" x2=\".55\" y2=\"1\">"
      + "<stop offset=\"0\" stop-color=\"" + tint(color, 0.36) + "\"/>"
      + "<stop offset=\".56\" stop-color=\"" + color + "\"/>"
      + "<stop offset=\"1\" stop-color=\"" + deep + "\"/>"
      + "</linearGradient>"
      + "<filter id=\"" + glowId + "\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"180%\">"
      + "<feGaussianBlur stdDeviation=\"7\"/>"
      + "</filter>"
      + "</defs>"
      + out
      + "</svg>";
  }

  /**
   * 螺旋星系：倾斜的盘状光晕 + 对数螺旋臂 + 亮核（给「一颗星球 = 一个知识点」的星系图当背景）
   * @param {Object} spec { size, color, core, tilt, arms }
   */
  function galaxy(spec) {
    var s = spec || {};
    var size = num(s.size, 260);
    var color = s.color || "#7C6CF5";
    var core = s.core || "#FFE9A8";
    var tilt = num(s.tilt, -22);
    var arms = Math.max(1, Math.min(4, Math.round(num(s.arms, 2))));
    var gradId = uid("qaGalDisc");
    var coreId = uid("qaGalCore");
    var armSvg = "";

    for (var a = 0; a < arms; a += 1) {
      var phase = (a / arms) * Math.PI;
      var d = "";
      for (var k = 0; k <= 1.0001; k += 0.045) {
        var th = phase + k * 3.6;
        var r = 7 + k * 86;
        d += (k ? "L" : "M") + (100 + Math.cos(th) * r).toFixed(1) + " " + (100 + Math.sin(th) * r).toFixed(1);
      }
      armSvg += "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + (a % 2 ? tint(color, 0.3) : color) + "\" "
        + "stroke-width=\"" + Math.max(3, 9 - a * 1.6).toFixed(1) + "\" stroke-linecap=\"round\" "
        + "opacity=\"" + Math.max(0.18, 0.5 - a * 0.09).toFixed(2) + "\"/>";
    }

    return "<svg class=\"qw-art qw-galaxy\" viewBox=\"0 0 200 200\" width=\"" + size + "\" height=\"" + size + "\" "
      + "role=\"img\" aria-label=\"" + esc(s.label || "星系") + "\" style=\"transform:rotate(" + tilt + "deg)\">"
      + "<defs>"
      + "<radialGradient id=\"" + gradId + "\" cx=\"50%\" cy=\"50%\" r=\"50%\">"
      + "<stop offset=\"0\" stop-color=\"" + color + "\" stop-opacity=\".5\"/>"
      + "<stop offset=\".6\" stop-color=\"" + color + "\" stop-opacity=\".18\"/>"
      + "<stop offset=\"1\" stop-color=\"" + color + "\" stop-opacity=\"0\"/>"
      + "</radialGradient>"
      + "<radialGradient id=\"" + coreId + "\" cx=\"50%\" cy=\"50%\" r=\"50%\">"
      + "<stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\".95\"/>"
      + "<stop offset=\".45\" stop-color=\"" + core + "\" stop-opacity=\".75\"/>"
      + "<stop offset=\"1\" stop-color=\"" + core + "\" stop-opacity=\"0\"/>"
      + "</radialGradient>"
      + "</defs>"
      + "<ellipse cx=\"100\" cy=\"100\" rx=\"98\" ry=\"42\" fill=\"url(#" + gradId + ")\"/>"
      + "<g transform=\"translate(100 100) scale(1 .42) translate(-100 -100)\">" + armSvg + "</g>"
      + "<ellipse cx=\"100\" cy=\"100\" rx=\"34\" ry=\"30\" fill=\"url(#" + coreId + ")\"/>"
      + "<ellipse cx=\"100\" cy=\"100\" rx=\"11\" ry=\"9\" fill=\"#FFFDF4\" opacity=\".92\"/>"
      + "</svg>";
  }

  /**
   * 庆祝特效：连打几组粒子，用于「答对了 / 通关了 / 升级了」
   * 注意：host 需要 position:relative（可以加 .qw-dust-host 类）
   */
  function celebrate(host, spec) {
    if (!host || !host.appendChild) return null;
    var s = spec || {};
    var times = Math.max(1, Math.min(4, Math.round(num(s.times, 2))));
    for (var i = 0; i < times; i += 1) {
      (function (delay) {
        setTimeout(function () {
          burst(host, { texts: s.texts, color: s.color });
        }, delay);
      })(i * 230);
    }
    return host;
  }

  /* -------------------------------------------------------------------------
     6 · 粒子特效（点宠物 / 答对时冒星星）
     ------------------------------------------------------------------------- */
  // 轻量 DOM 环境的 style 没有 setProperty，直接赋值兜底，避免测试环境整页报错
  function setVar(node, name, value) {
    if (!node || !node.style) return;
    if (typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
    else node.style[name] = value;
  }

  function burst(host, spec) {
    if (!host || !host.appendChild) return null;
    var s = spec || {};
    var doc = host.ownerDocument || document;
    injectStyle(doc);

    var layer = doc.createElement('div');
    layer.className = 'qw-dust-layer';
    layer.setAttribute('aria-hidden', 'true');

    var texts = s.texts || ['+1', '✦', '+1', '★', '+1', '✧'];
    var color = s.color || '#FFE16E';
    var i;

    for (i = 0; i < texts.length; i += 1) {
      var t = doc.createElement('span');
      t.textContent = texts[i];
      t.style.color = color;
      t.style.fontSize = (texts[i] === '+1' ? 17 : 15) + 'px';
      t.style.animationDelay = (i * 70) + 'ms';
      setVar(t, '--dx', ((i - (texts.length - 1) / 2) * 22).toFixed(0) + 'px');
      layer.appendChild(t);
    }
    for (i = 0; i < 8; i += 1) {
      var ang = (i / 8) * Math.PI * 2;
      var p = doc.createElement('span');
      p.className = 'qw-spark';
      p.textContent = i % 2 ? '✦' : '★';
      p.style.color = color;
      p.style.fontSize = '13px';
      p.style.animationDelay = (i * 40) + 'ms';
      setVar(p, '--dx', (Math.cos(ang) * 58).toFixed(0) + 'px');
      setVar(p, '--dy', (Math.sin(ang) * 46).toFixed(0) + 'px');
      layer.appendChild(p);
    }

    host.appendChild(layer);
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 1300);
    return layer;
  }

  /* -------------------------------------------------------------------------
     7 · 星球卡插画快捷入口（给 app.js 的 ORB_ART 用）
     ------------------------------------------------------------------------- */
  var ORB_ART = {
    kp1: planet({ id: 'kp1', mood: 'curious', label: '一次函数星球' }),
    kp2: planet({ id: 'kp2', mood: 'happy', label: '内角和星球' }),
    kp3: planet({ id: 'kp3', mood: 'proud', label: '勾股星球' })
  };

  var API = {
    injectStyle: injectStyle,
    planet: planet,
    constellation: constellation,
    sideDots: sideDots,
    cellGrid: cellGrid,
    pythagorasArt: pythagorasArt,
    emblem: emblem,
    galaxy: galaxy,
    starPath: starPath,
    mix: mix,
    shade: shade,
    tint: tint,
    burst: burst,
    celebrate: celebrate,
    ORB_ART: ORB_ART,
    KIT: PLANET_KIT,
    escape: esc,
    uid: uid
  };

  global.QWSpaceArt = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  // 页面脚本一加载就注入动画样式（burst 之外也会用到）
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { injectStyle(); });
    else injectStyle();
  }
})(typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this));