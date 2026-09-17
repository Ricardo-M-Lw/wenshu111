// 表结构定义 —— 对应框架「五、数据库：先懂共性，再认识产品」
// 这里是唯一事实来源：
//   · toSql() 生成 MySQL 建表 DDL（src/db/schema.sql，可用 npm run db:schema 重新生成）
//   · 字段定义同时驱动当前的内存表引擎（src/db/table.js）
// 落库时把这份定义翻译成 MyBatis 实体与 Mapper 即可，业务代码不用改。
// 注意：登录状态、短信验证码、限流计数属于短期状态，放在 Redis（src/cache），不进 MySQL。

const Q = String.fromCharCode(39); // 单引号常量，避免 SQL 与 JS 字符串互相转义

const TABLES = [
  {
    name: 'qw_user',
    comment: '用户（学生 / 教师 / 运营）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '用户主键' },
      { name: 'name', type: 'VARCHAR(32)', notNull: true, comment: '姓名' },
      { name: 'nickname', type: 'VARCHAR(32)', comment: '昵称' },
      { name: 'username', type: 'VARCHAR(32)', comment: '用户名' },
      { name: 'phone', type: 'VARCHAR(20)', comment: '手机号' },
      { name: 'role', type: 'VARCHAR(16)', notNull: true, default: 'student', comment: '角色 student / teacher / ops' },
      { name: 'avatar', type: 'MEDIUMTEXT', comment: '头像（emoji / 文字 / 链接 / data URL）' },
      { name: 'grade', type: 'VARCHAR(16)', comment: '年级' },
      { name: 'school', type: 'VARCHAR(64)', comment: '学校' },
      { name: 'class_name', type: 'VARCHAR(32)', comment: '班级' },
      { name: 'password_hash', type: 'VARCHAR(128)', comment: '加盐密码哈希' },
      { name: 'salt', type: 'VARCHAR(32)', comment: '密码盐' },
      { name: 'created_at', type: 'DATETIME', comment: '注册时间' },
      { name: 'updated_at', type: 'DATETIME', comment: '更新时间' }
    ],
    indexes: [
      { name: 'uk_user_phone', columns: ['phone'], unique: true, comment: '按手机号登录 / 注册查重' },
      { name: 'uk_user_username', columns: ['username'], unique: true, comment: '按用户名登录' },
      { name: 'idx_user_role', columns: ['role'], comment: '按角色查询（管理端）' }
    ]
  },
  {
    name: 'qw_knowledge_point',
    comment: '知识点（知识星球）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '知识点主键' },
      { name: 'name', type: 'VARCHAR(64)', notNull: true, comment: '知识点名称' },
      { name: 'subtitle', type: 'VARCHAR(64)', comment: '副标题' },
      { name: 'grade', type: 'VARCHAR(16)', comment: '适用年级' },
      { name: 'total_steps', type: 'INT', default: 5, comment: '讲题步骤数' },
      { name: 'sort_no', type: 'INT', comment: '排序号' }
    ],
    indexes: [
      { name: 'idx_kp_grade', columns: ['grade'], comment: '按年级筛选' }
    ]
  },
  {
    name: 'qw_lesson_step',
    comment: '讲题步骤（五步闭环脚本，答案不入库）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '步骤主键' },
      { name: 'knowledge_point_id', type: 'VARCHAR(32)', notNull: true, comment: '所属知识点' },
      { name: 'step_index', type: 'INT', notNull: true, comment: '第几步（1 起）' },
      { name: 'title', type: 'VARCHAR(64)', comment: '步骤标题' },
      { name: 'shape_type', type: 'VARCHAR(32)', comment: '黑板图形类型' }
    ],
    indexes: [
      { name: 'uk_step_kp_index', columns: ['knowledge_point_id', 'step_index'], unique: true, comment: '同一知识点内步骤号唯一' }
    ]
  },
  {
    name: 'qw_learning_session',
    comment: '学习会话（一次讲题 / 练题）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '会话主键' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '所属学生' },
      { name: 'knowledge_point_id', type: 'VARCHAR(32)', notNull: true, comment: '知识点' },
      { name: 'status', type: 'VARCHAR(16)', comment: '进行中 / 已完成' },
      { name: 'current_step', type: 'INT', comment: '当前步骤' },
      { name: 'total_steps', type: 'INT', comment: '总步骤数' },
      { name: 'hint_count', type: 'INT', comment: '使用提示次数' },
      { name: 'correction_count', type: 'INT', comment: '订正次数' },
      { name: 'duration', type: 'INT', comment: '本次用时（分钟）' },
      { name: 'error_types', type: 'JSON', comment: '本次出现的错因' },
      { name: 'quiz', type: 'JSON', comment: '练题对错（correct / total）' },
      { name: 'created_at', type: 'DATETIME', comment: '开始时间' },
      { name: 'updated_at', type: 'DATETIME', comment: '最近更新时间' }
    ],
    indexes: [
      { name: 'idx_session_user', columns: ['user_id'], comment: '按学生查学习记录' },
      { name: 'idx_session_user_kp', columns: ['user_id', 'knowledge_point_id'], comment: '按学生 + 知识点查掌握度' }
    ]
  },
  {
    name: 'qw_question',
    comment: '标准题库（correct_answer 仅服务端可见，接口统一剥离）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '题目主键' },
      { name: 'knowledge_point_id', type: 'VARCHAR(32)', notNull: true, comment: '所属知识点' },
      { name: 'question', type: 'VARCHAR(255)', notNull: true, comment: '题干' },
      { name: 'options', type: 'JSON', comment: '选项' },
      { name: 'correct_answer', type: 'INT', comment: '正确选项下标（仅服务端可见）' },
      { name: 'hint', type: 'VARCHAR(255)', comment: '提示语' },
      { name: 'type', type: 'VARCHAR(16)', comment: '题型' }
    ],
    indexes: [
      { name: 'idx_question_kp', columns: ['knowledge_point_id'], comment: '按知识点取题' },
      { name: 'idx_question_type', columns: ['type'], comment: '按题型统计' }
    ]
  },  {
    name: 'qw_answer_record',
    comment: '作答记录（标准题）',
    columns: [
      { name: 'id', type: 'VARCHAR(40)', pk: true, notNull: true, comment: '作答主键' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '学生' },
      { name: 'question_id', type: 'VARCHAR(32)', notNull: true, comment: '题目' },
      { name: 'answer', type: 'VARCHAR(64)', comment: '学生作答' },
      { name: 'correct', type: 'TINYINT', comment: '是否答对' },
      { name: 'created_at', type: 'DATETIME', comment: '作答时间' }
    ],
    indexes: [
      { name: 'idx_answer_user', columns: ['user_id'], comment: '按学生查作答' },
      { name: 'idx_answer_question', columns: ['question_id'], comment: '按题目统计正确率' }
    ]
  },
  {
    name: 'qw_error_record',
    comment: '错因记录（错题本按错因汇总）',
    columns: [
      { name: 'id', type: 'VARCHAR(40)', pk: true, notNull: true, comment: '错因主键' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '学生' },
      { name: 'knowledge_point_id', type: 'VARCHAR(32)', comment: '知识点' },
      { name: 'error_type', type: 'VARCHAR(32)', comment: '错因分类' },
      { name: 'detail', type: 'VARCHAR(255)', comment: '错因说明' },
      { name: 'created_at', type: 'DATETIME', comment: '记录时间' }
    ],
    indexes: [
      { name: 'idx_error_user', columns: ['user_id'], comment: '按学生查错题本' },
      { name: 'idx_error_type', columns: ['error_type'], comment: '按错因统计（错因字典）' }
    ]
  },
  {
    name: 'qw_gamification',
    comment: '趣味化数据（经验 / 星尘 / 连续签到）',
    columns: [
      { name: 'user_id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '学生' },
      { name: 'exp', type: 'INT', default: 0, comment: '经验值' },
      { name: 'points', type: 'INT', default: 0, comment: '星尘（通用积分）' },
      { name: 'agent_date', type: 'DATE', comment: 'AI 对话配额所属日期（跨天自动重置）' },
      { name: 'agent_used', type: 'INT', default: 0, comment: '当天已用 AI 对话次数' },
      { name: 'agent_extra', type: 'INT', default: 0, comment: '当天用星尘 / 星钻兑换到的额外次数' },
      { name: 'crystal_used', type: 'INT', default: 0, comment: '累计消耗的星钻（兑换 AI 对话次数）' },
      { name: 'crystal_recharge', type: 'INT', default: 0, comment: '累计充值获得的星钻（1 元 = 1 星钻）' },
      { name: 'streak_days', type: 'INT', default: 0, comment: '连续签到天数' },
      { name: 'total_checkins', type: 'INT', default: 0, comment: '累计签到次数' },
      { name: 'updated_at', type: 'DATETIME', comment: '更新时间' }
    ],
    indexes: [
      { name: 'idx_gami_points', columns: ['points'], comment: '积分榜单排序' }
    ]
  },
  {
    name: 'qw_checkin',
    comment: '签到流水',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, notNull: true, comment: '主键（学生 + 日期）' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '学生' },
      { name: 'checkin_date', type: 'DATE', notNull: true, comment: '签到日期' },
      { name: 'points', type: 'INT', comment: '本次获得星尘' },
      { name: 'created_at', type: 'DATETIME', comment: '签到时间' }
    ],
    indexes: [
      { name: 'uk_checkin_user_date', columns: ['user_id', 'checkin_date'], unique: true, comment: '同一学生同一天只能签到一次' }
    ]
  },
  {
    name: 'qw_study_setting',
    comment: '学习提醒设置',
    columns: [
      { name: 'user_id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '学生' },
      { name: 'study_window', type: 'JSON', comment: '学习时段' },
      { name: 'quiet_hours', type: 'JSON', comment: '免打扰时段' },
      { name: 'image_policy', type: 'VARCHAR(16)', comment: '题图生成策略' },
      { name: 'reminders', type: 'JSON', comment: '提醒开关' },
      { name: 'privacy', type: 'JSON', comment: '隐私与共享' },
      { name: 'updated_at', type: 'DATETIME', comment: '更新时间' }
    ],
    indexes: [
      { name: 'idx_setting_updated', columns: ['updated_at'], comment: '按更新时间巡检' }
    ]
  },
  {
    name: 'qw_vip_order',
    comment: '会员订单（领航舱充值）',
    columns: [
      { name: 'order_no', type: 'VARCHAR(40)', pk: true, notNull: true, comment: '订单号（业务主键）' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '下单用户' },
      { name: 'plan_id', type: 'VARCHAR(16)', notNull: true, comment: '方案 monthly / yearly' },
      { name: 'plan_name', type: 'VARCHAR(64)', comment: '方案名称快照' },
      { name: 'channel', type: 'VARCHAR(16)', comment: '支付渠道' },
      { name: 'origin_amount', type: 'DECIMAL(10,2)', comment: '原价' },
      { name: 'discount', type: 'DECIMAL(10,2)', comment: '立减' },
      { name: 'amount', type: 'DECIMAL(10,2)', comment: '实付' },
      { name: 'days', type: 'INT', comment: '开通天数' },
      { name: 'pay_code', type: 'VARCHAR(160)', comment: '付款码（每次下单随机生成）' },
      { name: 'code_tail', type: 'VARCHAR(8)', comment: '付款码尾号' },
      { name: 'status', type: 'VARCHAR(16)', comment: 'pending / paid' },
      { name: 'created_at', type: 'DATETIME', comment: '下单时间' },
      { name: 'paid_at', type: 'DATETIME', comment: '支付时间' }
    ],
    indexes: [
      { name: 'uk_order_no', columns: ['order_no'], unique: true, comment: '订单号唯一' },
      { name: 'idx_order_user', columns: ['user_id'], comment: '按用户查订单' },
      { name: 'idx_order_status', columns: ['status'], comment: '按状态对账' },
      { name: 'idx_order_channel', columns: ['channel'], comment: '按渠道统计' }
    ]
  },
  {
    name: 'qw_membership',
    comment: '会员权益（领航员有效期）',
    columns: [
      { name: 'user_id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '用户' },
      { name: 'plan_id', type: 'VARCHAR(16)', comment: '方案' },
      { name: 'plan_name', type: 'VARCHAR(64)', comment: '方案名称' },
      { name: 'tier', type: 'VARCHAR(32)', comment: '层级标签' },
      { name: 'days', type: 'INT', comment: '本次开通天数' },
      { name: 'start_at', type: 'DATETIME', comment: '生效时间' },
      { name: 'end_at', type: 'DATETIME', comment: '到期时间' },
      { name: 'order_no', type: 'VARCHAR(40)', comment: '最近一笔订单' },
      { name: 'auto_renew', type: 'TINYINT', default: 0, comment: '是否自动续费' },
      { name: 'updated_at', type: 'DATETIME', comment: '更新时间' }
    ],
    indexes: [
      { name: 'idx_membership_end', columns: ['end_at'], comment: '按到期时间筛有效会员' },
      { name: 'idx_membership_plan', columns: ['plan_id'], comment: '按方案统计' }
    ]
  },
  {
    name: 'qw_crystal_order',
    comment: '星钻充值订单（1 元 = 1 星钻，等值充值）',
    columns: [
      { name: 'order_no', type: 'VARCHAR(40)', pk: true, notNull: true, comment: '订单号' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '学生' },
      { name: 'pack_id', type: 'VARCHAR(16)', comment: '充值档位' },
      { name: 'amount', type: 'DECIMAL(10,2)', comment: '实付金额（元）' },
      { name: 'crystal', type: 'INT', comment: '到账星钻' },
      { name: 'channel', type: 'VARCHAR(16)', comment: '支付渠道' },
      { name: 'pay_code', type: 'VARCHAR(160)', comment: '付款码（每次下单随机生成）' },
      { name: 'status', type: 'VARCHAR(16)', comment: 'pending / paid' },
      { name: 'created_at', type: 'DATETIME', comment: '下单时间' },
      { name: 'paid_at', type: 'DATETIME', comment: '支付时间' }
    ],
    indexes: [
      { name: 'idx_crystal_user', columns: ['user_id'], comment: '按学生查充值记录' },
      { name: 'idx_crystal_status', columns: ['status'], comment: '按状态对账' }
    ]
  },
  {
    name: 'qw_wallet_log',
    comment: '星尘 / 星钻收支流水（收支记录）',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, notNull: true, comment: '流水主键' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '学生' },
      { name: 'wallet', type: 'VARCHAR(8)', notNull: true, comment: 'dust 星尘 / gem 星钻' },
      { name: 'amount', type: 'INT', notNull: true, comment: '变动值，正数收入负数支出' },
      { name: 'balance', type: 'INT', comment: '变动后余额' },
      { name: 'category', type: 'VARCHAR(24)', comment: '来源分类：checkin / quiz / lesson / redeem / recharge' },
      { name: 'reason', type: 'VARCHAR(128)', comment: '说明文案' },
      { name: 'created_at', type: 'DATETIME', comment: '发生时间' }
    ],
    indexes: [
      { name: 'idx_wallet_user', columns: ['user_id'], comment: '按学生查流水' },
      { name: 'idx_wallet_time', columns: ['user_id', 'created_at'], comment: '按时间倒序翻页' }
    ]
  },
  {
    name: 'qw_ladder_season',
    comment: '天梯赛季（星际天梯）',
    columns: [
      { name: 'id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '赛季主键' },
      { name: 'name', type: 'VARCHAR(64)', notNull: true, comment: '赛季名称' },
      { name: 'start_at', type: 'DATE', comment: '开始日期' },
      { name: 'end_at', type: 'DATE', comment: '结束日期' },
      { name: 'status', type: 'VARCHAR(16)', default: 'active', comment: 'active / closed' }
    ],
    indexes: [
      { name: 'idx_lseason_status', columns: ['status'], comment: '按状态取当前赛季' }
    ]
  },
  {
    name: 'qw_ladder_profile',
    comment: '天梯档案（段位 / 积分 / 战绩 / 每日场次 / 家长守护开关）',
    columns: [
      { name: 'user_id', type: 'VARCHAR(32)', pk: true, notNull: true, comment: '学生' },
      { name: 'season_id', type: 'VARCHAR(32)', comment: '所属赛季' },
      { name: 'rating', type: 'INT', default: 1000, comment: '天梯积分' },
      { name: 'tier', type: 'VARCHAR(16)', comment: '段位标识' },
      { name: 'wins', type: 'INT', default: 0, comment: '胜场' },
      { name: 'losses', type: 'INT', default: 0, comment: '负场' },
      { name: 'draws', type: 'INT', default: 0, comment: '平局' },
      { name: 'streak', type: 'INT', default: 0, comment: '当前连胜' },
      { name: 'best_streak', type: 'INT', default: 0, comment: '最高连胜' },
      { name: 'best_score', type: 'INT', default: 0, comment: '单局最高分' },
      { name: 'daily_date', type: 'DATE', comment: '每日场次所属日期（跨天重置）' },
      { name: 'daily_used', type: 'INT', default: 0, comment: '当天已打场次' },
      { name: 'guard', type: 'TINYINT', default: 0, comment: '是否遵守学习时段 / 免打扰（家长守护）' },
      { name: 'updated_at', type: 'DATETIME', comment: '更新时间' }
    ],
    indexes: [
      { name: 'idx_lprofile_rating', columns: ['rating'], comment: '天梯榜排序' },
      { name: 'idx_lprofile_tier', columns: ['tier'], comment: '按段位统计' }
    ]
  },
  {
    name: 'qw_ladder_match',
    comment: '天梯对局（题面与正确答案仅服务端可见，接口统一剥离）',
    columns: [
      { name: 'id', type: 'VARCHAR(40)', pk: true, notNull: true, comment: '对局主键' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '挑战者' },
      { name: 'season_id', type: 'VARCHAR(32)', comment: '赛季' },
      { name: 'mode', type: 'VARCHAR(16)', default: 'quick', comment: 'quick 快速匹配' },
      { name: 'opponent_type', type: 'VARCHAR(16)', comment: 'rival 星海对手 / bot 机器人' },
      { name: 'opponent_name', type: 'VARCHAR(32)', comment: '对手昵称' },
      { name: 'opponent_avatar', type: 'VARCHAR(16)', comment: '对手头像' },
      { name: 'opponent_rating', type: 'INT', comment: '对手积分' },
      { name: 'opponent_plan', type: 'JSON', comment: '对手逐题表现（服务端预演，用于进度条）' },
      { name: 'seed', type: 'VARCHAR(32)', comment: '出题种子（同一局双方同题）' },
      { name: 'knowledge_point_ids', type: 'JSON', comment: '本局覆盖的知识点' },
      { name: 'questions', type: 'JSON', comment: '题面 + 正确答案（仅服务端）' },
      { name: 'total', type: 'INT', comment: '题目数' },
      { name: 'current_seq', type: 'INT', default: 1, comment: '当前进行到第几题（服务端推进）' },
      { name: 'seq_started_at', type: 'DATETIME', comment: '本题开始时间：服务端计时，客户端改不了' },
      { name: 'status', type: 'VARCHAR(16)', comment: 'playing / done / abandoned' },
      { name: 'my_score', type: 'INT', default: 0, comment: '我的得分' },
      { name: 'my_correct', type: 'INT', default: 0, comment: '我答对的题数' },
      { name: 'opp_score', type: 'INT', comment: '对手得分' },
      { name: 'opp_correct', type: 'INT', comment: '对手答对的题数' },
      { name: 'result', type: 'VARCHAR(8)', comment: 'win / lose / draw' },
      { name: 'rating_before', type: 'INT', comment: '开局积分' },
      { name: 'rating_after', type: 'INT', comment: '结算积分' },
      { name: 'rating_delta', type: 'INT', comment: '积分变化' },
      { name: 'reward', type: 'INT', comment: '本局获得的星尘' },
      { name: 'created_at', type: 'DATETIME', comment: '开局时间' },
      { name: 'ended_at', type: 'DATETIME', comment: '结束时间' }
    ],
    indexes: [
      { name: 'idx_lmatch_user', columns: ['user_id'], comment: '按学生查对局' },
      { name: 'idx_lmatch_status', columns: ['status'], comment: '按状态巡检未结束对局' }
    ]
  },
  {
    name: 'qw_ladder_answer',
    comment: '天梯逐题作答记录（服务端判分）',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', pk: true, notNull: true, comment: '作答主键（对局 + 题号）' },
      { name: 'match_id', type: 'VARCHAR(40)', notNull: true, comment: '对局' },
      { name: 'user_id', type: 'VARCHAR(32)', notNull: true, comment: '作答人' },
      { name: 'seq', type: 'INT', notNull: true, comment: '第几题（1 起）' },
      { name: 'knowledge_point_id', type: 'VARCHAR(32)', comment: '知识点' },
      { name: 'choice', type: 'INT', comment: '所选下标' },
      { name: 'correct', type: 'TINYINT', comment: '是否答对' },
      { name: 'cost_ms', type: 'INT', comment: '本题用时（毫秒）' },
      { name: 'created_at', type: 'DATETIME', comment: '作答时间' }
    ],
    indexes: [
      { name: 'uk_lanswer_match_seq', columns: ['match_id', 'seq'], unique: true, comment: '同一对局同一题只记一次' },
      { name: 'idx_lanswer_user', columns: ['user_id'], comment: '按学生查作答' }
    ]
  }
];

