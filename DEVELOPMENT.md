# 开发规范 · iangame

> 本文件是后续所有 session / 协作者的**唯一事实来源**。任何代码改动须遵守本规范。
> 读完此文件即可上手迭代。架构与产品需求见 [`PRD.md`](./PRD.md)。

---

## 0. 一句话总览
Flask + 原生 JS/Canvas + SQLite + Nginx 的深色霓虹电竞风游戏聚合站。
14 款游戏各自独立文件,通过**统一接口契约**接入站点,可独立开发、独立替换。

---

## 1. 目录约定(权威结构)

```
iangame/
├── PRD.md                  # 产品需求 + 技术选型 + 设计规范(勿删,产品决策唯一来源)
├── DEVELOPMENT.md          # ← 本文件:开发/协作/Git 规范
├── README.md               # 快速启动 / 部署
├── CHANGELOG.md            # 版本变更记录(每次发版追加)
├── backend/                # Flask 应用(Python)
│   ├── app.py              # 路由 + API + 工厂
│   ├── models.py           # ORM 模型 + SEED_GAMES 种子数据
│   ├── config.py / extensions.py / wsgi.py
│   └── requirements.txt
├── templates/              # Jinja2 模板
│   ├── base.html           # 全站骨架(导航/页脚/CDN 字体)
│   ├── index/games/play/login/register/profile/404.html
│   └── partials/           # 可复用片段(_nav / _footer / _gamecard)
├── static/
│   ├── css/style.css       # ★设计系统(颜色/字体/组件变量,改样式先改这里)
│   ├── js/app.js           # 站点交互 + API 客户端 IanAPI + 游戏加载器 IanGameLoader
│   └── games/<slug>/game.js# ★每款游戏一个文件,12 个独立模块
├── deploy/                 # 部署产物
│   ├── nginx.conf / iangame.service / deploy.sh
└── data/iangame.db         # SQLite(自动生成,不入库)
```

**关键原则**:
- 一款游戏 = `static/games/<slug>/game.js` 一个文件。新增/修改游戏**只动这个文件 + models.py 的 SEED_GAMES**。
- 样式改动**只改 `static/css/style.css`**(用 CSS 变量),不要在模板里堆内联样式。
- 后端接口改动**只动 `backend/app.py`**,模型改动**只动 `backend/models.py`**。

---

## 2. ★ 游戏接入契约(新增游戏必读)

每款游戏以 IIFE 封装,只暴露**一个全局 `window.IanGame`**:

```js
(function () {
  // ...全部私有逻辑...
  window.IanGame = {
    init(canvas, hooks) {
      // canvas: <canvas> 元素,逻辑分辨率读 canvas.width / canvas.height
      // hooks = {
      //   onScore(score, level),     // 分数/关卡变化即调用,整数
      //   onGameOver(score, level),  // 一局结束时调用(负责云端上报)
      //   onState(state),            // 'ready' | 'playing' | 'paused' | 'over'
      // }
      // 返回 controller:
      return { pause(), resume(), restart(), destroy() };
    }
  };
})();
```

**硬性要求**:
1. **自包含**:不依赖任何外部库,不引用其他游戏文件。
2. **不污染全局**:除 `window.IanGame` 外不挂任何全局变量;IIFE 包裹。
3. **自适应**:从 `canvas.width/height` 读取尺寸,不写死像素。
4. **可重开**:`restart()` 必须能立即开始新一局,不残留旧状态。
5. **可暂停**:`pause()` 停 rAF 循环,`resume()` 恢复,`destroy()` 清监听/定时器防内存泄漏。
6. **整数分数**:分数只上报整数。
7. **无 alert/prompt**:用 `onState('over')` 让壳页面渲染结束界面。

**接入新游戏的步骤**:
1. 在 `static/games/<slug>/` 新建 `game.js`,实现上述契约。
2. 在 `backend/models.py` 的 `SEED_GAMES` 追加一条元数据(slug 必须与目录名一致)。
3. 重启服务(种子数据只在空库时灌入;改种子需删 `data/iangame.db` 重建,或手动 INSERT)。
4. 访问 `/play/<slug>` 验证。

**例外:多人房间制游戏(狼人杀 `werewolf`)** — 不走 canvas 契约:
- 独立路由 `/werewolf`(大厅) + `/werewolf/<code>`(房间页),模板 `werewolf*.html`,逻辑在 `static/js/werewolf.js`。
- 游戏状态机在 `backend/werewolf.py`(纯逻辑,不依赖 Flask 请求上下文,错误返回 i18n key);`app.py` 只挂薄路由(`/api/ww/create|join|state|action`)。
- 三张表 `ww_rooms / ww_players / ww_events`(房间 json 字段存当夜行动/投票/竞选/待处理死亡);免登录身份 = 昵称 + 随机 token(localStorage `ian:ww:<code>`)。
- 实时性靠 1.5s 轮询 `GET /api/ww/state`(回合制够用,零部署改动);写操作统一 `POST /api/ww/action`,服务端按 phase+角色+主持人校验。
- 可见性裁剪在服务端做:玩家只可见自己的牌,主持人全程上帝视角,secret 事件(验人/用药/刀口)game_over 前仅当事人与主持人可见。
- 大厅卡片:`games.html`/`index.html` 对 `slug == 'werewolf'` 特判链接指向 `/werewolf`。

