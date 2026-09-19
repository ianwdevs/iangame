# iangame.com

**中文** · [English](#english)

深色霓虹电竞风的 HTML5 小游戏聚合站,16 款游戏免登录即玩。

> **上手必读**:[`DEVELOPMENT.md`](./DEVELOPMENT.md) · [`PRD.md`](./PRD.md)

## 快速启动(开发)
```bash
cd iangame
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cd backend && python app.py          # http://127.0.0.1:5000
```

## 生产部署
```bash
bash deploy/deploy.sh               # 一键:venv + gunicorn + nginx + systemd
```
详见 [`deploy/`](./deploy/)。

## 技术栈
Flask 3 · SQLite · 原生 JS/Canvas · Gunicorn · Nginx · systemd

## 目录
- `backend/` Flask 应用与 API
- `templates/` Jinja2 模板
- `static/` CSS / 站点 JS / 16 款游戏
- `deploy/` 部署配置
- `PRD.md` 产品需求与技术设计
- `DEVELOPMENT.md` 开发与 Git 规范

## 许可证
[MIT](./LICENSE) · 全站支持中 / 英 / 西 / 法 / 德 / 意 / 葡 7 种语言

---

# English

[中文](#iangamecom) · **English**

iangame.com — a dark neon esports-styled HTML5 mini-game portal with 16 games, playable without signing up.

> **Must read**: [`DEVELOPMENT.md`](./DEVELOPMENT.md) · [`PRD.md`](./PRD.md)

## Quick Start (Development)
```bash
cd iangame
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cd backend && python app.py          # http://127.0.0.1:5000
```

## Production Deployment
```bash
bash deploy/deploy.sh               # one-shot: venv + gunicorn + nginx + systemd
```
See [`deploy/`](./deploy/) for details.

## Tech Stack
Flask 3 · SQLite · Vanilla JS/Canvas · Gunicorn · Nginx · systemd

## Project Layout
- `backend/` Flask app & API
- `templates/` Jinja2 templates
- `static/` CSS / site JS / 16 games
- `deploy/` deployment configs
- `PRD.md` product requirements & technical design
- `DEVELOPMENT.md` development & Git conventions

## License
[MIT](./LICENSE) · The site supports 7 languages: Chinese / English / Spanish / French / German / Italian / Portuguese
