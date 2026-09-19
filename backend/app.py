import re
import time
import hmac
import hashlib
from functools import wraps

from flask import (
    Flask, render_template, request, session, redirect,
    url_for, jsonify, g, abort,
)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from config import Config
from extensions import db
from models import User, Game, Score, Favorite, LoginAttempt, SEED_GAMES, CATEGORY_LABELS, SLUG_RENAMES
from i18n import LANGS, LANG_NAMES, STRINGS, detect_lang, tr, COOKIE_NAME as LANG_COOKIE, COOKIE_MAX_AGE as LANG_COOKIE_AGE
from i18n_games import get_game_meta, CATEGORY_LABELS_I18N

_USERNAME_RE = re.compile(r'^[\w\u4e00-\u9fa5]{2,20}$')

# 敏感用户名黑名单:防止注册 admin/root/login 等误导性或特权暗示的用户名
_USERNAME_BLACKLIST = {
    'admin', 'administrator', 'root', 'system', 'login', 'logout',
    'register', 'api', 'static', 'games', 'play', 'profile',
    'iangame', 'support', 'help', 'test', 'guest', 'user',
    'me', 'settings', 'config', 'console', 'superuser', 'operator',
}

# ============================================================
# 登录速率限制(基于 SQLite,跨 Gunicorn worker 共享;防暴力破解)
# ============================================================
LOGIN_WINDOW = 60          # 60 秒窗口
LOGIN_MAX_FAIL = 5         # 窗口内最多 5 次失败


def _login_fail_count(ip):
    """该 IP 在窗口内的失败次数(顺带清理过期记录)"""
    now = time.time()
    cutoff = now - LOGIN_WINDOW
    # 清理过期(顺带,防表膨胀;偶尔执行即可,加随机降低多 worker 同时清理)
    if int(now) % 10 == 0:
        db.session.query(LoginAttempt).filter(LoginAttempt.ts < cutoff).delete()
        db.session.commit()
    return db.session.query(LoginAttempt).filter(
        LoginAttempt.ip == ip, LoginAttempt.ts > cutoff).count()


def _login_record_fail(ip):
    """记录一次登录失败"""
    db.session.add(LoginAttempt(ip=ip, ts=time.time()))
    db.session.commit()


# ============================================================
# CSRF 防护:校验同源(写操作必须来自本站)
# ============================================================
def _csrf_check():
    """对会改变状态的 POST 请求校验 Origin/Referer 同源。

    策略:只要 Origin 或 Referer 出现,就必须匹配本站 host;不匹配一律拒绝。
    两者都缺失时(非浏览器/curl 裸请求),拒绝 JSON 请求。
    """
    if request.method != 'POST':
        return True
    host = request.host
    origin = request.headers.get('Origin') or ''
    referer = request.headers.get('Referer') or ''
    # 收集所有提供的来源头
    provided = []
    for val in (origin, referer):
        if not val:
            continue
        val_host = val
        for prefix in ('https://', 'http://'):
            if val_host.startswith(prefix):
                val_host = val_host[len(prefix):].split('/')[0]
                break
        provided.append(val_host)
    # 有提供来源头 → 至少一个必须等于本站 host(有但不匹配=跨站,拒绝)
    if provided:
        return host in provided
    # 没有任何来源头:浏览器 fetch(form/json)总会带,缺失视为可疑,拒绝 JSON
    ct = request.headers.get('Content-Type', '')
    if 'application/json' in ct:
        return False
    return True


def login_required(f):
    @wraps(f)
    def _w(*a, **kw):
        if 'uid' not in session:
            if request.path.startswith('/api/'):
                return jsonify(ok=False, error=tr('err_login')), 401
            return redirect(url_for('login'))
        return f(*a, **kw)
    return _w


def csrf_required(f):
    """装饰器:对该视图强制 CSRF 同源校验"""
    @wraps(f)
    def _w(*a, **kw):
        if not _csrf_check():
            return jsonify(ok=False, error=tr('err_csrf')), 403
        return f(*a, **kw)
    return _w


