// 轻量表引擎 —— 按 db/schema.js 的表定义建「内存表」
// 对外暴露接近 SQL 的读写接口（主键查找 / 索引查找 / 条件查询 / 插入 / 更新），
// 让仓储层的代码长得像在操作数据库；换 MySQL + MyBatis 时只替换本文件的实现。
// 所有表共用 models/mockData.js 里的同一份数据，保证与旧代码「一个数据源」。

const schema = require('./schema');

const registry = new Map();

// 把 DB 风格（snake_case）的字段名翻译成领域对象风格（camelCase）
function translate(row) {
  const out = {};
  Object.keys(row || {}).forEach(function (key) {
    out[schema.toCamel(key)] = row[key];
  });
  return out;
}

// 让「按主键索引的对象」也能当表用：mockData.gamification 是 { u1: {...} }
function fromMap(map, pkField) {
  // 把主键写回行对象，等价于表里的主键列（对象本身只以主键为 key）
  Object.keys(map).forEach(function (key) {
    if (map[key] && map[key][pkField] === undefined) map[key][pkField] = key;
  });
  return {
    get length() { return Object.keys(map).length; },
    find: function (predicate) { return Object.values(map).find(predicate); },
    filter: function (predicate) { return Object.values(map).filter(predicate); },
    push: function (row) { map[row[pkField]] = row; return row; }
  };
}

function createTable(def, backing) {
  const pkField = def.columns.filter(function (col) { return col.pk; })
    .map(function (col) { return schema.toCamel(col.name); })[0];

  const table = {
    name: def.name,
    comment: def.comment,
    columns: def.columns.map(function (col) { return col.name; }),
    fields: def.columns.map(function (col) { return schema.toCamel(col.name); }),
    pk: pkField,
    indexes: def.indexes || [],
    backing: backing,

    all: function () { return Array.isArray(backing) ? backing : backing.filter(function () { return true; }); },
    count: function (predicate) { return predicate ? table.filter(predicate).length : backing.length; },

    findById: function (id) {
      return backing.find(function (row) { return String(row[pkField]) === String(id); }) || null;
    },
    find: function (predicate) { return backing.find(predicate) || null; },
    filter: function (predicate) { return backing.filter(predicate); },

    // 走「索引」的等值查询：索引名必须在 schema 里声明过
    byIndex: function (indexName, value) {
      const index = (def.indexes || []).find(function (item) { return item.name === indexName; });
      if (!index) throw new Error(def.name + ' 未声明索引：' + indexName);
      if (value && typeof value === 'object') {
        return backing.filter(function (row) {
          return index.columns.every(function (col) {
            return String(row[schema.toCamel(col)]) === String(value[col]);
          });
        });
      }
      const key = schema.toCamel(index.columns[0]);
      return backing.filter(function (row) { return String(row[key]) === String(value); });
    },
    findOneByIndex: function (indexName, value) { return table.byIndex(indexName, value)[0] || null; },

    insert: function (row) {
      const record = translate(row);
      backing.push(record);
      return record;
    },
    update: function (id, patch) {
      const row = table.findById(id);
      if (!row) return null;
      Object.assign(row, translate(patch));
      row.updatedAt = new Date().toISOString();
      return row;
    },
    nextId: function (prefix) {
      return String(prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
  };
  return table;
}

function register(def, backing) {
  const definition = typeof def === 'string' ? schema.byName(def) : def;
  if (!definition) throw new Error('未知的数据表：' + def);
  const table = createTable(definition, backing);
  registry.set(definition.name, table);
  return table;
}

function get(name) { return registry.get(name) || null; }
function names() { return Array.from(registry.keys()); }
function sql() { return schema.toSql(); }

// 已经在内存里落地的表
function info() {
  return names().map(function (name) {
    const table = registry.get(name);
    return { table: name, rows: table.count(), columns: table.columns.length, indexes: table.indexes.length, backing: Array.isArray(table.backing) ? 'array' : 'map' };
  });
}

// schema 里已经定义、但内存数据还是嵌套结构（落库时才拆表）的表
function pending() {
  return schema.TABLES.map(function (def) { return def.name; })
    .filter(function (name) { return !registry.has(name); });
}

module.exports = { register, get, names, sql, info, pending, translate, fromMap, createTable };