/**
 * 和悦酒店全栈服务 —— Express + SQLite
 * 完整复刻原 Spring Boot 后端 (D:\project\hotel) 的所有接口，
 * 保持路径 /ho-api/**、参数名、AjaxResult 返回格式一致。
 */
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = '/ho-api';

// ---------- 基础中间件 ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'hehotel-session-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, sameSite: 'lax' }
}));

// ---------- 工具 ----------
const MD5 = s => crypto.createHash('md5').update(String(s == null ? '' : s), 'utf8').digest('hex');
// sql.js 返回下划线列名，转成 MyBatis 风格的驼峰字段，保持与原 Java 后端返回格式一致
function toCamel(v) {
  if (Array.isArray(v)) return v.map(toCamel);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    for (const k of Object.keys(v)) o[k.replace(/_([a-z])/g, (m, c) => c.toUpperCase())] = toCamel(v[k]);
    return o;
  }
  return v;
}
const ok = (data, message) => ({ code: 1000, message: message || 'SUCCESS', ...(data !== undefined ? { data: toCamel(data) } : {}) });
const fail = (message, code) => ({ code: code || 1001, message: message || '操作失败' });
const num = v => (v === undefined || v === null || v === '' ? null : Number(v));
const str = v => (v === undefined || v === null ? null : String(v));
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// 日期：把 yyyy-MM-dd 或 ISO 归一为标准日期字符串
function fmtDate(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

// ---------- 会话与权限 ----------
function currentUser(req) {
  return { userId: req.session.userId, username: req.session.username, role: req.session.role };
}
function needLogin(req, res, next) {
  if (!req.session.userId) return res.json(fail('NOT LOGIN', 1100));
  next();
}
function needOp(req, res, next) {
  if (!req.session.userId || !req.session.role) return res.json(fail('NOT LOGIN', 1100));
  next();
}
function needAdmin(req, res, next) {
  if (!req.session.userId) return res.json(fail('NOT LOGIN', 1100));
  if (req.session.role !== 'admin') return res.json(fail('PERMISSION_DENIED', 1002));
  next();
}

// 身份证脱敏（按长度安全处理）
function maskIdcard(idcard) {
  if (!idcard || idcard.length <= 4) return idcard;
  const len = idcard.length;
  const keepFront = Math.min(6, len - 4);
  let maskEnd = len - Math.min(4, Math.floor((len - keepFront) / 2));
  maskEnd = Math.max(keepFront, Math.min(maskEnd, len));
  return idcard.slice(0, keepFront) + '********' + idcard.slice(maskEnd);
}

const api = express.Router();

/* ========== 公共：酒店信息 / 房型 ========== */
api.get('/hotel', (req, res) => res.json(ok(db.all('SELECT * FROM hotel_info'))));
api.get('/hotel/room', (req, res) => res.json(ok(db.all('SELECT * FROM room_type'))));
api.get('/hotel/room/rest', (req, res) => res.json(ok(db.all('SELECT * FROM room_type WHERE rest > 0'))));
api.get('/hotel/room/:typeId', (req, res) => res.json(ok(db.get('SELECT * FROM room_type WHERE type_id=?', [num(req.params.typeId)]))));

/* ========== 登录 / 注册 ========== */
api.post('/login/user', (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.json(fail('用户名不能为空'));
  if (!password) return res.json(fail('密码不能为空'));
  const md5 = MD5(password);
  // 兼容明文与 MD5 两种存储
  const user = db.get("SELECT * FROM user_info WHERE username!='' AND password!='' AND username=? AND password IN (?,?)", [username, md5, password]);
  if (!user) return res.json(fail('用户名或密码不正确'));
  req.session.userId = user.user_id;
  req.session.username = user.username;
  return res.json(ok({ sessionId: req.session.id, userId: user.user_id }));
});

api.post('/login/admin', (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.json(fail('用户名不能为空'));
  if (!password) return res.json(fail('密码不能为空'));
  const md5 = MD5(password);
  const worker = db.get("SELECT * FROM worker_info WHERE username=? AND password IN (?,?)", [username, md5, password]);
  if (!worker) return res.json(fail('用户名或密码不正确'));
  req.session.userId = worker.worker_id;
  req.session.role = worker.role;
  return res.json(ok({ sessionId: req.session.id, role: worker.role }));
});

function regUser(req, res) {
  const b = req.body;
  const sql = 'INSERT INTO user_info(username,password,name,gender,phone,email,address,idcard,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?,?)';
  try {
    const r = db.run(sql, [b.username, MD5(b.password), b.name || '', b.gender || '男', b.phone || '',
      b.email || '', b.address || '', b.idcard || '', now(), now()]);
    return r >= 1 ? res.json(ok(1)) : res.json(fail('注册失败,请稍后再试'));
  } catch (e) { return res.json(fail('注册失败：' + (e.message.includes('UNIQUE') ? '用户名或手机已存在' : '请稍后再试'))); }
}
api.post('/register/user', regUser);
api.post('/register/admin', (req, res) => regWorker(req, res, 'admin'));
api.post('/register/operator', (req, res) => regWorker(req, res, 'operator'));
function regWorker(req, res, role) {
  const b = req.body;
  try {
    const r = db.run('INSERT INTO worker_info(role,username,password,name,gender,phone,email,address,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [role, b.username, MD5(b.password), b.name || '', b.gender || '男', b.phone || '', b.email || '', b.address || '', now(), now()]);
    return r >= 1 ? res.json(ok(r)) : res.json(fail('注册失败,请稍后再试'));
  } catch (e) { return res.json(fail('注册失败：' + (e.message.includes('UNIQUE') ? '用户名已存在' : '请稍后再试'))); }
}

module.exports = { app, api, PORT, PREFIX, MD5, ok, fail, num, str, now, fmtDate, maskIdcard,
  currentUser, needLogin, needOp, needAdmin, db };

/* ========== 用户：个人资料 ========== */
api.get('/user/profile', needLogin, (req, res) => {
  const u = db.get('SELECT * FROM user_info WHERE username=?', [req.session.username]);
  if (!u) return res.json(fail('未知错误'));
  delete u.password;
  u.idcard = maskIdcard(u.idcard);
  return res.json(ok(u));
});

api.post('/user/update', needLogin, (req, res) => {
  const b = req.body;
  if (num(b.userId) !== req.session.userId) return res.json(fail('PERMISSION_DENIED', 1002));
  db.run('UPDATE user_info SET name=?,gender=?,phone=?,email=?,address=?,idcard=?,update_time=? WHERE user_id=?',
    [b.name || '', b.gender || '', b.phone || '', b.email || '', b.address || '', b.idcard || '', now(), num(b.userId)]);
  return res.json(ok('修改成功'));
});

api.post('/user/updatePassword', (req, res) => {
  const b = req.body;
  const md5 = MD5(b.oldPassword);
  const u = db.get("SELECT * FROM user_info WHERE username!='' AND password!='' AND username=? AND password IN (?,?)",
    [b.username, md5, b.oldPassword]);
  if (!u) return res.json(fail('密码不对'));
  db.run('UPDATE user_info SET password=?,update_time=? WHERE user_id=?', [MD5(b.newPassword), now(), u.user_id]);
  return res.json(ok('修改成功'));
});

api.post('/user/logout', (req, res) => {
  req.session.userId = null; req.session.username = null; req.session.role = null;
  return res.json(ok('注销成功'));
});

/* ========== 用户：订单 ========== */
function addOrderLogic(req, res) {
  const b = req.body;
  const sql = `INSERT INTO order_info(order_type_id,order_type,user_id,name,phone,room_type_id,room_type,order_date,order_days,order_status,order_cost,create_time,update_time)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  db.run(sql, [num(b.orderTypeId), b.orderType || '', num(b.userId), b.name || '', b.phone || '',
    num(b.roomTypeId), b.roomType || '', fmtDate(b.orderDate), num(b.orderDays) || 1, 0,
    num(b.orderCost) || 0, now(), now()]);
  return res.json(ok(1000));
}
api.get('/user/order/add', addOrderLogic);
api.post('/user/order/add', addOrderLogic);

api.get('/user/order', needLogin, (req, res) => {
  const uid = num(req.query.userId) || req.session.userId;
  const rows = db.all('SELECT * FROM order_info WHERE user_id=? AND order_status > -3 ORDER BY order_id DESC', [uid]);
  return res.json(ok(rows));
});
api.get('/user/order/delete', needLogin, (req, res) => {
  db.run('UPDATE order_info SET order_status=-3,update_time=? WHERE order_id=?', [now(), num(req.query.orderId)]);
  return res.json(ok(1000));
});
api.post('/user/order/delete', needLogin, (req, res) => {
  db.run('UPDATE order_info SET order_status=-3,update_time=? WHERE order_id=?', [now(), num(req.body.orderId)]);
  return res.json(ok(1000));
});

api.get('/user/order/cancel', needLogin, (req, res) => {
  const id = num(req.query.orderId);
  const o = db.get('SELECT * FROM order_info WHERE order_id=?', [id]);
  if (!o) return res.json(fail('', 1001));
  db.run('UPDATE order_info SET order_status=-1,update_time=? WHERE order_id=?', [now(), id]);
  db.run('UPDATE room_type SET rest=rest+1 WHERE type_id=?', [o.room_type_id]);
  return res.json(ok(1000));
});
// 参数路由放最后
api.get('/user/order/:orderId', needLogin, (req, res) =>
  res.json(ok(db.get('SELECT * FROM order_info WHERE order_id=?', [num(req.params.orderId)]))));

api.post('/user/order/pay', needLogin, (req, res) => {
  const b = req.body;
  const md5 = MD5(b.password);
  const u = db.get("SELECT * FROM user_info WHERE username!='' AND password!='' AND username=? AND password IN (?,?)",
    [b.username, md5, b.password]);
  if (!u) return res.json(fail('密码错误'));
  const id = num(b.orderId);
  const o = db.get('SELECT * FROM order_info WHERE order_id=?', [id]);
  if (!o || o.order_status !== 0) return res.json(fail('订单状态不允许支付'));
  const rt = db.get('SELECT * FROM room_type WHERE type_id=?', [o.room_type_id]);
  if (!rt || rt.rest <= 0) return res.json(fail('该房型已无余量'));
  db.run('UPDATE room_type SET rest=rest-1 WHERE type_id=?', [o.room_type_id]);
  db.run('UPDATE order_info SET order_status=1,update_time=? WHERE order_id=?', [now(), id]);
  return res.json(ok(1000));
});

/* ==================== 后台管理（需登录） ==================== */

/* ---------- 订单管理 /op/order ---------- */
api.get('/op/order', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM order_info ORDER BY order_id DESC'))));
api.get('/op/order/count', needOp, (req, res) => res.json(ok(db.scalar('SELECT COUNT(*) AS n FROM order_info'))));
api.get('/op/order/user/:userId', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM order_info WHERE user_id=? ORDER BY order_id DESC', [num(req.params.userId)]))));
api.get('/op/order/withNameAndPhone', needOp, (req, res) =>
  res.json(ok(db.get('SELECT * FROM order_info WHERE name=? AND phone=? AND order_status=1 ORDER BY order_id DESC LIMIT 1',
    [req.query.name, req.query.phone]))));
api.get('/op/order/add', needOp, addOrderLogic);
api.post('/op/order/add', needOp, addOrderLogic);
api.get('/op/order/delete', needOp, (req, res) => {
  db.run('DELETE FROM order_info WHERE order_id=?', [num(req.query.orderId)]); return res.json(ok('删除成功.'));
});
api.get('/op/order/update', needOp, (req, res) => {
  const b = req.query;
  db.run(`UPDATE order_info SET order_type_id=?,order_type=?,user_id=?,name=?,phone=?,room_type_id=?,room_type=?,order_date=?,order_days=?,order_cost=?,update_time=? WHERE order_id=?`,
    [num(b.orderTypeId), b.orderType || '', num(b.userId), b.name || '', b.phone || '', num(b.roomTypeId), b.roomType || '',
     fmtDate(b.orderDate), num(b.orderDays), num(b.orderCost), now(), num(b.orderId)]);
  return res.json(ok('修改成功.'));
});
api.post('/op/order/update', needOp, (req, res) => {
  const b = req.body;
  db.run(`UPDATE order_info SET order_type_id=?,order_type=?,user_id=?,name=?,phone=?,room_type_id=?,room_type=?,order_date=?,order_days=?,order_cost=?,update_time=? WHERE order_id=?`,
    [num(b.orderTypeId), b.orderType || '', num(b.userId), b.name || '', b.phone || '', num(b.roomTypeId), b.roomType || '',
     fmtDate(b.orderDate), num(b.orderDays), num(b.orderCost), now(), num(b.orderId)]);
  return res.json(ok('修改成功.'));
});
api.post('/op/order/pay', needOp, (req, res) => {
  const id = num(req.body.orderId);
  const o = db.get('SELECT * FROM order_info WHERE order_id=?', [id]);
  if (!o || o.order_status !== 0) return res.json(fail('订单状态不允许支付'));
  const rt = db.get('SELECT rest FROM room_type WHERE type_id=?', [o.room_type_id]);
  if (rt && rt.rest > 0) db.run('UPDATE room_type SET rest=rest-1 WHERE type_id=?', [o.room_type_id]);
  db.run('UPDATE order_info SET order_status=1,update_time=? WHERE order_id=?', [now(), id]);
  return res.json(ok('支付成功.'));
});
api.get('/op/order/cancel', needOp, (req, res) => {
  const id = num(req.query.orderId);
  db.run('UPDATE order_info SET order_status=-1,update_time=? WHERE order_id=?', [now(), id]);
  db.run('UPDATE room_type SET rest=rest+1 WHERE type_id=?', [db.get('SELECT room_type_id FROM order_info WHERE order_id=?', [id])?.room_type_id]);
  return res.json(ok('取消成功.'));
});
api.get('/op/order/overtime', needOp, (req, res) => {
  db.run('UPDATE order_info SET order_status=-2,update_time=? WHERE order_id=?', [now(), num(req.query.orderId)]);
  res.json(1);
});
// 参数路由放最后，避免吞掉上面具名路径
api.get('/op/order/:orderId', needOp, (req, res) => res.json(ok(db.get('SELECT * FROM order_info WHERE order_id=?', [num(req.params.orderId)]))));

/* ---------- 入住管理 /op/check-in ---------- */
api.get('/op/check-in', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM check_in ORDER BY check_in_id DESC'))));
api.get('/op/check-in/in', needOp, doCheckIn);
api.post('/op/check-in/in', needOp, doCheckIn);
function doCheckIn(req, res) {
  const b = req.body && req.body.orderId !== undefined ? req.body : req.query;
  const o = db.get('SELECT * FROM order_info WHERE order_id=?', [num(b.orderId)]);
  if (!o) return res.json(fail('订单不存在'));
  // 找一间该房型空闲房间
  const room = db.get('SELECT * FROM room_info WHERE type_id=? AND room_status=1 ORDER BY room_id LIMIT 1', [o.room_type_id]);
  if (!room) return res.json(fail('没有可用的空闲房间'));
  db.run('UPDATE room_info SET room_status=3,update_time=? WHERE room_id=?', [now(), room.room_id]);
  db.run('UPDATE room_type SET rest=rest-1 WHERE type_id=?', [o.room_type_id]);
  db.run('UPDATE order_info SET order_status=2,update_time=? WHERE order_id=?', [now(), o.order_id]);
  db.run(`INSERT INTO check_in(order_id,room_id,room_number,peo_count,persons,ids,check_in_time,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?)`,
    [o.order_id, room.room_id, room.room_number, num(b.peoCount) || 1, b.persons || o.name, b.ids || '', now(), now(), now()]);
  return res.json(ok(room));
}
api.get('/op/check-in/out', needOp, (req, res) => {
  const rn = req.query.roomNumber;
  const room = db.get('SELECT * FROM room_info WHERE room_number=?', [rn]);
  if (!room) return res.json(fail('退房失败'));
  db.run('UPDATE room_info SET room_status=1,update_time=? WHERE room_id=?', [now(), room.room_id]);
  db.run('UPDATE room_type SET rest=rest+1 WHERE type_id=?', [room.type_id]);
  db.run("UPDATE check_in SET check_out_time=? WHERE room_number=? AND (check_out_time IS NULL OR check_out_time='') ORDER BY check_in_id DESC LIMIT 1", [now(), rn]);
  return res.json(ok('退房成功'));
});
api.get('/op/check-in/delete', needOp, (req, res) => {
  const r = db.run('DELETE FROM check_in WHERE check_in_id=?', [num(req.query.checkId)]);
  return r >= 1 ? res.json(ok('删除成功')) : res.json(fail('删除失败'));
});
api.get('/op/check-in/update', needOp, doCheckInUpdate);
api.post('/op/check-in/update', needOp, doCheckInUpdate);
function doCheckInUpdate(req, res) {
  const b = req.body && req.body.checkId !== undefined ? req.body : req.query;
  const r = db.run('UPDATE check_in SET room_number=?,update_time=? WHERE check_in_id=?', [b.roomNumber, now(), num(b.checkId)]);
  return r >= 1 ? res.json(ok('更新成功')) : res.json(fail('更新失败'));
}
api.get('/op/check-in/:checkId', needOp, (req, res) => res.json(ok(db.get('SELECT * FROM check_in WHERE check_in_id=?', [num(req.params.checkId)]))));

/* ---------- 房间管理 /op/room ---------- */
api.get('/op/room', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM room_info ORDER BY room_id'))));
api.get('/op/room/type/:typeId', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM room_info WHERE type_id=?', [num(req.params.typeId)]))));
api.get('/op/room/status/:statusId', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM room_info WHERE room_status=?', [num(req.params.statusId)]))));
api.get('/op/room/add', needOp, doRoomAdd);
api.post('/op/room/add', needOp, doRoomAdd);
function doRoomAdd(req, res) {
  const b = req.body && req.body.roomNumber !== undefined ? req.body : req.query;
  if (db.get('SELECT * FROM room_info WHERE room_number=?', [b.roomNumber])) return res.json(fail('房间号码重复'));
  try {
    db.run('INSERT INTO room_info(room_number,type_id,room_type,room_price,room_discount,room_status,remark,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?)',
      [b.roomNumber, num(b.typeId), b.roomType || '', num(b.roomPrice) || 0, num(b.roomDiscount) || 0, num(b.roomStatus) || 1, b.remark || '', now(), now()]);
    db.run('UPDATE room_type SET rest=rest+1 WHERE type_id=?', [num(b.typeId)]);
    return res.json(ok('添加成功'));
  } catch (e) { return res.json(fail('添加失败')); }
}
api.get('/op/room/delete/:roomId', needOp, (req, res) => {
  db.run('DELETE FROM room_info WHERE room_id=?', [num(req.params.roomId)]); return res.json(ok('删除成功'));
});
api.post('/op/room/delete/:roomId', needOp, (req, res) => {
  db.run('DELETE FROM room_info WHERE room_id=?', [num(req.params.roomId)]); return res.json(ok('删除成功'));
});
api.get('/op/room/update', needOp, doRoomUpdate);
api.post('/op/room/update', needOp, doRoomUpdate);
function doRoomUpdate(req, res) {
  const b = req.body && req.body.roomId !== undefined ? req.body : req.query;
  db.run('UPDATE room_info SET room_number=?,type_id=?,room_type=?,room_price=?,room_discount=?,room_status=?,remark=?,update_time=? WHERE room_id=?',
    [b.roomNumber, num(b.typeId), b.roomType || '', num(b.roomPrice) || 0, num(b.roomDiscount) || 0, num(b.roomStatus), b.remark || '', now(), num(b.roomId)]);
  return res.json(ok('更新成功'));
}
api.get('/op/room/:id', needOp, (req, res) => res.json(ok(db.get('SELECT * FROM room_info WHERE room_id=?', [num(req.params.id)]))));

/* ---------- 房型管理 /op/room-type ---------- */
api.get('/op/room-type', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM room_type ORDER BY type_id'))));
api.get('/op/room-type/rest', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM room_type WHERE rest > 0'))));
api.get('/op/room-type/add', needOp, doRoomTypeAdd);
api.post('/op/room-type/add', needOp, doRoomTypeAdd);
function doRoomTypeAdd(req, res) {
  const b = req.body && req.body.roomType !== undefined ? req.body : req.query;
  try {
    db.run(`INSERT INTO room_type(room_type,remark,price,discount,area,bed_num,bed_size,\`window\`,rest,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [b.roomType, b.remark || '', num(b.price) || 0, num(b.discount) || 0, num(b.area) || 12, num(b.bedNum) || 1,
       b.bedSize || '1.5m*1.8m', num(b.window) || 0, num(b.rest) || 0, now(), now()]);
    return res.json(ok('添加成功'));
  } catch (e) { return res.json(fail('添加失败')); }
}
api.get('/op/room-type/update', needOp, doRoomTypeUpdate);
api.post('/op/room-type/update', needOp, doRoomTypeUpdate);
function doRoomTypeUpdate(req, res) {
  const b = req.body && req.body.typeId !== undefined ? req.body : req.query;
  db.run(`UPDATE room_type SET room_type=?,remark=?,price=?,discount=?,area=?,bed_num=?,bed_size=,\`window\`=?,rest=?,update_time=? WHERE type_id=?`,
    [b.roomType, b.remark || '', num(b.price) || 0, num(b.discount) || 0, num(b.area), num(b.bedNum), b.bedSize,
     num(b.window), num(b.rest), now(), num(b.typeId)]);
  return res.json(ok('修改成功'));
}
api.post('/op/room-type/delete/:typeId', needOp, (req, res) => {
  db.run('DELETE FROM room_type WHERE type_id=?', [num(req.params.typeId)]); return res.json(ok('删除成功'));
});
api.get('/op/room-type/:typeId', needOp, (req, res) => res.json(ok(db.get('SELECT * FROM room_type WHERE type_id=?', [num(req.params.typeId)]))));

/* ---------- 预订方式 /op/order-type ---------- */
api.get('/op/order-type', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM order_type ORDER BY type_id'))));
api.get('/op/order-type/add', needOp, doOrderTypeAdd);
api.post('/op/order-type/add', needOp, doOrderTypeAdd);
function doOrderTypeAdd(req, res) {
  const b = req.body && req.body.type !== undefined ? req.body : req.query;
  db.run('INSERT INTO order_type(type,remark,create_time,update_time) VALUES(?,?,?,?)', [b.type, b.remark || '', now(), now()]);
  return res.json(ok(1));
}
api.get('/op/order-type/update', needOp, doOrderTypeUpdate);
api.post('/op/order-type/update', needOp, doOrderTypeUpdate);
function doOrderTypeUpdate(req, res) {
  const b = req.body && req.body.typeId !== undefined ? req.body : req.query;
  db.run('UPDATE order_type SET type=?,remark=?,update_time=? WHERE type_id=?', [b.type, b.remark || '', now(), num(b.typeId)]);
  return res.json(ok(1));
}
api.get('/op/order-type/delete/:typeId', needOp, (req, res) => {
  db.run('DELETE FROM order_type WHERE type_id=?', [num(req.params.typeId)]); return res.json(ok(1));
});
api.get('/op/order-type/:typeId', needOp, (req, res) => res.json(ok(db.get('SELECT * FROM order_type WHERE type_id=?', [num(req.params.typeId)]))));

/* ---------- 客户管理 /op/user ---------- */
api.get('/op/user', needOp, (req, res) => res.json(ok(db.all('SELECT * FROM user_info ORDER BY user_id'))));
api.get('/op/user/count', needOp, (req, res) => res.json(ok(db.scalar('SELECT COUNT(*) AS n FROM user_info'))));
api.get('/op/user/username/:username', needOp, (req, res) => {
  const u = db.get('SELECT * FROM user_info WHERE username=?', [req.params.username]);
  if (u) delete u.password; return res.json(ok(u));
});
api.post('/op/user/add', needOp, (req, res) => {
  const b = req.body;
  try {
    db.run('INSERT INTO user_info(username,password,name,gender,phone,email,address,idcard,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [b.username, MD5(b.password), b.name || '', b.gender || '男', b.phone || '', b.email || '', b.address || '', b.idcard || '', now(), now()]);
    return res.json(ok());
  } catch (e) { return res.json(fail()); }
});
api.post('/op/user/update', needOp, (req, res) => {
  const b = req.body;
  db.run('UPDATE user_info SET name=?,gender=?,phone=?,email=?,address=?,idcard=?,update_time=? WHERE user_id=?',
    [b.name || '', b.gender || '', b.phone || '', b.email || '', b.address || '', b.idcard || '', now(), num(b.userId)]);
  return res.json(ok('修改成功'));
});
api.post('/op/user/updatePassword', needOp, (req, res) => {
  const b = req.body;
  const u = db.get("SELECT * FROM user_info WHERE username=? AND password IN (?,?)", [b.username, MD5(b.oldPassword), b.oldPassword]);
  if (!u) return res.json(fail('密码不对'));
  db.run('UPDATE user_info SET password=?,update_time=? WHERE user_id=?', [MD5(b.newPassword), now(), u.user_id]);
  return res.json(ok('修改成功'));
});
api.get('/op/user/delete/:userId', needOp, (req, res) => {
  const r = db.run('DELETE FROM user_info WHERE user_id=?', [num(req.params.userId)]);
  return r >= 1 ? res.json(ok()) : res.json(fail());
});
api.get('/op/user/:userId', needOp, (req, res) => {
  const u = db.get('SELECT * FROM user_info WHERE user_id=?', [num(req.params.userId)]);
  if (u) delete u.password; return res.json(ok(u));
});

/* ---------- 酒店设置 /op/hotel ---------- */
api.get('/op/hotel/update', needOp, doHotelUpdate);
api.post('/op/hotel/update', needOp, doHotelUpdate);
function doHotelUpdate(req, res) {
  const b = req.body && req.body.hotelId !== undefined ? req.body : req.query;
  db.run('UPDATE hotel_info SET hotel_name=?,phone=?,telephone=?,email=?,address=?,website=?,update_time=? WHERE hotel_id=?',
    [b.hotelName, b.phone || '', b.telephone || '', b.email || '', b.address || '', b.website || '', now(), num(b.hotelId)]);
  return res.json(ok('修改成功'));
}

/* ---------- 员工管理 /admin/operator（仅管理员） ---------- */
api.get('/admin/operator', needAdmin, (req, res) => res.json(ok(db.all("SELECT * FROM worker_info WHERE role='operator' ORDER BY worker_id"))));
api.post('/admin/operator/add', needAdmin, (req, res) => {
  const b = req.body;
  try {
    db.run('INSERT INTO worker_info(role,username,password,name,gender,phone,email,address,create_time,update_time) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ['operator', b.username, MD5(b.password), b.name || '', b.gender || '男', b.phone || '', b.email || '', b.address || '', now(), now()]);
    return res.json(ok('添加成功'));
  } catch (e) { return res.json(fail('添加失败')); }
});
api.post('/admin/operator/update', needAdmin, (req, res) => {
  const b = req.body;
  db.run('UPDATE worker_info SET name=?,gender=?,phone=?,email=?,address=?,update_time=? WHERE worker_id=?',
    [b.name || '', b.gender || '', b.phone || '', b.email || '', b.address || '', now(), num(b.workerId)]);
  return res.json(ok('更新成功'));
});
api.post('/admin/operator/delete/:workerId', needAdmin, (req, res) => {
  db.run('DELETE FROM worker_info WHERE worker_id=?', [num(req.params.workerId)]); return res.json(ok('删除成功'));
});
api.post('/admin/operator/:workerId', needAdmin, (req, res) => res.json(ok(db.get('SELECT * FROM worker_info WHERE worker_id=?', [num(req.params.workerId)]))));

// 挂载所有接口（保留 /ho-api 前缀，前端 api.js 无需大改）
app.use(PREFIX, api);

// ---------- 静态资源：官网 + 后台 ----------
// 发布平台网关要求「每个请求」都带 sharecode，否则 403。
// API 请求由前端 api.js 自动附加；这里在服务端把 HTML/CSS 内的
// 静态资源 URL（link/script/img/background url）也自动补上 sharecode，
// 这样浏览器自动发出的图片/样式/脚本请求就能正常通过网关。
const FALLBACK_SHARECODE = '6LUFZKGP7I';
function injectSharecode(text, sc) {
  if (!sc) return text;
  function add(url) {
    if (!url || /^(#|https?:|\/\/|data:|javascript:|mailto:|tel:)/i.test(url)) return url;
    if (url.indexOf('sharecode=') >= 0) return url;
    return url + (url.indexOf('?') >= 0 ? (url.endsWith('?') || url.endsWith('&') ? '' : '&') : '?') + 'sharecode=' + encodeURIComponent(sc);
  }
  // src="..." / href="..."
  text = text.replace(/(\b(?:src|href)\s*=\s*)(['"])(.*?)\2/gi,
    (m, pre, q, url) => pre + q + add(url) + q);
  // CSS/内联样式里的 url(...)
  text = text.replace(/(\burl\s*\(\s*)(['"]?)([^'")]+)\2(\s*\))/gi,
    (m, pre, q, url, end) => pre + q + add(url) + q + end);
  return text;
}
// 拦截 HTML 与 CSS，注入分享码后再交给浏览器；其余静态文件走 express.static
app.use((req, res, next) => {
  let rel = req.path;
  if (rel === '/' || rel === '') rel = '/index.html';
  else if (rel === '/admin' || rel === '/admin/') rel = '/admin/index.html';
  if (!/\.(html|css)$/i.test(rel)) return next();
  const clean = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(__dirname, 'public', clean);
  if (!file.startsWith(path.join(__dirname, 'public'))) return next();
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
  const sc = req.query.sharecode || FALLBACK_SHARECODE;
  try {
    const body = fs.readFileSync(file, 'utf8');
    res.type(/\.css$/i.test(file) ? 'css' : 'html').send(injectSharecode(body, sc));
  } catch (e) { next(); }
});
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 启动 ----------
(async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`和悦酒店全栈服务已启动: http://localhost:${PORT}`);
    console.log(`接口前缀: ${PREFIX}`);
  });
})();