def create_app(config_class=Config):
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    app.config.from_object(config_class)
    # 经 Cloudflare → cloudflared → Nginx → Gunicorn 多层代理
    # ProxyFix 让 request.remote_addr 取真实客户端 IP(限流/日志用)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=2, x_proto=1, x_host=1)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        _seed()

    # ---- 安全响应头统一由 Nginx 设置(避免反代时与 Nginx 重复叠加)----
    @app.after_request
    def _security_headers(resp):
        return resp

    # ---- 每请求检测语言(在加载用户之前)----
    @app.before_request
    def _detect_lang():
        g.lang = detect_lang()

    # ---- 每请求加载当前用户 ----
    @app.before_request
    def _load_user():
        uid = session.get('uid')
        g.user = db.session.get(User, uid) if uid else None

    @app.context_processor
    def _ctx():
        lang = getattr(g, 'lang', 'zh')
        games = Game.query.order_by(Game.sort).all()
        counts = {}
        for gm in games:
            counts[gm.category] = counts.get(gm.category, 0) + 1
        # 当前语言的全部游戏元数据 {slug: {name, desc, controls}}
        gmeta = {gm.slug: get_game_meta(gm.slug, lang, gm.name, gm.desc, gm.controls) for gm in games}
        return dict(
            current_user=g.user,
            all_games=games,
            category_counts=counts,
            category_labels=CATEGORY_LABELS_I18N.get(lang) or CATEGORY_LABELS,
            lang=lang,
            langs=LANGS,
            lang_names=LANG_NAMES,
            t=STRINGS.get(lang) or STRINGS['zh'],
            games_meta=gmeta,
        )

    # ---- 语言切换:设 cookie 后回跳 ----
    @app.route('/setlang/<lang>')
    def set_lang(lang):
        target = lang if lang in LANGS else 'zh'
        resp = redirect(request.referrer or url_for('index'))
        resp.set_cookie(LANG_COOKIE, target, max_age=LANG_COOKIE_AGE, samesite='Lax')
        return resp

    # ================= 页面 =================
    @app.route('/')
    def index():
        hot = Game.query.order_by(Game.sort).limit(8).all()
        return render_template('index.html', hot_games=hot)

    @app.route('/games')
    def games_page():
        return render_template('games.html')

    @app.route('/play/<slug>')
    def play(slug):
        # 旧 slug 301 到新 slug(历史分享链接兼容)
        if slug in SLUG_RENAMES:
            return redirect(url_for('play', slug=SLUG_RENAMES[slug]), code=301)
        game = Game.query.filter_by(slug=slug).first()
        if not game:
            abort(404)
        # 为登录用户签发短期游戏令牌(用于提交分数时校验,防直接调 API 刷分)
        game_token = ''
        if g.user:
            game_token = _issue_game_token(app, g.user.id)
        return render_template('play.html', game=game, game_token=game_token,
                               game_meta=get_game_meta(slug, g.lang, game.name, game.desc, game.controls))

    @app.route('/login')
    def login():
        return render_template('login.html', mode='login')

    @app.route('/register')
    def register():
        return render_template('login.html', mode='register')

    @app.route('/logout')
    def logout():
        session.pop('uid', None)
        return redirect(url_for('index'))

    @app.route('/profile')
    @login_required
    def profile():
        return render_template('profile.html')

    # ================= API =================
    @app.post('/api/register')
    @csrf_required
    def api_register():
        d = request.get_json(silent=True) or {}
        u = (d.get('username') or '').strip()
        p = d.get('password') or ''
        if not _USERNAME_RE.match(u):
            return jsonify(ok=False, error=tr('err_username_fmt')), 400
        if u.lower() in _USERNAME_BLACKLIST:
            return jsonify(ok=False, error=tr('err_username_reserved')), 400
        if not (4 <= len(p) <= 60):
            return jsonify(ok=False, error=tr('err_password_fmt')), 400
        user = User(username=u, password_hash=generate_password_hash(p))
        db.session.add(user)
        try:
            # 竞态安全:并发注册同名时,唯一约束触发 IntegrityError → 409
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(ok=False, error=tr('err_username_taken')), 409
        session['uid'] = user.id
        return jsonify(ok=True, user=_pub(user))

    @app.post('/api/login')
    @csrf_required
    def api_login():
        ip = request.remote_addr or '0.0.0.0'
        if _login_fail_count(ip) >= LOGIN_MAX_FAIL:
            return jsonify(ok=False, error=tr('err_too_fast')), 429
        d = request.get_json(silent=True) or {}
        u = (d.get('username') or '').strip()
        p = d.get('password') or ''
        user = User.query.filter_by(username=u).first()
        # 统一报错 + 失败计数(无论用户名是否存在都计,防止用户名枚举探测)
        if not user or not check_password_hash(user.password_hash, p):
            _login_record_fail(ip)
            return jsonify(ok=False, error=tr('err_credentials')), 401
        session['uid'] = user.id
        return jsonify(ok=True, user=_pub(user))

    @app.post('/api/logout')
    @csrf_required
    def api_logout():
        session.pop('uid', None)
        return jsonify(ok=True)

    @app.get('/api/me')
    def api_me():
        return jsonify(ok=True, user=_pub(g.user) if g.user else None)

    @app.get('/api/games')
    def api_games():
        return jsonify(ok=True, games=[_game_pub(gm) for gm in Game.query.order_by(Game.sort).all()])

    @app.get('/api/leaderboard/<slug>')
    def api_leaderboard(slug):
        rows = (
            db.session.query(User.username.label('u'), func.max(Score.score).label('s'))
            .join(User, Score.user_id == User.id)
            .filter(Score.game_slug == slug)
            .group_by(User.id)
            .order_by(func.max(Score.score).desc())
            .limit(20).all()
        )
        return jsonify(ok=True, board=[{'username': r.u, 'score': r.s} for r in rows])

    @app.post('/api/score')
    @login_required
    @csrf_required
    def api_score():
        d = request.get_json(silent=True) or {}
        slug = (d.get('slug') or '').strip()
        token = d.get('token') or ''
        # 令牌校验:必须携带本会话签发的有效令牌,防直接调 API 刷分
        if not _verify_game_token(app, g.user.id, token):
            return jsonify(ok=False, error=tr('err_token')), 403
        try:
            score = int(d.get('score') or 0)
            level = int(d.get('level') or 0)
        except (TypeError, ValueError):
            return jsonify(ok=False, error=tr('err_param')), 400
        if not Game.query.filter_by(slug=slug).first():
            return jsonify(ok=False, error=tr('err_game_not_found')), 404
        if score < 0 or score > app.config['MAX_SCORE_PER_SUBMIT']:
            return jsonify(ok=False, error=tr('err_score')), 400
        if level < 0 or level > 9999:
            return jsonify(ok=False, error=tr('err_level')), 400
        sc = Score(user_id=g.user.id, game_slug=slug, score=score, level=level)
        db.session.add(sc)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(ok=False, error=tr('err_submit')), 400
        higher = db.session.query(func.count(Score.id)).filter(
            Score.game_slug == slug, Score.score > score).scalar() or 0
        rank = higher + 1
        best = db.session.query(func.max(Score.score)).filter_by(
            user_id=g.user.id, game_slug=slug).scalar() or 0
        return jsonify(ok=True, rank=int(rank), best=int(best))

    @app.get('/api/favorite')
    @login_required
    def api_fav_list():
        favs = Favorite.query.filter_by(user_id=g.user.id).all()
        return jsonify(ok=True, favorites=[f.game_slug for f in favs])

    @app.post('/api/favorite')
    @login_required
    @csrf_required
    def api_fav_toggle():
        d = request.get_json(silent=True) or {}
        slug = (d.get('slug') or '').strip()
        if not Game.query.filter_by(slug=slug).first():
            return jsonify(ok=False, error=tr('err_game_not_found')), 404
        fav = Favorite.query.filter_by(user_id=g.user.id, game_slug=slug).first()
        if fav:
            db.session.delete(fav)
            db.session.commit()
            return jsonify(ok=True, favorite=False)
        # 竞态安全:并发重复收藏时唯一约束兜底
        db.session.add(Favorite(user_id=g.user.id, game_slug=slug))
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
        return jsonify(ok=True, favorite=True)

    @app.get('/api/profile')
    @login_required
    def api_profile():
        uid = g.user.id
        records = (
            db.session.query(
                Score.game_slug.label('slug'),
                func.max(Score.score).label('best'),
                func.count(Score.id).label('plays'),
            )
            .filter_by(user_id=uid)
            .group_by(Score.game_slug).all()
        )
        best_map = {r.slug: {'best': r.best, 'plays': r.plays} for r in records}
        favs = [f.game_slug for f in Favorite.query.filter_by(user_id=uid).all()]
        games = Game.query.order_by(Game.sort).all()
        data = []
        for gm in games:
            b = best_map.get(gm.slug)
            data.append({
                'slug': gm.slug, 'name': gm.name, 'icon': gm.icon, 'color': gm.color,
                'best': b['best'] if b else 0, 'plays': b['plays'] if b else 0,
            })
        return jsonify(ok=True, username=g.user.username, favorites=favs, games=data)

    @app.errorhandler(404)
    def _404(e):
        if request.path.startswith('/api/'):
            return jsonify(ok=False, error=tr('err_game_not_found')), 404
        return render_template('404.html'), 404

    @app.errorhandler(429)
    def _429(e):
        return jsonify(ok=False, error=tr('err_rate')), 429

    return app


