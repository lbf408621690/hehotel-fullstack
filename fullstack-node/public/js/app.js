/* ============================================================
   前端交互逻辑
   ============================================================ */
(function () {
  // 标记 JS 已成功加载：只有此时 CSS 才启用 reveal 隐藏动画。
  // 若本脚本因任何原因没跑到这行，图片保持默认可见，不会出现"整片空白"。
  document.documentElement.classList.add('js-ready');
  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));

  // 发布平台要求图片等静态请求也带 sharecode，否则被网关 403 拦截。
  // 房型图片是运行时拼接的，服务端改写 HTML 时看不到，这里单独补上。
  function asset(url) {
    let sc = new URLSearchParams(location.search).get('sharecode');
    if (!sc) { try { sc = sessionStorage.getItem('_wb_sharecode') || ''; } catch (e) {} }
    if (!sc) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(sc);
  }

  // 房型图片映射（后端 roomType -> 本地素材）
  const ROOM_IMG = {
    '单人房': 'room-single.jpg', '双床房': 'room-twin.jpg',
    '豪华大床房': 'room-deluxe.jpg', '大床房': 'room-view.jpg',
    '商务双床房': 'room-family.jpg', '豪华套房': 'room-suite.jpg',
    '豪华三床房': 'room-view.jpg'
  };
  const ROOM_EN = {
    '单人房': 'Single Room', '双床房': 'Twin Room',
    '豪华大床房': 'Deluxe King Room', '大床房': 'King Room',
    '商务双床房': 'Business Twin', '豪华套房': 'Luxury Suite',
    '豪华三床房': 'Triple Room'
  };
  const STATUS = {
    '-3': '已删除', '-2': '支付超时', '-1': '已取消',
    '0': '未付款', '1': '待入住', '2': '已入住'
  };

  let allRooms = [], hotelInfo = null, currentUser = null;

  /* ---------- 工具 ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function afterDays(n) {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function needLogin() {
    if (!currentUser) { toast('请先登录'); openModal('loginModal'); return false; }
    return true;
  }
  function fmtDate(s) { return s ? String(s).slice(0, 10) : '—'; }

  /* ---------- 模态框 ---------- */
  function openModal(id) { $('#' + id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(box) { box.classList.remove('open'); document.body.style.overflow = ''; }
  $$('.modal').forEach(m => {
    m.querySelector('.modal-mask').addEventListener('click', () => closeModal(m));
    m.querySelector('.modal-close').addEventListener('click', () => closeModal(m));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal.open').forEach(closeModal);
  });

  /* ---------- 导航 ---------- */
  function initHeader() {
    const header = $('#siteHeader');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 80);
    window.addEventListener('scroll', onScroll); onScroll();

    // 滚动高亮
    // 注意：员工登录链接的 href 是 "#"，直接 querySelector('#') 会抛异常，
    // 导致本函数后面的汉堡菜单等事件绑定全部无法执行。这里跳过非锚点链接。
    const links = $$('.main-nav a');
    const secs = links.map(a => {
      const href = a.getAttribute('href');
      return (href && href.length > 1 && href.charAt(0) === '#') ? $(href) : null;
    }).filter(Boolean);
    window.addEventListener('scroll', () => {
      let idx = 0;
      secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= 180) idx = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === idx));
    });

    $('#menuBtn').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
    $$('.main-nav a').forEach(a => a.addEventListener('click', () => $('#mainNav').classList.remove('open')));
    $('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    $('#consultBtn').addEventListener('click', () => {
      const phone = hotelInfo ? hotelInfo.phone : '18768866666';
      toast('礼宾热线：' + phone + '（24h 为您服务）');
    });
    $('#searchToggle').addEventListener('click', () => {
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => $('#checkIn').focus(), 600);
    });
  }

  /* ---------- 入场动画 ---------- */
  function initReveal() {
    const els = $$('.reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .12 });
    els.forEach(el => io.observe(el));
    // 兜底：IntersectionObserver 若因任何原因没触发，1.5 秒后强制全部显现，
    // 保证内容区图片绝不会一直透明。正常情况滚动仍走渐显动画。
    setTimeout(() => els.forEach(el => el.classList.add('in')), 1500);
  }

  /* ---------- 酒店信息 ---------- */
  async function loadHotel() {
    try {
      const r = await API.getHotel();
      if (r.code === API.SUCCESS && r.data && r.data[0]) {
        hotelInfo = r.data[0];
        $('#ftAddress').textContent = hotelInfo.address || '—';
        $('#ftPhone').textContent = hotelInfo.phone || '—';
        $('#ftEmail').textContent = hotelInfo.email || '—';
        $('#ftWebsite').textContent = hotelInfo.website || '—';
      }
    } catch (e) { console.warn('酒店信息加载失败（后端未启动？）', e); }
  }

  /* ---------- 房型 ---------- */
  function roomCard(x) {
    const img = ROOM_IMG[x.roomType] || 'room-suite.jpg';
    const en = ROOM_EN[x.roomType] || 'Grand Room';
    const rest = x.rest || 0;
    return `<article class="room-card">
      <div class="rc-img">
        <img src="${asset('images/' + img)}" alt="${x.roomType}">
        <span class="rc-tag">臻选房型</span>
        <span class="rc-rest ${rest > 0 ? '' : 'none'}">${rest > 0 ? '仅剩 ' + rest + ' 间' : '暂无空房'}</span>
      </div>
      <div class="rc-body">
        <h3 class="rc-name">${x.roomType}</h3>
        <p class="rc-en">${en}</p>
        <div class="rc-meta">
          <span><i>▢</i>${x.area || '—'} ㎡</span>
          <span><i>▤</i>${x.bedNum || '—'} 张床</span>
          <span><i>◫</i>${x.bedSize || '—'} 米</span>
          <span><i>☼</i>${x.window ? '有窗' : '无窗'}</span>
        </div>
        <div class="rc-bottom">
          <div class="rc-price"><b><small>¥</small>${x.price}</b><span>/ 晚起</span></div>
          <div class="rc-btns"><button class="rc-detail" data-detail-room="${x.typeId}">详情</button><button class="rc-book" data-id="${x.typeId}" ${rest > 0 ? '' : 'disabled'}>${rest > 0 ? '预订' : '已满'}</button></div>
        </div>
      </div>
    </article>`;
  }

  function renderRooms(list) {
    const grid = $('#roomGrid');
    if (!list || !list.length) { grid.innerHTML = '<div class="loading">暂无房型数据</div>'; return; }
    grid.innerHTML = list.map(roomCard).join('');
    $$('.rc-book', grid).forEach(btn => btn.addEventListener('click', () => {
      const room = allRooms.find(r => r.typeId == btn.dataset.id);
      if (room) openBookModal(room);
    }));
    $$('.rc-detail', grid).forEach(btn => btn.addEventListener('click', async () => {
      try {
        const r = await API.getRoom(btn.dataset.detailRoom);
        if (r.code === API.SUCCESS && r.data) {
          const x = r.data;
          alert(`房型详情 · ${x.roomType}\n\n面积：${x.area || '—'} ㎡\n床位：${x.bedNum || '—'} 张（${x.bedSize || '—'} 米）\n窗户：${x.window ? '有窗' : '无窗'}\n价格：¥${x.price} / 晚\n剩余：${x.rest || 0} 间\n\n${x.remark || ''}`);
        } else { toast(r.message || '加载详情失败'); }
      } catch (e) { toast('加载详情失败'); }
    }));
  }

  function renderTabs() {
    const types = Array.from(new Set(allRooms.map(r => r.roomType)));
    $('#roomTabs').innerHTML = ['全部房型'].concat(types).map((t, i) =>
      `<button class="room-tab ${i === 0 ? 'active' : ''}" data-type="${t}">${t}</button>`).join('');
    $$('.room-tab').forEach(tab => tab.addEventListener('click', () => {
      $$('.room-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const t = tab.dataset.type;
      renderRooms(t === '全部房型' ? allRooms : allRooms.filter(r => r.roomType === t));
    }));
  }

  async function loadRooms() {
    try {
      const r = await API.getRooms();
      if (r.code === API.SUCCESS && r.data) {
        allRooms = r.data;
        renderTabs(); renderRooms(allRooms);
        $('#statRooms').textContent = allRooms.length;
        const sel = $('#roomFilter');
        Array.from(new Set(allRooms.map(x => x.roomType))).forEach(t => {
          const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
        });
      } else {
        $('#roomGrid').innerHTML = '<div class="loading">房型加载失败：' + (r.message || '未知错误') + '</div>';
      }
    } catch (e) {
      $('#roomGrid').innerHTML = '<div class="loading">无法连接后端服务，请确认 http://localhost:8080 已启动</div>';
    }
  }

  /* ---------- 查询空房 ---------- */
  function initSearch() {
    $('#checkIn').value = today();
    $('#checkOut').value = afterDays(1);
    $('#searchRooms').addEventListener('click', async () => {
      const type = $('#roomFilter').value;
      try {
        const r = await API.getRestRooms();
        let list = (r.code === API.SUCCESS && r.data) ? r.data : allRooms.filter(x => x.rest > 0);
        if (type !== 'all') list = list.filter(x => x.roomType === type);
        renderRooms(list);
        document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' });
        toast('已为您筛选出 ' + list.length + ' 种可订房型');
      } catch (e) { toast('查询失败，请稍后再试'); }
    });
  }

  /* ---------- 预订 ---------- */
  let bookRoom = null;
  function openBookModal(room) {
    if (!needLogin()) return;
    bookRoom = room;
    $('#bookRoomName').textContent = room.roomType + ' · ' + (ROOM_EN[room.roomType] || 'Grand Room');
    $('#bkRoomType').value = room.roomType + '（' + room.price + ' 元/晚）';
    $('#bkName').value = currentUser.name || '';
    $('#bkPhone').value = currentUser.phone || '';
    $('#bkDate').value = $('#checkIn').value || today();
    $('#bkDays').value = 1;
    updateCost();
    $('#bookMsg').textContent = '';
    openModal('bookModal');
  }
  function updateCost() {
    if (!bookRoom) return;
    const days = Math.max(1, parseInt($('#bkDays').value) || 1);
    $('#bkCost').textContent = '¥ ' + (bookRoom.price * days).toFixed(2);
  }
  $('#bkDays').addEventListener('input', updateCost);

  $('#bookForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('#bookMsg');
    const days = Math.max(1, parseInt(f.orderDays.value) || 1);
    const d = {
      orderTypeId: 2, orderType: '官网预订',
      userId: currentUser.userId,
      name: f.name.value.trim(), phone: f.phone.value.trim(),
      roomTypeId: bookRoom.typeId, roomType: bookRoom.roomType,
      orderDate: f.orderDate.value, orderDays: days,
      orderCost: (bookRoom.price * days).toFixed(2)
    };
    msg.className = 'form-msg'; msg.textContent = '正在提交…';
    try {
      const r = await API.addOrder(d);
      if (r.code === API.SUCCESS) {
        toast('预订成功！订单已生成');
        closeModal($('#bookModal'));
        loadOrders();
      } else { msg.textContent = '预订失败：' + r.message; }
    } catch (err) { msg.textContent = '网络错误，请稍后再试'; }
  });

  /* ---------- 登录 / 注册 ---------- */
  $('#loginBtn').addEventListener('click', () => openModal('loginModal'));
  $('#registerBtn').addEventListener('click', () => openModal('registerModal'));
  $('#toRegister').addEventListener('click', () => { closeModal($('#loginModal')); openModal('registerModal'); });
  $('#toLogin').addEventListener('click', () => { closeModal($('#registerModal')); openModal('loginModal'); });
  // 员工入口：官网内弹出员工登录框（导航栏 + 登录弹窗底部）
  function openStaffLogin() { closeModal($('#loginModal')); openModal('staffLoginModal'); }
  $('#staffLoginBtn').addEventListener('click', openStaffLogin);
  $('#toAdminLogin').addEventListener('click', openStaffLogin);
  if ($('#staffLoginBtnM')) $('#staffLoginBtnM').addEventListener('click', e => { e.preventDefault(); openStaffLogin(); });
  $('#staffBackSite').addEventListener('click', () => closeModal($('#staffLoginModal')));

  $('#staffLoginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#staffLoginMsg'); msg.className = 'form-msg'; msg.textContent = '登录中…';
    try {
      const u = $('#staffUser').value.trim(), p = $('#staffPass').value;
      const r = await API.adminLogin(u, p);
      if (r.code === API.SUCCESS) {
        msg.className = 'form-msg ok'; msg.textContent = '登录成功，正在进入管理后台…';
        setTimeout(() => { window.location.href = 'admin/index.html'; }, 400);
      } else { msg.textContent = r.message || '账号或密码错误'; }
    } catch (err) { msg.textContent = '无法连接服务器，请确认后端已启动'; }
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#loginMsg'); msg.className = 'form-msg'; msg.textContent = '登录中…';
    try {
      const r = await API.login($('#lgUser').value.trim(), $('#lgPass').value);
      if (r.code === API.SUCCESS) {
        currentUser = { userId: r.data.userId, username: $('#lgUser').value.trim() };
        try { const p = await API.profile(); if (p.code === API.SUCCESS) currentUser = p.data; } catch (e) {}
        updateUserArea();
        toast('登录成功，欢迎回来');
        closeModal($('#loginModal'));
      } else { msg.textContent = r.message || '登录失败'; }
    } catch (err) { msg.textContent = '无法连接服务器，请确认后端已启动'; }
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('#registerMsg');
    const d = {};
    Array.from(new FormData(f).entries()).forEach(([k, v]) => d[k] = v);
    msg.className = 'form-msg'; msg.textContent = '注册中…';
    try {
      const r = await API.register(d);
      if (r.code === API.SUCCESS) {
        toast('注册成功，请登录');
        closeModal($('#registerModal'));
        $('#lgUser').value = d.username;
        openModal('loginModal');
      } else { msg.textContent = r.message || '注册失败'; }
    } catch (err) { msg.textContent = '网络错误，请稍后再试'; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await API.logout(); } catch (e) {}
    currentUser = null; updateUserArea();
    closeModal($('#profileModal'));
    toast('已退出登录');
  });

  function updateUserArea() {
    const box = $('#userArea');
    if (currentUser) {
      box.innerHTML = `<button class="link-btn" id="ordersBtn">我的订单</button><span class="sep">/</span>` +
        `<button class="link-btn" id="profileBtn">${(currentUser.name || currentUser.username)}</button>` +
        `<span class="sep sep-staff">|</span><button class="link-btn staff-entry" id="staffLoginBtn">员工登录</button>`;
      $('#ordersBtn').addEventListener('click', () => { openModal('ordersModal'); loadOrders(); });
      $('#profileBtn').addEventListener('click', () => { openModal('profileModal'); loadProfile(); });
    } else {
      box.innerHTML = `<button class="link-btn" id="loginBtn">登录</button><span class="sep">/</span>` +
        `<button class="link-btn" id="registerBtn">注册</button>` +
        `<span class="sep sep-staff">|</span><button class="link-btn staff-entry" id="staffLoginBtn">员工登录</button>`;
      $('#loginBtn').addEventListener('click', () => openModal('loginModal'));
      $('#registerBtn').addEventListener('click', () => openModal('registerModal'));
    }
    // 重建后重新绑定员工入口（用事件委托的兜底：每次都绑定当前节点）
    $('#staffLoginBtn').addEventListener('click', openStaffLogin);
  }

  /* ---------- 订单 ---------- */
  async function loadOrders() {
    if (!needLogin()) return;
    const box = $('#ordersList'); box.innerHTML = '<div class="loading">加载中…</div>';
    try {
      const r = await API.getOrders(currentUser.userId);
      if (r.code === API.SUCCESS && r.data) {
        if (!r.data.length) { box.innerHTML = '<div class="loading">您还没有订单，快去预订一段美好旅程吧</div>'; return; }
        box.innerHTML = r.data.map(o => {
          const st = String(o.orderStatus);
          const canCancel = ['-1', '-2', '-3', '2'].indexOf(st) === -1 && st === '-1' ? false : ['0'].indexOf(st) > -1;
          return `<div class="order-item">
            <div class="oi-top"><span class="oi-no">订单号 · ${o.orderId}</span>
              <span class="oi-status st${st}">${STATUS[st] || '未知'}</span></div>
            <div class="oi-main">
              <div><small>房型</small><b>${o.roomType}</b></div>
              <div><small>入住日期</small><b>${fmtDate(o.orderDate)}</b></div>
              <div><small>天数 / 金额</small><b>${o.orderDays} 晚 · ¥${o.orderCost}</b></div>
            </div>
            <div class="oi-foot"><span class="oi-cost">¥ ${o.orderCost}</span>
              <div class="oi-acts">
                <button data-detail="${o.orderId}">详情</button>
                ${st === '0' ? `<button data-pay="${o.orderId}">支付</button><button class="danger" data-cancel="${o.orderId}">取消</button>` : ''}
                <button class="danger" data-del="${o.orderId}">删除</button>
              </div>
            </div>
          </div>`;
        }).join('');
        $$('[data-cancel]', box).forEach(b => b.addEventListener('click', async () => {
          if (!confirm('确定取消该订单？')) return;
          const r = await API.cancelOrder(b.dataset.cancel);
          toast(r.code === API.SUCCESS ? '订单已取消' : '取消失败');
          loadOrders();
        }));
        $$('[data-detail]', box).forEach(b => b.addEventListener('click', async () => {
          const r = await API.getOrder(b.dataset.detail);
          if (r.code === API.SUCCESS && r.data) {
            const o = r.data;
            alert(`订单详情 #${o.orderId}\n\n房型：${o.roomType}\n入住人：${o.name}\n手机号：${o.phone}\n入住日期：${fmtDate(o.orderDate)}\n天数：${o.orderDays} 晚\n金额：¥${o.orderCost}\n状态：${STATUS[String(o.orderStatus)] || '未知'}\n下单时间：${fmtDate(o.createTime)}`);
          } else { toast(r.message || '加载详情失败'); }
        }));
        $$('[data-pay]', box).forEach(b => b.addEventListener('click', async () => {
          const username = currentUser.username;
          const pass = prompt('请输入账户密码以确认支付：');
          if (!pass) return;
          const r = await API.payOrder({ orderId: b.dataset.pay, username, password: pass });
          toast(r.code === API.SUCCESS ? '支付成功' : (r.message || '支付失败'));
          loadOrders();
        }));
        $$('[data-del]', box).forEach(b => b.addEventListener('click', async () => {
          if (!confirm('确定删除订单 ' + b.dataset.del + '？此操作不可恢复。')) return;
          const r = await API.deleteOrder(b.dataset.del);
          toast(r.code === API.SUCCESS ? '订单已删除' : (r.message || '删除失败'));
          loadOrders();
        }));
      }
    } catch (e) { box.innerHTML = '<div class="loading">订单加载失败</div>'; }
  }

  async function loadProfile() {
    const box = $('#profileBody'); box.innerHTML = '<div class="loading">加载中…</div>';
    try {
      const r = await API.profile();
      if (r.code === API.SUCCESS && r.data) {
        const u = r.data;
        $('#profileName').textContent = u.username || '';
        box.innerHTML = `
          <p><span>姓名</span><b>${u.name || '—'}</b></p>
          <p><span>用户名</span><b>${u.username || '—'}</b></p>
          <p><span>性别</span><b>${u.gender || '—'}</b></p>
          <p><span>手机</span><b>${u.phone || '—'}</b></p>
          <p><span>邮箱</span><b>${u.email || '—'}</b></p>
          <p><span>地址</span><b>${u.address || '—'}</b></p>
          <p><span>身份证</span><b>${u.idcard || '—'}</b></p>
          <div class="profile-actions">
            <button class="btn btn-outline" id="editProfileBtn">编辑资料</button>
            <button class="btn btn-outline" id="changePwdBtn">修改密码</button>
          </div>
          <div id="profileEditArea"></div>`;
        $('#editProfileBtn').addEventListener('click', () => showProfileEdit(u));
        $('#changePwdBtn').addEventListener('click', showChangePwd);
      }
    } catch (e) { box.innerHTML = '<div class="loading">加载失败</div>'; }
  }

  function showProfileEdit(u) {
    const area = $('#profileEditArea');
    area.innerHTML = `<div class="edit-form">
      <label>姓名</label><input id="efName" value="${u.name || ''}">
      <label>性别</label><select id="efGender"><option ${u.gender === '男' ? 'selected' : ''}>男</option><option ${u.gender === '女' ? 'selected' : ''}>女</option></select>
      <label>手机</label><input id="efPhone" value="${u.phone || ''}">
      <label>邮箱</label><input id="efEmail" value="${u.email || ''}">
      <label>地址</label><input id="efAddress" value="${u.address || ''}">
      <label>身份证</label><input id="efIdcard" value="${u.idcard || ''}">
      <div class="form-msg" id="efMsg"></div>
      <button class="btn btn-dark block" id="efSave">保存修改</button>
    </div>`;
    $('#efSave').addEventListener('click', async () => {
      const d = { userId: u.userId, name: $('#efName').value.trim(), gender: $('#efGender').value,
        phone: $('#efPhone').value.trim(), email: $('#efEmail').value.trim(),
        address: $('#efAddress').value.trim(), idcard: $('#efIdcard').value.trim() };
      const r = await API.updateProfile(d);
      toast(r.code === API.SUCCESS ? (r.message || '资料已更新') : r.message);
      if (r.code === API.SUCCESS) { loadProfile(); updateUserArea(); }
    });
  }

  function showChangePwd() {
    const area = $('#profileEditArea');
    area.innerHTML = `<div class="edit-form">
      <label>用户名</label><input id="cpUser" value="${currentUser.username || ''}" readonly>
      <label>原密码</label><input id="cpOld" type="password" placeholder="请输入原密码">
      <label>新密码</label><input id="cpNew" type="password" placeholder="请输入新密码">
      <div class="form-msg" id="cpMsg"></div>
      <button class="btn btn-dark block" id="cpSave">确认修改</button>
    </div>`;
    $('#cpSave').addEventListener('click', async () => {
      const d = { username: $('#cpUser').value.trim(), oldPassword: $('#cpOld').value, newPassword: $('#cpNew').value };
      if (!d.oldPassword || !d.newPassword) { toast('请填写原密码和新密码'); return; }
      const r = await API.updatePassword(d);
      toast(r.code === API.SUCCESS ? (r.message || '密码已修改') : r.message);
    });
  }

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    // 每个模块独立容错：任何一个初始化抛错都不影响其他功能，
    // 尤其保证入场动画(reveal)能执行，避免图片一直透明看不见。
    const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[init] ' + name + ' 失败:', e); } };
    safe('header', () => initHeader());
    safe('reveal', () => initReveal());
    safe('search', () => initSearch());
    safe('hotel', () => loadHotel());
    safe('rooms', () => loadRooms());
    safe('userArea', () => updateUserArea());
  });
})();
