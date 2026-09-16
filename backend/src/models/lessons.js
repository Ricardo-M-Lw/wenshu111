// 问数平台 - 讲题脚本（每个知识点拆成 5 个讲题步骤）
// 每一步都包含：讲解对话、黑板图形（diagram）、互动检查点、步骤小结
// 原则：不泄答案——答错只给针对性引导和提示，不直接公布答案

const lessons = {
  kp1: {
    id: 'kp1',
    title: '一次函数 y = kx + b',
    grade: '八年级 · 第 12 章',
    minutes: 15,
    goal: '能看懂 y = kx + b 的样子，说清 k 和 b 各自管什么，并能画出一条直线',
    steps: [
      {
        id: 'kp1-s1',
        name: '情境导入',
        tag: '生活中的函数',
        minutes: 2,
        diagram: { type: 'mappingMachine', title: '函数就像一台“加工机器”', input: 'x', output: 'y = kx + b' },
        bubbles: [
          { role: 'ai', text: '同学你好！今天是「一次函数」的第 1 步 👋' },
          { role: 'ai', text: '先想一件生活里的事：坐出租车，起步价 8 元，每公里再加 2 元。', highlight: '路程走得越远，车费就越高。' },
          { role: 'ai', text: '如果路程记作 x 公里，车费记作 y 元，你能把 y 用 x 写出来吗？' }
        ],
        checkpoint: {
          question: '起步价 8 元、每公里 2 元的车费 y 与路程 x 的关系是？',
          options: ['y = 8x + 2', 'y = 2x + 8', 'y = 10x', 'y = 2x − 8'],
          correct: 1,
          hints: ['起步价是不管走多远都要付的钱，也就是 x = 0 时的车费。', '每公里的 2 元跟着 x 一起变化，它会“乘”在 x 上。'],
          correctText: '对！起步价 8 元固定不变，2 元跟着路程走，所以 y = 2x + 8。',
          wrongText: {
            0: '再看一眼：8 元是起步价，不管路程是 0 还是 100 公里都要付，它不会去乘 x 哦。',
            2: '10x 这个式子里，起步价也跟着路程涨了，可现实里起步价是固定的。',
            _: '别急，把「固定的钱」和「跟着路程变的钱」分开看，再写一次。'
          }
        },
        summary: '像 y = 2x + 8 这样，形如 y = kx + b（k ≠ 0）的式子，就叫一次函数。'
      },
      {
        id: 'kp1-s2',
        name: '概念精讲',
        tag: 'k 和 b 分别管什么',
        minutes: 3,
        diagram: { type: 'coordinateLines', title: '两条直线，谁更陡？', lines: [{ k: 2, b: 1, color: '#43C7B8', label: 'y = 2x + 1' }, { k: 1, b: 1, color: '#F5A623', label: 'y = x + 1' }] },
        bubbles: [
          { role: 'ai', text: '我们把它写成一般形式：y = kx + b。它有两个“关键零件”。' },
          { role: 'ai', text: 'b 是直线与 y 轴交点的纵坐标，也就是 x = 0 时 y 的值。', highlight: 'b 决定了直线从 y 轴的哪里出发。' },
          { role: 'ai', text: 'k 叫斜率，它决定直线的倾斜程度。', highlight: 'k 越大，直线上升得越快（越陡）。' }
        ],
        checkpoint: {
          question: '直线 y = 3x − 2 与 y 轴的交点在哪里？',
          options: ['(0, 3)', '(0, −2)', '(3, 0)', '(−2, 0)'],
          correct: 1,
          hints: ['与 y 轴相交时，x 等于多少？', '把 x = 0 代进去，算一算 y 是多少。'],
          correctText: '正确！x = 0 时 y = −2，所以交点是 (0, −2)，这个 −2 就是 b。',
          wrongText: {
            0: '注意：3 是 k，不是与 y 轴的交点。交点在 y 轴上，横坐标必须是 0。',
            2: '点 (3, 0) 在 x 轴上，那是与 x 轴的交点，题目问的是 y 轴。',
            _: '只要记住“与 y 轴相交 → x = 0”，代入算 y 就好。'
          }
        },
        summary: 'b 管“从哪里出发”（与 y 轴交点），k 管“走得多陡”（倾斜程度）。'
      },
      {
        id: 'kp1-s3',
        name: '例题演示',
        tag: '两点定一线',
        minutes: 3,
        diagram: { type: 'coordinateLines', title: '画出 y = 2x + 1', lines: [{ k: 2, b: 1, color: '#43C7B8', label: 'y = 2x + 1', points: true }] },
        bubbles: [
          { role: 'ai', text: '画直线其实只要两个点，我们就用最简单的两个点。' },
          { role: 'ai', text: '令 x = 0，得 y = 1，于是有第一个点 (0, 1)。', highlight: '这是直线与 y 轴的交点。' },
          { role: 'ai', text: '再令 x = 1，得 y = 3，得到第二个点 (1, 3)。两点一连，直线就出来了。' }
        ],
        checkpoint: {
          question: '要画 y = −x + 2 的图像，下面哪一组点最好用？',
          options: ['(0, 2) 和 (1, 1)', '(1, 2) 和 (2, 3)', '(0, 0) 和 (1, −1)', '(2, 0) 和 (2, 4)'],
          correct: 0,
          hints: ['x = 0 时算出的那个点最简单。', '再取一个 x 为小整数的点，代入算一算。'],
          correctText: '没错，(0, 2) 是 y 轴交点，(1, 1) 是另一个好算的点，两点定一线。',
          wrongText: {
            1: '把 x = 1 代进 y = −x + 2，得到的不是 2，再算一遍试试。',
            2: '(0, 0) 只有 b = 0 时才成立，这里的 b 是 2。',
            _: '选点诀窍：先让 x = 0，再取 x 为 1 或 −1，算起来最快。'
          }
        },
        summary: '画一次函数图像：找两个点 → 描点 → 连线，通常取 x = 0 和 x = 1。'
      },
      {
        id: 'kp1-s4',
        name: '变式引导',
        tag: 'k 的正负与走向',
        minutes: 3,
        diagram: { type: 'coordinateLines', title: 'k 变号，直线往哪走？', lines: [{ k: 2, b: 0, color: '#43C7B8', label: 'y = 2x（上升）' }, { k: -2, b: 0, color: '#FF6B6B', label: 'y = −2x（下降）' }] },
        bubbles: [
          { role: 'ai', text: '把 k 换成负数，直线会发生什么变化？看看黑板上的两条线。' },
          { role: 'ai', text: 'k > 0 时，x 变大 y 也变大，直线从左下往右上，是上升的。' },
          { role: 'ai', text: 'k < 0 时，x 变大 y 反而变小，直线从左上往右下，是下降的。', highlight: 'k 的正负决定“上坡”还是“下坡”。' }
        ],
        checkpoint: {
          question: '直线 y = −4x + 1 的图像大致是？',
          options: ['从左下往右上，很陡', '从左上往右下，很陡', '从左上往右下，很平', '平行于 x 轴'],
          correct: 1,
          hints: ['先看 k 是正还是负，判断方向上坡还是下坡。', '再看 |k| 的大小，4 比 1 大，说明它比较陡。'],
          correctText: '很好！k = −4 < 0 所以下坡，|k| = 4 比较大所以很陡。',
          wrongText: {
            0: 'k 是 −4，符号是负的，它应该是下坡而不是上坡哦。',
            2: '|k| = 4 说明每向右 1 格，y 要变化 4 格，这个变化量并不小。',
            _: '判断两步走：先看 k 的正负定方向，再看 |k| 的大小定陡缓。'
          }
        },
        summary: 'k > 0 上升，k < 0 下降；|k| 越大越陡，越小越平。'
      },
      {
        id: 'kp1-s5',
        name: '课堂小结',
        tag: '易错点自查',
        minutes: 3,
        diagram: { type: 'summaryCard', title: '一次函数学习地图', items: ['形式：y = kx + b（k ≠ 0）', 'k：斜率，管倾斜程度', 'b：与 y 轴交点纵坐标', '画图：取两点连线'] },
        bubbles: [
          { role: 'ai', text: '最后我们把今天的内容串起来，这一步最容易丢分的两个地方要看清楚。' },
          { role: 'ai', text: '第一个坑：把 y = kx + b 中的 b 当成斜率，看到 y = 3x − 2 就说斜率是 −2。' },
          { role: 'ai', text: '第二个坑：忘记“与 x 轴交点”要令 y = 0，“与 y 轴交点”要令 x = 0。', highlight: '先让哪个等于 0，是最容易记混的地方。' }
        ],
        checkpoint: {
          question: '关于直线 y = 5x + 4，下面说法正确的是？',
          options: ['斜率为 5，与 y 轴交于 (0, 4)', '斜率为 4，与 y 轴交于 (0, 5)', '与 x 轴交于 (4, 0)', '斜率为 5，与 y 轴交于 (4, 0)'],
          correct: 0,
          hints: ['斜率是 x 前面的那个系数。', '与 y 轴的交点横坐标一定是 0。'],
          correctText: '完全正确！k = 5 是斜率，x = 0 时 y = 4，交点是 (0, 4)。',
          wrongText: {
            1: '把 k 和 b 弄反了：x 前面的 5 才是斜率，4 是 b。',
            2: '(4, 0) 是令 y = 0 求出来的 x 轴交点，而且那个坐标也不是 4。',
            _: '再复习一遍：k 看 x 前面的数，b 看 x = 0 时的 y。'
          }
        },
        summary: '本课要点：形式、k 与 b 的含义、画图方法、两个易错点。接下来做 5 道标准题巩固一下。'
      }
    ]
  },

  kp2: {
    id: 'kp2',
    title: '三角形内角和',
    grade: '八年级 · 第 11 章',
    minutes: 14,
    goal: '经历“测量—猜想—证明”的过程，理解并会应用三角形内角和为 180°',
    steps: [
      {
        id: 'kp2-s1',
        name: '情境导入',
        tag: '三角尺里的秘密',
        minutes: 2,
        diagram: { type: 'triangleAngleSum', title: '两块三角尺的三个角', angles: [90, 45, 45] },
        bubbles: [
          { role: 'ai', text: '欢迎来到「三角形内角和」课堂 🔍' },
          { role: 'ai', text: '你书包里的两块三角尺，三个角加起来分别是多少度？' },
          { role: 'ai', text: '一块是 90° + 45° + 45°，另一块是 90° + 60° + 30°。', highlight: '算一算，两个结果好像都一样。' }
        ],
        checkpoint: {
          question: '30° + 60° + 90° 等于多少度？',
          options: ['120°', '150°', '180°', '210°'],
          correct: 2,
          hints: ['先算 30 + 60 = 90。', '再把算出的结果和 90 相加。'],
          correctText: '正是 180°！两块三角尺的内角和都等于 180°，这是巧合吗？',
          wrongText: {
            0: '30 + 60 = 90，别漏掉直角 90° 哦。',
            1: '再检查一下加法：90 + 90 应该是 180。',
            _: '把三个角按顺序加起来：30 + 60 + 90。'
          }
        },
        summary: '两块三角尺的内角和都是 180°，那任意三角形呢？'
      },
      {
        id: 'kp2-s2',
        name: '动手测量',
        tag: '量一量、算一算',
        minutes: 3,
        diagram: { type: 'triangleAngleSum', title: '量出三个角再求和', angles: [60, 70, 50], showSum: true },
        bubbles: [
          { role: 'ai', text: '我们换一个“歪一点”的三角形试试：∠A = 60°，∠B = 70°。' },
          { role: 'ai', text: '用量角器量出第三个角，再加起来，看看结果是多少。' },
          { role: 'ai', text: '很多同学量出来是 50° 左右，加起来正好 180°，', highlight: '但测量可能有 1°–2° 的误差，所以还需要证明。' }
        ],
        checkpoint: {
          question: '如果 ∠A = 60°、∠B = 70°，那么 ∠C 是多少度？',
          options: ['30°', '40°', '50°', '60°'],
          correct: 2,
          hints: ['三个角的和是 180°。', '用 180° 依次减去已知的两个角。'],
          correctText: '对！180° − 60° − 70° = 50°，和测量结果一致。',
          wrongText: {
            0: '180 − 60 − 70，中间那一步再仔细算一次。',
            1: '建议分两步算：180 − 60 = 120，再用 120 减去 70。',
            _: '记住套路：未知角 = 180° − 另外两个角之和。'
          }
        },
        summary: '测量能帮我们发现规律，但要说明它对所有三角形都成立，还得靠证明。'
      },
      {
        id: 'kp2-s3',
        name: '猜想规律',
        tag: '撕角拼平角',
        minutes: 3,
        diagram: { type: 'triangleTear', title: '把三个角撕下来拼在一起' },
        bubbles: [
          { role: 'ai', text: '把三角形的三个角撕下来，顶点对齐拼在一起，你看到了什么？' },
          { role: 'ai', text: '三个角刚好拼成一条直线，也就是一个平角。' },
          { role: 'ai', text: '平角是 180°，于是我们得到猜想：', highlight: '任意三角形的内角和都等于 180°。' }
        ],
        checkpoint: {
          question: '三个内角拼成的平角是多少度？',
          options: ['90°', '180°', '270°', '360°'],
          correct: 1,
          hints: ['一条直线的角度叫做平角。', '平角的一半是直角 90°。'],
          correctText: '没错，平角是 180°，所以三个内角的和就是 180°。',
          wrongText: {
            0: '90° 是直角，是一条直线的一半，拼成的是一条完整的直线。',
            2: '270° 已经超过一条直线了，撕下来的三个角拼不出那么大的角。',
            _: '想一想：一条直线对应多少度？'
          }
        },
        summary: '撕角拼平角是个好实验，但它仍然需要严格的证明。'
      },
      {
        id: 'kp2-s4',
        name: '证明定理',
        tag: '作平行线',
        minutes: 3,
        diagram: { type: 'triangleProof', title: '过顶点 A 作 BC 的平行线' },
        bubbles: [
          { role: 'ai', text: '证明的关键是添一条辅助线：过顶点 A 作直线 DE ∥ BC。' },
          { role: 'ai', text: '因为 DE ∥ BC，所以 ∠DAB = ∠B，∠EAC = ∠C，两直线平行内错角相等。' },
          { role: 'ai', text: '而 ∠DAB + ∠A + ∠EAC 正好是一个平角 180°，', highlight: '把 ∠DAB 换成 ∠B、∠EAC 换成 ∠C，就得到 ∠A + ∠B + ∠C = 180°。' }
        ],
        checkpoint: {
          question: '证明中作 DE ∥ BC，用到的依据是？',
          options: ['两直线平行，内错角相等', '对顶角相等', '三角形全等', '勾股定理'],
          correct: 0,
          hints: ['DE 和 BC 是什么关系？', '平行线被第三条直线所截，会出现内错角。'],
          correctText: '对！平行线 + 截线 → 内错角相等，这就是把角“搬过来”的依据。',
          wrongText: {
            1: '对顶角需要两条直线相交形成，这里的关键是平行关系。',
            2: '这道题里没有两个三角形，用不上全等。',
            _: '抓住 DE ∥ BC 这个条件，想想平行线能提供什么相等的角。'
          }
        },
        summary: '证明思路：作平行线 → 内错角相等 → 三个角拼成平角 → 内角和为 180°。'
      },
      {
        id: 'kp2-s5',
        name: '应用与拓展',
        tag: '从三角形到多边形',
        minutes: 3,
        diagram: { type: 'polygonSum', title: '四边形能分成几个三角形？' },
        bubbles: [
          { role: 'ai', text: '掌握了内角和，就能解决一大类“求角度”的问题。' },
          { role: 'ai', text: '再看一个拓展：从一个顶点出发连对角线，四边形被分成 2 个三角形。' },
          { role: 'ai', text: '所以四边形内角和 = 2 × 180° = 360°，', highlight: 'n 边形内角和 = (n − 2) × 180°。' }
        ],
        checkpoint: {
          question: '五边形的内角和是多少度？',
          options: ['360°', '480°', '540°', '720°'],
          correct: 2,
          hints: ['先想五边形能从同一个顶点连出几个三角形。', '用 (n − 2) × 180° 代入 n = 5 试试。'],
          correctText: '正确！(5 − 2) × 180° = 540°。',
          wrongText: {
            0: '360° 是四边形（n = 4）的结果，五边形要多一个三角形。',
            1: '再数一遍：五边形能分成 3 个三角形，3 × 180° 是多少？',
            _: '方法：n 边形从一个顶点可连出 (n − 2) 个三角形。'
          }
        },
        summary: '三角形内角和 180° 是多边形内角和公式的起点，掌握它就能一路拓展。'
      }
    ]
  },

  kp3: {
    id: 'kp3',
    title: '勾股定理 a² + b² = c²',
    grade: '八年级 · 第 17 章',
    minutes: 16,
    goal: '通过面积法理解勾股定理，能用它求直角三角形的边长，并用逆定理判断直角',
    steps: [
      {
        id: 'kp3-s1',
        name: '情境导入',
        tag: '古人的 3-4-5 绳结',
        minutes: 2,
        diagram: { type: 'pythagorasGrid', title: '3-4-5 直角三角形的网格验证' },
        bubbles: [
          { role: 'ai', text: '今天我们来认识数学里最有名的定理之一：勾股定理 📐' },
          { role: 'ai', text: '古埃及人用一根打结的绳子，量出 3、4、5 三段，就能围出一个直角。' },
          { role: 'ai', text: '更有意思的是：3² + 4² = 9 + 16 = 25，而 5² 也等于 25。', highlight: '这不是巧合，而是规律。' }
        ],
        checkpoint: {
          question: '3² + 4² 的结果是？',
          options: ['7', '12', '25', '49'],
          correct: 2,
          hints: ['先分别算 3² 和 4²。', '3² = 9，4² = 16，再把它们相加。'],
          correctText: '很好！9 + 16 = 25，正好等于 5²。',
          wrongText: {
            0: '7 是 3 + 4 的结果，注意这里要算“平方”再相加。',
            1: '12 是 3 × 4，平方和应该是 9 + 16。',
            _: '先算平方：3² = 9，4² = 16，然后相加。'
          }
        },
        summary: '两条直角边的平方和，恰好等于斜边的平方——这就是我们要研究的规律。'
      },
      {
        id: 'kp3-s2',
        name: '观察猜想',
        tag: '三个正方形的面积',
        minutes: 3,
        diagram: { type: 'rightTriangleSquares', title: '以三边为边长的三个正方形', a: 3, b: 4, c: 5 },
        bubbles: [
          { role: 'ai', text: '在直角三角形的三条边上，分别向外画一个正方形。' },
          { role: 'ai', text: '两条直角边上的正方形面积是 a² 和 b²，斜边上的正方形面积是 c²。' },
          { role: 'ai', text: '数一数格子你会发现：两个小正方形的面积加起来，正好等于大正方形的面积。', highlight: 'a² + b² = c²。' }
        ],
        checkpoint: {
          question: '直角三角形两条直角边为 6 和 8，斜边上的正方形面积是多少？',
          options: ['14', '48', '100', '196'],
          correct: 2,
          hints: ['斜边上的正方形面积就是 c²。', '先算 6² + 8²，它等于 c²。'],
          correctText: '对！36 + 64 = 100，所以斜边 c = 10。',
          wrongText: {
            0: '14 是 6 + 8，正方形面积要用平方和。',
            1: '48 是 6 × 8，那是两条直角边围成的长方形面积。',
            _: '记住：斜边上的正方形面积 = 两个直角边上正方形面积之和。'
          }
        },
        summary: '面积关系帮助我们“看见”了 a² + b² = c²。'
      },
      {
        id: 'kp3-s3',
        name: '定理表述',
        tag: '说清楚条件和结论',
        minutes: 3,
        diagram: { type: 'rightTriangleSquares', title: '勾股定理：a² + b² = c²', a: 3, b: 4, c: 5, formula: true },
        bubbles: [
          { role: 'ai', text: '把它写成定理：直角三角形两条直角边的平方和，等于斜边的平方。' },
          { role: 'ai', text: '符号语言：在 Rt△ABC 中，∠C = 90°，则 a² + b² = c²。', highlight: '其中的 c 一定是斜边，也就是直角所对的边。' },
          { role: 'ai', text: '所以用公式前，先要认准哪条边是斜边。' }
        ],
        checkpoint: {
          question: '在 Rt△ABC 中，∠B = 90°，三边应满足的关系是？',
          options: ['a² + b² = c²', 'a² + c² = b²', 'b² + c² = a²', 'a + b = c'],
          correct: 1,
          hints: ['先找哪个角是直角，直角所对的边才是斜边。', '∠B = 90°，说明边 b 是斜边。'],
          correctText: '漂亮！∠B = 90°，斜边是 b，所以 a² + c² = b²。',
          wrongText: {
            0: 'a² + b² = c² 是当 ∠C = 90°、c 为斜边时成立的形式。',
            2: '直角在 B，斜边就不是 a 了。',
            _: '诀窍：公式里单独在等号右边的那个字母，对应的是斜边。'
          }
        },
        summary: '用勾股定理前必须先确认直角位置，再确定斜边，不能死记字母顺序。'
      },
      {
        id: 'kp3-s4',
        name: '证明演示',
        tag: '面积法',
        minutes: 4,
        diagram: { type: 'areaProof', title: '大正方形 = 4 个直角三角形 + 中间小正方形' },
        bubbles: [
          { role: 'ai', text: '为什么 a² + b² = c² 一定成立？我们用面积来证明。' },
          { role: 'ai', text: '用 4 个全等的直角三角形拼成一个边长为 (a + b) 的大正方形。' },
          { role: 'ai', text: '大正方形面积 = (a + b)²，同时它等于 4 个三角形面积加中间小正方形 c²。' },
          { role: 'ai', text: '列式展开后左右两边相同的项抵消，就剩下：', highlight: 'a² + b² = c²。' }
        ],
        checkpoint: {
          question: '边长为 (a + b) 的大正方形，面积还可以写成？',
          options: ['a² + b²', 'a² + 2ab + b²', '2ab', 'a² − b²'],
          correct: 1,
          hints: ['把 (a + b)² 展开，就是 (a + b)(a + b)。', '逐项相乘：a·a、a·b、b·a、b·b。'],
          correctText: '正确！(a + b)² = a² + 2ab + b²，再和 4 个三角形 + c² 比较即可。',
          wrongText: {
            0: '漏掉了中间交叉的 2ab 这一项。',
            2: '2ab 只是展开式里的一部分，别忘了两个平方项。',
            _: '把 (a + b)² 写开：(a + b)(a + b)，四项相加。'
          }
        },
        summary: '面积法把图形和代数式连起来，是勾股定理最漂亮的证明之一。'
      },
      {
        id: 'kp3-s5',
        name: '应用与逆定理',
        tag: '求边长 + 判断直角',
        minutes: 4,
        diagram: { type: 'converseCheck', title: '逆定理：三边满足平方关系就是直角三角形', triples: [[3, 4, 5], [5, 12, 13], [6, 8, 10]] },
        bubbles: [
          { role: 'ai', text: '正着用可以求边长：已知 a = 5、b = 12，则 c² = 25 + 144 = 169，c = 13。' },
          { role: 'ai', text: '反过来也能用：如果三边满足 a² + b² = c²，那这个三角形一定是直角三角形。', highlight: '这叫做勾股定理的逆定理。' },
          { role: 'ai', text: '3-4-5、5-12-13、6-8-10 这些是常见的勾股数，记住它们能更快解题。' }
        ],
        checkpoint: {
          question: '三边为 9、12、15 的三角形是直角三角形吗？',
          options: ['是，因为 9² + 12² = 15²', '不是，因为 9 + 12 ≠ 15', '是，因为三条边都是 3 的倍数', '无法判断'],
          correct: 0,
          hints: ['分别算三条边的平方。', '比较两条较短边的平方和，与最长边的平方是否相等。'],
          correctText: '完全正确！81 + 144 = 225 = 15²，所以它是直角三角形。',
          wrongText: {
            1: '判断直角用的是“平方和”，不是边长直接相加。',
            2: '都是 3 的倍数只能说明它是 3-4-5 的放大版，真正要验证的还是平方关系。',
            _: '步骤：找最长边 → 算两条短边平方和 → 与最长边平方比较。'
          }
        },
        summary: '会用定理求边，会用逆定理判直角，再记住几组常见勾股数，这一类题就稳了。'
      }
    ]
  }
};

