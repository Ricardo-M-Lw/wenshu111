const express = require('express');
const router = express.Router();
const { users } = require('../models/mockData');
const { currentUser } = require('../utils/auth');
const { buildAbility } = require('../agent/ability');

function resolveUser(req) {
  return currentUser(req, users) || users.find(item => item.role === 'student') || null;
}

// 五维能力雷达图数据（「我的」页面）
router.get('/ability', (req, res) => {
  res.json({ data: buildAbility(resolveUser(req)) });
});

module.exports = router;