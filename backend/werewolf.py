# -*- coding: utf-8 -*-
"""狼人杀核心逻辑:房间 / 发牌 / 状态机 / 事件记录。
app.py 只做路由与翻译;本模块不依赖 Flask 请求上下文(错误一律返回 i18n key)。

状态机(服务端权威,主持人推进):
  waiting → dealing → police_run → police_vote →(平票 police_pk)→
  night_guard → night_wolf → night_witch → night_seer → dawn(结算死讯/猎人/警徽)→
  day_talk → vote_cast →(平票 vote_pk)→ exile → 胜负判定 → night_* … 或 game_over

规则要点(面对面聚会场景,讨论/遗言线下口头):
- 只有主持人(上帝视角)可见全部身份;玩家只可见自己的牌
- 警长:放逐投票 1.5 票;竞选票平票 PK 再投,再平流选
- 守卫不能连守;守卫与女巫同守同救不冲突(不做"奶穿")
- 女巫不能自救、每晚只能用一瓶药、全局各一瓶
- 猎人被毒死不能开枪;胜负已定后不再触发技能
- 胜负(屠城简化):狼全灭→好人胜;狼数≥存活好人数→狼胜
"""
import json
import random
import re
import secrets
import time

from extensions import db
from models import WwRoom, WwPlayer, WwEvent

ROLES = ('wolf', 'villager', 'seer', 'witch', 'hunter', 'guard')
GODS = ('seer', 'witch', 'hunter', 'guard')
NIGHT_PHASES = ('night_guard', 'night_wolf', 'night_witch', 'night_seer')
MIN_PLAYERS, MAX_PLAYERS = 6, 12
ROOM_TTL = 24 * 3600      # 24h 无心跳的房间清理(复盘回看窗口)
ONLINE_WINDOW = 12        # 12s 内有心跳视为在线

NAME_RE = re.compile(r'^[\w\u4e00-\u9fa5]{1,12}$')

# 按人数的标准板(村民 = 人数 - 狼 - 神职)
PRESETS = {
    6:  {'wolf': 2, 'seer': 1, 'witch': 1, 'hunter': 0, 'guard': 0},
    7:  {'wolf': 2, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 0},
    8:  {'wolf': 2, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1},
    9:  {'wolf': 3, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1},
    10: {'wolf': 3, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1},
    11: {'wolf': 3, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1},
    12: {'wolf': 4, 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1},
}

ROLE_CAMP = {r: 'village' for r in ROLES}
ROLE_CAMP['wolf'] = 'wolf'


# ---------------- 基础工具 ----------------

def _now():
    return time.time()


def _loads(s, default):
    try:
        v = json.loads(s) if s else None
        return v if v is not None else default
    except Exception:
        return default


def _cfg(room):
    """角色配置:显式调整过的 config_json 优先,否则按人数给标准板"""
    c = _loads(room.config_json, None)
    if c:
        return c
    return preset_for(_player_count(room))


