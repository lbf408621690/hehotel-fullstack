/* ============================================================
   和悦酒店 · 后台管理交互逻辑（配置驱动）
   ============================================================ */
(function () {
  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));
  let currentRole = null, currentView = 'dashboard';

  const STATUS = { '-3':'已删除', '-2':'支付超时', '-1':'已取消', '0':'未付款', '1':'待入住', '2':'已入住' };
  const ROOM_STATUS = { '0':'空闲', '1':'在住', '2':'预订', '3':'维修' };

  /* ---------- 工具 ---------- */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function fmtDate(s) { return s ? String(s).slice(0, 10) : '—'; }
  function esc(s) { return s == null ? '' : String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function ok(r) { return r && r.code === AdminAPI.SUCCESS; }

  /* ---------- 登录 ---------- */
  async function checkLogin() {
    try {
      const r = await AdminAPI.operatorList();
      if (ok(r)) { currentRole = 'admin'; return true; }
      // 操作员访问 /admin/** 会被拒，但 /op/** 可用
      const r2 = await AdminAPI.orderCount();
      if (ok(r2)) { currentRole = 'operator'; return true; }
      return false;
    } catch (e) { return false; }
  }
  function showApp(role) {
    currentRole = role;
    $('#loginPage').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#sbRole').textContent = role === 'admin' ? '管理员' : '操作员';
    $('#sbName').textContent = role === 'admin' ? '系统管理员' : '前台操作员';
    $('#todayText').textContent = new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
    // 非管理员隐藏仅管理员可见的菜单
    $$('[data-admin]').forEach(a => { if (role !== 'admin') a.style.display = 'none'; });
    navigate('dashboard');
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#loginMsg'); msg.textContent = '登录中…';
    try {
      const r = await AdminAPI.login($('#lgUser').value.trim(), $('#lgPass').value);
      if (ok(r)) {
        const role = (r.data && r.data.role) || 'operator';
        showApp(role); toast('登录成功，欢迎回来');
      } else { msg.textContent = r.message || '账号或密码错误'; }
    } catch (err) { msg.textContent = '无法连接服务器，请确认后端已启动'; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await AdminAPI.logout(); } catch (e) {}
    location.reload();
  });

  /* ---------- 导航 ---------- */
  const VIEW_TITLE = { dashboard:'控制面板', order:'订单管理', checkin:'入住管理', room:'客房管理', roomtype:'房型管理', ordertype:'预订方式', user:'客户管理', operator:'员工管理', hotel:'酒店设置' };
  function navigate(view) {
    currentView = view;
    $$('#sbNav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    $('#viewTitle').textContent = VIEW_TITLE[view];
    $('#sidebar').classList.remove('open');
    render(view);
  }
  $$('#sbNav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.view); }));
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ---------- 弹窗 ---------- */
  function openModal(title, bodyHtml, onSave) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modal').classList.add('open');
    $('#modalSave').onclick = onSave;
  }
  function closeModal() { $('#modal').classList.remove('open'); }
  $('.modal-mask').addEventListener('click', closeModal);
  $('.modal-close').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);

  // 由配置生成表单 HTML
  function formHtml(fields, data) {
    data = data || {};
    return '<div class="form-grid">' + fields.map(f => {
      const v = data[f.k] == null ? '' : data[f.k];
      let input;
      if (f.type === 'select') {
        input = `<select name="${f.k}">${f.opts.map(o => `<option value="${o.v}" ${String(v)===String(o.v)?'selected':''}>${o.t}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        input = `<textarea name="${f.k}">${esc(v)}</textarea>`;
      } else {
        input = `<input name="${f.k}" type="${f.type||'text'}" value="${esc(v)}">`;
      }
      return `<div class="field ${f.full?'full':''}"><label>${f.t}</label>${input}</div>`;
    }).join('') + '</div>';
  }
  function readForm(fields) {
    const d = {};
    fields.forEach(f => { d[f.k] = $('[name="'+f.k+'"]', $('#modalBody')).value; });
    return d;
  }
  function confirmBox(msg, cb) { if (window.confirm(msg)) cb(); }

  /* ============================================================
     通用列表渲染器：配置驱动表格 + 工具栏 + 增删改
     ============================================================ */
  function renderTable(cfg) {
    const box = $('#content');
    box.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>${cfg.title}</h3><span class="sub" id="tblCount"></span>
          <span class="spacer"></span>
          <div class="toolbar">${cfg.toolbar || ''}${cfg.add ? `<button class="btn btn-wine" id="addBtn">+ 新增</button>` : ''}</div>
        </div>
        <div class="table-wrap"><table><thead><tr>${cfg.cols.map(c=>`<th>${c.t}</th>`).join('')}<th>操作</th></tr></thead>
        <tbody id="tblBody"><tr><td colspan="${cfg.cols.length+1}" class="loading">加载中…</td></tr></tbody></table></div>
      </div>`;
    if (cfg.add) $('#addBtn').addEventListener('click', () => cfg.add());
    if (cfg.onToolbar) cfg.onToolbar();
    return { body: $('#tblBody'), count: $('#tblCount') };
  }
  function fillTable(ctx, cfg, list) {
    ctx.count.textContent = '共 ' + (list ? list.length : 0) + ' 条';
    if (!list || !list.length) {
      ctx.body.innerHTML = `<tr><td colspan="${cfg.cols.length+1}" class="empty">暂无数据</td></tr>`; return;
    }
    ctx.body.innerHTML = list.map(row => `<tr>${cfg.cols.map(c => {
      let v = row[c.k];
      if (c.render) v = c.render(row);
      else if (c.type === 'date') v = fmtDate(v);
      else if (c.map) v = c.map[v] || v || '—';
      return `<td>${v == null || v === '' ? '—' : v}</td>`;
    }).join('')}<td><div class="td-actions">${cfg.actions(row)}</div></td></tr>`).join('');
    if (cfg.bindActions) cfg.bindActions();
  }
  async function loadList(cfg, ctx) {
    try {
      const r = await cfg.api();
      fillTable(ctx, cfg, ok(r) ? r.data : []);
      if (!ok(r)) toast(r.message || '加载失败');
    } catch (e) { ctx.body.innerHTML = `<tr><td colspan="${cfg.cols.length+1}" class="empty">加载失败，请检查后端服务</td></tr>`; }
  }

  /* ---------- 各模块配置 ---------- */
  const orderFields = [
    { k:'orderTypeId', t:'预订方式ID', type:'number' }, { k:'orderType', t:'预订方式' },
    { k:'userId', t:'客户ID', type:'number' }, { k:'name', t:'入住人' },
    { k:'phone', t:'手机号' }, { k:'roomTypeId', t:'房型ID', type:'number' },
    { k:'roomType', t:'房型' }, { k:'orderDate', t:'预订日期', type:'date' },
    { k:'orderDays', t:'预订天数', type:'number' }, { k:'orderCost', t:'订单费用', type:'number' }
  ];
  const roomFields = [
    { k:'roomNumber', t:'房间号' }, { k:'typeId', t:'房型ID', type:'number' },
    { k:'roomType', t:'房型' }, { k:'roomPrice', t:'房价', type:'number' },
    { k:'roomDiscount', t:'折扣', type:'number' },
    { k:'roomStatus', t:'状态', type:'select', opts:[{v:0,t:'空闲'},{v:1,t:'在住'},{v:2,t:'预订'},{v:3,t:'维修'}] },
    { k:'remark', t:'备注', full:true }
  ];
  const roomTypeFields = [
    { k:'roomType', t:'房型名称' }, { k:'price', t:'价格', type:'number' },
    { k:'discount', t:'折扣', type:'number' }, { k:'area', t:'面积(㎡)', type:'number' },
    { k:'bedNum', t:'床数', type:'number' }, { k:'bedSize', t:'床尺寸' },
    { k:'window', t:'窗户', type:'select', opts:[{v:1,t:'有窗'},{v:0,t:'无窗'}] },
    { k:'rest', t:'剩余数量', type:'number' }, { k:'remark', t:'备注', full:true, type:'textarea' }
  ];
  const orderTypeFields = [ { k:'type', t:'预订方式名称' }, { k:'remark', t:'备注', full:true } ];
  const userFields = [
    { k:'username', t:'用户名' }, { k:'password', t:'密码' },
    { k:'name', t:'姓名' }, { k:'gender', t:'性别', type:'select', opts:[{v:'男',t:'男'},{v:'女',t:'女'}] },
    { k:'phone', t:'手机号' }, { k:'email', t:'邮箱' },
    { k:'address', t:'地址' }, { k:'idcard', t:'身份证' }
  ];
  const operatorFields = [
    { k:'username', t:'账号' }, { k:'password', t:'密码' },
    { k:'name', t:'姓名' }, { k:'gender', t:'性别', type:'select', opts:[{v:'男',t:'男'},{v:'女',t:'女'}] },
    { k:'phone', t:'手机号' }, { k:'email', t:'邮箱' }, { k:'address', t:'地址', full:true }
  ];

  const CFG = {
    order: {
      title:'订单列表', api:AdminAPI.orderList,
      cols:[
        { k:'orderId', t:'订单号' }, { k:'name', t:'入住人' }, { k:'phone', t:'手机号' },
        { k:'roomType', t:'房型' }, { k:'orderDate', t:'入住日期', type:'date' },
        { k:'orderDays', t:'天数' }, { k:'orderCost', t:'金额' },
        { k:'orderStatus', t:'状态', map:STATUS }, { k:'orderType', t:'来源' }
      ],
      toolbar:`<input id="oSName" placeholder="入住人姓名"><input id="oSPhone" placeholder="预留手机号"><button class="btn" id="oSearch">按姓名手机查</button><input id="oSUser" placeholder="客户ID" type="number"><button class="btn" id="oUserSearch">按客户查</button>`,
      add:()=>openModal('新增订单', formHtml(orderFields), async()=>{
        const d=readForm(orderFields); const r=await AdminAPI.orderAdd(d); toast(ok(r)?'添加成功':r.message); closeModal(); load();
      }),
      actions:row=>{
        let s='<button class="btn btn-sm" data-act="detail" data-id="'+row.orderId+'">详情</button>';
        if(String(row.orderStatus)==='0'){
          s+='<button class="btn btn-sm" data-act="pay" data-id="'+row.orderId+'">支付</button>';
          s+='<button class="btn btn-sm" data-act="cancel" data-id="'+row.orderId+'">取消</button>';
          s+='<button class="btn btn-sm" data-act="overtime" data-id="'+row.orderId+'">超时</button>';
        }
        s+='<button class="btn btn-sm" data-act="edit" data-id="'+row.orderId+'">编辑</button>';
        s+='<button class="btn btn-sm btn-danger" data-act="del" data-id="'+row.orderId+'">删除</button>';
        return s;
      },
      bindActions:()=>{
        $$('[data-act]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id, act=b.dataset.act;
          if(act==='detail'){
            const r=await AdminAPI.orderById(id);
            if(ok(r)){const o=r.data;openModal('订单详情 #'+id,
              `<div class="detail-list"><div><span>订单号</span>${o.orderId}</div><div><span>状态</span>${STATUS[o.orderStatus]||'—'}</div>
               <div><span>入住人</span>${esc(o.name)}</div><div><span>手机号</span>${esc(o.phone)}</div>
               <div><span>房型</span>${esc(o.roomType)}</div><div><span>客户ID</span>${o.userId}</div>
               <div><span>预订日期</span>${fmtDate(o.orderDate)}</div><div><span>天数</span>${o.orderDays}</div>
               <div><span>金额</span>¥${o.orderCost}</div><div><span>来源</span>${esc(o.orderType)}</div>
               <div><span>创建时间</span>${fmtDate(o.createTime)}</div><div><span>更新时间</span>${fmtDate(o.updateTime)}</div></div>`,
              ()=>closeModal()); $('#modalSave').style.display='none';
            }
          }
          else if(act==='pay'){const r=await AdminAPI.orderPay(id);toast(ok(r)?'支付成功':r.message);load();}
          else if(act==='cancel'){confirmBox('确定取消订单 '+id+'？',async()=>{const r=await AdminAPI.orderCancel(id);toast(ok(r)?'已取消':r.message);load();});}
          else if(act==='overtime'){confirmBox('标记订单 '+id+' 支付超时？',async()=>{await AdminAPI.orderOvertime(id);toast('已标记超时');load();});}
          else if(act==='del'){confirmBox('确定删除订单 '+id+'？',async()=>{const r=await AdminAPI.orderDelete(id);toast(ok(r)?'已删除':r.message);load();});}
          else if(act==='edit'){
            const r=await AdminAPI.orderById(id); if(!ok(r))return;
            openModal('编辑订单 #'+id, formHtml(orderFields,r.data), async()=>{
              const d=readForm(orderFields); d.orderId=+id;
              const res=await AdminAPI.orderUpdate(d); toast(ok(res)?'修改成功':res.message); closeModal(); load();
            });
          }
        }));
      },
      onToolbar:()=>{
        $('#oSearch').addEventListener('click',async()=>{
          const r=await AdminAPI.orderByNamePhone($('#oSName').value.trim(),$('#oSPhone').value.trim());
          fillTable(ctx,CFG.order,ok(r)?r.data:[]);
        });
        $('#oUserSearch').addEventListener('click',async()=>{
          const id=$('#oSUser').value.trim(); if(!id)return;
          const r=await AdminAPI.orderByUser(id); fillTable(ctx,CFG.order,ok(r)?r.data:[]);
        });
      }
    },
    checkin: {
      title:'入住记录', api:AdminAPI.checkInList,
      cols:[
        { k:'checkInId',t:'记录ID' },{ k:'orderId',t:'订单号' },{ k:'roomNumber',t:'房间号' },
        { k:'peoCount',t:'人数' },{ k:'persons',t:'入住人' },{ k:'ids',t:'证件号' },
        { k:'checkInTime',t:'入住时间',type:'date' },{ k:'checkOutTime',t:'退房时间',type:'date' }
      ],
      toolbar:`<button class="btn" id="cinAddBtn">+ 办理入住</button><input id="cinOutRoom" placeholder="房间号退房"><button class="btn" id="cinOutBtn">办理退房</button>`,
      add:null,
      actions:row=>{
        let s='<button class="btn btn-sm" data-cact="detail" data-id="'+row.checkInId+'">详情</button>';
        if(!row.checkOutTime) s+='<button class="btn btn-sm" data-cact="chroom" data-id="'+row.checkInId+'">换房</button>';
        s+='<button class="btn btn-sm btn-danger" data-cact="del" data-id="'+row.checkInId+'">删除</button>';
        return s;
      },
      bindActions:()=>{
        $$('[data-cact]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.cact;
          if(act==='detail'){
            const r=await AdminAPI.checkInById(id); if(!ok(r))return;const o=r.data;
            openModal('入住详情 #'+id,`<div class="detail-list">
              <div><span>记录ID</span>${o.checkInId}</div><div><span>订单号</span>${o.orderId}</div>
              <div><span>房间号</span>${esc(o.roomNumber)}</div><div><span>入住人数</span>${o.peoCount}</div>
              <div><span>入住人</span>${esc(o.persons)}</div><div><span>证件号</span>${esc(o.ids)}</div>
              <div><span>入住时间</span>${fmtDate(o.checkInTime)}</div><div><span>退房时间</span>${fmtDate(o.checkOutTime)}</div></div>`,
              ()=>closeModal()); $('#modalSave').style.display='none';
          } else if(act==='chroom'){
            openModal('更换房间 #'+id,formHtml([{k:'roomNumber',t:'新房间号'}],{}),async()=>{
              const d=readForm([{k:'roomNumber'}]);d.checkId=+id;
              const r=await AdminAPI.checkInUpdate(d);toast(ok(r)?'换房成功':r.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除入住记录 '+id+'？',async()=>{const r=await AdminAPI.checkInDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      },
      onToolbar:()=>{
        $('#cinAddBtn').addEventListener('click',()=>openModal('办理入住',formHtml([
          {k:'orderId',t:'订单号',type:'number'},{k:'peoCount',t:'入住人数',type:'number'},
          {k:'persons',t:'入住人姓名（多人用逗号分隔）',full:true},{k:'ids',t:'证件号（多人用逗号分隔）',full:true}
        ]),async()=>{
          const d=readForm([{k:'orderId'},{k:'peoCount'},{k:'persons'},{k:'ids'}]);
          const r=await AdminAPI.checkInAdd(d);toast(ok(r)?'入住登记成功':r.message);closeModal();load();
        }));
        $('#cinOutBtn').addEventListener('click',()=>{
          const room=$('#cinOutRoom').value.trim(); if(!room){toast('请输入房间号');return;}
          confirmBox('确定房间 '+room+' 退房？',async()=>{const r=await AdminAPI.checkOut(room);toast(ok(r)?'退房成功':r.message);load();});
        });
      }
    },
    room: {
      title:'客房列表', api:AdminAPI.roomList,
      cols:[
        { k:'roomId',t:'ID' },{ k:'roomNumber',t:'房间号' },{ k:'typeId',t:'房型ID' },
        { k:'roomType',t:'房型' },{ k:'roomPrice',t:'房价' },{ k:'roomDiscount',t:'折扣' },
        { k:'roomStatus',t:'状态',map:ROOM_STATUS },{ k:'remark',t:'备注' }
      ],
      toolbar:`<select id="roomStatusFilter"><option value="all">全部状态</option><option value="0">空闲</option><option value="1">在住</option><option value="2">预订</option><option value="3">维修</option></select><select id="roomTypeFilter"><option value="all">全部房型</option></select>`,
      add:()=>openModal('新增客房',formHtml(roomFields),async()=>{
        const r=await AdminAPI.roomAdd(readForm(roomFields));toast(ok(r)?'添加成功':r.message);closeModal();load();
      }),
      actions:row=>`<button class="btn btn-sm" data-ract="edit" data-id="${row.roomId}">编辑</button><button class="btn btn-sm btn-danger" data-ract="del" data-id="${row.roomId}">删除</button>`,
      bindActions:()=>{
        $$('[data-ract]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.ract;
          if(act==='edit'){
            const r=await AdminAPI.roomById(id);if(!ok(r))return;
            openModal('编辑客房 #'+id,formHtml(roomFields,r.data),async()=>{
              const d=readForm(roomFields);d.roomId=+id;
              const res=await AdminAPI.roomUpdate(d);toast(ok(res)?'修改成功':res.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除客房 '+id+'？',async()=>{const r=await AdminAPI.roomDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      },
      onToolbar:async()=>{
        const rt=await AdminAPI.roomTypeList();
        if(ok(rt)&&rt.data){$('#roomTypeFilter').innerHTML+=(rt.data.map(x=>`<option value="${x.typeId}">${esc(x.roomType)}</option>`).join(''));}
        $('#roomStatusFilter').addEventListener('change',async e=>{
          const v=e.target.value;if(v==='all'){load();return;}
          const r=await AdminAPI.roomByStatus(v);fillTable(ctx,CFG.room,ok(r)?r.data:[]);
        });
        $('#roomTypeFilter').addEventListener('change',async e=>{
          const v=e.target.value;if(v==='all'){load();return;}
          const r=await AdminAPI.roomByType(v);fillTable(ctx,CFG.room,ok(r)?r.data:[]);
        });
      }
    },
    roomtype: {
      title:'房型列表', api:AdminAPI.roomTypeList,
      cols:[
        { k:'typeId',t:'ID' },{ k:'roomType',t:'房型' },{ k:'price',t:'价格' },
        { k:'discount',t:'折扣' },{ k:'area',t:'面积' },{ k:'bedNum',t:'床数' },
        { k:'bedSize',t:'床尺寸' },{ k:'window',t:'窗户',map:{0:'无窗',1:'有窗'} },
        { k:'rest',t:'剩余' }
      ],
      toolbar:`<button class="btn" id="rtRestBtn">只看有空房</button>`,
      add:()=>openModal('新增房型',formHtml(roomTypeFields),async()=>{
        const r=await AdminAPI.roomTypeAdd(readForm(roomTypeFields));toast(ok(r)?'添加成功':r.message);closeModal();load();
      }),
      actions:row=>`<button class="btn btn-sm" data-tact="edit" data-id="${row.typeId}">编辑</button><button class="btn btn-sm btn-danger" data-tact="del" data-id="${row.typeId}">删除</button>`,
      bindActions:()=>{
        $$('[data-tact]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.tact;
          if(act==='edit'){
            const r=await AdminAPI.roomTypeById(id);if(!ok(r))return;
            openModal('编辑房型 #'+id,formHtml(roomTypeFields,r.data),async()=>{
              const d=readForm(roomTypeFields);d.typeId=+id;
              const res=await AdminAPI.roomTypeUpdate(d);toast(ok(res)?'修改成功':res.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除房型 '+id+'？',async()=>{const r=await AdminAPI.roomTypeDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      },
      onToolbar:()=>{
        $('#rtRestBtn').addEventListener('click',async()=>{
          const r=await AdminAPI.roomTypeRest();fillTable(ctx,CFG.roomtype,ok(r)?r.data:[]);
        });
      }
    },
    ordertype: {
      title:'预订方式', api:AdminAPI.orderTypeList,
      cols:[{k:'typeId',t:'ID'},{k:'type',t:'方式名称'},{k:'remark',t:'备注'}],
      add:()=>openModal('新增预订方式',formHtml(orderTypeFields),async()=>{
        const r=await AdminAPI.orderTypeAdd(readForm(orderTypeFields));toast(ok(r)?'添加成功':r.message);closeModal();load();
      }),
      actions:row=>`<button class="btn btn-sm" data-otact="edit" data-id="${row.typeId}">编辑</button><button class="btn btn-sm btn-danger" data-otact="del" data-id="${row.typeId}">删除</button>`,
      bindActions:()=>{
        $$('[data-otact]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.otact;
          if(act==='edit'){
            const r=await AdminAPI.orderTypeById(id);if(!ok(r))return;
            openModal('编辑预订方式 #'+id,formHtml(orderTypeFields,r.data),async()=>{
              const d=readForm(orderTypeFields);d.typeId=+id;
              const res=await AdminAPI.orderTypeUpdate(d);toast(ok(res)?'修改成功':res.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除预订方式 '+id+'？',async()=>{const r=await AdminAPI.orderTypeDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      }
    },
    user: {
      title:'客户列表', api:AdminAPI.userList,
      cols:[
        {k:'userId',t:'ID'},{k:'username',t:'用户名'},{k:'name',t:'姓名'},
        {k:'gender',t:'性别'},{k:'phone',t:'手机号'},{k:'email',t:'邮箱'},
        {k:'address',t:'地址'},{k:'idcard',t:'身份证'},{k:'createTime',t:'注册时间',type:'date'}
      ],
      toolbar:`<input id="uSName" placeholder="用户名查询"><button class="btn" id="uSearch">查询</button><button class="btn" id="uPwdBtn">修改密码</button>`,
      add:()=>openModal('新增客户',formHtml(userFields),async()=>{
        const r=await AdminAPI.userAdd(readForm(userFields));toast(ok(r)?'添加成功':r.message);closeModal();load();
      }),
      actions:row=>`<button class="btn btn-sm" data-uact="edit" data-id="${row.userId}">编辑</button><button class="btn btn-sm btn-danger" data-uact="del" data-id="${row.userId}">删除</button>`,
      bindActions:()=>{
        $$('[data-uact]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.uact;
          if(act==='edit'){
            const r=await AdminAPI.userById(id);if(!ok(r))return;
            openModal('编辑客户 #'+id,formHtml(userFields.filter(f=>f.k!=='username'&&f.k!=='password'),r.data),async()=>{
              const d=readForm(userFields.filter(f=>f.k!=='username'&&f.k!=='password'));d.userId=+id;
              const res=await AdminAPI.userUpdate(d);toast(ok(res)?(res.message||'修改成功'):res.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除客户 '+id+'？',async()=>{const r=await AdminAPI.userDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      },
      onToolbar:()=>{
        $('#uSearch').addEventListener('click',async()=>{
          const n=$('#uSName').value.trim();if(!n){load();return;}
          const r=await AdminAPI.userByUsername(n);fillTable(ctx,CFG.user,ok(r)&&r.data?[r.data]:[]);
        });
        $('#uPwdBtn').addEventListener('click',()=>openModal('修改客户密码',formHtml([
          {k:'username',t:'用户名'},{k:'oldPassword',t:'原密码',type:'password'},
          {k:'newPassword',t:'新密码',type:'password'}
        ]),async()=>{
          const r=await AdminAPI.userUpdatePassword(readForm([{k:'username'},{k:'oldPassword'},{k:'newPassword'}]));
          toast(ok(r)?'密码已修改':r.message);closeModal();
        }));
      }
    },
    operator: {
      title:'员工列表（仅管理员）', api:AdminAPI.operatorList,
      cols:[
        {k:'workerId',t:'ID'},{k:'username',t:'账号'},{k:'name',t:'姓名'},
        {k:'gender',t:'性别'},{k:'phone',t:'手机号'},{k:'email',t:'邮箱'},
        {k:'role',t:'角色',map:{admin:'管理员',operator:'操作员'}},{k:'address',t:'地址'}
      ],
      add:()=>openModal('新增员工',formHtml(operatorFields),async()=>{
        const r=await AdminAPI.operatorAdd(readForm(operatorFields));toast(ok(r)?'添加成功':r.message);closeModal();load();
      }),
      actions:row=>`<button class="btn btn-sm" data-pact="edit" data-id="${row.workerId}">编辑</button><button class="btn btn-sm btn-danger" data-pact="del" data-id="${row.workerId}">删除</button>`,
      bindActions:()=>{
        $$('[data-pact]').forEach(b=>b.addEventListener('click',async()=>{
          const id=b.dataset.id,act=b.dataset.pact;
          if(act==='edit'){
            const r=await AdminAPI.operatorById(id);if(!ok(r))return;
            openModal('编辑员工 #'+id,formHtml(operatorFields.filter(f=>f.k!=='username'&&f.k!=='password'),r.data),async()=>{
              const d=readForm(operatorFields.filter(f=>f.k!=='username'&&f.k!=='password'));d.workerId=+id;
              const res=await AdminAPI.operatorUpdate(d);toast(ok(res)?'修改成功':res.message);closeModal();load();
            });
          } else if(act==='del'){
            confirmBox('删除员工 '+id+'？',async()=>{const r=await AdminAPI.operatorDelete(id);toast(ok(r)?'已删除':r.message);load();});
          }
        }));
      }
    }
  };

  let ctx = null, load = null;
  function render(view) {
    if (view === 'dashboard') return renderDashboard();
    const cfg = CFG[view];
    if (!cfg) return;
    ctx = renderTable(cfg);
    load = () => loadList(cfg, ctx);
    load();
  }

  /* ---------- 控制面板 ---------- */
  async function renderDashboard() {
    const box = $('#content');
    box.innerHTML = `<div class="stat-grid">
      <div class="stat-card wine"><div class="sc-label">订单总数</div><div class="sc-num" id="stOrder">—</div></div>
      <div class="stat-card gold"><div class="sc-label">注册客户</div><div class="sc-num" id="stUser">—</div></div>
      <div class="stat-card teal"><div class="sc-label">客房总数</div><div class="sc-num" id="stRoom">—</div></div>
      <div class="stat-card"><div class="sc-label">房型数量</div><div class="sc-num" id="stRoomType">—</div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>最近订单</h3><span class="sub">实时数据</span><span class="spacer"></span><button class="btn btn-sm" id="toOrders">查看全部 →</button></div>
      <div class="table-wrap"><table><thead><tr><th>订单号</th><th>入住人</th><th>房型</th><th>日期</th><th>金额</th><th>状态</th></tr></thead><tbody id="dashOrders"><tr><td colspan="6" class="loading">加载中…</td></tr></tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>快捷操作</h3></div><div class="panel-body">
      <button class="btn" data-quick="order">处理订单</button>
      <button class="btn" data-quick="checkin">办理入住</button>
      <button class="btn" data-quick="room">管理客房</button>
      <button class="btn" data-quick="hotel">酒店设置</button>
    </div></div>`;
    $('#toOrders').addEventListener('click',()=>navigate('order'));
    $$('[data-quick]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.quick)));
    try {
      const [oc, uc, rom, rt, ord] = await Promise.all([
        AdminAPI.orderCount(), AdminAPI.userCount(), AdminAPI.roomList(), AdminAPI.roomTypeList(), AdminAPI.orderList()
      ]);
      if(ok(oc)) $('#stOrder').innerHTML = oc.data + '<small>单</small>';
      if(ok(uc)) $('#stUser').innerHTML = uc.data + '<small>人</small>';
      if(ok(rom)) $('#stRoom').innerHTML = rom.data.length + '<small>间</small>';
      if(ok(rt)) $('#stRoomType').innerHTML = rt.data.length + '<small>种</small>';
      if(ok(ord)) {
        const list = ord.data.slice(0, 8);
        $('#dashOrders').innerHTML = list.length ? list.map(o=>`<tr>
          <td>${o.orderId}</td><td>${esc(o.name)}</td><td>${esc(o.roomType)}</td>
          <td>${fmtDate(o.orderDate)}</td><td>¥${o.orderCost}</td>
          <td><span class="badge ${o.orderStatus===0?'red':o.orderStatus===2?'green':''}">${STATUS[o.orderStatus]||'—'}</span></td></tr>`).join('')
          : '<tr><td colspan="6" class="empty">暂无订单</td></tr>';
      }
    } catch(e) { toast('数据加载失败，请检查后端服务'); }
  }

  /* ---------- 酒店设置 ---------- */
  const hotelFields = [
    { k:'hotelId', t:'酒店ID', type:'number' }, { k:'hotelName', t:'酒店名称' },
    { k:'phone', t:'联系电话' }, { k:'telephone', t:'备用电话' },
    { k:'email', t:'邮箱' }, { k:'address', t:'地址', full:true }, { k:'website', t:'网址', full:true }
  ];
  const _origRender = render;
  render = function(view) {
    if (view === 'hotel') return renderHotel();
    return _origRender(view);
  };
  async function renderHotel() {
    const box = $('#content');
    box.innerHTML = `<div class="panel"><div class="panel-head"><h3>酒店信息设置</h3><span class="sub">保存后前台官网同步更新</span></div>
      <div class="panel-body" id="hotelForm"><div class="loading">加载中…</div></div></div>`;
    try {
      const r = await AdminAPI.hotelInfo();
      if (ok(r) && r.data && r.data[0]) {
        const h = r.data[0];
        $('#hotelForm').innerHTML = formHtml(hotelFields, h) + '<div style="margin-top:18px"><button class="btn btn-wine" id="hotelSave">保存修改</button></div>';
        $('#hotelSave').addEventListener('click', async()=>{
          const d = readForm(hotelFields);
          const res = await AdminAPI.hotelUpdate(d);
          toast(ok(res)?'保存成功，前台已同步':res.message);
        });
      } else { $('#hotelForm').innerHTML = '<div class="empty">未获取到酒店信息</div>'; }
    } catch(e) { $('#hotelForm').innerHTML = '<div class="empty">加载失败</div>'; }
  }

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const logged = await checkLogin();
    if (logged) showApp(currentRole);
    else $('#loginPage').classList.remove('hidden');
  });
})();
