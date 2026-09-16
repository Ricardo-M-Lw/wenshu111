/**
 * 问数 Web 平台 - 黑板图形渲染器
 * 每个讲题步骤都会根据 LESSON.step.diagram 生成一张对应的图形讲解（SVG 矢量图）
 */
(function () {
  'use strict';

  const W = 640;
  const H = 420;

  const C = {
    grid: 'rgba(232, 238, 235, 0.13)',
    chalk: '#E8EEEB',
    dim: 'rgba(232, 238, 235, 0.58)',
    teal: '#43C7B8',
    tealDeep: '#1E8C88',
    orange: '#F5A623',
    red: '#FF6B6B',
    blue: '#7FB2FF',
    purple: '#A48CF0',
    green: '#6EE7A8',
    board: '#16283A'
  };

  const FONT = "'Noto Sans SC','Microsoft YaHei',sans-serif";

  function svg(inner, extraDefs) {
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="qw-board-svg" role="img" aria-label="黑板图形">'
      + '<defs>'
      + '<linearGradient id="qwBoardBg" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#1B3040"/><stop offset="100%" stop-color="#12202E"/>'
      + '</linearGradient>'
      + '<linearGradient id="qwTeal" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#54D8C8"/><stop offset="100%" stop-color="#1E8C88"/>'
      + '</linearGradient>'
      + '<linearGradient id="qwOrange" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#FFC46B"/><stop offset="100%" stop-color="#E8891C"/>'
      + '</linearGradient>'
      + '<filter id="qwGlow" x="-40%" y="-40%" width="180%" height="180%">'
      + '<feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter>'
      + (extraDefs || '')
      + '</defs>'
      + '<rect width="' + W + '" height="' + H + '" rx="20" fill="url(#qwBoardBg)"/>'
      + '<path d="M0 0 L' + W + ' 0 L' + W + ' 10 C 420 34 200 8 0 26 Z" fill="rgba(255,255,255,.03)"/>'
      + inner
      + '</svg>';
  }

  function caption(text) {
    if (!text) return '';
    return '<text x="' + (W / 2) + '" y="' + (H - 22) + '" text-anchor="middle" font-family="' + FONT
      + '" font-size="15" fill="' + C.dim + '">' + text + '</text>';
  }

  function title(text, sub) {
    return '<text x="36" y="48" font-family="' + FONT + '" font-size="21" font-weight="700" fill="' + C.chalk + '">' + text + '</text>'
      + (sub ? '<text x="36" y="74" font-family="' + FONT + '" font-size="13" fill="' + C.dim + '">' + sub + '</text>' : '');
  }

  function label(x, y, text, color, size, anchor) {
    return '<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-size="' + (size || 14) + '" font-weight="700" fill="'
      + (color || C.chalk) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + text + '</text>';
  }

  // 数形结合：在一条边上均匀画 n 个小圆点 —— 让 b=3 真的长出 3 个点，
  // 孩子可以「数」出边长，而不是只读一个数字。
  function sideDots(x1, y1, x2, y2, n, color, r) {
    const count = Math.max(1, Math.min(30, Math.round(Number(n) || 1)));
    const radius = r || 4.4;
    let out = '';
    for (let i = 1; i <= count; i += 1) {
      const ratio = i / (count + 1);
      const cx = (x1 + (x2 - x1) * ratio).toFixed(1);
      const cy = (y1 + (y2 - y1) * ratio).toFixed(1);
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="' + color
        + '" stroke="rgba(12,24,36,.55)" stroke-width="1.2"/>';
    }
    return out;
  }

  // 「星尘格子」：把面积画成能一格一格数出来的小方块。
  // 真正的画法在图案库 space-art.js 里（统一一套，避免两张图长得不一样）；
  // 万一图案库没加载上，这里返回空串，图里仍然保留虚线外框，不会画崩。
  function cellGrid(spec) {
    const art = typeof window !== 'undefined' ? window.QWSpaceArt : null;
    return art && typeof art.cellGrid === 'function' ? art.cellGrid(spec) : '';
  }

  // 带底色的小标签：文字压在方格或斜边上时保证读得清
  function chip(cx, cy, text, color, size) {
    const fs = size || 15;
    const w = Math.max(34, Math.round(String(text).length * fs * 0.72) + 18);
    const h = fs + 14;
    return '<g>'
      + '<rect x="' + (cx - w / 2).toFixed(1) + '" y="' + (cy - h / 2).toFixed(1) + '" width="' + w
      + '" height="' + h + '" rx="' + (h / 2).toFixed(1) + '" fill="rgba(12,24,36,.76)" stroke="' + color
      + '" stroke-width="1.4" stroke-opacity=".7"/>'
      + label(cx, cy + fs * 0.36, text, color, fs, 'middle')
      + '</g>';
  }

  function gridLines(x0, y0, x1, y1, step, color) {
    let out = '<g stroke="' + (color || C.grid) + '" stroke-width="1">';
    for (let x = x0; x <= x1; x += step) out += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + y1 + '"/>';
    for (let y = y0; y <= y1; y += step) out += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '"/>';
    return out + '</g>';
  }

  function arrowDef(id, color) {
    return '<marker id="' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
      + '<path d="M0 0 L10 5 L0 10 z" fill="' + color + '"/></marker>';
  }

  function ax(x, y, text, color) {
    return '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="' + color + '"/>'
      + '<text x="' + (x + 9) + '" y="' + (y + 5) + '" font-family="' + FONT + '" font-size="13" font-weight="700" fill="' + color + '">' + text + '</text>';
  }

  // 1. 函数“加工机器”示意图
  function mappingMachine(p) {
    const inner = title(p.title || '函数就像一台加工机器', '输入一个 x，机器按规则输出一个 y')
      + '<g>'
      + '<rect x="52" y="176" width="120" height="76" rx="16" fill="rgba(67,199,184,.14)" stroke="' + C.teal + '" stroke-width="2"/>'
      + label(112, 208, '输入 x', C.teal, 15, 'middle')
      + label(112, 234, '路程 / 自变量', C.dim, 12, 'middle')
      + '</g>'
      + '<line x1="180" y1="214" x2="238" y2="214" stroke="' + C.teal + '" stroke-width="2.5" marker-end="url(#arrowTeal)"/>'
      + '<g>'
      + '<rect x="246" y="132" width="168" height="164" rx="22" fill="rgba(245,166,35,.12)" stroke="' + C.orange + '" stroke-width="2.5"/>'
      + label(330, 172, '函数机器', C.orange, 17, 'middle')
      + label(330, 216, 'y = 2x + 8', C.chalk, 22, 'middle')
      + label(330, 248, '每公里 2 元', C.dim, 12, 'middle')
      + label(330, 270, '起步价 8 元', C.dim, 12, 'middle')
      + '</g>'
      + '<line x1="422" y1="214" x2="480" y2="214" stroke="' + C.orange + '" stroke-width="2.5" marker-end="url(#arrowOrange)"/>'
      + '<g>'
      + '<rect x="488" y="176" width="120" height="76" rx="16" fill="rgba(127,178,255,.14)" stroke="' + C.blue + '" stroke-width="2"/>'
      + label(548, 208, '输出 y', C.blue, 15, 'middle')
      + label(548, 234, '车费 / 因变量', C.dim, 12, 'middle')
      + '</g>'
      + '<g opacity=".92">'
      + label(112, 316, 'x = 3', C.dim, 13, 'middle')
      + label(330, 316, '2 × 3 + 8 = 14', C.chalk, 14, 'middle')
      + label(548, 316, 'y = 14', C.dim, 13, 'middle')
      + '</g>'
      + caption('对应关系：输入变，输出跟着变；起步价不变，斜率不变');
    return svg(inner, arrowDef('arrowTeal', C.teal) + arrowDef('arrowOrange', C.orange));
  }

  // 2. 坐标系与直线
  function coordinateLines(p) {
    const originX = 150;
    const originY = 300;
    const unit = 42;
    const lines = (p.lines || [{ k: 2, b: 1, color: C.teal, label: 'y = 2x + 1' }]);
    let inner = title(p.title || '一次函数图像', '两条直线对比：谁更陡？')
      + gridLines(originX - 3 * unit, originY - 4 * unit, originX + 8 * unit, originY + unit, unit);
    inner += '<line x1="' + (originX - 3.4 * unit) + '" y1="' + originY + '" x2="' + (originX + 8.4 * unit) + '" y2="' + originY + '" stroke="' + C.chalk + '" stroke-width="2"/>';
    inner += '<line x1="' + originX + '" y1="' + (originY + 1.4 * unit) + '" x2="' + originX + '" y2="' + (originY - 4.4 * unit) + '" stroke="' + C.chalk + '" stroke-width="2"/>';
    inner += label(originX - 16, originY + 18, 'O', C.dim, 13);
    inner += label(originX + 8.6 * unit, originY + 20, 'x', C.dim, 13);
    inner += label(originX - 18, originY - 4.5 * unit, 'y', C.dim, 13);

    lines.forEach(line => {
      const x1 = -3, x2 = 4;
      const px1 = originX + x1 * unit;
      const py1 = originY - (line.k * x1 + line.b) * unit;
      const px2 = originX + x2 * unit;
      const py2 = originY - (line.k * x2 + line.b) * unit;
      inner += '<line x1="' + px1 + '" y1="' + py1 + '" x2="' + px2 + '" y2="' + py2 + '" stroke="' + line.color
        + '" stroke-width="3.5" stroke-linecap="round" filter="url(#qwGlow)"/>';
      inner += label(px2 + 10, py2 + 6, line.label || '', line.color, 14);
      if (line.points) {
        inner += ax(originX, originY - line.b * unit, '(0, ' + line.b + ')', line.color);
        inner += ax(originX + unit, originY - (line.k + line.b) * unit, '(1, ' + (line.k + line.b) + ')', line.color);
      }
    });

    if (p.annotation) inner += label(W - 40, 380, p.annotation, C.orange, 14, 'end');
    return svg(inner + caption('k 越大直线越陡；b 不同则与 y 轴交点不同'));
  }

  // 3. 小结卡片
  function summaryCard(p) {
    const items = p.items || [];
    let inner = title(p.title || '本课学习地图', '把今天的关键结论装进脑子');
    items.forEach((text, index) => {
      const y = 110 + index * 66;
      inner += '<g>'
        + '<rect x="52" y="' + (y - 30) + '" width="' + (W - 104) + '" height="52" rx="14" fill="rgba(67,199,184,.10)" stroke="rgba(67,199,184,.35)"/>'
        + '<circle cx="84" cy="' + (y - 4) + '" r="15" fill="url(#qwTeal)"/>'
        + label(84, y + 1, String(index + 1), '#0E2233', 15, 'middle')
        + label(116, y + 2, text, C.chalk, 16)
        + '</g>';
    });
    return svg(inner + caption('把这几条写在错题本第一页，考试前扫一眼就够了'));
  }

  // 通用：顶点 v 处、两条边方向之间的角弧
  function angleArc(vx, vy, x1, y1, x2, y2, r, color, width) {
    const l1 = Math.hypot(x1 - vx, y1 - vy) || 1;
    const l2 = Math.hypot(x2 - vx, y2 - vy) || 1;
    const d1x = (x1 - vx) / l1, d1y = (y1 - vy) / l1;
    const d2x = (x2 - vx) / l2, d2y = (y2 - vy) / l2;
    const cross = d1x * d2y - d1y * d2x;
    return '<path d="M ' + (vx + d1x * r) + ' ' + (vy + d1y * r) + ' A ' + r + ' ' + r + ' 0 0 '
      + (cross > 0 ? 1 : 0) + ' ' + (vx + d2x * r) + ' ' + (vy + d2y * r) + '" fill="none" stroke="' + color
      + '" stroke-width="' + (width || 2.5) + '" stroke-linecap="round"/>';
  }

  // 通用：以 O 为顶点、从 a0 到 a1 的扇形（角度制，逆时针向上为正）
  function sector(ox, oy, r, a0, a1, fill, stroke) {
    const p0x = ox + r * Math.cos(a0 * Math.PI / 180);
    const p0y = oy - r * Math.sin(a0 * Math.PI / 180);
    const p1x = ox + r * Math.cos(a1 * Math.PI / 180);
    const p1y = oy - r * Math.sin(a1 * Math.PI / 180);
    const large = a1 - a0 > 180 ? 1 : 0;
    return '<path d="M ' + ox + ' ' + oy + ' L ' + p0x + ' ' + p0y + ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 '
      + p1x + ' ' + p1y + ' Z" fill="' + fill + '" stroke="' + (stroke || 'none') + '" stroke-width="1.5"/>';
  }

  function midPoint(ox, oy, r, a0, a1) {
    const mid = (a0 + a1) / 2;
    return { x: ox + r * Math.cos(mid * Math.PI / 180), y: oy - r * Math.sin(mid * Math.PI / 180) };
  }

  // 4. 三角形内角和
  function triangleAngleSum(p) {
    const a = p.angles || [60, 70, 50];
    const A = { x: 320, y: 104 }, B = { x: 176, y: 322 }, Cv = { x: 470, y: 322 };
    let inner = title(p.title || '三角形内角和', '三个内角加起来是多少？');
    inner += '<polygon points="' + A.x + ',' + A.y + ' ' + B.x + ',' + B.y + ' ' + Cv.x + ',' + Cv.y
      + '" fill="rgba(127,178,255,.08)" stroke="' + C.chalk + '" stroke-width="3" stroke-linejoin="round"/>';
    inner += angleArc(A.x, A.y, B.x, B.y, Cv.x, Cv.y, 42, C.teal);
    inner += angleArc(B.x, B.y, A.x, A.y, Cv.x, Cv.y, 42, C.orange);
    inner += angleArc(Cv.x, Cv.y, A.x, A.y, B.x, B.y, 42, C.purple);
    inner += label(300, 168, '∠A = ' + a[0] + '°', C.teal, 15, 'end');
    inner += label(206, 296, '∠B = ' + a[1] + '°', C.orange, 15);
    inner += label(400, 296, '∠C = ' + (p.showSum ? a[2] + '°' : '?'), C.purple, 15);
    inner += label(A.x, A.y - 16, 'A', C.chalk, 15, 'middle');
    inner += label(B.x - 22, B.y + 12, 'B', C.chalk, 15);
    inner += label(Cv.x + 10, Cv.y + 12, 'C', C.chalk, 15);
    if (p.showSum) {
      inner += '<g><rect x="400" y="352" width="204" height="42" rx="12" fill="rgba(67,199,184,.16)" stroke="rgba(67,199,184,.45)"/>'
        + label(502, 379, a[0] + '° + ' + a[1] + '° + ' + a[2] + '° = 180°', C.teal, 15, 'middle') + '</g>';
    } else {
      inner += '<g><rect x="404" y="352" width="200" height="42" rx="12" fill="rgba(245,166,35,.14)" stroke="rgba(245,166,35,.45)"/>'
        + label(504, 379, '量一量，三个角加起来是多少？', C.orange, 14, 'middle') + '</g>';
    }
    return svg(inner);
  }

  // 5. 撕角拼平角
  function triangleTear(p) {
    const a = [60, 70, 50];
    const A = { x: 150, y: 78 }, B = { x: 62, y: 232 }, Cv = { x: 258, y: 232 };
    let inner = title(p.title || '把三个角撕下来拼在一起', '三个角刚好铺满一个平角');
    inner += '<polygon points="' + A.x + ',' + A.y + ' ' + B.x + ',' + B.y + ' ' + Cv.x + ',' + Cv.y
      + '" fill="rgba(127,178,255,.08)" stroke="' + C.chalk + '" stroke-width="2.5" stroke-linejoin="round"/>';
    inner += angleArc(A.x, A.y, B.x, B.y, Cv.x, Cv.y, 26, C.teal, 2);
    inner += angleArc(B.x, B.y, A.x, A.y, Cv.x, Cv.y, 26, C.orange, 2);
    inner += angleArc(Cv.x, Cv.y, A.x, A.y, B.x, B.y, 26, C.purple, 2);
    inner += label(150, 62, '∠A', C.teal, 12, 'middle');
    inner += label(48, 218, '∠B', C.orange, 12, 'end');
    inner += label(272, 218, '∠C', C.purple, 12);

    const ox = 430, oy = 300, r = 150;
    inner += '<line x1="' + (ox - r - 16) + '" y1="' + oy + '" x2="' + (ox + r + 16) + '" y2="' + oy
      + '" stroke="' + C.chalk + '" stroke-width="2" stroke-dasharray="6 5"/>';
    inner += sector(ox, oy, r, 0, a[0], 'rgba(67,199,184,.35)', C.teal);
    inner += sector(ox, oy, r, a[0], a[0] + a[1], 'rgba(245,166,35,.32)', C.orange);
    inner += sector(ox, oy, r, a[0] + a[1], 180, 'rgba(164,140,240,.32)', C.purple);
    const m1 = midPoint(ox, oy, r * 0.62, 0, a[0]);
    const m2 = midPoint(ox, oy, r * 0.62, a[0], a[0] + a[1]);
    const m3 = midPoint(ox, oy, r * 0.62, a[0] + a[1], 180);
    inner += label(m1.x, m1.y, '∠A', C.teal, 14, 'middle');
    inner += label(m2.x, m2.y, '∠B', C.orange, 14, 'middle');
    inner += label(m3.x, m3.y, '∠C', C.purple, 14, 'middle');
    inner += label(ox, oy + 30, '拼成的是一条直线 → 平角 180°', C.chalk, 14, 'middle');
    return svg(inner);
  }

  // 6. 内角和定理证明
  function triangleProof(p) {
    const A = { x: 320, y: 110 }, B = { x: 196, y: 312 }, Cv = { x: 452, y: 312 };
    let inner = title(p.title || '过顶点 A 作 BC 的平行线', '把 ∠B、∠C “搬”到顶点 A 旁边');
    inner += '<line x1="216" y1="' + A.y + '" x2="430" y2="' + A.y + '" stroke="' + C.orange + '" stroke-width="2.5" stroke-dasharray="9 6"/>';
    inner += label(206, A.y + 5, 'D', C.orange, 14, 'end');
    inner += label(440, A.y + 5, 'E', C.orange, 14);
    inner += '<polygon points="' + A.x + ',' + A.y + ' ' + B.x + ',' + B.y + ' ' + Cv.x + ',' + Cv.y
      + '" fill="rgba(127,178,255,.08)" stroke="' + C.chalk + '" stroke-width="3" stroke-linejoin="round"/>';
    inner += angleArc(A.x, A.y, 216, A.y, B.x, B.y, 40, C.teal);
    inner += angleArc(A.x, A.y, B.x, B.y, Cv.x, Cv.y, 56, C.blue);
    inner += angleArc(A.x, A.y, Cv.x, Cv.y, 430, A.y, 40, C.purple);
    inner += angleArc(B.x, B.y, A.x, A.y, Cv.x, Cv.y, 36, C.teal);
    inner += angleArc(Cv.x, Cv.y, A.x, A.y, B.x, B.y, 36, C.purple);
    inner += label(280, A.y - 12, '∠1 = ∠B', C.teal, 14, 'end');
    inner += label(360, A.y - 12, '∠2 = ∠C', C.purple, 14);
    inner += label(A.x, A.y - 34, 'A', C.chalk, 15, 'middle');
    inner += label(B.x - 22, B.y + 12, 'B', C.chalk, 15);
    inner += label(Cv.x + 12, Cv.y + 12, 'C', C.chalk, 15);
    inner += '<g><rect x="52" y="356" width="536" height="40" rx="12" fill="rgba(67,199,184,.12)" stroke="rgba(67,199,184,.35)"/>'
      + label(320, 382, '∠1 + ∠2 + ∠A = 180°  ⇒  ∠B + ∠C + ∠A = 180°', C.teal, 15, 'middle') + '</g>';
    return svg(inner);
  }

  // 7. 多边形内角和
  function polygonSum(p) {
    const center = { x: 250, y: 214 }, r = 118;
    const points = [];
    for (let i = 0; i < 5; i++) {
      const angle = -90 + i * 72;
      points.push({ x: center.x + r * Math.cos(angle * Math.PI / 180), y: center.y + r * Math.sin(angle * Math.PI / 180) });
    }
    let inner = title(p.title || '四边形能分成几个三角形？', '从一个顶点出发连对角线');
    inner += '<polygon points="' + points.map(pt => pt.x + ',' + pt.y).join(' ') + '" fill="rgba(127,178,255,.07)" stroke="' + C.chalk
      + '" stroke-width="3" stroke-linejoin="round"/>';
    const colors = [C.teal, C.orange, C.purple];
    for (let i = 1; i <= 3; i++) {
      const pt = points[(i + 1) % 5];
      inner += '<line x1="' + points[0].x + '" y1="' + points[0].y + '" x2="' + pt.x + '" y2="' + pt.y
        + '" stroke="' + colors[i - 1] + '" stroke-width="2" stroke-dasharray="7 5"/>';
    }
    for (let i = 0; i < 3; i++) {
      const p1 = points[(i + 1) % 5], p2 = points[(i + 2) % 5];
      inner += label((points[0].x + p1.x + p2.x) / 3, (points[0].y + p1.y + p2.y) / 3 + 6, String(i + 1), colors[i], 20, 'middle');
    }
    inner += label(points[0].x, points[0].y - 16, 'A', C.chalk, 14, 'middle');
    inner += '<g>'
      + '<rect x="420" y="120" width="184" height="180" rx="18" fill="rgba(67,199,184,.10)" stroke="rgba(67,199,184,.32)"/>'
      + label(512, 156, '四边形', C.chalk, 16, 'middle') + label(512, 190, '2 × 180° = 360°', C.teal, 15, 'middle')
      + label(512, 232, '五边形', C.chalk, 16, 'middle') + label(512, 266, '3 × 180° = 540°', C.teal, 15, 'middle')
      + '</g>'
      + label(320, 388, 'n 边形内角和 = (n − 2) × 180°', C.orange, 17, 'middle');
    return svg(inner);
  }

  // 8. 网格上的 3-4-5
  function pythagorasGrid(p) {
    const unit = 44, x0 = 150, y0 = 330;
    let inner = title(p.title || '3-4-5 直角三角形的网格验证', '数格子：两条直角边围成的面积关系');
    inner += gridLines(x0, y0 - 4 * unit, x0 + 7 * unit, y0, unit);
    inner += '<line x1="' + (x0 - 20) + '" y1="' + y0 + '" x2="' + (x0 + 7 * unit + 20) + '" y2="' + y0 + '" stroke="' + C.chalk + '" stroke-width="2"/>';
    inner += '<line x1="' + x0 + '" y1="' + (y0 + 12) + '" x2="' + x0 + '" y2="' + (y0 - 4 * unit - 20) + '" stroke="' + C.chalk + '" stroke-width="2"/>';
    const A = { x: x0, y: y0 }, B = { x: x0, y: y0 - 3 * unit }, Cv = { x: x0 + 4 * unit, y: y0 };
    inner += '<polygon points="' + A.x + ',' + A.y + ' ' + B.x + ',' + B.y + ' ' + Cv.x + ',' + Cv.y
      + '" fill="rgba(67,199,184,.16)" stroke="' + C.teal + '" stroke-width="3.5" stroke-linejoin="round"/>';
    inner += '<path d="M ' + (A.x + 16) + ' ' + A.y + ' L ' + (A.x + 16) + ' ' + (A.y - 16) + ' L ' + A.x + ' ' + (A.y - 16)
      + '" fill="none" stroke="' + C.chalk + '" stroke-width="2.5"/>';
    inner += sideDots(A.x, A.y, B.x, B.y, 3, C.orange);
    inner += sideDots(A.x, A.y, Cv.x, Cv.y, 4, C.blue);
    inner += label(x0 - 14, y0 - 1.5 * unit, 'b = 3', C.blue, 15, 'end');
    inner += label(x0 + 2 * unit, y0 + 26, 'a = 4', C.orange, 15, 'middle');
    inner += label(x0 + 2.6 * unit, y0 - 1.8 * unit, 'c = 5', C.teal, 16);
    inner += '<g><rect x="420" y="300" width="184" height="86" rx="16" fill="rgba(245,166,35,.12)" stroke="rgba(245,166,35,.4)"/>'
      + label(512, 334, '3² + 4² = 9 + 16 = 25', C.chalk, 15, 'middle')
      + label(512, 362, '5² = 25', C.orange, 16, 'middle') + '</g>';
    return svg(inner);
  }

  // 9. 三边上的正方形
  function rightTriangleSquares(p) {
    const s = 24, Cpt = { x: 200, y: 270 };
    const A = { x: Cpt.x + 4 * s, y: Cpt.y };
    const B = { x: Cpt.x, y: Cpt.y - 3 * s };
    let inner = title(p.title || '以三边为边长的三个正方形', '两个小正方形面积之和 = 大正方形面积');
    // 直角边 4（水平）上的正方形：4 × 4 = 16 块小方格，可以一格一格数出来
    inner += cellGrid({ x: Cpt.x, y: Cpt.y, side: 4 * s, n: 4, color: C.blue });
    inner += '<rect x="' + Cpt.x + '" y="' + Cpt.y + '" width="' + (4 * s) + '" height="' + (4 * s)
      + '" fill="none" stroke="' + C.blue + '" stroke-width="2" stroke-dasharray="7 5"/>';
    inner += chip(Cpt.x + 4 * s + 46, Cpt.y + 2 * s, 'a² = 16', C.blue, 15);
    // 直角边 3（竖直）上的正方形：3 × 3 = 9 块
    inner += cellGrid({ x: Cpt.x - 3 * s, y: Cpt.y - 3 * s, side: 3 * s, n: 3, color: C.orange });
    inner += '<rect x="' + (Cpt.x - 3 * s) + '" y="' + (Cpt.y - 3 * s) + '" width="' + (3 * s) + '" height="' + (3 * s)
      + '" fill="none" stroke="' + C.orange + '" stroke-width="2" stroke-dasharray="7 5"/>';
    inner += chip(Cpt.x - 1.5 * s, Cpt.y - 3 * s - 17, 'b² = 9', C.orange, 15);
    // 斜边上的正方形
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    // 斜边上的正方形要画在三角形的「外侧」（否则会盖住两条直角边上的正方形）
    const px = -uy, py = ux;
    const p1 = A, p2 = B;
    const p3 = { x: B.x + px * len, y: B.y + py * len };
    const p4 = { x: A.x + px * len, y: A.y + py * len };
    const mid = { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };
    const tilt = Math.atan2(dy, dx) * 180 / Math.PI + 180;
    inner += cellGrid({ x: mid.x - len / 2, y: mid.y - len / 2, side: len, n: 5, color: C.teal, tilt: tilt });
    inner += '<polygon points="' + [p1, p2, p3, p4].map(pt => pt.x + ',' + pt.y).join(' ')
      + '" fill="none" stroke="' + C.teal + '" stroke-width="2.5"/>';
    inner += chip(mid.x, mid.y, 'c² = 25 格', C.teal, 15);
    // 三角形本体
    inner += '<polygon points="' + Cpt.x + ',' + Cpt.y + ' ' + A.x + ',' + A.y + ' ' + B.x + ',' + B.y
      + '" fill="rgba(255,255,255,.10)" stroke="' + C.chalk + '" stroke-width="3" stroke-linejoin="round"/>';
    inner += '<path d="M ' + (Cpt.x + 18) + ' ' + Cpt.y + ' L ' + (Cpt.x + 18) + ' ' + (Cpt.y - 18) + ' L ' + Cpt.x + ' ' + (Cpt.y - 18)
      + '" fill="none" stroke="' + C.chalk + '" stroke-width="2.5"/>';
    inner += sideDots(Cpt.x, Cpt.y, A.x, A.y, 4, C.blue);
    inner += sideDots(Cpt.x, Cpt.y, B.x, B.y, 3, C.orange);
    inner += label(Cpt.x + 2 * s, Cpt.y + 4 * s + 30, 'a = 4', C.chalk, 14, 'middle');
    inner += label(Cpt.x - 3 * s - 14, Cpt.y - 1.5 * s, 'b = 3', C.chalk, 14, 'end');
    inner += chip((A.x + B.x) / 2 + (A.x - B.x) * 0.55, (A.y + B.y) / 2 + (A.y - B.y) * 0.55, 'c = 5', C.chalk, 14);
    if (p.formula) {
      inner += '<g><rect x="404" y="292" width="200" height="104" rx="16" fill="rgba(67,199,184,.14)" stroke="rgba(67,199,184,.45)"/>'
        + label(504, 322, 'a² + b² = c²', C.teal, 19, 'middle')
        + label(504, 350, '9 颗 + 16 颗 = 25 颗星尘', C.chalk, 13, 'middle')
        + label(504, 376, '直角边平方和 = 斜边平方', C.dim, 12, 'middle') + '</g>';
    }
    return svg(inner);
  }

  // 10. 面积法证明
  function areaProof(p) {
    const s = 40, ox = 170, oy = 56;
    const P = (u, v) => ({ x: ox + u * s, y: oy + v * s });
    const A = P(0, 0), B = P(7, 0), Cc = P(7, 7), D = P(0, 7);
    const E = P(4, 0), F = P(7, 4), G = P(3, 7), H = P(0, 3);
    let inner = title(p.title || '大正方形 = 4 个直角三角形 + 中间小正方形', '边长为 (a + b) = 7');
    inner += '<polygon points="' + [A, B, Cc, D].map(pt => pt.x + ',' + pt.y).join(' ') + '" fill="none" stroke="' + C.chalk + '" stroke-width="3"/>';
    const tris = [[A, E, H, C.orange], [E, B, F, C.blue], [F, Cc, G, C.purple], [G, D, H, C.red]];
    tris.forEach(t => {
      inner += '<polygon points="' + t.slice(0, 3).map(pt => pt.x + ',' + pt.y).join(' ') + '" fill="' + t[3]
        + '" fill-opacity=".34" stroke="' + t[3] + '" stroke-width="3" stroke-linejoin="round"/>';
    });
    const cMid = { x: (E.x + F.x + G.x + H.x) / 4, y: (E.y + F.y + G.y + H.y) / 4 };
    const cSide = Math.hypot(F.x - E.x, F.y - E.y);
    const cTilt = Math.atan2(F.y - E.y, F.x - E.x) * 180 / Math.PI;
    inner += cellGrid({ x: cMid.x - cSide / 2, y: cMid.y - cSide / 2, side: cSide, n: 5, color: C.teal, tilt: cTilt, opacity: 0.52 });
    inner += '<polygon points="' + [E, F, G, H].map(pt => pt.x + ',' + pt.y).join(' ') + '" fill="none" stroke="' + C.teal + '" stroke-width="3"/>';
    inner += chip(cMid.x, cMid.y, 'c² = 25 格', C.teal, 16);
    inner += label((A.x + E.x) / 2, A.y - 10, 'a = 4', C.orange, 13, 'middle');
    inner += label(A.x - 12, (A.y + H.y) / 2, 'b = 3', C.orange, 13, 'end');
    inner += '<g><rect x="420" y="86" width="184" height="150" rx="16" fill="rgba(67,199,184,.10)" stroke="rgba(67,199,184,.35)"/>'
      + label(512, 124, '大正方形', C.chalk, 15, 'middle')
      + label(512, 154, '(a + b)² = a² + 2ab + b²', C.dim, 12, 'middle')
      + label(512, 190, '= 4 × ½ab + c²', C.chalk, 15, 'middle')
      + label(512, 218, '⇒ a² + b² = c²', C.teal, 15, 'middle') + '</g>';
    return svg(inner);
  }

  // 11. 勾股定理逆定理
  function converseCheck(p) {
    const triples = p.triples || [[3, 4, 5], [5, 12, 13], [6, 8, 10]];
    let inner = title(p.title || '逆定理：三边满足平方关系 ⇒ 直角三角形', '两条短边平方和与最长边平方比较');
    triples.forEach((t, index) => {
      const y = 116 + index * 74;
      const ok = t[0] * t[0] + t[1] * t[1] === t[2] * t[2];
      inner += '<g>'
        + '<rect x="52" y="' + (y - 30) + '" width="536" height="58" rx="16" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)"/>'
        + label(84, y + 6, t[0] + ', ' + t[1] + ', ' + t[2], C.chalk, 18)
        + label(300, y + 6, t[0] + '² + ' + t[1] + '² = ' + (t[0] * t[0] + t[1] * t[1]), C.blue, 15)
        + label(452, y + 6, '= ' + t[2] + '²', C.teal, 15)
        + '<circle cx="556" cy="' + (y - 1) + '" r="15" fill="rgba(110,231,168,.18)"/>'
        + label(556, y + 5, ok ? '直' : '×', C.green, 15, 'middle')
        + '</g>';
    });
    inner += label(320, 388, '注意：一定要先找最长边，再去比较平方关系', C.orange, 15, 'middle');
    return svg(inner);
  }

  const BOARDS = {
    mappingMachine: mappingMachine,
    coordinateLines: coordinateLines,
    summaryCard: summaryCard,
    triangleAngleSum: triangleAngleSum,
    triangleTear: triangleTear,
    triangleProof: triangleProof,
    polygonSum: polygonSum,
    pythagorasGrid: pythagorasGrid,
    rightTriangleSquares: rightTriangleSquares,
    areaProof: areaProof,
    converseCheck: converseCheck
  };

  function renderBoard(diagram) {
    const spec = diagram || {};
    const builder = BOARDS[spec.type] || summaryCard;
    try {
      return builder(spec);
    } catch (err) {
      console.warn('黑板图形渲染失败：', err);
      return summaryCard({ title: '图形生成中', items: ['请返回上一步后再试一次'] });
    }
  }

  window.QWBoard = { render: renderBoard, types: Object.keys(BOARDS) };
})();
