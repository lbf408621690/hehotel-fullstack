/* ============================================================
   后台 API 封装 · 对接 Spring Boot 后端 http://localhost:8080/ho-api
   覆盖全部 /op/** 与 /admin/** 后台接口
   ============================================================ */
const AdminAPI = (function () {
  // 跟随页面域名：页面在 127.0.0.1 就请求 127.0.0.1，在 localhost 就请求 localhost，保证 Cookie 同源
  const HOST = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? location.hostname : 'localhost';
  const BASE = 'http://' + HOST + ':8080/ho-api';
  const SUCCESS = 1000, NOT_LOGIN = 1100, PERMISSION_DENIED = 1002;

  async function req(path, method, data) {
    let url = BASE + path, opt = { method: method || 'GET', credentials: 'include' };
    if (method === 'POST') {
      opt.headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
      opt.body = new URLSearchParams(data || {}).toString();
    } else if (data && Object.keys(data).length) {
      url += '?' + new URLSearchParams(data).toString();
    }
    const res = await fetch(url, opt);
    return await res.json();
  }
  const get = (p, d) => req(p, 'GET', d);
  const post = (p, d) => req(p, 'POST', d);

  return {
    SUCCESS, NOT_LOGIN, PERMISSION_DENIED,
    // 登录
    login: (u, p) => post('/login/admin', { username: u, password: p }),
    logout: () => post('/user/logout'),
    // ===== 订单 /op/order =====
    orderList: () => get('/op/order'),
    orderCount: () => get('/op/order/count'),
    orderByUser: (userId) => get('/op/order/user/' + userId),
    orderById: (id) => get('/op/order/' + id),
    orderByNamePhone: (name, phone) => get('/op/order/withNameAndPhone', { name, phone }),
    orderAdd: (d) => get('/op/order/add', d),
    orderUpdate: (d) => get('/op/order/update', d),
    orderDelete: (orderId) => get('/op/order/delete', { orderId }),
    orderPay: (orderId) => post('/op/order/pay', { orderId }),
    orderCancel: (orderId) => get('/op/order/cancel', { orderId }),
    orderOvertime: (orderId) => get('/op/order/overtime', { orderId }),
    // ===== 入住 /op/check-in =====
    checkInList: () => get('/op/check-in'),
    checkInById: (id) => get('/op/check-in/' + id),
    checkInAdd: (d) => get('/op/check-in/in', d),
    checkOut: (roomNumber) => get('/op/check-in/out', { roomNumber }),
    checkInDelete: (checkId) => get('/op/check-in/delete', { checkId }),
    checkInUpdate: (d) => get('/op/check-in/update', d),
    // ===== 房间 /op/room =====
    roomList: () => get('/op/room'),
    roomById: (id) => get('/op/room/' + id),
    roomByType: (typeId) => get('/op/room/type/' + typeId),
    roomByStatus: (statusId) => get('/op/room/status/' + statusId),
    roomAdd: (d) => get('/op/room/add', d),
    roomUpdate: (d) => get('/op/room/update', d),
    roomDelete: (roomId) => post('/op/room/delete/' + roomId),
    // ===== 房型 /op/room-type =====
    roomTypeList: () => get('/op/room-type'),
    roomTypeRest: () => get('/op/room-type/rest'),
    roomTypeById: (id) => get('/op/room-type/' + id),
    roomTypeAdd: (d) => post('/op/room-type/add', d),
    roomTypeUpdate: (d) => post('/op/room-type/update', d),
    roomTypeDelete: (typeId) => post('/op/room-type/delete/' + typeId),
    // ===== 预订方式 /op/order-type =====
    orderTypeList: () => get('/op/order-type'),
    orderTypeById: (id) => get('/op/order-type/' + id),
    orderTypeAdd: (d) => get('/op/order-type/add', d),
    orderTypeUpdate: (d) => get('/op/order-type/update', d),
    orderTypeDelete: (typeId) => get('/op/order-type/delete/' + typeId),
    // ===== 用户 /op/user =====
    userList: () => get('/op/user'),
    userCount: () => get('/op/user/count'),
    userById: (id) => get('/op/user/' + id),
    userByUsername: (username) => get('/op/user/username/' + username),
    userAdd: (d) => post('/op/user/add', d),
    userUpdate: (d) => post('/op/user/update', d),
    userUpdatePassword: (d) => post('/op/user/updatePassword', d),
    userDelete: (userId) => get('/op/user/delete/' + userId),
    // ===== 员工 /admin/operator（仅 admin） =====
    operatorList: () => get('/admin/operator'),
    operatorById: (id) => post('/admin/operator/' + id),
    operatorAdd: (d) => post('/admin/operator/add', d),
    operatorUpdate: (d) => post('/admin/operator/update', d),
    operatorDelete: (workerId) => post('/admin/operator/delete/' + workerId),
    // ===== 酒店信息 /op/hotel + /hotel =====
    hotelInfo: () => get('/hotel'),
    hotelUpdate: (d) => get('/op/hotel/update', d)
  };
})();
