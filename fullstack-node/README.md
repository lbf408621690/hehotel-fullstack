# H.O 和悦酒店 · 全栈版（已上线）

完整可运行的酒店官网 + 管理后台，前端 + 后端 + 数据库一体，**任何人通过网址即可访问和使用**。

## 🌐 线上地址

**https://hehotel-booking.app.workbuddy.host/?sharecode=6LUFZKGP7I**

- 官网首页：打开即上面的链接
- 管理后台：官网右上角「员工登录」进入，或访问 `https://hehotel-booking.app.workbuddy.host/admin/index.html?sharecode=6LUFZKGP7I`

> 分享给别人时请发**完整链接**（带 `?sharecode=...`），前端会自动携带它访问接口。

## 测试账号

| 角色 | 账号 / 密码 | 权限 |
|---|---|---|
| 客人 | `user0` / `pass0` | 前台登录、预订、个人中心、我的订单 |
| 管理员 | `freee` / `123456` | 后台全部功能（含员工管理、酒店设置） |
| 操作员 | `www` / `123456` | 后台业务功能（员工管理/酒店设置自动隐藏） |

## 技术架构

- **前端**：原生 HTML/CSS/JS（官网 + 管理后台两个入口）
- **后端**：Node.js + Express，完整复刻原 Spring Boot 后端的 68 个接口
- **数据库**：SQLite（sql.js），数据文件 `data/hotel.db`，从原 MySQL `hotel.sql` 全量迁移（46 用户 / 23 订单 / 7 房型 / 10 房间等）
- **会话**：express-session Cookie，角色权限（admin / operator）与原逻辑一致
- **单端口**：一个 Express 服务同时提供静态页面和 `/ho-api/**` 接口，同源无跨域问题

数据链路：
```
浏览器 → 公网域名 /ho-api/** (带 sharecode)
       → Express 服务 (PORT)
       → sql.js 内存数据库 ↔ data/hotel.db（写操作后自动持久化）
```

## 功能范围

前台：房型浏览、空房查询、登录/注册、在线预订、支付、取消、个人中心、编辑资料、修改密码、订单详情/删除、员工登录入口。

后台：控制面板（统计 + 最近订单）、订单/入住/房间/房型/预订方式/客户/员工/酒店设置 9 大模块完整增删改查，订单支付/取消/超时、办理入住/退房/换房。

## 本地运行

```bash
cd hotel-fullstack
npm install
node server.js          # 默认 3000 端口，可用 PORT=xxxx 指定
# 浏览器打开 http://localhost:3000
```

本地运行时没有 sharecode，前端 API 会自动走不带参数的同源请求，功能一致。

## 数据来源与迁移

`data/hotel.db` 由原 `D:\project\hotel\hotel.sql` 迁移而来。迁移脚本保留在 `../hotel-fullstack-tools/seed.py`（不在发布目录内），需要重新生成时：
1. 把它复制回项目根目录执行 `python seed.py`
2. 或在有 MySQL 的环境里重新导出

## 注意事项

1. **数据持久化**：发布沙箱的运行环境在重启后会恢复到发布时的初始数据；运行期间的注册/下单等操作会即时写入 `data/hotel.db` 并保持到本次运行结束。适合演示与体验。
2. **sharecode 机制**：发布平台网关要求每个请求 URL 带 `sharecode`，前端已自动处理（读取 → 存 sessionStorage → 附加到所有请求），用户无需关心。
3. **重新发布**：修改代码后需重新部署；链接保持稳定（同一目录复用同一应用）。
