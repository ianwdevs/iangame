from datetime import datetime

from extensions import db


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(32), unique=True, nullable=False, index=True)
    name = db.Column(db.String(40), nullable=False)
    category = db.Column(db.String(20), nullable=False, index=True)
    icon = db.Column(db.String(8), default='🎮')
    color = db.Column(db.String(9), default='#b537f2')
    desc = db.Column(db.String(200), default='')
    controls = db.Column(db.String(200), default='')
    sort = db.Column(db.Integer, default=0)


class Score(db.Model):
    __tablename__ = 'scores'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    game_slug = db.Column(db.String(32), db.ForeignKey('games.slug'), nullable=False, index=True)
    score = db.Column(db.Integer, nullable=False, default=0)
    level = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Favorite(db.Model):
    __tablename__ = 'favorites'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    game_slug = db.Column(db.String(32), db.ForeignKey('games.slug'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (
        db.UniqueConstraint('user_id', 'game_slug', name='uq_user_game'),
    )


class LoginAttempt(db.Model):
    """登录失败记录(跨 worker 共享,防暴力破解)。定期清理过期记录。"""
    __tablename__ = 'login_attempts'
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(64), nullable=False, index=True)
    ts = db.Column(db.Float, nullable=False)  # 失败时间戳(epoch 秒)


# ============================================================
# 狼人杀(Werewolf):房间 / 玩家 / 事件 三表
# 免登录:玩家身份 = 昵称 + 随机 token(localStorage 保存,重连复用)
# 房间状态(阶段/当晚行动/投票/竞选/待处理死亡)集中存 room 的 json 字段,
# 多 gunicorn worker 经 SQLite 共享;轮询读、动作写。
# ============================================================
class WwRoom(db.Model):
    __tablename__ = 'ww_rooms'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(4), unique=True, nullable=False, index=True)  # 4位数字房间号
    phase = db.Column(db.String(16), nullable=False, default='waiting')
    day_no = db.Column(db.Integer, nullable=False, default=0)       # 第几夜/第几天,0=未开始
    host_player_id = db.Column(db.Integer, nullable=False, default=0)
    config_json = db.Column(db.Text, nullable=False, default='')    # 角色配置 {wolf:n, seer:0/1,...}
    winner = db.Column(db.String(16), nullable=True)                # wolf/village,未结束为 null
    status = db.Column(db.String(16), nullable=False, default='active')  # active/finished
    night_json = db.Column(db.Text, nullable=False, default='')     # 当晚行动(guard/wolf/witch/seer)
    votes_json = db.Column(db.Text, nullable=False, default='')     # 当前投票 {voter: target|0弃票}
    police_json = db.Column(db.Text, nullable=False, default='')    # 警长竞选(上警名单/候选/轮次)
    pending_json = db.Column(db.Text, nullable=False, default='')   # 待处理死亡(猎人开枪/警徽移交)
    talk_end = db.Column(db.Float, nullable=True)                   # 讨论截止 epoch(倒计时)
    created_at = db.Column(db.Float, nullable=False, default=0)
    updated_at = db.Column(db.Float, nullable=False, default=0)     # 兼作状态版本号(轮询比对)


class WwPlayer(db.Model):
    __tablename__ = 'ww_players'
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('ww_rooms.id'), nullable=False, index=True)
    seat = db.Column(db.Integer, nullable=False, default=0)         # 座位号(加入顺序)
    name = db.Column(db.String(12), nullable=False)
    token = db.Column(db.String(32), nullable=False, default='')    # 踢人后置空即失效
    role = db.Column(db.String(16), nullable=False, default='')     # 发牌前为空
    alive = db.Column(db.Boolean, nullable=False, default=True)
    is_police = db.Column(db.Boolean, nullable=False, default=False)
    hunter_used = db.Column(db.Boolean, nullable=False, default=False)  # 猎人技能是否已用
    badge_done = db.Column(db.Boolean, nullable=False, default=True)    # 警长死亡后是否已处理警徽
    last_seen = db.Column(db.Float, nullable=False, default=0)       # 轮询心跳(在线判定)
    joined_at = db.Column(db.Float, nullable=False, default=0)
    is_bot = db.Column(db.Boolean, nullable=False, default=False)    # 机器人(单人测试/凑数,自动行动)
    is_judge = db.Column(db.Boolean, nullable=False, default=False)  # 法官(主持人):无身份牌,不参与游戏