def _pub(user):
    return {'id': user.id, 'username': user.username}


# ============================================================
# 游戏令牌:登录用户进入游戏页时签发,提交分数时校验
# 防"不玩游戏、直接构造 POST /api/score 刷分"。令牌与用户绑定且有 TTL。
# ============================================================
def _issue_game_token(app, user_id):
    key = app.config['GAME_TOKEN_KEY'].encode()
    exp = int(time.time()) + app.config['GAME_TOKEN_TTL']
    payload = f'{user_id}:{exp}'
    sig = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}:{sig}'


def _verify_game_token(app, user_id, token):
    if not token or ':' not in token:
        return False
    try:
        uid_s, exp_s, sig = token.rsplit(':', 2)
        uid = int(uid_s)
        exp = int(exp_s)
    except (ValueError, TypeError):
        return False
    if uid != user_id:
        return False
    if exp < time.time():
        return False  # 过期
    key = app.config['GAME_TOKEN_KEY'].encode()
    payload = f'{uid}:{exp}'
    expect = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    # hmac.compare_digest 防时序攻击
    return hmac.compare_digest(expect, sig)


def _game_pub(gm):
    lang = getattr(g, 'lang', 'zh')
    m = get_game_meta(gm.slug, lang, gm.name, gm.desc, gm.controls)
    return {
        'slug': gm.slug, 'name': m['name'], 'category': gm.category,
        'icon': gm.icon, 'color': gm.color, 'desc': m['desc'], 'controls': m['controls'],
    }