def preset_for(n):
    base = PRESETS.get(n)
    if base:
        c = dict(base)
    else:
        # 人数超出预设表时给保底板:狼 = n//4, 神职 = 预 1 女 1 猎 1 守 1
        c = {'wolf': max(2, n // 4), 'seer': 1, 'witch': 1, 'hunter': 1, 'guard': 1}
    c['villager'] = max(0, n - sum(c[k] for k in GODS) - c['wolf'])
    return c


def config_valid(c, n):
    """配置校验:键齐全、每神职≤1、狼≥1、狼<好人(2*wolf<n)、总数=人数"""
    try:
        wolf = int(c.get('wolf', 0))
        gods = {k: int(c.get(k, 0)) for k in GODS}
        total = wolf + sum(gods.values())
    except (TypeError, ValueError):
        return False
    if wolf < 1 or any(v not in (0, 1) for v in gods.values()):
        return False
    if wolf * 2 >= n or total > n:
        return False
    return True


def _players(room):
    return WwPlayer.query.filter_by(room_id=room.id).order_by(WwPlayer.seat).all()


def _player_count(room):
    return WwPlayer.query.filter_by(room_id=room.id).count()


def _alive(room):
    return [p for p in _players(room) if p.alive]


def _alive_with_role(room, role):
    return [p for p in _alive(room) if p.role == role]


def _pid(p):
    return p.id if p else 0


def _touch(room):
    room.updated_at = _now()
    db.session.commit()


def _evt(room, etype, actor=None, target=None, data=None, secret=False, phase=None, day=None):
    db.session.add(WwEvent(
        room_id=room.id, day_no=room.day_no if day is None else day,
        phase=phase or room.phase, type=etype,
        actor_id=_pid(actor), target_id=_pid(target),
        data_json=json.dumps(data or {}, ensure_ascii=False),
        secret=bool(secret), ts=_now(),
    ))


def auth_player(room, player_id, token):
    """token 校验(踢人后 token 置空即失效)"""
    try:
        pid = int(player_id)
    except (TypeError, ValueError):
        return None
    p = db.session.get(WwPlayer, pid)
    if p and p.room_id == room.id and p.token and p.token == token:
        return p
    return None


# ---------------- 房间生命周期 ----------------

def create_room(name):
    if not NAME_RE.match(name or ''):
        return None, None, 'ww_err_name'
    for _ in range(50):  # 房间号冲突重试
        code = str(random.randint(1000, 9999))
        if not WwRoom.query.filter_by(code=code).first():
            break
    else:
        return None, None, 'ww_err_busy'
    now = _now()
    room = WwRoom(code=code, phase='waiting', day_no=0, host_player_id=0,
                  config_json='', status='active', created_at=now, updated_at=now)
    db.session.add(room)
    db.session.flush()  # 取 room.id
    host = WwPlayer(room_id=room.id, seat=1, name=name, token=secrets.token_hex(16),
                    last_seen=now, joined_at=now)
    db.session.add(host)
    db.session.flush()
    room.host_player_id = host.id
    db.session.commit()
    return room, host, None


def join_room(code, name, token=''):
    """加入/重连:带 token 且匹配 → 恢复原身份(任何阶段);否则新玩家仅 waiting 可加入"""
    if not NAME_RE.match(name or ''):
        return None, None, 'ww_err_name'
    room = WwRoom.query.filter_by(code=(code or '').strip()).first()
    if not room or room.status != 'active':
        return None, None, 'ww_err_room'
    players = _players(room)
    if token:
        for p in players:
            if p.token == token:  # 断线重连(允许顺手改名,但不得与现存玩家重名)
                if p.name != name and any(x.name == name for x in players if x.id != p.id):
                    return None, None, 'ww_err_dup_name'
                p.name = name
                p.last_seen = _now()
                _touch(room)
                return room, p, None
    if room.phase != 'waiting':
        return None, None, 'ww_err_started'
    if any(p.name == name for p in players):
        return None, None, 'ww_err_dup_name'
    if len(players) >= MAX_PLAYERS:
        return None, None, 'ww_err_full'
    now = _now()
    p = WwPlayer(room_id=room.id, seat=max([x.seat for x in players], default=0) + 1,
                 name=name, token=secrets.token_hex(16), last_seen=now, joined_at=now)
    db.session.add(p)
    # 人数变化 → 回到当前人数的标准板(主持人此前的微调作废)
    room.config_json = ''
    db.session.flush()
    _evt(room, 'join', p, None, {'seat': p.seat}, phase='waiting')
    _touch(room)
    return room, p, None


def leave_room(room, me):
    """退出:主持人退=解散;waiting 阶段普通玩家退=移除;游戏中退出仅自然离线"""
    if me.id == room.host_player_id:
        room.status = 'abandoned'
        for p in _players(room):
            p.token = ''
        _evt(room, 'close', me, None, phase=room.phase)
        db.session.commit()
        return None
    if room.phase == 'waiting':
        db.session.delete(me)
        _evt(room, 'leave', me, None, {'seat': me.seat}, phase='waiting')
        room.config_json = ''
        db.session.commit()
    return None


def cleanup_stale():
    """惰性清理:全房间玩家 last_seen 距今超 ROOM_TTL → 物理删除(房间/玩家/事件)"""
    cutoff = _now() - ROOM_TTL
    rooms = WwRoom.query.filter(WwRoom.created_at < cutoff).all()
    for room in rooms:
        last = db.session.query(db.func.max(WwPlayer.last_seen)).filter_by(room_id=room.id).scalar() or 0
        if last < cutoff:
            WwEvent.query.filter_by(room_id=room.id).delete()
            WwPlayer.query.filter_by(room_id=room.id).delete()
            db.session.delete(room)
    if rooms:
        db.session.commit()


# ---------------- 发牌与夜晚 ----------------

def _deal(room):
    c = _cfg(room)
    pool = ['wolf'] * c['wolf'] + [g for g in GODS for _ in range(c[g])] + ['villager'] * c['villager']
    random.shuffle(pool)
    players = _players(room)
    for p, role in zip(players, pool):
        p.role = role
        p.alive = True
        p.is_police = False
        p.hunter_used = False
        p.badge_done = True
    room.phase = 'dealing'
    room.day_no = 0
    room.winner = None
    room.police_json = ''
    room.pending_json = ''
    room.votes_json = ''
    _evt(room, 'deal', None, None, {'roles': {r: pool.count(r) for r in set(pool)}}, phase='dealing')


def _night(room):
    return _loads(room.night_json, {})


def _police(room):
    return _loads(room.police_json, {})


def _pending(room):
    return _loads(room.pending_json, {})


def _votes(room):
    return _loads(room.votes_json, {})


def _enter_night(room):
    room.day_no += 1
    prev = _night(room)
    room.night_json = json.dumps({
        'guard': None, 'wolf': None, 'witch': None, 'seer': None,
        'heal_used': prev.get('heal_used', False),
        'poison_used': prev.get('poison_used', False),
        'last_guard': prev.get('guard', 0),
    })
    room.votes_json = ''
    room.phase = 'night_guard'
    room.talk_end = None
    _evt(room, 'night', phase='night_guard')
    _skip_empty_night(room)


def _night_actors(room, phase):
    """当前夜阶段需要行动的存活玩家(无 → 阶段自动跳过)"""
    if phase == 'night_guard':
        return _alive_with_role(room, 'guard')
    if phase == 'night_wolf':
        return _alive_with_role(room, 'wolf')
    if phase == 'night_witch':
        return _alive_with_role(room, 'witch')
    if phase == 'night_seer':
        return _alive_with_role(room, 'seer')
    return []


def _skip_empty_night(room):
    """无行动者的夜阶段自动前移;越过 night_seer 后直接结算进 dawn"""
    while room.phase in NIGHT_PHASES:
        if _night_actors(room, room.phase):
            return
        room.phase = NIGHT_PHASES[NIGHT_PHASES.index(room.phase) + 1] if room.phase != 'night_seer' else 'dawn'
        if room.phase == 'dawn':
            _resolve_night(room)
            return


def _next_night_phase(room):
    """主持人推进夜晚子阶段(未提交视为空过)"""
    if room.phase == 'night_seer':
        _resolve_night(room)
        return
    room.phase = NIGHT_PHASES[NIGHT_PHASES.index(room.phase) + 1]
    _skip_empty_night(room)


def _resolve_night(room):
    n = _night(room)
    guard = n.get('guard') or 0
    wolf = n.get('wolf') or 0
    witch = n.get('witch') or {}
    healed = witch.get('act') == 'heal' if witch else False
    poison = witch.get('target') if (witch and witch.get('act') == 'poison') else 0

    # secret 行动明细(复盘公开;进行中只有当事人与主持人可见)
    witch_p = (_alive_with_role(room, 'witch') or [None])[0]
    if guard:
        gp = db.session.get(WwPlayer, guard)
        _evt(room, 'guard', db.session.get(WwPlayer, guard), gp, secret=True)
    if wolf:
        wp = db.session.get(WwPlayer, wolf)
        _evt(room, 'kill', None, wp, secret=True)
        if healed:
            _evt(room, 'heal', witch_p, wp, secret=True)
    if witch and witch.get('act') == 'poison':
        pp = db.session.get(WwPlayer, poison)
        _evt(room, 'poison', witch_p, pp, secret=True)

    deaths = []
    if wolf and wolf != guard and not healed:
        deaths.append((wolf, 'wolf'))
    if poison:
        deaths.append((poison, 'poison'))
    # 死讯公告(公开,不含死因)
    dead_ps = [db.session.get(WwPlayer, pid) for pid, _ in deaths]
    _evt(room, 'dawn', None, None,
         {'deaths': [pid for pid, _ in deaths]}, phase='dawn')
    room.phase = 'dawn'
    room.talk_end = None
    for pid, cause in deaths:
        p = db.session.get(WwPlayer, pid)
        if p and p.alive:
            _kill(room, p, cause)


def _kill(room, p, cause):
    p.alive = False
    _evt(room, 'death', None, p, {'cause': cause})
    if room.winner:  # 胜负已定,技能不再触发
        return
    pend = _pending(room)
    if p.role == 'hunter' and not p.hunter_used and cause != 'poison':
        pend.setdefault('shoot', []).append(p.id)
    if p.is_police and not p.badge_done:
        pend.setdefault('badge', []).append(p.id)
        p.badge_done = False
    room.pending_json = json.dumps(pend)
    _check_winner(room)


def _pending_done(room):
    pend = _pending(room)
    return not pend.get('shoot') and not pend.get('badge')


def _check_winner(room):
    if room.winner:
        return
    alive = _alive(room)
    wolves = [p for p in alive if p.role == 'wolf']
    others = len(alive) - len(wolves)
    winner = None
    if not wolves:
        winner = 'village'
    elif len(wolves) >= others:
        winner = 'wolf'
    if winner:
        room.winner = winner
        room.status = 'finished'
        room.phase = 'game_over'
        room.pending_json = ''   # 胜负已定,猎人/警徽不再处理
        for p in alive:
            p.badge_done = True
        _evt(room, 'win', None, None, {'winner': winner}, phase='game_over')


# ---------------- 投票(警长竞选 / 放逐) ----------------

def _vote_weights(room, voters):
    """警长 1.5 票(放逐);竞选票人人 1 票"""
    return {p.id: (1.5 if p.is_police else 1.0) for p in voters}


def _tally(room, votes, voters, weight_map):
    """计票:votes={voter_id: target_id|0弃}。返回 (counts, 顶尖名单)"""
    by_id = {p.id: p for p in _players(room)}
    counts = {}
    detail = {}
    for v in voters:
        t = votes.get(str(v.id), None)
        w = weight_map[v.id]
        detail[v.id] = {'target': t or 0, 'weight': w}
        if t and t in by_id and by_id[t].alive:
            counts[t] = round(counts.get(t, 0) + w, 1)
    top = max(counts.values()) if counts else 0
    leaders = sorted([pid for pid, c in counts.items() if c == top]) if top > 0 else []
    return counts, leaders, detail


def _end_police_vote(room):
    pol = _police(room)
    cands = pol.get('cands') or pol.get('run') or []
    voters = [p for p in _alive(room) if p.id not in cands]
    counts, leaders, detail = _tally(room, _votes(room), voters, {p.id: 1.0 for p in voters})
    _evt(room, 'police_result', None, None,
         {'counts': counts, 'detail': detail, 'cands': cands, 'round': pol.get('round', 1)})
    players = {p.id: p for p in _players(room)}
    if len(leaders) == 1:
        sheriff = players[leaders[0]]
        sheriff.is_police = True
        sheriff.badge_done = True
        _evt(room, 'police', None, sheriff)
        _enter_night(room)
    elif not leaders or pol.get('round', 1) >= 2:
        _evt(room, 'police_none')
        _enter_night(room)
    else:
        pol['cands'] = leaders
        pol['round'] = 2
        room.police_json = json.dumps(pol)
        room.votes_json = ''
        room.phase = 'police_pk'


def _end_day_vote(room):
    votes = _votes(room)
    voters = _alive(room)
    counts, leaders, detail = _tally(room, votes, voters, _vote_weights(room, voters))
    _evt(room, 'vote_result', None, None, {'counts': counts, 'detail': detail})
    players = {p.id: p for p in _players(room)}
    if len(leaders) == 1:
        out = players[leaders[0]]
        _evt(room, 'exile', None, out)
        room.phase = 'exile'
        room.talk_end = None
        _kill(room, out, 'exile')
        if not room.winner and not _pending_done(room):
            pass  # 停在 exile 等待猎人/警徽
    else:
        if room.phase == 'vote_cast':  # 首轮平票 → PK
            pol = {'cands': leaders, 'round': 2, 'run': []}
            room.police_json = json.dumps(pol)
            room.votes_json = ''
            room.phase = 'vote_pk'
        else:  # PK 再平 → 无人放逐,入夜
            _evt(room, 'vote_none')
            _enter_night(room)


# ---------------- 状态查询(state 轮询) ----------------

def get_state(room, me):
    me.last_seen = _now()
    db.session.commit()
    players = _players(room)
    is_host = me.id == room.host_player_id
    started = room.phase not in ('waiting',)
    n = _night(room)
    pol = _police(room)
    votes = _votes(room)
    pend = _pending(room)

    # ---- players(公开字段,无角色) ----
    online_cut = _now() - ONLINE_WINDOW
    p_list = []
    for p in players:
        d = {'id': p.id, 'seat': p.seat, 'name': p.name, 'alive': p.alive,
             'is_police': p.is_police, 'is_host': p.id == room.host_player_id,
             'online': p.last_seen > online_cut}
        if room.phase == 'police_run' and p.alive:
            d['run'] = p.id in (pol.get('run') or [])
        p_list.append(d)

    # ---- me ----
    me_d = {
        'id': me.id, 'name': me.name, 'seat': me.seat, 'alive': me.alive,
        'is_police': me.is_police, 'is_host': is_host,
        'role': me.role if started else '', 'camp': ROLE_CAMP.get(me.role, '') if started else '',
        'hunter_used': me.hunter_used, 'badge_done': me.badge_done,
        'can': '',
        # 狼人白天可自爆(讨论/投票/PK)
        'can_explode': bool(started and me.alive and me.role == 'wolf'
                            and room.phase in ('day_talk', 'vote_cast', 'vote_pk')),
    }
    acts = []
    if is_host:
        acts = _host_actions(room, pend)
    me_d['needs'] = ''
    if me.id in (pend.get('shoot') or []):
        me_d['needs'] = 'hunter_shoot'
    elif me.id in (pend.get('badge') or []):
        me_d['needs'] = 'badge_pass'
    # 我的阶段性行动提示
    if room.phase == 'police_run' and me.alive:
        me_d['can'] = 'police_run'
    elif room.phase in NIGHT_PHASES and me.alive:
        if me in _night_actors(room, room.phase):
            # 狼队目标可反复修改直到阶段结束;其他角色提交一次即完成
            if room.phase == 'night_wolf' or not _my_night_done(room, me, n):
                me_d['can'] = room.phase
    elif room.phase in ('police_vote', 'police_pk', 'vote_cast', 'vote_pk') and me.alive:
        if not _can_vote(room, me, pol):
            me_d['can'] = ''
        elif str(me.id) not in votes:
            me_d['can'] = room.phase
    # 角色私有信息
    if started and me.role == 'witch':
        me_d['potions'] = {'heal': not n.get('heal_used', False), 'poison': not n.get('poison_used', False)}
        if room.phase == 'night_witch' and n.get('wolf'):
            me_d['night_kill'] = n.get('wolf') or 0
    if started and me.role == 'seer':
        rows = WwEvent.query.filter_by(room_id=room.id, type='check', actor_id=me.id).all()
        me_d['seer_results'] = [(_loads(r.data_json, {}).get('target', 0),
                                 _loads(r.data_json, {}).get('is_wolf', False)) for r in rows]

    # ---- votes 进度 ----
    vote_d = {'my': int(votes.get(str(me.id), 0) or 0), 'progress': len(votes), 'cands': []}
    if room.phase in ('police_vote', 'police_pk'):
        cands = pol.get('cands') or pol.get('run') or []
        vote_d['cands'] = cands
        vote_d['total'] = sum(1 for p in _alive(room) if p.id not in cands)
    elif room.phase == 'vote_pk':
        cands = pol.get('cands') or []
        vote_d['cands'] = cands
        vote_d['total'] = sum(1 for p in _alive(room) if p.id not in cands)
    elif room.phase == 'vote_cast':
        vote_d['total'] = len(_alive(room))
    else:
        vote_d['total'] = 0

    # ---- 夜晚行动进度(给主持人看"x/x 已行动") ----
    night_prog = None
    if room.phase in NIGHT_PHASES:
        actors = _night_actors(room, room.phase)
        if room.phase == 'night_wolf':
            done = 1 if n.get('wolf') is not None else 0
            night_prog = {'done': done, 'total': 1}
        else:
            done = 0
            for a in actors:
                if _my_night_done(room, a, n):
                    done += 1
            night_prog = {'done': done, 'total': len(actors)}

    # ---- 事件时间线(可见性裁剪) ----
    evts = WwEvent.query.filter_by(room_id=room.id).order_by(WwEvent.id).all()
    opened = room.phase == 'game_over'
    ev_list = []
    for e in evts:
        if e.secret and not opened and not is_host and e.actor_id != me.id:
            continue
        d = _loads(e.data_json, {})
        ev_list.append({'day': e.day_no, 'phase': e.phase, 'type': e.type,
                        'actor': e.actor_id, 'target': e.target_id,
                        'data': d, 'secret': e.secret})

    state = {
        'ok': True,
        'now': _now(),
        'room': {
            'code': room.code, 'phase': room.phase, 'day_no': room.day_no,
            'status': room.status, 'winner': room.winner or '',
            'host_id': room.host_player_id, 'talk_end': room.talk_end or 0,
            'count': len(players), 'min': MIN_PLAYERS, 'max': MAX_PLAYERS,
            'config': _cfg(room),
            'version': room.updated_at,
        },
        'me': me_d,
        'players': p_list,
        'votes': vote_d,
        'night_progress': night_prog,
        'events': ev_list,
    }
    # 主持人:全程上帝视角;普通玩家:仅 game_over 后身份揭示
    if (is_host and started) or room.phase == 'game_over':
        state['all_roles'] = [{'id': p.id, 'name': p.name, 'role': p.role,
                               'alive': p.alive, 'is_police': p.is_police} for p in players]
    return state


def _my_night_done(room, p, n):
    ph = room.phase
    if ph == 'night_guard':
        return n.get('guard') is not None
    if ph == 'night_wolf':
        return n.get('wolf') is not None
    if ph == 'night_witch':
        return n.get('witch') is not None
    if ph == 'night_seer':
        return n.get('seer') is not None
    return True


def _can_vote(room, p, pol):
    if room.phase in ('police_vote', 'police_pk'):
        cands = pol.get('cands') or pol.get('run') or []
        return p.id not in cands
    if room.phase == 'vote_pk':
        return p.id not in (pol.get('cands') or [])
    return True


def _host_actions(room, pend):
    ph = room.phase
    if ph == 'waiting':
        n = _player_count(room)
        return ['start'] if n >= MIN_PLAYERS else []
    if ph == 'dealing':
        return ['run_police', 'skip_police']
    if ph == 'police_run':
        return ['next_phase']
    if ph in ('police_vote', 'police_pk'):
        return ['next_phase']
    if ph in NIGHT_PHASES:
        return ['next_phase']
    if ph == 'dawn':
        return ['next_phase'] if _pending_done(room) else []
    if ph == 'day_talk':
        return ['next_phase', 'set_timer']
    if ph in ('vote_cast', 'vote_pk'):
        return ['next_phase']
    if ph == 'exile':
        return ['next_phase'] if _pending_done(room) else []
    if ph == 'game_over':
        return ['restart']
    return []


# ---------------- 动作入口 ----------------

def do_action(room, me, action, target=0, extra=None):
    extra = extra or {}
    is_host = me.id == room.host_player_id
    ph = room.phase

    # ===== 主持人类 =====
    if action == 'start':
        if not is_host or ph != 'waiting':
            return 'ww_err_host_only'
        n = _player_count(room)
        if n < MIN_PLAYERS or n > MAX_PLAYERS:
            return 'ww_err_players'
        if not config_valid(_cfg(room), n):
            return 'ww_err_config'
        _deal(room)
        _touch(room)
        return None

    if action == 'adjust_config':
        if not is_host or ph != 'waiting':
            return 'ww_err_host_only'
        c = extra.get('config') or {}
        n = _player_count(room)
        clean = {}
        try:
            clean['wolf'] = int(c.get('wolf', 2))
            for g in GODS:
                clean[g] = int(c.get(g, 0))
        except (TypeError, ValueError):
            return 'ww_err_config'
        if not config_valid(clean, n):
            return 'ww_err_config'
        clean['villager'] = n - clean['wolf'] - sum(clean[g] for g in GODS)
        room.config_json = json.dumps(clean)
        _touch(room)
        return None

    if action == 'kick':
        if not is_host:
            return 'ww_err_host_only'
        t = db.session.get(WwPlayer, int(target or 0))
        if not t or t.room_id != room.id or t.id == me.id:
            return 'ww_err_target'
        if ph == 'waiting':
            db.session.delete(t)
            room.config_json = ''
            _evt(room, 'leave', t, None, {'seat': t.seat}, phase='waiting')
        else:
            t.token = ''   # 被踢者 token 失效,无法再进入
            if t.is_police:
                t.badge_done = True
                _evt(room, 'badge_tear', None, t, phase=ph)
            _evt(room, 'kick', None, t, phase=ph)  # 不揭示角色
            if t.alive:
                _kill(room, t, 'kick')
        db.session.commit()
        return None

    if action == 'transfer_host':
        if not is_host:
            return 'ww_err_host_only'
        t = db.session.get(WwPlayer, int(target or 0))
        if not t or t.room_id != room.id:
            return 'ww_err_target'
        room.host_player_id = t.id
        _evt(room, 'host', me, t, phase=ph)
        _touch(room)
        return None

    if action == 'run_police':
        if not is_host or ph != 'dealing':
            return 'ww_err_host_only'
        room.police_json = json.dumps({'run': [], 'cands': [], 'round': 0})
        room.phase = 'police_run'
        _evt(room, 'police_start')
        _touch(room)
        return None

    if action == 'skip_police':
        if not is_host or ph != 'dealing':
            return 'ww_err_host_only'
        _evt(room, 'police_skip')
        _enter_night(room)
        _touch(room)
        return None

    if action == 'set_timer':
        if not is_host or ph != 'day_talk':
            return 'ww_err_host_only'
        try:
            secs = int(extra.get('secs', 0))
        except (TypeError, ValueError):
            return 'ww_err_param'
        room.talk_end = (_now() + secs) if secs > 0 else None
        db.session.commit()
        return None

    if action == 'restart':
        if not is_host or ph != 'game_over':
            return 'ww_err_host_only'
        WwEvent.query.filter_by(room_id=room.id).delete()  # 新一局,旧局事件清空
        for p in _players(room):
            p.role = ''
            p.alive = True
            p.is_police = False
            p.hunter_used = False
            p.badge_done = True
        room.phase = 'waiting'
        room.day_no = 0
        room.winner = None
        room.status = 'active'
        room.night_json = ''
        room.votes_json = ''
        room.police_json = ''
        room.pending_json = ''
        room.talk_end = None
        room.config_json = ''
        _touch(room)
        return None

    if action == 'next_phase':
        if not is_host:
            return 'ww_err_host_only'
        return _host_advance(room, extra)

    # ===== 玩家类 =====
    if action == 'police_run':
        if ph != 'police_run' or not me.alive:
            return 'ww_err_not_now'
        pol = _police(room)
        run = pol.get('run') or []
        if me.id not in run:
            run.append(me.id)
        pol['run'] = run
        room.police_json = json.dumps(pol)
        _evt(room, 'police_run', me)
        _touch(room)
        return None

    if action == 'police_quit':
        if ph != 'police_pk' or not me.alive:
            return 'ww_err_not_now'
        pol = _police(room)
        cands = [c for c in (pol.get('cands') or []) if c != me.id]
        pol['cands'] = cands
        room.police_json = json.dumps(pol)
        _evt(room, 'police_quit', me)
        if not cands:  # 全退光 → 无警长
            _evt(room, 'police_none')
            _enter_night(room)
        _touch(room)
        return None

    if action in ('police_vote', 'day_vote'):
        if ph not in ('police_vote', 'police_pk', 'vote_cast', 'vote_pk') or not me.alive:
            return 'ww_err_not_now'
        if not _can_vote(room, me, _police(room)):
            return 'ww_err_not_now'
        t = int(target or 0)
        if t:
            tp = db.session.get(WwPlayer, t)
            if not tp or tp.room_id != room.id or not tp.alive:
                return 'ww_err_target'
        votes = _votes(room)
        votes[str(me.id)] = t
        room.votes_json = json.dumps(votes)
        _touch(room)
        return None

    if action == 'wolf_explode':
        # 狼人自爆(白天讨论/投票/PK 阶段):身份公开、当天作废、直接入夜
        if not me.alive or me.role != 'wolf':
            return 'ww_err_not_now'
        if ph not in ('day_talk', 'vote_cast', 'vote_pk'):
            return 'ww_err_not_now'
        _evt(room, 'explode', me, me, phase=ph)
        if me.is_police:  # 自爆直接入夜,警长身份随之撕毁,不走 pending
            me.is_police = False
            me.badge_done = True
            _evt(room, 'badge_tear', me, phase=ph)
        room.votes_json = ''
        _kill(room, me, 'explode')   # 公开死亡 + 胜负判定
        if not room.winner:
            _enter_night(room)
        _touch(room)
        return None

    if action == 'night_act':
        return _night_act(room, me, target, extra)

    if action == 'hunter_shoot':
        pend = _pending(room)
        if me.id not in (pend.get('shoot') or []):
            return 'ww_err_not_now'
        t = int(target or 0)
        tp = None
        if t:
            tp = db.session.get(WwPlayer, t)
            if not tp or tp.room_id != room.id or not tp.alive:
                return 'ww_err_target'
        me.hunter_used = True
        pend['shoot'] = [x for x in pend['shoot'] if x != me.id]
        room.pending_json = json.dumps(pend)
        if tp:
            _evt(room, 'shoot', me, tp)
            _kill(room, tp, 'shoot')
        else:
            _evt(room, 'shoot_pass', me)
        db.session.commit()
        return None

    if action == 'badge_pass':
        pend = _pending(room)
        if me.id not in (pend.get('badge') or []):
            return 'ww_err_not_now'
        t = int(target or 0)
        tp = None
        if t:
            tp = db.session.get(WwPlayer, t)
            if not tp or tp.room_id != room.id or not tp.alive:
                return 'ww_err_target'
        me.is_police = False
        me.badge_done = True
        pend['badge'] = [x for x in pend['badge'] if x != me.id]
        room.pending_json = json.dumps(pend)
        if tp:
            tp.is_police = True
            tp.badge_done = True
            _evt(room, 'badge', me, tp)
        else:
            _evt(room, 'badge_tear', me)
        db.session.commit()
        return None

    return 'ww_err_action'


def _host_advance(room, extra):
    ph = room.phase
    if ph == 'police_run':
        pol = _police(room)
        run = pol.get('run') or []
        if not run:
            _evt(room, 'police_none')
            _enter_night(room)
        elif len(run) == 1:
            p = db.session.get(WwPlayer, run[0])
            p.is_police = True
            p.badge_done = True
            _evt(room, 'police', None, p)
            _enter_night(room)
        else:
            pol['cands'] = run
            pol['round'] = 1
            room.police_json = json.dumps(pol)
            room.votes_json = ''
            room.phase = 'police_vote'
        _touch(room)
        return None
    if ph in ('police_vote', 'police_pk'):
        _end_police_vote(room)
        _touch(room)
        return None
    if ph in NIGHT_PHASES:
        _next_night_phase(room)
        _touch(room)
        return None
    if ph == 'dawn':
        if not _pending_done(room):
            return 'ww_err_pending'
        room.phase = 'day_talk'
        room.talk_end = None
        _evt(room, 'day')
        _touch(room)
        return None
    if ph == 'day_talk':
        room.phase = 'vote_cast'
        room.votes_json = ''
        room.police_json = ''
        _evt(room, 'vote_start')
        _touch(room)
        return None
    if ph in ('vote_cast', 'vote_pk'):
        _end_day_vote(room)
        _touch(room)
        return None
    if ph == 'exile':
        if not _pending_done(room):
            return 'ww_err_pending'
        _enter_night(room)
        _touch(room)
        return None
    return 'ww_err_not_now'


def _night_act(room, me, target, extra):
    ph = room.phase
    if ph not in NIGHT_PHASES or not me.alive:
        return 'ww_err_not_now'
    n = _night(room)
    t = int(target or 0)
    players = {p.id: p for p in _players(room)}

    if ph == 'night_guard':
        if me.role != 'guard':
            return 'ww_err_not_now'
        if t and (t not in players or not players[t].alive or t == n.get('last_guard')):
            return 'ww_err_target'
        n['guard'] = t
    elif ph == 'night_wolf':
        if me.role != 'wolf':
            return 'ww_err_not_now'
        if t and (t not in players or not players[t].alive):
            return 'ww_err_target'
        n['wolf'] = t  # 狼队共同目标,后提交覆盖(可改)
    elif ph == 'night_witch':
        if me.role != 'witch':
            return 'ww_err_not_now'
        act = extra.get('act', 'skip')
        if act == 'heal':
            if n.get('heal_used'):
                return 'ww_err_potion'
            kill = n.get('wolf') or 0
            if not kill or kill == me.id:  # 无刀口或不能自救
                return 'ww_err_target'
            n['heal_used'] = True
            n['witch'] = {'act': 'heal', 'target': kill}
        elif act == 'poison':
            if n.get('poison_used'):
                return 'ww_err_potion'
            if not t or t not in players or not players[t].alive:
                return 'ww_err_target'
            n['poison_used'] = True
            n['witch'] = {'act': 'poison', 'target': t}
        else:
            act = 'skip'
            n['witch'] = {'act': 'skip', 'target': 0}
    elif ph == 'night_seer':
        if me.role != 'seer':
            return 'ww_err_not_now'
        if not t or t not in players or not players[t].alive:
            return 'ww_err_target'
        if any(_loads(e.data_json, {}).get('target') == t for e in
               WwEvent.query.filter_by(room_id=room.id, type='check', actor_id=me.id).all()):
            n['seer'] = t  # 允许重复验,不重复记事件
        else:
            is_wolf = players[t].role == 'wolf'
            _evt(room, 'check', me, players[t], {'target': t, 'is_wolf': is_wolf}, secret=True)
            n['seer'] = t
    else:
        return 'ww_err_not_now'

    room.night_json = json.dumps(n)
    db.session.commit()
    return None
