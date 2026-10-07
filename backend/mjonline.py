# -*- coding: utf-8 -*-
"""在线麻将引擎(四川/标准) — 服务端权威状态机,移植自 static/games/mahjong/core.js(已测试)
架构沿用 werewolf.py:免登录房间号 + player token 身份 + 惰性推进(轮询时到期自动结算/机器人行动)
牌 id = suit*10 + rank ; suit: 0万 1条 2筒 3字(东南西北中发白 rank1-7)
"""
import json
import random
import time

from flask import current_app
from models import db, MjRoom, MjPlayer, MjEvent

NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
HON = ['東', '南', '西', '北', '中', '發', '白']
SUIT_NAME = ['万', '条', '筒']

ROOM_TTL = 24 * 3600          # 无心跳房间清理
WAIT_TTL = 2 * 3600           # 等待中房间 2 小时
TURN_SEC = 30                 # 出牌限时
CALL_SEC = 12                 # 叫牌决断限时
DING_SEC = 20                 # 定缺/换三张限时
BOT_DELAY = (0.8, 1.6)        # 机器人思考秒数区间


def _now():
    return time.time()


def _dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def _loads(s, default):
    try:
        v = json.loads(s) if s else default
        return v
    except Exception:
        return default


def t_name(tid):
    s, r = tid // 10, tid % 10
    return HON[r - 1] if s == 3 else NUM[r - 1] + SUIT_NAME[s]


def tile_ids(has_honors):
    ids = [s * 10 + r for s in range(3) for r in range(1, 10)]
    if has_honors:
        ids += [30 + h for h in range(1, 8)]
    return ids


# =====================================================================
# 牌理(与 JS core.js 等价,移植时保持行为一致)
# =====================================================================
def counts_of(hand):
    c = [0] * 40
    for t in hand:
        c[t] += 1
    return c


def _extract_sets(c, need):
    if need == 0:
        return True
    for i in range(40):
        if c[i] > 0:
            if c[i] >= 3:
                c[i] -= 3
                if _extract_sets(c, need - 1):
                    return True
                c[i] += 3
            if i // 10 < 3 and i % 10 <= 7 and c[i + 1] > 0 and c[i + 2] > 0:
                c[i] -= 1; c[i + 1] -= 1; c[i + 2] -= 1
                if _extract_sets(c, need - 1):
                    return True
                c[i] += 1; c[i + 1] += 1; c[i + 2] += 1
            return False
    return True


def _pong_only(c):
    for p in range(40):
        if c[p] < 2:
            continue
        c[p] -= 2
        ok = all(c[i] in (0, 3) for i in range(40))
        c[p] += 2
        if ok:
            return True
    return False