def _seed():
    """按 slug upsert 种子游戏:已有库可补种新游戏,无需删库。
    sort 以 SEED_GAMES 中的顺序为准(新游戏追加在末尾)。"""
    changed = False
    # 去商标 slug 迁移:games/scores/favorites 三表联动,保留历史分数与收藏
    for old, new in SLUG_RENAMES.items():
        has_old = Game.query.filter_by(slug=old).first()
        has_new = Game.query.filter_by(slug=new).first()
        if has_old and not has_new:
            Score.query.filter_by(game_slug=old).update({'game_slug': new})
            Favorite.query.filter_by(game_slug=old).update({'game_slug': new})
            has_old.slug = new
            changed = True
    existing = {g.slug: g for g in Game.query.all()}
    for i, g in enumerate(SEED_GAMES):
        row = existing.get(g['slug'])
        if row is None:
            db.session.add(Game(sort=i, **g))
            changed = True
        else:
            # 同步显示字段与排序(不改 id)
            for k in ('name', 'category', 'icon', 'color', 'desc', 'controls'):
                if getattr(row, k) != g.get(k):
                    setattr(row, k, g.get(k))
                    changed = True
            if row.sort != i:
                row.sort = i
                changed = True
    if changed:
        db.session.commit()


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5000, debug=True)
