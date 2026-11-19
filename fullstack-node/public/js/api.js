/* ============================================================
   API 封装 · 全栈版（前端与 Express+SQLite 后端同源部署）
   统一返回格式 { code, message, data }，成功 code = 1000
   ============================================================ */
const API = (function () {
  // 同源相对路径：页面和接口由同一个 Express 服务提供
  const BASE = '/ho-api';
  const SUCCESS = 1000, NOT_LOGIN = 1100;

  // 发布平台分享码：网关要求每个请求 URL 都带 sharecode，否则返回 403
  function sharecode() {
    let sc = new URLSearchParams(location.search).get('sharecode');
    if (sc) { try { sessionStorage.setItem('_wb_sharecode', sc); } catch (e) {} return sc; }
    try { return sessionStorage.getItem('_wb_sharecode') || ''; } catch (e) { return ''; }
  }
  // 若跳转后 URL 丢了 sharecode，从本地恢复并补回地址栏，保证链接始终可分享
  (function restoreShare() {
    if (new URLSearchParams(location.search).get('sharecode')) return;
    let saved = ''; try { saved = sessionStorage.getItem('_wb_sharecode') || ''; } catch (e) {}
    if (saved && /^https?:$/.test(location.protocol)) {
      const u = new URL(location.href); u.searchParams.set('sharecode', saved);
      history.replaceState(null, '', u.toString());
    }
  })();
  function withShare(url) {
    const sc = sharecode();
    if (!sc) return url;
    const sep = url.indexOf('?') >= 0 ? (url.endsWith('?') || url.endsWith('&') ? '' : '&') : '?';
    return url + sep + 'sharecode=' + encodeURIComponent(sc);
  }

  // GET 请求
  async function get(path) {
    const res = await fetch(withShare(BASE + path), { credentials: 'include' });
    return await res.json();
  }

  // POST 表单请求
  async function post(path, data) {
    const body = new URLSearchParams(data).toString();
    const res = await fetch(withShare(BASE + path), {
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
