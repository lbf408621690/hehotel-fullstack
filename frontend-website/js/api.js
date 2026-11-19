/* ============================================================
   API 封装 · 对接 Spring Boot 后端 http://localhost:8080/ho-api
   统一返回格式 { code, message, data }，成功 code = 1000
   ============================================================ */
const API = (function () {
  // 跟随页面域名，保证登录 Cookie 与接口同源（127.0.0.1 或 localhost 均可）
  const HOST = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? location.hostname : 'localhost';
  const BASE = 'http://' + HOST + ':8080/ho-api';
  const SUCCESS = 1000, NOT_LOGIN = 1100;

  // GET 请求
  async function get(path) {
    const res = await fetch(BASE + path, { credentials: 'include' });
    return await res.json();
  }

  // POST 表单请求
  async function post(path, data) {
    const body = new URLSearchParams(data).toString();
    const res = await fetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body
    });
    return await res.json();
  }

  return {
    SUCCESS, NOT_LOGIN,
    // 酒店信息
    getHotel: () => get('/hotel'),
    // 房型
    getRooms: () => get('/hotel/room'),
    getRestRooms: () => get('/hotel/room/rest'),
    getRoom: (id) => get('/hotel/room/' + id),
    // 认证
    login: (username, password) => post('/login/user', { username, password }),
    adminLogin: (username, password) => post('/login/admin', { username, password }),
    register: (d) => post('/register/user', d),
    logout: () => post('/user/logout'),
    profile: () => get('/user/profile'),
    updateProfile: (d) => post('/user/update', d),
    updatePassword: (d) => post('/user/updatePassword', d),
    // 订单
    getOrders: (userId) => get('/user/order?userId=' + userId),
    getOrder: (id) => get('/user/order/' + id),
    addOrder: (d) => get('/user/order/add?' + new URLSearchParams(d).toString()),
    cancelOrder: (orderId) => get('/user/order/cancel?orderId=' + orderId),
    deleteOrder: (orderId) => get('/user/order/delete?orderId=' + orderId),
    payOrder: (d) => post('/user/order/pay', d),
    // 房型详情
    getRoom: (id) => get('/hotel/room/' + id)
  };
})();
