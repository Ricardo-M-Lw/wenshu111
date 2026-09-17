// 仓储层出口：服务层统一从这里取数据访问对象（对应框架「二、分层框架总览」的持久层）
// 现在由内存表引擎驱动，落库后换成 MyBatis Mapper，服务层调用方式不变。

const db = require('../db/table');

module.exports = {
  user: require('./userRepository'),
  learning: require('./learningRepository'),
  quiz: require('./quizRepository'),
  gamification: require('./gamificationRepository'),
  study: require('./studyRepository'),
  vip: require('./vipRepository'),
  wallet: require('./walletRepository'),
  ladder: require('./ladderRepository'),

  // 表结构信息：管理端与技术自检用
  schema: db,
  info: function () { return { tables: db.info(), pending: db.pending() }; }
};