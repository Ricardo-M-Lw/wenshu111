const { users, knowledgePoints, learningSessions, gamification } = require('../models/mockData');

console.log('🌱 问数 Mock 数据初始化');
console.log('');
console.log('👤 用户:');
users.forEach(u => console.log(`  - ${u.name} (${u.role})`));
console.log('');
console.log('📚 知识点:');
knowledgePoints.forEach(kp => console.log(`  - ${kp.name} (${kp.totalSteps} 步)`));
console.log('');
console.log('📝 学习会话:');
learningSessions.forEach(s => {
  const kp = knowledgePoints.find(k => k.id === s.knowledgePointId);
  console.log(`  - ${kp.name}: ${s.status}, 第 ${s.currentStep}/${s.totalSteps} 步`);
});
console.log('');
console.log('🎮 趣味化数据:');
const g = gamification['u1'];
console.log(`  - 积分: ${g.points}`);
console.log(`  - 连续签到: ${g.streakDays} 天`);
console.log(`  - 等级: Lv.${g.level.current} ${g.level.name}`);
console.log(`  - 徽章: ${g.badges.filter(b => b.unlockedAt).length}/${g.badges.length} 枚`);
console.log('');
console.log('✅ 数据初始化完成');
