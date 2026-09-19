# iangame.com — 游戏门户 PRD / 技术设计

> 深色霓虹电竞风的 HTML5 小游戏聚合站。14 款游戏免登录即玩,登录享云端记分与排行榜。

## 1. 产品定位
- 域名 `iangame.com`,聚合 16 款 HTML5 游戏(含 2 款大型原创:经典风 RTS、路径式塔防)
- **游客**可玩全部游戏(本地记分);**登录用户**额外享全球排行榜 / 云端存分 / 收藏
- 登录注册宽松:无验证码、无密码强度限制,仅基础长度校验

## 2. 技术选型
| 层 | 选型 | 理由 |
|---|---|---|
| 后端 | Flask 3.x | 轻量,匹配 2 核小机 |
| 数据库 | SQLite | 单文件零运维 |
| ORM | Flask-SQLAlchemy | 防注入、模型清晰 |
| 认证 | Werkzeug 哈希 + Flask session | 无 JWT 复杂度 |
| 前端 | 原生 HTML/CSS/JS + Canvas | 无构建步骤 |
| WSGI | Gunicorn (2 worker) | 生产进程管理 |
| 反代 | Nginx | 静态直出 + 反代 |
| 入口隧道 | Cloudflare Tunnel (cloudflared) | 无公网入站端口,HTTPS 由 CF 管理 |

架构:`浏览器 ─HTTPS─> Cloudflare 边缘 ─tunnel─> cloudflared(本机) ─> Nginx:80 ─> Gunicorn:8000(Flask) ─> SQLite`;静态由 Nginx 直出。

## 3. 游戏清单(16)
| slug | 名称 | 分类 | 要点 |
|---|---|---|---|
| plantguard | 植物守卫战 | defense 塔防 | 5×9 网格,3 植物/3 僵尸,阳光与波次 |
| arcadefighter | 街机格斗 | battle 对战 | 1v1,拳/脚/必杀,血条,简易 AI |
| snake | 霓虹贪吃蛇 | casual 休闲 | 加速、记分 |
| neonblocks | 霓虹方块 | puzzle 益智 | 7 方块,消行,等级 |
| g2048 | 2048 | puzzle 益智 | 4×4 合并 |
| breakout | 打砖块 | casual 休闲 | 球+板+砖,多关 |
| minesweeper | 扫雷 | puzzle 益智 | 三难度,插旗 |
| gomoku | 五子棋 | battle 对战 | 人机,启发式 AI |
| flappy | 像素小鸟 | casual 休闲 | 管道躲避 |
| shooter | 飞机大战 | shooter 射击 | 滚动射击,道具 |
| tankbattle | 坦克大战 | shooter 射制 | 玩家/敌坦克,砖墙 |
| memory | 记忆翻牌 | puzzle 益智 | 翻牌配对计时 |
| ironcommand | 铁幕指挥官 | strategy 策略 | 原经典 RTS 风:采矿/造基地/产兵/迷雾/科技树/核弹,3 难度 |
| starfall | 星陨防线 | defense 塔防 | 太空科幻路径塔防:5 塔 6 敌 7 关战役,3 难度,可拆二级域名 |

## 4. 设计规范 — 深色霓虹电竞风
- 背景:`#060912` 页 / `#0d1320` 卡 / `#141b2e` 悬浮
- 霓虹:`#b537f2` 紫 / `#00e0ff` 青 / `#7c3aed` 蓝紫;主渐变 `linear-gradient(135deg,#b537f2,#00e0ff)`
- 文字:`#eaf0fb` 主 / `#8b97b3` 次;成功 `#2ee6a6` 危险 `#ff2e63`
- 字体:标题 Orbitron,正文 Rajdhani,分数 Orbitron tabular
- 玻璃卡:`rgba(20,27,46,.6)+blur(14px)+紫描边圆角16px`;按钮辉光;卡片 hover 上浮+双色描边

## 5. 数据模型
```
User(id, username唯一, password_hash, created_at)
Game(id, slug唯一, name, category, icon, color, desc, controls, sort)
Score(id, user_id, game_slug, score, level, created_at)
Favorite(id, user_id, game_slug)  unique(user,slug)
```

## 6. 路由 / API
- 页面:`/` `/games` `/play/<slug>` `/login` `/register` `/logout` `/profile`
- API:`POST /api/register` `POST /api/login` `POST /api/logout` `GET /api/me` `GET /api/games`
  `GET /api/leaderboard/<slug>` `POST /api/score`(登录) `GET|POST /api/favorite`(登录)

## 7. ★ 统一游戏接口契约(所有游戏必须遵守)
每个游戏为独立文件 `static/games/<slug>/game.js`,**只暴露一个全局 `window.IanGame`**:

```js
window.IanGame = {
  init(canvas, hooks) {
    // canvas: 主画布元素
    // hooks = {
    //   onScore(score, level),   // 分数/关卡变化时调用(用于 UI 与云存分)
    //   onGameOver(score, level),// 结束时调用
    //   onState(state),          // 'ready'|'playing'|'paused'|'over'
    // }
    // 返回 controller = { pause(), resume(), restart(), destroy() }
    return controller;
  }
};
```
- 必须**自包含**(不依赖外部库),用 IIFE 包裹,杜绝污染全局
- 必须支持 `restart()` 重开与 `pause()/resume()`
- 必须**自适应画布尺寸**(读取 `canvas.width/height`)
- 分数仅向**整数**,经 `onScore` 上报;`play.html` 负责本地存档(localStorage)与登录用户的云端 `POST /api/score`

## 8. 部署
1. `python3 -m venv venv && pip install -r backend/requirements.txt`
2. 初始化 SQLite(自动建表 + `_seed()` 灌入 14 款游戏元数据;按 slug upsert,加新游戏无需删库)
3. `gunicorn -w 2 -b 127.0.0.1:8000 wsgi:app`
4. Nginx 反代 + 静态直出;systemd 托管,开机自启
5. **入口走 Cloudflare Tunnel**(无公网入站端口,HTTPS 由 CF 管理):
   `cloudflared tunnel login` 授权 iangame.com zone → 建 tunnel → `config.yml` 把 iangame.com 转到本机 :80 → systemd 托管
   详细步骤见 [`deploy/SERVER_MIGRATION.md`](./deploy/SERVER_MIGRATION.md)(新机从零部署)
   与 [`deploy/DEPLOY_TUNNEL.md`](./deploy/DEPLOY_TUNNEL.md)(tunnel 运维)

## 9. 并行实施编排
- Wave 1 地基:后端 / 前端骨架 / 部署产物(并发)
- Wave 2 游戏:12 款分 4 批(每批 3 款并发)
- Wave 3 审查:接口一致性 / 样式 / 报错检查并修复;灌种子、部署、本地验证
