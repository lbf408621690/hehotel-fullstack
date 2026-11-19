/**
 * 数据访问层：基于 sql.js（纯 JS SQLite），启动时载入 data/hotel.db，
 * 写操作后自动导出回文件，保证运行期间数据持久化。
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'hotel.db');
let db = null;
let saveTimer = null;

async function init() {
  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f) });
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  return db;
}

function getDB() { return db; }

/** 执行写 SQL，并延迟持久化 */
function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
  return db.getRowsModified();
}

/** 查询多行，返回对象数组（列名->值） */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

/** 查询单行 */
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

/** 标量查询 */
function scalar(sql, params = []) {
  const row = get(sql, params);
  return row ? Object.values(row)[0] : null;
}

/** 最后插入的 rowid */
function lastId() { return scalar('SELECT last_insert_rowid() AS id'); }

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}
function saveNow() {
  if (!db) return;
  try {
    const data = db.export();
    const buf = Buffer.from(data);
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.error('[db] 持久化失败:', e.message);
  }
}

function lastInsertRowId() { return lastId(); }

module.exports = { init, getDB, run, all, get, scalar, lastId, lastInsertRowId, saveNow };