def try_win(hand):
    """返回 {'win','seven','dragon','pongOnly'}"""
    c = counts_of(hand)
    total = len(hand)
    pairs = 0
    dragon = False
    all_even = True
    for i in range(40):
        if c[i] % 2:
            all_even = False
        elif c[i]:
            pairs += c[i] // 2
            if c[i] >= 4:
                dragon = True
    if all_even and total == 14 and pairs == 7:
        return {'win': True, 'seven': True, 'dragon': dragon, 'pongOnly': True}
    if total % 3 != 2:
        return {'win': False, 'seven': False, 'dragon': False, 'pongOnly': False}
    for i in range(40):
        if c[i] >= 2:
            c[i] -= 2
            if _extract_sets(c, (total - 2) // 3):
                c[i] += 2
                return {'win': True, 'seven': False, 'dragon': False, 'pongOnly': _pong_only(counts_of(hand))}
            c[i] += 2
    return {'win': False, 'seven': False, 'dragon': False, 'pongOnly': False}


def ting_tiles(hand, que=-1, has_honors=False):
    out = []
    c = counts_of(hand)
    for t in tile_ids(has_honors):
        if c[t] >= 4:
            continue
        if que >= 0 and t // 10 == que:
            continue
        hand.append(t)
        ok = try_win(hand)['win']
        hand.pop()
        if ok:
            out.append(t)
    return out


def can_chow_with(hand, tile):
    """tile 为他人打出的牌,手 + tile 能否成顺(那两张在手)"""
    c = counts_of(hand)
    s = tile // 10
    if s == 3:
        return None
    for d in (-2, -1, 0):
        a = tile + d
        if a % 10 < 1 or (a + 2) % 10 > 9 or a // 10 != s or (a + 2) // 10 != s:
            continue
        ok = True
        for x in (a, a + 1, a + 2):
            if x != tile and not c[x]:
                ok = False
        if ok:
            return a
    return None


def calc_fans(hand, melds, self_drawn, sichuan, ctx=None):
    """番型:返回 {'list':[(名,番)...], 'total', 'points'} — 与 JS core.js 口径一致"""
    ctx = ctx or {}
    w = try_win(hand)
    if not w['win']:
        return {'list': [], 'total': 0, 'points': 0}
    c = counts_of(hand)
    suits = {}
    for t in hand:
        suits[t // 10] = True
    for m in melds:
        suits[m['tile'] // 10] = True
    suit_cnt = sum(1 for s in range(3) if s in suits)
    has_hon = 3 in suits
    pong_melds_only = all(m['type'] != 'chow' for m in melds)
    fans = []
    if w['seven']:
        fans.append(['七对', 2])
        if w['dragon']:
            fans.append(['龙七对', 2])
    else:
        if w['pongOnly'] and pong_melds_only:
            fans.append(['对对胡', 2])
        else:
            fans.append(['平胡', 1])
    if suit_cnt == 1 and not has_hon:
        fans.append(['清一色', 4])
    elif suit_cnt == 1 and has_hon:
        fans.append(['混一色', 2])
    if sichuan:
        meld_cnt = {}
        for m in melds:
            if m['type'] in ('pong', 'kong'):
                meld_cnt[m['tile']] = meld_cnt.get(m['tile'], 0) + (4 if m['type'] == 'kong' else 3)
        gen = sum(1 for i in range(40) if c[i] + meld_cnt.get(i, 0) >= 4)
        if gen:
            fans.append(['根×%d' % gen, gen])
    else:
        yan = 0
        for i in (35, 36, 37):
            got = c[i] >= 3
            for m in melds:
                if m['tile'] == i and m['type'] != 'chow':
                    got = True
            if got:
                yan += 1
        if yan:
            fans.append(['役牌刻×%d' % yan, yan])
        duan = all(c[i] == 0 or (i // 10 < 3 and 2 <= i % 10 <= 8) for i in range(40)) and \
            all(m['tile'] // 10 < 3 and 2 <= m['tile'] % 10 <= 8 for m in melds)
        if duan and not w['seven']:
            fans.append(['断幺九', 1])
        concealed = all(m.get('from', -1) == -1 for m in melds)
        if concealed and not w['seven']:
            fans.append(['门清', 1])
    if self_drawn:
        fans.append(['自摸', 1])
    if ctx.get('gangDraw'):
        fans.append(['杠上开花', 2])
    if ctx.get('qiangGang'):
        fans.append(['抢杠胡', 2])
    if ctx.get('seaBottom'):
        fans.append(['海底捞月', 1])
    if ctx.get('tianHu'):
        fans.append(['天胡', 4])
    if ctx.get('diHu'):
        fans.append(['地胡', 4])
    total = sum(f[1] for f in fans)
    return {'list': fans, 'total': total, 'points': total * 10}


def fan_text(det):
    return ' '.join('%s%d番' % (f[0], f[1]) for f in det['list']) + (' 共%d番' % det['total'] if det['list'] else '')


# =====================================================================
# AI(与 JS 口径一致)
# =====================================================================
def hand_quality(c, que):
    a = c[:]
    score = 0.0
    if que >= 0:
        for i in range(40):
            if i // 10 == que:
                a[i] = 0
    for i in range(40):
        while a[i] >= 3:
            a[i] -= 3
            score += 10
    for _k in range(2):
        for i in range(40):
            if i // 10 < 3 and i % 10 <= 7 and a[i] > 0 and a[i + 1] > 0 and a[i + 2] > 0:
                a[i] -= 1; a[i + 1] -= 1; a[i + 2] -= 1
                score += 9
    for i in range(40):
        while a[i] >= 2:
            a[i] -= 2
            score += 2
    for i in range(40):
        if i // 10 < 3 and i % 10 <= 7 and a[i] > 0 and a[i + 1] > 0:
            a[i] -= 1; a[i + 1] -= 1
            score += 1.5
    return score


def ai_pick_discard(hand, que, melds, has_honors):
    best, best_q, seen = None, -1e9, set()
    for tid in hand:
        if tid in seen:
            continue
        seen.add(tid)
        c = counts_of(hand)
        c[tid] -= 1
        q = hand_quality(c, que)
        h2 = hand[:]
        h2.remove(tid)
        if ting_tiles(h2, que, has_honors):
            q += 50
        if q > best_q:
            best_q, best = q, tid
    return best


def ai_call_intent(p, tile, is_next, room, rng):
    """p: MjPlayer。返回 win/pong/kong/chow/None"""
    hand = _loads(p.hand_json, [])
    melds = _loads(p.melds_json, [])
    c = counts_of(hand)
    h = hand + [tile]
    if try_win(h)['win'] and _can_win_hand(room, p, h):
        return 'win'
    sichuan = room.mode == 'sc'
    if sichuan and tile // 10 == p.que:
        return None
    pairs = sum(1 for i in range(40) if c[i] == 2)
    suit_cnt = [0, 0, 0, 0]
    for t in hand:
        suit_cnt[t // 10] += 1
    if c[tile] >= 3:
        return 'kong'
    if c[tile] == 2:
        if pairs >= 3:
            return 'pong'
        if suit_cnt[tile // 10] >= 7 and rng.random() < 0.6:
            return 'pong'
        if tile // 10 == 3 and tile % 10 >= 5:
            return 'pong'
        return None
    if is_next and not sichuan and tile // 10 < 3:
        a = can_chow_with(hand, tile)
        if a is not None:
            if not (c[a] == 3 or c[a + 1] == 3 or c[a + 2] == 3) and suit_cnt[tile // 10] >= 6 and rng.random() < 0.3:
                return 'chow'
    return None


# =====================================================================
# 房间流程
# =====================================================================
def _players(room):
    return MjPlayer.query.filter_by(room_id=room.id).order_by(MjPlayer.seat).all()


def _alive(room):
    return [p for p in _players(room) if not p.out and not p.win]


def _evt(room, type_, actor, text, data=None):
    db.session.add(MjEvent(room_id=room.id, hand_no=room.hand_no, type=type_, actor=actor,
                           data_json=_dumps(data or {}), text=text[:120], ts=_now()))
    room.updated_at = _now()


def _flags(room):
    return _loads(room.flags_json, {})


def _set_flags(room, **kw):
    f = _flags(room)
    f.update(kw)
    room.flags_json = _dumps(f)


def _touch(room):
    room.updated_at = _now()


def _sched_bot(room, delay=None):
    d = delay if delay is not None else random.uniform(*BOT_DELAY)
    room.bot_at = _now() + d


def _hand_of(p):
    return _loads(p.hand_json, [])


def _set_hand(p, h):
    p.hand_json = _dumps(h)


def _melds_of(p):
    return _loads(p.melds_json, [])


def _can_win_hand(room, p, hand):
    """四川: 手牌+副露不能有缺门"""
    if room.mode == 'sc' and p.que >= 0:
        for t in hand:
            if t // 10 == p.que:
                return False
        for m in _melds_of(p):
            if m['tile'] // 10 == p.que:
                return False
    return True


def create_room(name, mode, token=None):
    if mode not in ('sc', 'std'):
        mode = 'sc'
    for _ in range(60):
        code = '%04d' % random.randint(0, 9999)
        if not MjRoom.query.filter_by(code=code).first():
            break
    else:
        raise RuntimeError('no free room code')
    room = MjRoom(code=code, mode=mode, phase='waiting', created_at=_now(), updated_at=_now())
    db.session.add(room)
    db.session.flush()
    me = MjPlayer(room_id=room.id, seat=0, name=name[:12], token=token or _new_token(),
                  is_host=True, last_seen=_now(), joined_at=_now())
    db.session.add(me)
    _evt(room, 'create', 0, '房间创建(%s)' % ('四川麻将' if mode == 'sc' else '标准麻将'))
    db.session.commit()
    return room, me


def _new_token():
    import secrets
    return secrets.token_hex(16)


def join_room(room, name):
    players = _players(room)
    if room.phase != 'waiting' or len(players) >= 4:
        return None, '房间已开局或已满'
    used = {p.seat for p in players}
    seat = next(s for s in range(4) if s not in used)
    me = MjPlayer(room_id=room.id, seat=seat, name=name[:12], token=_new_token(),
                  last_seen=_now(), joined_at=_now())
    db.session.add(me)
    _evt(room, 'join', seat, '%s 加入' % me.name)
    db.session.commit()
    return me, None


def add_bot(room):
    if room.phase != 'waiting':
        return '已开局,不能加机器人'
    players = _players(room)
    if len(players) >= 4:
        return '房间已满'
    used = {p.seat for p in players}
    seat = next(s for s in range(4) if s not in used)
    n = sum(1 for p in players if p.is_bot)
    names = ['机器人·阿福', '机器人·翠花', '机器人·幺鸡', '机器人·老王']
    db.session.add(MjPlayer(room_id=room.id, seat=seat, name=names[n % 4], token='',
                            is_bot=True, last_seen=_now(), joined_at=_now()))
    _evt(room, 'bot', seat, '加入机器人')
    db.session.commit()
    _sched_bot(room, 0.5)
    return None


def leave_room(room, me):
    """房主退=解散(物理删除);等待期普通玩家退=移除"""
    if me.is_host:
        MjEvent.query.filter_by(room_id=room.id).delete()
        MjPlayer.query.filter_by(room_id=room.id).delete()
        db.session.delete(room)
        db.session.commit()
        return None
    if room.phase == 'waiting':
        db.session.delete(me)
        _evt(room, 'leave', me.seat, '%s 离开' % me.name)
        db.session.commit()
    return None


def start_hand(room):
    players = _players(room)
    if len(players) < 4:
        return '需要 4 名玩家(可加机器人)'
    room.hand_no += 1
    room.dealer = (room.hand_no - 1) % 4
    room.turn = room.dealer
    room.status = 'active'
    ids = tile_ids(room.mode == 'std')
    wall = ids * 4
    random.shuffle(wall)
    room.wall_json = _dumps(wall)
    room.last_json = ''
    room.pending_json = ''
    room.flags_json = _dumps({'firstDiscard': None, 'gangDraw': False, 'seaBottom': False, 'pendingGang': False})
    for p in players:
        hand = sorted(wall[-13:])
        del wall[-13:]
        _set_hand(p, hand)
        p.melds_json = '[]'
        p.discards_json = '[]'
        p.huan3_json = ''
        p.que = -1
        p.out = False
        p.win = False
        p.win_detail_json = ''
    room.wall_json = _dumps(wall)
    _evt(room, 'deal', None, '第%d局开始, %s先出牌' % (room.hand_no, players[room.dealer].name))
    if room.mode == 'sc':
        room.phase = 'dingque'
        room.deadline = _now() + DING_SEC
        # 机器人定缺即时完成(无决策含量)
        for p in players:
            if p.is_bot:
                c = [0, 0, 0]
                for tt in _hand_of(p):
                    c[tt // 10] += 1
                p.que = c.index(min(c))
                _evt(room, 'dingque', p.seat, '%s 定缺%s' % (p.name, SUIT_NAME[p.que]))
    else:
        room.phase = 'play'
        _draw_for(room, room.turn)
    _sched_bot(room)
    _touch(room)
    db.session.commit()
    return None


# ---------------- 定缺 / 换三张 ----------------
def act_dingque(room, me, suit):
    if room.phase != 'dingque':
        return '当前不是定缺阶段'
    if me.que >= 0:
        return '已定缺'
    if suit not in (0, 1, 2):
        return '参数错误'
    me.que = suit
    _evt(room, 'dingque', me.seat, '%s 定缺%s' % (me.name, SUIT_NAME[suit]))
    _after_step(room)
    db.session.commit()
    return None


def _auto_dingque(p):
    c = [0, 0, 0]
    for t in _hand_of(p):
        c[t // 10] += 1
    p.que = c.index(min(c))
    room = db.session.query(MjRoom).get(p.room_id)
    _evt(room, 'dingque', p.seat, '%s 超时自动定缺%s' % (p.name, SUIT_NAME[p.que]))


def act_huan3(room, me, tiles):
    if room.phase != 'huan3':
        return '当前不是换三张'
    if me.huan3_json:
        return '已换过'
    tiles = [int(t) for t in (tiles or []) if isinstance(t, (int, float))]
    tiles = [int(t) for t in tiles][:3]
    if len(tiles) != 3 or len(set(tiles)) > 3:
        return '需要选 3 张'
    hand = _hand_of(me)
    for t in tiles:
        if t not in hand:
            return '所选牌不在手中'
    if len(set(t // 10 for t in tiles)) != 1:
        return '必须同花色'
    me.huan3_json = _dumps(tiles)
    _evt(room, 'huan3', me.seat, '%s 完成换三张' % me.name)
    _after_step(room)
    db.session.commit()
    return None


def _auto_huan3(p):
    hand = _hand_of(p)
    que_tiles = sorted([t for t in hand if t // 10 == p.que], reverse=True)[:3]
    pick = que_tiles
    if len(pick) < 3:
        others = sorted([t for t in hand if t // 10 != p.que])
        pick = pick + others[:3 - len(pick)]
    p.huan3_json = _dumps(pick[:3])
    _evt(db.session.query(MjRoom).get(p.room_id), 'huan3', p.seat, '%s 自动换三张' % p.name)


def _do_huan3_swap(room):
    """全员选好后:对家互换"""
    players = _players(room)
    gives = {}
    for p in players:
        tiles = _loads(p.huan3_json, [])
        if not tiles:
            _auto_huan3(p)
            tiles = _loads(p.huan3_json, [])
        gives[p.seat] = tiles
    for p in players:
        hand = _hand_of(p)
        for t in gives[p.seat]:
            hand.remove(t)
        _set_hand(p, sorted(hand))
    for p in players:
        partner = players[(p.seat + 2) % 4]
        hand = _hand_of(p)
        hand += gives[partner.seat]
        _set_hand(p, sorted(hand))
    _evt(room, 'huan3done', None, '换三张完成(对家互换)')
    room.phase = 'play'
    _draw_for(room, room.turn)


# ---------------- 摸打 ----------------
def _draw_for(room, seat):
    """轮到 seat 摸牌;牌墙尽→流局。设置限时与机器人"""
    wall = _loads(room.wall_json, [])
    if not wall:
        _end_hand(room, 'liuju')
        return
    t = wall.pop()
    room.wall_json = _dumps(wall)
    p = _players(room)[seat]
    hand = _hand_of(p)
    hand.append(t)
    _set_hand(p, sorted(hand))
    f = _flags(room)
    f['gangDraw'] = bool(f.get('pendingGang'))
    f['pendingGang'] = False
    f['seaBottom'] = len(wall) == 0
    room.flags_json = _dumps(f)
    room.turn = seat
    room.phase = 'play'
    room.pending_json = ''
    room.deadline = _now() + TURN_SEC
    if p.is_bot:
        _sched_bot(room)
    _touch(room)


def _next_turn(room, seat):
    alive = _alive(room)
    if not alive:
        _end_hand(room, 'win')
        return
    nxt = seat
    for _ in range(4):
        nxt = (nxt + 1) % 4
        cand = next((p for p in alive if p.seat == nxt), None)
        if cand:
            break
    _draw_for(room, nxt)


def act_discard(room, me, tile):
    if room.phase != 'play' or room.pending_json:
        return '当前不能打牌'
    if room.turn != me.seat:
        return '还没轮到你'
    if me.out or me.win:
        return '你已结束本局'
    hand = _hand_of(me)
    tile = int(tile or 0)
    if tile not in hand:
        return '所打之牌不在手中'
    _do_discard(room, me, tile)
    db.session.commit()
    return None


def _do_discard(room, p, tile):
    hand = _hand_of(p)
    hand.remove(tile)
    _set_hand(p, hand)
    disc = _loads(p.discards_json, [])
    disc.append(tile)
    p.discards_json = _dumps(disc)
    f = _flags(room)
    f['firstDiscard'] = True if f.get('firstDiscard') is None else False
    room.flags_json = _dumps(f)
    room.last_json = _dumps({'id': tile, 'seat': p.seat})
    _evt(room, 'discard', p.seat, '%s 打出 %s' % (p.name, t_name(tile)))
    _open_call_window(room, tile, p)


def _open_call_window(room, tile, discarder):
    """弃牌后的叫牌窗口:胡(可多人)>碰/杠>吃(下家)。人类等响应,机器人延迟决策"""
    players = _players(room)
    cands = {}
    for k in range(1, 5):
        seat = (discarder.seat + k) % 4
        if seat == discarder.seat:
            break
        p = players[seat]
        if p.out or p.win:
            continue
        if p.is_bot:
            continue          # 机器人意图在 advance 中延迟计算
        opts = _call_options(room, p, tile, is_next=k == 1)
        if opts:
            cands[seat] = opts
    room.pending_json = _dumps({'type': 'call', 'tile': tile, 'from': discarder.seat,
                                'resp': {}, 'cands': cands})
    room.phase = 'call'
    room.deadline = _now() + CALL_SEC
    _sched_bot(room)
    _touch(room)


def _call_options(room, p, tile, is_next):
    """该玩家对此弃牌的可用操作(不含 pass)"""
    hand = _hand_of(p)
    c = counts_of(hand)
    h = hand + [tile]
    opts = {}
    if try_win(h)['win'] and _can_win_hand(room, p, h):
        opts['win'] = True
    if c[tile] == 2:
        opts['pong'] = True
    if c[tile] >= 3:
        opts['kong'] = True
    if is_next and room.mode == 'std' and can_chow_with(hand, tile) is not None:
        opts['chow'] = True
    if room.mode == 'sc' and p.que >= 0 and tile // 10 == p.que:
        opts.pop('pong', None)
        opts.pop('kong', None)
        opts.pop('chow', None)
    return opts


def act_call(room, me, intent):
    """人类对叫牌窗口表态: win/pong/kong/chow/pass"""
    pend = _loads(room.pending_json, {})
    if room.phase != 'call' or not pend or pend.get('type') not in ('call', 'qiang'):
        return '当前没有叫牌'
    tile = pend['tile']
    if str(me.seat) not in pend['cands'] and str(me.seat) not in pend['resp']:
        return '你没有叫牌权'
    if str(me.seat) in pend['resp']:
        return '已表态'
    if intent != 'pass':
        opts = _call_options(room, me, tile, is_next=(me.seat == (pend['from'] + 1) % 4))
        if pend.get('type') == 'qiang':
            opts = {'win': True}
        if intent not in opts:
            return '没有此操作权'
    pend['resp'][str(me.seat)] = intent
    room.pending_json = _dumps(pend)
    if intent != 'pass':
        _evt(room, 'call', me.seat, '%s %s' % (me.name, {'win': '胡!', 'pong': '碰', 'kong': '杠', 'chow': '吃'}[intent]))
    if all(str(s) in pend['resp'] for s in pend['cands']):
        _resolve_pending(room)
    else:
        _touch(room)
    db.session.commit()
    return None


def act_self(room, me, intent, tile):
    """摸牌后的自身操作: self_win / an_gang / bu_gang"""
    if room.phase != 'play' or room.pending_json:
        return '当前不可操作'
    if room.turn != me.seat:
        return '还没轮到你'
    hand = _hand_of(me)
    if intent == 'self_win':
        if not (try_win(hand)['win'] and _can_win_hand(room, me, hand)):
            return '不能胡'
        _apply_self_win(room, me)
    elif intent in ('an_gang', 'bu_gang'):
        c = counts_of(hand)
        tile = int(tile or 0)
        melds = _melds_of(me)
        opened = False
        if intent == 'an_gang':
            if c[tile] < 4:
                return '暗杠需手中四张'
            for _ in range(4):
                hand.remove(tile)
            melds.append({'type': 'kong', 'tile': tile, 'from': -1})
            _evt(room, 'gang', me.seat, '%s 暗杠 %s' % (me.name, t_name(tile)))
        else:
            if c[tile] < 1 or not any(m['type'] == 'pong' and m['tile'] == tile for m in melds):
                return '补杠参数错误'
            hand.remove(tile)
            for m in melds:
                if m['type'] == 'pong' and m['tile'] == tile:
                    m['type'] = 'kong'
                    break
            _evt(room, 'gang', me.seat, '%s 补杠 %s' % (me.name, t_name(tile)))
            opened = _open_qiang_window(room, me, tile)
        _set_hand(me, hand)
        me.melds_json = _dumps(melds)
        if not opened:
            f = _flags(room)
            f['pendingGang'] = True
            room.flags_json = _dumps(f)
            room.turn = me.seat
            _draw_for(room, me.seat)
    else:
        return '未知操作'
    db.session.commit()
    return None


def _open_qiang_window(room, kong_player, tile):
    """补杠抢杠窗口:返回 True 表示开了窗口(等响应),False 无人可抢继续摸"""
    players = _players(room)
    cands = {}
    for k in range(1, 4):
        p = players[(kong_player.seat + k) % 4]
        if p.out or p.win or p.is_bot:
            continue
        h = _hand_of(p) + [tile]
        if try_win(h)['win'] and _can_win_hand(room, p, h):
            cands[p.seat] = {'win': True}
    if not cands:
        return False
    room.pending_json = _dumps({'type': 'qiang', 'tile': tile, 'from': kong_player.seat,
                                'resp': {}, 'cands': cands})
    room.phase = 'call'
    room.deadline = _now() + CALL_SEC
    _sched_bot(room)
    _touch(room)
    return True


def _resolve_pending(room):
    """窗口关闭:按 胡>碰杠>吃 结算。机器人意图在此刻现算(不给人类额外等待)"""
    pend = _loads(room.pending_json, {})
    if not pend:
        return
    players = _players(room)
    tile = pend['tile']
    from_seat = pend['from']
    resp = pend.get('resp', {})
    is_qiang = pend.get('type') == 'qiang'
    rng = random
    # 机器人意图现算(人类未表态已被超时填 pass)
    for k in range(1, 5):
        seat = (from_seat + k) % 4
        if seat == from_seat:
            break
        p = players[seat]
        if p.out or p.win or str(seat) in resp:
            continue
        if not p.is_bot:
            continue          # 人类无权/未表态 → 过
        if is_qiang:
            h = _hand_of(p) + [tile]
            resp[str(seat)] = 'win' if (try_win(h)['win'] and _can_win_hand(room, p, h)) else 'pass'
        else:
            resp[str(seat)] = ai_call_intent(p, tile, seat == (from_seat + 1) % 4, room, rng) or 'pass'
    room.pending_json = ''
    winners = [int(s) for s, v in resp.items() if v == 'win']
    if winners:
        for seat in winners:
            _apply_win(room, players[seat], players[from_seat], qiang=is_qiang, tile=tile)
        _after_wins(room, players[from_seat])
        return
    if is_qiang:
        # 无人抢杠 → 杠生效,杠者摸牌
        p = players[from_seat]
        f = _flags(room)
        f['pendingGang'] = True
        room.flags_json = _dumps(f)
        room.turn = p.seat
        _draw_for(room, p.seat)
        return
    pk = [int(s) for s, v in resp.items() if v in ('pong', 'kong')]
    if pk:
        seat = pk[0]
        p = players[seat]
        if resp[str(seat)] == 'pong':
            _do_pong(room, p, tile, players[from_seat])
        else:
            _do_kong(room, p, tile, players[from_seat])
        return
    ch = [int(s) for s, v in resp.items() if v == 'chow']
    if ch:
        _do_chow(room, players[ch[0]], tile, players[from_seat])
        return
    _next_turn(room, from_seat)


def _do_pong(room, p, tile, discarder):
    hand = _hand_of(p)
    hand.remove(tile)
    hand.remove(tile)
    _set_hand(p, hand)
    melds = _melds_of(p)
    melds.append({'type': 'pong', 'tile': tile, 'from': discarder.seat})
    p.melds_json = _dumps(melds)
    disc = _loads(discarder.discards_json, [])
    if disc and disc[-1] == tile:
        disc.pop()
        discarder.discards_json = _dumps(disc)
    _evt(room, 'pong', p.seat, '%s 碰 %s' % (p.name, t_name(tile)))
    room.turn = p.seat
    room.phase = 'play'
    room.pending_json = ''
    room.deadline = _now() + TURN_SEC
    if p.is_bot:
        _sched_bot(room)
    _touch(room)


def _do_kong(room, p, tile, discarder):
    hand = _hand_of(p)
    for _ in range(3):
        hand.remove(tile)
    _set_hand(p, hand)
    melds = _melds_of(p)
    melds.append({'type': 'kong', 'tile': tile, 'from': discarder.seat})
    p.melds_json = _dumps(melds)
    disc = _loads(discarder.discards_json, [])
    if disc and disc[-1] == tile:
        disc.pop()
        discarder.discards_json = _dumps(disc)
    _evt(room, 'gang', p.seat, '%s 明杠 %s' % (p.name, t_name(tile)))
    f = _flags(room)
    f['pendingGang'] = True
    room.flags_json = _dumps(f)
    room.turn = p.seat
    _draw_for(room, p.seat)


def _do_chow(room, p, tile, discarder):
    hand = _hand_of(p)
    a = can_chow_with(hand, tile)
    for x in (a, a + 1, a + 2):
        if x != tile:
            hand.remove(x)
    _set_hand(p, hand)
    melds = _melds_of(p)
    melds.append({'type': 'chow', 'tile': a, 'from': discarder.seat})
    p.melds_json = _dumps(melds)
    disc = _loads(discarder.discards_json, [])
    if disc and disc[-1] == tile:
        disc.pop()
        discarder.discards_json = _dumps(disc)
    _evt(room, 'chow', p.seat, '%s 吃 %s%s%s' % (p.name, t_name(a), t_name(a + 1), t_name(a + 2)))
    room.turn = p.seat
    room.phase = 'play'
    room.pending_json = ''
    room.deadline = _now() + TURN_SEC
    if p.is_bot:
        _sched_bot(room)
    _touch(room)


def _apply_win(room, p, discarder, qiang=False, tile=None):
    f = _flags(room)
    if qiang and discarder is not None:
        # 被抢的杠退回碰
        melds = _melds_of(discarder)
        for m in melds:
            if m['type'] == 'kong' and m['tile'] == tile:
                m['type'] = 'pong'
                break
        discarder.melds_json = _dumps(melds)
    if tile is not None:
        hand = _hand_of(p)
        hand.append(tile)
        _set_hand(p, hand)
        if discarder is not None and not qiang:
            disc = _loads(discarder.discards_json, [])
            if disc and disc[-1] == tile:
                disc.pop()
                discarder.discards_json = _dumps(disc)
    hand = _hand_of(p)
    melds = _melds_of(p)
    act_cnt = sum(len(_loads(q.discards_json, [])) + len(_melds_of(q)) for q in _players(room))
    tian = room.hand_no == 1 and p.seat == room.dealer and act_cnt <= 1 and f.get('firstDiscard') is True
    di = room.hand_no == 1 and p.seat != room.dealer and discarder is not None and \
        discarder.seat == room.dealer and act_cnt <= 1 and f.get('firstDiscard') is True
    det = calc_fans(hand, melds, self_drawn=False, sichuan=room.mode == 'sc', ctx={
        'gangDraw': bool(f.get('gangDraw')) and p.seat == room.turn,
        'qiangGang': qiang,
        'seaBottom': bool(f.get('seaBottom')) or not _loads(room.wall_json, []),
        'tianHu': tian, 'diHu': di,
    })
    p.win = True
    p.win_detail_json = _dumps(det)
    if room.mode == 'sc':
        p.out = True
    p.score += det['points']
    _evt(room, 'win', p.seat, '%s 胡! %s (+%d分)' % (p.name, fan_text(det), det['points']))


def _apply_self_win(room, p):
    f = _flags(room)
    hand = _hand_of(p)
    det = calc_fans(hand, _melds_of(p), self_drawn=True, sichuan=room.mode == 'sc', ctx={
        'gangDraw': bool(f.get('gangDraw')),
        'seaBottom': not _loads(room.wall_json, []),
        'tianHu': room.hand_no == 1 and p.seat == room.dealer and
                  sum(len(_loads(q.discards_json, [])) + len(_melds_of(q)) for q in _players(room)) == 0,
    })
    p.win = True
    p.win_detail_json = _dumps(det)
    if room.mode == 'sc':
        p.out = True
    p.score += det['points']
    _evt(room, 'win', p.seat, '%s 自摸! %s (+%d分)' % (p.name, fan_text(det), det['points']))
    _after_wins(room, p)


def _after_wins(room, from_player):
    alive = _alive(room)
    any_win = any(p.win for p in _players(room))
    if room.mode == 'std' and any_win:
        _end_hand(room, 'win')
        return
    if not alive or (room.mode == 'sc' and len(alive) <= 1):
        _end_hand(room, 'win')
        return
    _next_turn(room, from_player.seat)


def _end_hand(room, reason):
    room.phase = 'over'
    room.pending_json = ''
    room.deadline = None
    room.bot_at = None
    if reason == 'liuju':
        _evt(room, 'liuju', None, '流局(牌墙已尽)')
    else:
        wins = [p for p in _players(room) if p.win]
        _evt(room, 'handover', None, '本局结束' + (',' + '/'.join(p.name for p in wins) + '获胜' if wins else ''))
    _touch(room)


def act_next_hand(room, me):
    if room.phase != 'over':
        return '本局未结束'
    if not me.is_host:
        return '只有房主能开下一局'
    return start_hand(room)


# =====================================================================
# 惰性推进(每次轮询调用):超时自动 + 机器人行动
# =====================================================================
def advance(room, rng=None):
    """幂等推进:处理到期超时与机器人决策。任何状态 GET 都先跑这个。"""
    rng = rng or random
    now = _now()
    guard = 0
    while guard < 200:
        guard += 1
        moved = False
        players = _players(room)
        # 1) 机器人到点行动
        if room.bot_at and now >= room.bot_at and room.status == 'active':
            room.bot_at = None
            _bot_act(room, players, rng)
            moved = True
        # 2) 到期超时
        elif room.deadline and now >= room.deadline:
            room.deadline = None
            _timeout(room, players)
            moved = True
        if not moved:
            break
    db.session.commit()


def _bot_act(room, players, rng):
    if room.phase == 'dingque':
        for p in players:
            if p.is_bot and p.que < 0:
                c = [0, 0, 0]
                for t in _hand_of(p):
                    c[t // 10] += 1
                p.que = c.index(min(c))
                _evt(room, 'dingque', p.seat, '%s 定缺%s' % (p.name, SUIT_NAME[p.que]))
        _after_step(room)
        return
    if room.phase == 'huan3':
        for p in players:
            if p.is_bot and not p.huan3_json:
                _auto_huan3(p)
        _after_step(room)
        return
    pend = _loads(room.pending_json, {})
    if pend and room.phase == 'call':
        # 人类都已表态(或无人类候选) → 立即裁决(机器人意图在 resolve 时现算)
        if all(str(s) in pend['resp'] for s in pend['cands']):
            _resolve_pending(room)
        return
    if room.phase == 'play' and not pend:
        p = players[room.turn]
        if not p.is_bot or p.out or p.win:
            return
        hand = _hand_of(p)
        # 自摸/暗杠/补杠优先
        if try_win(hand)['win'] and _can_win_hand(room, p, hand):
            _apply_self_win(room, p)
            return
        gc_an, gc_bu = _gang_candidates(p)
        if gc_an or gc_bu:
            act_self(room, p, 'an_gang' if gc_an else 'bu_gang', (gc_an or gc_bu)[0])
            return
        tile = ai_pick_discard(hand, p.que, _melds_of(p), room.mode == 'std')
        _do_discard(room, p, tile)
        return


def _timeout(room, players):
    pend = _loads(room.pending_json, {})
    if room.phase in ('dingque', 'huan3'):
        for p in players:
            if room.phase == 'dingque' and p.que < 0:
                if p.is_bot:
                    c = [0, 0, 0]
                    for t in _hand_of(p):
                        c[t // 10] += 1
                    p.que = c.index(min(c))
                else:
                    _auto_dingque(p)
            elif room.phase == 'huan3' and not p.huan3_json:
                _auto_huan3(p)
        _after_step(room)
        return
    if room.phase == 'call' and pend:
        # 未表态者自动过(不替人类胡)
        for seat_s in pend['cands']:
            if seat_s not in pend['resp']:
                pend['resp'][seat_s] = 'pass'
        room.pending_json = _dumps(pend)
        _resolve_pending(room)
        return
    if room.phase == 'play' and not pend:
        p = players[room.turn]
        if p.out or p.win:
            return
        hand = _hand_of(p)
        tile = ai_pick_discard(hand, p.que, _melds_of(p), room.mode == 'std')
        _evt(room, 'autodiscard', p.seat, '%s 超时自动打牌' % p.name)
        _do_discard(room, p, tile)
        return


def _after_step(room):
    """定缺/换三张 阶段:全员完成则进入下一阶段(机器人即时,人类限时)"""
    players = _players(room)
    if room.phase == 'dingque':
        if all(p.que >= 0 for p in players):
            _evt(room, 'dingdone', None, '全部定缺完成')
            if room.mode == 'sc':
                room.phase = 'huan3'
                room.deadline = _now() + DING_SEC
                for p in players:
                    if p.is_bot and not p.huan3_json:
                        _auto_huan3(p)
            else:
                room.phase = 'play'
                _draw_for(room, room.turn)
        else:
            room.deadline = _now() + DING_SEC
    elif room.phase == 'huan3':
        if all(p.huan3_json for p in players):
            _do_huan3_swap(room)
        else:
            room.deadline = _now() + DING_SEC


# =====================================================================
# 状态输出(按可见性裁剪)
# =====================================================================
def get_state(room, me):
    advance(room)
    players = _players(room)
    me.last_seen = _now()
    db.session.commit()
    f = _flags(room)
    pend = _loads(room.pending_json, {})
    wall = _loads(room.wall_json, [])
    last = _loads(room.last_json, None)
    now = _now()
    hand = _hand_of(me)
    melds = _melds_of(me)

    # 我的操作面
    opts = {}
    if room.phase == 'dingque' and me.que < 0:
        opts['dingque'] = True
    if room.phase == 'huan3' and not me.huan3_json:
        opts['huan3'] = True
    if room.phase == 'play' and not pend and room.turn == me.seat and not me.out and not me.win:
        opts['my_turn'] = True
        if try_win(hand)['win'] and _can_win_hand(room, me, hand):
            opts['self_win'] = True
        gc_an, gc_bu = _gang_candidates(me)
        if gc_an or gc_bu:
            opts['gang_tiles'] = gc_an + gc_bu
    if room.phase == 'call' and pend:
        if str(me.seat) not in pend['resp'] and str(me.seat) in pend['cands']:
            opts['call'] = pend['cands'][str(me.seat)]
        opts['call_wait'] = str(me.seat) in pend['resp']
    if room.phase == 'over' and me.is_host:
        opts['next_hand'] = True

    # 听牌提示(我打哪张能听什么): 14 张时逐张试 → {打出的牌: [听的牌...]}
    ting_hint = {}
    if room.phase == 'play' and not pend and room.turn == me.seat and len(hand) % 3 == 2:
        for tid in sorted(set(hand)):
            h2 = hand[:]
            h2.remove(tid)
            w = ting_tiles(h2, me.que, room.mode == 'std')
            if w:
                ting_hint[tid] = w

    evs = MjEvent.query.filter_by(room_id=room.id).order_by(MjEvent.id.desc()).limit(30).all()
    state = {
        'room': room.code,
        'mode': room.mode,
        'phase': room.phase,
        'hand_no': room.hand_no,
        'wall': len(wall),
        'turn': room.turn,
        'dealer': room.dealer,
        'deadline': max(0, int(room.deadline - now)) if room.deadline else 0,
        'last': last,
        'me': {
            'seat': me.seat, 'name': me.name, 'is_host': me.is_host,
            'hand': hand, 'melds': melds,
            'discards': _loads(me.discards_json, []),
            'que': me.que, 'out': me.out, 'win': me.win,
            'win_detail': _loads(me.win_detail_json, None),
            'score': me.score, 'huan3_done': bool(me.huan3_json),
        },
        'players': [],
        'my_options': opts,
        'ting': ting_hint,
        'reveal': room.phase == 'over',
        'events': [{'t': e.text, 'ts': int(e.ts), 'type': e.type} for e in reversed(evs)],
        'n_players': len(players),
    }
    for p in players:
        d = {
            'seat': p.seat, 'name': p.name, 'is_bot': p.is_bot,
            'hand_count': len(_hand_of(p)),
            'melds': _melds_of(p),
            'discards': _loads(p.discards_json, []),
            'que': p.que if (room.mode == 'sc' and p.que >= 0 and room.phase not in ('waiting', 'dingque')) else -1,
            'out': p.out, 'win': p.win,
            'win_detail': _loads(p.win_detail_json, None) if p.win else None,
            'score': p.score,
            'online': p.is_bot or (now - p.last_seen < 8),
            'is_me': p.id == me.id,
        }
        if room.phase == 'over':
            d['hand'] = _hand_of(p)
        state['players'].append(d)
    return state


def _gang_candidates(p):
    c = counts_of(_hand_of(p))
    an = [i for i in range(40) if c[i] >= 4]
    melds = _melds_of(p)
    bu = [i for i in range(40) if c[i] >= 1 and any(m['type'] == 'pong' and m['tile'] == i for m in melds)]
    return an, bu


def cleanup_stale():
    cutoff = _now() - ROOM_TTL
    rooms = MjRoom.query.filter(MjRoom.created_at < cutoff).all()
    for room in rooms:
        last = db.session.query(db.func.max(MjPlayer.last_seen)).filter_by(room_id=room.id).scalar() or 0
        ttl = WAIT_TTL if room.phase == 'waiting' else ROOM_TTL
        if _now() - last > ttl:
            MjEvent.query.filter_by(room_id=room.id).delete()
            MjPlayer.query.filter_by(room_id=room.id).delete()
            db.session.delete(room)
    if rooms:
        db.session.commit()


def do_action(room, me, action, tile=None, suit=None, tiles=None):
    """统一动作入口,返回 error 字符串或 None"""
    if action == 'leave':
        return leave_room(room, me)
    if action == 'add_bot':
        if not me.is_host:
            return '只有房主能加机器人'
        return add_bot(room)
    if action == 'kick':
        if not me.is_host:
            return '只有房主能踢人'
        seat = int(suit or -1)
        target = next((p for p in _players(room) if p.seat == seat and not p.is_host), None)
        if not target:
            return '无此玩家'
        if room.phase != 'waiting':
            return '只能在等待阶段踢人'
        db.session.delete(target)
        _evt(room, 'kick', seat, '%s 被移出房间' % target.name)
        db.session.commit()
        return None
    if action == 'start':
        if not me.is_host:
            return '只有房主能开始'
        if room.phase != 'waiting':
            return '已开局'
        err = start_hand(room)
        if err:
            return err
        return None
    if action == 'next_hand':
        return act_next_hand(room, me)
    if action == 'dingque':
        try:
            s = int(suit)
        except (TypeError, ValueError):
            return '参数错误'
        return act_dingque(room, me, s)
    if action == 'huan3':
        return act_huan3(room, me, tiles)
    if action == 'discard':
        return act_discard(room, me, tile)
    if action == 'pass':
        return act_call(room, me, 'pass')
    if action in ('win', 'pong', 'kong', 'chow'):
        return act_call(room, me, action)
    if action in ('self_win', 'an_gang', 'bu_gang'):
        return act_self(room, me, action, tile)
    return '未知操作'