class WwEvent(db.Model):
    """单局游戏环节记录:按天分组时间线,复盘用。secret 事件(验人/用药明细/
    刀口死因)结算后仅当事人与主持人可见,game_over 后全公开。"""
    __tablename__ = 'ww_events'
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('ww_rooms.id'), nullable=False, index=True)
    day_no = db.Column(db.Integer, nullable=False, default=0)
    phase = db.Column(db.String(16), nullable=False, default='')
    type = db.Column(db.String(24), nullable=False, default='')     # deal/police/kill/heal/poison/check/vote/exile/shoot/badge/death/win...
    actor_id = db.Column(db.Integer, nullable=True)
    target_id = db.Column(db.Integer, nullable=True)
    data_json = db.Column(db.Text, nullable=False, default='')      # 结构化补充(票型/结果)
    secret = db.Column(db.Boolean, nullable=False, default=False)
    ts = db.Column(db.Float, nullable=False, default=0)


# 16 款游戏种子数据
# SLUG_RENAMES:去商标改 slug 的历史映射,_seed() 据此迁移旧数据,旧 play 链接据此 301
SLUG_RENAMES = {
    'tetris': 'neonblocks',
    'pvz': 'plantguard',
    'pvz-deluxe': 'plantguard-deluxe',
    'kof': 'arcadefighter',
}