---

## 3. 后端开发规范
- **Python**:3.12,4 空格缩进,单引号字符串为主。
- **路由**:页面路由 + `/api/*` 分组;写接口必须 `@login_required`。
- **响应**:`/api/*` 统一返回 `{ ok: bool, ... }`,出错带 `error` 字段和合适 HTTP 码。
- **模型改动**:改 `models.py` 后,因 SQLite 无迁移工具,开发期删库重建即可(`rm data/iangame.db` 重启)。生产结构变更另行处理。
- **安全**:密码 Werkzeug 哈希;查询一律走 SQLAlchemy(禁止拼 SQL);session httpOnly。

---

## 4. 前端开发规范
- **设计系统**:所有颜色/字体/圆角/辉光在 `style.css` 的 `:root` 用 CSS 变量定义,**禁止硬编码颜色**。
- **交互 JS**:统一放 `static/js/app.js`,暴露 `window.IanAPI`(fetch 封装)和 `window.IanGameLoader`(游戏加载与生命周期)。
- **可访问性**:按钮带 aria-label;焦点可见;关键操作有键盘等价。
- **无构建**:直接写 ES5/ES6,不引入打包器、不引入框架(降低小机负担)。

---

## 5. Git 规范

### 分支
- `main`:始终可部署的稳定版。只接 PR/合并,不直接 push 大改动。
- `dev`:集成分支(可选,小项目可直接在 main)。
- `feat-<范围>`:`feat-pvz`、`feat-frontend`、`fix-leaderboard`。
- `fix-<范围>`:`fix-snake-collision`。

### Commit 约定(Conventional Commits,中文动宾)
格式:`<type>(<scope>): <subject>`
- type:`feat` 新功能 / `fix` 修复 / `refactor` 重构 / `style` 样式 / `docs` 文档 / `chore` 杂务 / `test`
- scope:`backend` `frontend` `pvz` `kof` `snake` `deploy` `docs` 等
- 例:`feat(pvz): 实现阳光收集与僵尸波次`、`fix(backend): 修复排行榜按用户聚合错误`

**提交粒度**:一个逻辑改动一个 commit。游戏一个 commit,样式调整一个 commit,勿混杂。

### CHANGELOG
每次发版(打 tag)在 `CHANGELOG.md` 顶部追加一节,记录新增/修复/破坏性变更。

---

## 6. 本地开发流程
```bash
cd /usr/local/coneworkspace/iangame
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 开发模式(自动重载)
cd backend && python app.py            # → http://127.0.0.1:5000

# 生产模式
gunicorn -w 2 -b 127.0.0.1:8000 wsgi:app
```
- 改 Python 代码:开发模式自动重载;生产模式 `systemctl restart iangame`。
- 改前端/游戏:刷新浏览器即可(静态文件直出,Nginx 无缓存头时即时生效)。
- 改 SEED_GAMES:删 `data/iangame.db` 重启,或手动改库。

---

## 7. 测试 / 验证清单(改完必过)
- [ ] `python -c "from backend.app import create_app; create_app()"` 能启动(语法/导入正确)
- [ ] 首页 `/`、大厅 `/games`、各 `/play/<slug>` 返回 200
- [ ] `/api/games` 返回 14 款
- [ ] 每款游戏 `restart()` 不报错、`onScore` 能触发、`onGameOver` 能触发
- [ ] 登录→玩→上报分数→`/api/leaderboard/<slug>` 能看到自己

---

## 8. 给后续 session 的上手指南
1. 读 `PRD.md`(知道在做什么)→ 读本文件(知道怎么做)。
2. `git log --oneline` 看历史;`git status` 看当前状态。
3. 想加游戏:看第 2 节契约 + 参考任一现有 `static/games/*/game.js`。
4. 想改样式:只改 `static/css/style.css` 的 `:root` 变量。
5. 想改后端:看 `backend/app.py` 路由分组。
6. 动手前先开分支,改完按第 5 节规范提交。

---

## 9. 环境与凭据
- 服务器:Vultr,Ubuntu 24.04,2 vCPU/3.8G,root,UTC。
- 域名 `iangame.com` 需用户自行将 A 记录指向本机公网 IP。
- 生产密钥:部署时设环境变量 `IAN_SECRET_KEY`(勿用 config 默认值)。
- 数据库:SQLite 单文件 `data/iangame.db`,定期备份即拷贝该文件。