function byName(name) {
  return TABLES.find(function (item) { return item.name === name; }) || null;
}

function toCamel(value) {
  return String(value).replace(/_([a-z0-9])/g, function (all, ch) { return ch.toUpperCase(); });
}

function toSnake(value) {
  return String(value).replace(/[A-Z]/g, function (ch) { return '_' + ch.toLowerCase(); });
}

function columnDdl(col) {
  const parts = [col.name, col.type + (col.notNull ? ' NOT NULL' : ' NULL')];
  if (col.default !== undefined && col.default !== null) {
    parts.push('DEFAULT ' + (/INT|DECIMAL|TINYINT/.test(col.type) ? col.default : Q + col.default + Q));
  }
  if (col.comment) parts.push('COMMENT ' + Q + col.comment + Q);
  return '  ' + parts.join(' ');
}

function indexDdl(index) {
  const unique = index.unique ? 'UNIQUE KEY' : 'KEY';
  return '  ' + unique + ' ' + index.name + ' (' + index.columns.join(', ') + ')' + (index.comment ? ' COMMENT ' + Q + index.comment + Q : '');
}

function tableSql(def) {
  const lines = def.columns.map(columnDdl);
  const primary = def.columns.filter(function (col) { return col.pk; }).map(function (col) { return col.name; });
  const uniqueOnly = (def.indexes || []).filter(function (item) { return item.unique && !(item.columns.length === 1 && item.columns[0] === primary[0]); });
  const plain = (def.indexes || []).filter(function (item) { return !item.unique; });
  if (primary.length) lines.push('  PRIMARY KEY (' + primary.join(', ') + ')');
  uniqueOnly.forEach(function (item) { lines.push(indexDdl(item)); });
  plain.forEach(function (item) { lines.push(indexDdl(item)); });
  return 'CREATE TABLE IF NOT EXISTS ' + def.name + ' (\n' + lines.join(',\n') + '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=' + Q + def.comment + Q + ';';
}

function toSql() {
  const header = [
    '-- 问数星途 · MySQL 建表脚本（由 src/db/schema.js 生成，请勿手工修改）',
    '-- 重新生成：cd backend && npm run db:schema',
    '-- 说明：登录状态 / 短信验证码 / 限流计数属于短期状态，放 Redis（src/cache），不进 MySQL。',
    'SET NAMES utf8mb4;',
    ''
  ];
  const body = TABLES.map(function (def) {
    return '-- ' + def.comment + '\n' + tableSql(def);
  });
  return header.concat(body).join('\n\n') + '\n';
}

module.exports = { TABLES, byName, toCamel, toSnake, tableSql, toSql };