function listLessons() {
  return Object.values(lessons).map(lesson => ({
    id: lesson.id,
    title: lesson.title,
    grade: lesson.grade,
    minutes: lesson.minutes,
    goal: lesson.goal,
    stepCount: lesson.steps.length
  }));
}

// 根据会话进度生成讲题步骤清单（步骤定义与课堂讲题保持一致）
function stepListFor(kpId, session) {
  const lesson = lessons[kpId];
  if (!lesson) return [];
  const total = lesson.steps.length;
  const done = session
    ? (session.status === 'completed' ? total : Math.min(session.currentStep || 0, total))
    : 0;
  const correctedIndex = session && session.correctionCount > 0 ? Math.max(done - 1, 0) : -1;

  return lesson.steps.map((step, index) => {
    let status = 'pending';
    if (index < done) status = index === correctedIndex ? 'corrected' : 'completed';
    else if (index === done && session && session.status !== 'completed') status = 'current';
    return {
      step: index + 1,
      title: step.name,
      name: step.name,
      tag: step.tag,
      minutes: step.minutes,
      status,
      hint: status === 'corrected' ? '这一步曾出现错误，经引导后完成' : null
    };
  });
}

function lessonStepCount(kpId) {
  const lesson = lessons[kpId];
  return lesson ? lesson.steps.length : 0;
}

module.exports = { lessons, listLessons, stepListFor, lessonStepCount };
