// 生成 MySQL 建表脚本：node src/db/dump-sql.js（等价于 npm run db:schema）
const fs = require('fs');
const path = require('path');
const schema = require('./schema');

const target = path.join(__dirname, 'schema.sql');
fs.writeFileSync(target, schema.toSql(), 'utf8');

console.log('已生成 ' + target);
console.log('共 ' + schema.TABLES.length + ' 张表：' + schema.TABLES.map(function (def) { return def.name; }).join(', '));