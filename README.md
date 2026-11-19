# H.O 和悦酒店 · 官网 + 管理后台 + 全栈发布版

一个完整的酒店预订与管理系统，包含 **官网前台、员工管理后台、原始 Java 后端、以及一套零依赖外部服务的 Node.js 全栈发布版**。

- 官网前台：高端木质暖色风格、大图、中英双语、响应式，参考 [YANG 杨邦胜设计](https://www.yanghd.com/) 视觉语言设计。
- 管理后台：9 大模块完整增删改查，覆盖全部后端接口，角色权限（管理员 / 操作员）与原系统一致。
- 两套后端可选：原始 **Spring Boot + MySQL** 方案，以及为「免环境一键运行 / 公网分享」重写的 **Node.js + SQLite** 全栈方案。

---

## 一、目录结构

```
.
├── README.md                    # 本文档
├── .gitignore
├── database/                    # 原始 MySQL 建表 + 数据脚本
│   ├── hotel.sql                # 全量建表与样例数据（用户/订单/房型/客房等）
│   └── user_info_backup_before_md5.sql
├── backend-springboot/          # 方案 A：原始 Spring Boot 后端
│   ├── pom.xml                  # Maven 配置（Spring Boot 2.0.5 + MyBatis + MySQL）
│   ├── src/main/java/...        # Controller / Service / Mapper / Entity / 拦截器
│   ├── src/main/resources/      # application.yml、MyBatis mapper XML
│   ├── hotel.sql                # 同 database/hotel.sql
│   ├── 启动后端.bat             # Windows 一键启动（含 Java 21 兼容参数）
│   ├── mvnw / mvnw.cmd          # Maven Wrapper
│   └── .gitignore
├── frontend-website/            # 官网 + 后台前端（配原始 Spring Boot 后端使用）
│   ├── index.html               # 官网首页（含登录/注册/预订/订单/员工登录弹窗）
│   ├── admin/index.html         # 管理后台
│   ├── css / js / images        # 样式、交互脚本、本地图片素材
│   └── 使用说明.md              # 前端对接后端的详细说明
└── fullstack-node/              # 方案 B：Node.js 全栈版（推荐，零外部依赖）
    ├── server.js                # Express 服务，复刻全部 ~68 个 /ho-api 接口
    ├── db.js                    # sql.js（纯 JS SQLite）数据层，写后自动持久化
    ├── package.json             # 依赖：express / express-session / sql.js
    ├── seed.py                  # 从 hotel.sql 生成 data/hotel.db 的迁移脚本
    ├── data/hotel.db            # 已迁移好的 SQLite 数据库（46 用户/23 订单/7 房型/10 客房等）
    ├── public/                  # 官网 + 后台静态页面（同源，API 走 /ho-api）
    │   ├── index.html
    │   ├── admin/
    │   ├── css / js / images
    └── README.md
```

> 说明：`database/` 与 `backend-springboot/hotel.sql` 内容相同，前者便于单独查找数据脚本。

---

## 二、快速开始（推荐：Node.js 全栈版）

零外部依赖，不需要 Java、不需要 MySQL，一条命令跑起来整个系统（官网 + 后台 + 接口 + 数据库）。

### 环境要求
- Node.js 16+（含 npm）

### 启动
```bash
cd fullstack-node
npm install
npm start
# 默认 3000 端口，可用 PORT=xxxx 指定
```

### 访问
| 页面 | 地址 |
|---|---|
| 酒店官网 | http://localhost:3000/ |
| 管理后台 | http://localhost:3000/admin/index.html |

前端与接口同源（都在同一个 Express 服务，接口前缀 `/ho-api`），无跨域问题，登录 Cookie 天然可用。

### 测试账号
| 角色 | 账号 / 密码 | 权限 |
|---|---|---|
| 客人 | `user0` / `pass0` | 前台登录、预订、个人中心、我的订单 |
| 管理员 | `freee` / `123456` | 后台全部功能（含员工管理、酒店设置） |
| 操作员 | `www` / `123456` | 后台业务功能（员工管理/酒店设置自动隐藏） |

### 数据存储
- 使用 `sql.js`（纯 JavaScript 实现的 SQLite，无需原生编译、无需安装数据库）。
- 数据库文件：`data/hotel.db`，由 `seed.py` 从原始 `hotel.sql` 迁移而来。
- 所有写操作后自动导出回 `data/hotel.db`，运行期数据持久化。
- 需要重新生成数据库时：在项目根目录执行 `python seed.py`（依赖 Python 3）。

### 公网分享说明
全栈版可部署到支持 Node.js 的单端口托管平台。若托管平台网关要求每个请求 URL 携带分享码（`sharecode`），本项目已内置处理：
- `public/js/api.js` 与 `public/admin/js/admin-api.js`：自动读取 URL 中的 `sharecode`，存入 `sessionStorage`，并附加到所有接口请求。
- `server.js`：服务端在返回 HTML/CSS 时，自动为页面内所有静态资源（`link` / `script` / `img` / `background:url`）补上 `sharecode`，避免网关拦截图片与样式。
- 访客打开完整链接（带 `?sharecode=...`）即可正常看到样式与图片；若链接中的分享码丢失，前端会自动从本地恢复并补回地址栏。

---

## 三、备选方案：原始 Spring Boot + MySQL 后端

保留原始 Java 后端全部源码，适合需要在本地或自有服务器以原技术栈运行的场景。

### 环境要求
- JDK（见下方 Java 版本说明）、Maven（或用自带 `mvnw`）
- MySQL 5.7+ / 8.x，数据库名 `hotel`

### 配置数据库
1. 导入数据：将 `database/hotel.sql` 导入本地 MySQL。
2. 修改 `backend-springboot/src/main/resources/application.yml` 中的连接信息：
   ```yaml
   spring:
     datasource:
       username: root        # 改成你的 MySQL 用户名
       password: 123456      # 改成你的 MySQL 密码
       url: jdbc:mysql://localhost:3306/hotel?useUnicode=true&characterEncoding=UTF-8&...
   ```

### 启动后端（重要 · Java 版本兼容）
项目基于 **Spring Boot 2.0.5 / Spring 5.0.9**，其 CGLIB 版本不兼容 **Java 16+** 的强模块封装，直接用高版本 JDK 启动会报：

```
InaccessibleObjectException: module java.base does not "opens java.lang" to unnamed module
```

二选一解决：

**方式 1（推荐）**：双击 `backend-springboot/启动后端.bat`（已内置兼容参数）。

**方式 2**：命令行启动时加 JVM 参数：
```bash
cd backend-springboot
set MAVEN_OPTS=--add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.lang.reflect=ALL-UNNAMED
mvn spring-boot:run
```

**方式 3**：使用 IDEA，在 Run Configuration 的 VM options 中加入上面那串 `--add-opens` 参数；或改用 JDK 8 运行。

后端默认端口 `8080`，接口前缀 `/ho-api`，启动后访问 `http://localhost:8080/ho-api/hotel` 能返回 JSON 即正常。

### 启动前端
前端页面在 `frontend-website/`，需通过 HTTP 提供（不要直接双击 HTML，否则接口会因跨域失败）：
```bash
cd frontend-website
python -m http.server 8899
```
打开：
- 官网：http://localhost:8899/index.html
- 后台：http://localhost:8899/admin/index.html

前端 API 会自动跟随当前页面域名，保证登录 Cookie 同源。

---

## 四、功能与接口对照

### 官网前台（`frontend-website/index.html`）

| 功能 | 页面位置 | 后端接口 |
|---|---|---|
| 酒店信息（页脚电话/地址/邮箱） | 页面加载 | `GET /hotel` |
| 房型列表（7 种房型卡片） | 客房展示区 | `GET /hotel/room` |
| 房型详情 | 客房卡片 | `GET /hotel/room/{id}` |
| 查询空房 | 顶部预订查询条 | `GET /hotel/room/rest` |
| 登录 / 注册 | 登录/注册弹窗 | `POST /login/user`、`POST /register/user` |
| 员工登录进入后台 | 导航栏「员工登录」/ 登录弹窗底部入口 | `POST /login/admin` |
| 个人资料 / 修改资料 / 改密 / 退出 | 个人中心弹窗 | `GET /user/profile`、`POST /user/update`、`POST /user/updatePassword`、`POST /user/logout` |
| 提交预订 | 预订弹窗 | `GET /user/order/add` |
| 我的订单 | 我的订单弹窗 | `GET /user/order` |
| 订单详情 / 删除 / 取消 / 支付 | 订单列表操作 | `GET /user/order/{id}`、`/user/order/delete`、`/user/order/cancel`、`POST /user/order/pay` |

### 管理后台（`frontend-website/admin/index.html`）

配置驱动的通用表格 + 表单架构（配置在 `admin/js/`），共 9 个模块：

| 模块 | 功能 | 主要接口 |
|---|---|---|
| 控制面板 | 订单/客户/客房/房型统计、最近订单 | `/op/order/count`、`/op/user/count`、`/op/order` |
| 订单管理 | 列表/查询/增删改/支付/取消/超时 | `/op/order/**` |
| 入住管理 | 入住记录/办理入住/退房/换房/删除 | `/op/check-in/**` |
| 客房管理 | 列表/按状态房型筛选/增删改 | `/op/room/**` |
| 房型管理 | 列表/只看有空房/增删改 | `/op/room-type/**` |
| 预订方式 | 列表/增删改 | `/op/order-type/**` |
| 客户管理 | 列表/查询/增删改/改密码 | `/op/user/**` |
| 员工管理（管理员） | 列表/增删改 | `/admin/operator/**` |
| 酒店设置（管理员） | 修改酒店名称/电话/邮箱/地址/网址 | `GET /op/hotel/update`、`GET /hotel` |

---

## 五、技术架构

| 层 | 方案 A（原始） | 方案 B（全栈发布版） |
|---|---|---|
| 前端 | 原生 HTML/CSS/JS | 同左（同源部署） |
| 后端 | Spring Boot 2.0.5 + Spring MVC + MyBatis | Node.js + Express |
| 数据库 | MySQL `hotel` | SQLite（sql.js） |
| 会话 | Servlet Session + 拦截器 | express-session Cookie |
| 接口前缀 | `/ho-api` | `/ho-api`（保持一致） |
| 返回格式 | `AjaxResult {code,message,data}` | 同左（完全兼容） |
| 部署 | 需 Java + MySQL 环境 | 单端口，一条命令，可上公网 |

两套后端接口路径、参数名、返回格式一致，前端 API 封装无需大改即可切换。

---

## 六、常见问题（FAQ）

1. **官网打开没数据 / 接口 404？**
   确认后端已启动且接口前缀为 `/ho-api`。方案 A 请先按上文解决 Java 21 兼容问题。

2. **后台表格字段显示 `undefined`？**
   全栈版 `server.js` 的 `ok()` 已统一把数据库下划线字段转为驼峰（`toCamel`），与原 Java 后端返回一致。若自行改动数据层需保持该转换。

3. **登录 Cookie 失效？**
   前端 API 会跟随当前页面域名（`location.hostname`），请用同一种 hostname 访问页面与接口（都用 `localhost` 或都用 `127.0.0.1`），不要混用。

4. **支付密码在哪个表？**
   本项目没有独立的支付密码表，支付校验使用 `user_info.password`（即登录密码，MD5 存储）。

5. **个人中心接口 500 / `StringIndexOutOfBoundsException`？**
   原始 `UserController.getProfile` 对空身份证执行 `replace(5,12)` 会越界，后端源码中已修复为按实际长度安全脱敏，重新编译重启后生效。全栈版无此问题。

6. **公网分享后图片/CSS 不显示？**
   这是托管平台网关要求每个请求带 `sharecode` 所致。本项目已内置自动注入（见「公网分享说明」），请确认使用的是包含修复的版本，并分享完整链接。

---

## 七、数据与账号说明

- `database/hotel.sql` 为原始样例数据，仅用于演示与开发，请勿用于生产环境。
- 所有测试账号密码均为演示用途，部署到公网前请务必修改。
- 全栈版数据库 `fullstack-node/data/hotel.db` 由 `seed.py` 迁移生成，可随时重建。

---

## 八、许可

本项目为演示与学习用途。图片素材来源于公开网络，仅用于界面演示，商业使用请自行替换并确认版权。