SEED_GAMES = [
    {"slug": "plantguard", "name": "植物守卫战", "category": "defense", "icon": "🌻", "color": "#5fd35f",
     "desc": "布置植物军团,抵御一波波僵尸入侵草坪", "controls": "点击空地放置植物,收集阳光"},
    {"slug": "arcadefighter", "name": "街机格斗", "category": "battle", "icon": "👊", "color": "#ff2e63",
     "desc": "经典格斗对决,拳脚连招加必杀技", "controls": "A/D 移动 · W 跳 · J 拳 · K 脚 · L 必杀"},
    {"slug": "snake", "name": "霓虹贪吃蛇", "category": "casual", "icon": "🐍", "color": "#00e0ff",
     "desc": "操控霓虹蛇吞噬光点,越长越快", "controls": "方向键控制方向"},
    {"slug": "neonblocks", "name": "霓虹方块", "category": "puzzle", "icon": "🟦", "color": "#b537f2",
     "desc": "经典方块消除,整行消除得分", "controls": "←→ 移动 · ↑ 旋转 · ↓ 加速 · 空格直落"},
    {"slug": "g2048", "name": "2048", "category": "puzzle", "icon": "🔢", "color": "#ffb627",
     "desc": "滑动合并相同数字,挑战 2048", "controls": "方向键合并"},
    {"slug": "breakout", "name": "打砖块", "category": "casual", "icon": "🧱", "color": "#ff7847",
     "desc": "移动挡板反弹小球,击碎所有砖块", "controls": "鼠标 / 方向键移动挡板"},
    {"slug": "minesweeper", "name": "扫雷", "category": "puzzle", "icon": "💣", "color": "#7c8ba0",
     "desc": "逻辑推理标记地雷,揭开所有安全格", "controls": "左键揭开 · 右键插旗"},
    {"slug": "gomoku", "name": "五子棋", "category": "battle", "icon": "⚫", "color": "#00e0ff",
     "desc": "人机对弈,五子连珠者胜", "controls": "点击棋盘落子"},
    {"slug": "flappy", "name": "像素小鸟", "category": "casual", "icon": "🐤", "color": "#ffb627",
     "desc": "点击让小鸟飞跃管道,挑战极限", "controls": "点击 / 空格让小鸟上飞"},
    {"slug": "shooter", "name": "飞机大战", "category": "shooter", "icon": "🚀", "color": "#b537f2",
     "desc": "驾驶战机消灭敌机,拾取强化道具", "controls": "鼠标 / 方向键移动,自动开火"},
    {"slug": "tankbattle", "name": "坦克大战", "category": "shooter", "icon": "🛡️", "color": "#5fd35f",
     "desc": "操控坦克摧毁敌方,保卫基地", "controls": "方向键移动 · 空格开炮"},
    {"slug": "memory", "name": "记忆翻牌", "category": "puzzle", "icon": "🃏", "color": "#ff2e63",
     "desc": "翻开卡牌找出相同图案,考验记忆", "controls": "点击翻牌配对"},
    {"slug": "ironcommand", "name": "铁幕指挥官", "category": "strategy", "icon": "⚙️", "color": "#3da9fc",
     "desc": "经典即时战略:采矿、建造基地、生产军队,指挥作战摧毁敌方主基地(含战争迷雾、科技树、可选核弹)",
     "controls": "左键框选单位·右键移动/攻击·WASD移视野·右侧面板建造生产"},
    {"slug": "starfall", "name": "星陨防线", "category": "defense", "icon": "🛰️", "color": "#00e0ff",
     "desc": "太空科幻路径塔防:5种炮塔(光子/震荡/凝冰/雷电/天基)克制6种敌人,7关递进战役含Boss,三难度可调",
     "controls": "点建塔卡片选塔→点空地建造·点塔可升级/卖出·1-5键快选·Tab加速·ESC取消"},
    {"slug": "plantguard-deluxe", "name": "植物守卫战精致版", "category": "defense", "icon": "🌿", "color": "#39d98a",
     "desc": "精致塔防·植物贝塞尔自绘·元素反应(冰/火/毒/电)·光环增益·12植物·12僵尸·12关+Boss",
     "controls": "点商店选植物→点空地放置·收阳光·铲子可移除"},
    {"slug": "tankbattle-deluxe", "name": "坦克大战精致版", "category": "shooter", "icon": "🛡️", "color": "#39d98a",
     "desc": "精致射击·坦克贝塞尔自绘·3星成长·8道具·5种敌坦差异化AI·20关手工地图+Boss",
     "controls": "WASD/方向键移动·空格开炮·拾取道具强化"},
    {"slug": "werewolf", "name": "狼人杀", "category": "strategy", "icon": "🐺", "color": "#ff2e63",
     "desc": "面对面聚会神器:免登录建房,主持人上帝视角,手机翻牌看身份、夜晚行动、投票放逐,单局全程记录复盘",
     "controls": "创建/输入房间号加入·主持人推进流程·全员手机投票"},
    {"slug": "truthordare", "name": "真心话大冒险", "category": "casual", "icon": "🎭", "color": "#ff2e63",
     "desc": "聚会互动:转盘选出本轮幸运儿,真心话或大冒险二选一,内置 60 道题目随机抽",
     "controls": "点击转盘开始·点击卡片二选一"},
    {"slug": "numberbomb", "name": "数字炸弹", "category": "casual", "icon": "💣", "color": "#ffb627",
     "desc": "1 到 100 之间藏着一颗炸弹,轮流报数收缩安全范围,猜中炸弹的人中招",
     "controls": "数字键盘报数·点击 ✓ 确认"},
    {"slug": "luckyrevolver", "name": "幸运左轮", "category": "casual", "icon": "🎯", "color": "#b537f2",
     "desc": "六个弹巢只装一颗子弹,轮流扣扳机,六枪之内必出幸运儿",
     "controls": "点击扣扳机·传给下一位"},
    {"slug": "scmahjong", "name": "四川麻将", "category": "mahjong", "icon": "🀄", "color": "#2d8f6f",
     "desc": "血战到底:定缺换三张,不能吃只能碰杠胡,一炮多响,胡者离局战至最后,根/龙七对/杠上开花",
     "controls": "点牌打出·碰/杠/胡按钮决断·先定缺再换三张"},
    {"slug": "stdmahjong", "name": "标准麻将", "category": "mahjong", "icon": "🀅", "color": "#b04b3f",
     "desc": "136 张含字牌国标休闲玩法:可吃碰杠胡,清一色/混一色/七对/役牌刻/断幺九/门清计番",
     "controls": "点牌打出·吃(仅上家)/碰/杠/胡按钮决断"},
]

CATEGORY_LABELS = {
    'casual': '休闲',
    'puzzle': '益智',
    'shooter': '射击',
    'battle': '对战',
    'defense': '塔防',
    'strategy': '策略',
    'mahjong': '麻将',
}
