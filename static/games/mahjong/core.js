/* =====================================================================
   麻将通用引擎 — 四川麻将 / 标准麻将共用
   由 scmahjong/stdmahjong 的 game.js 动态加载,提供 window.MahjongCore
   模式差异由 cfg 驱动:
     sichuan: 108 张(万条筒), 定缺+换三张, 不能吃, 血战到底, 根/龙七对
     standard: 136 张(+字牌), 可吃(上家), 混一色/门清/役牌, 首胡即止
   ===================================================================== */
window.MahjongCore = (function () {
  'use strict';

  /* ---------------- 基础牌表示 ----------------
     id = suit*10 + rank ; suit: 0万 1条 2筒 3字(东南西北中发白 rank1-7) */
  var NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HON = ['東', '南', '西', '北', '中', '發', '白'];
  var SUIT_NAME = ['万', '条', '筒'];
  var SUIT_COLOR = ['#d33', '#2a8', '#26c', '#333'];

  function tid(s, r) { return s * 10 + r; }
  function tSuit(id) { return (id / 10) | 0; }
  function tRank(id) { return id % 10; }
  function tName(id) {
    var s = tSuit(id), r = tRank(id);
    return s === 3 ? HON[r - 1] : NUM[r - 1] + SUIT_NAME[s];
  }
  function tileIds(hasHonors) {
    var a = [];
    for (var s = 0; s < 3; s++) for (var r = 1; r <= 9; r++) a.push(tid(s, r));
    if (hasHonors) for (var h = 1; h <= 7; h++) a.push(tid(3, h));
    return a;
  }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) | 0;
      var x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 胡牌判定 ---------------- */
  function countsOf(hand) {
    var c = [];
    for (var i = 0; i < 40; i++) c[i] = 0;
    for (var j = 0; j < hand.length; j++) c[hand[j]]++;
    return c;
  }
  // 从最低非零牌位开始拆刻/顺(需回溯), 返回是否可全拆
  function extractSets(c, need) {
    if (need === 0) return true;
    for (var i = 0; i < 40; i++) {
      if (c[i] > 0) {
        if (c[i] >= 3) {                       // 刻
          c[i] -= 3;
          if (extractSets(c, need - 1)) return true;
          c[i] += 3;
        }
        if (tSuit(i) < 3 && tRank(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {  // 顺
          c[i]--; c[i + 1]--; c[i + 2]--;
          if (extractSets(c, need - 1)) return true;
          c[i]++; c[i + 1]++; c[i + 2]++;
        }
        return false;   // 最低位必须被某个组合消耗
      }
    }
    return true;
  }
  // 对对胡结构: 存在一组对子,其余全部是刻(手牌部分)
  function pongOnlyDecomp(c) {
    for (var p = 0; p < 40; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      var ok = true;
      for (var i = 0; i < 40; i++) if (c[i] !== 0 && c[i] !== 3) { ok = false; break; }
      c[p] += 2;
      if (ok) return true;
    }
    return false;
  }
  /**
   * 手牌(含胡的那张)能否和牌。返回:
   *   {win, seven, dragon, pongOnly}
   *   seven=七对, dragon=龙七对(七对含四张), pongOnly=可拆成全刻+对(对对胡手牌部分)
   */
  function tryWin(hand) {
    var c = countsOf(hand), total = hand.length, i, pairs = 0, dragon = false, allEven = true;
    for (i = 0; i < 40; i++) {
      if (c[i] % 2) { allEven = false; }
      else if (c[i]) { pairs += c[i] / 2; if (c[i] >= 4) dragon = true; }
    }
    if (allEven && total === 14 && pairs === 7) return { win: true, seven: true, dragon: dragon, pongOnly: true };
    if (total % 3 !== 2) return { win: false };
    for (i = 0; i < 40; i++) {
      if (c[i] >= 2) {
        c[i] -= 2;
        if (extractSets(c, (total - 2) / 3)) {
          c[i] += 2;
          // extractSets 成功路径不回溯,c 已被消耗 → 用原牌重算对对胡结构
          return { win: true, seven: false, dragon: false, pongOnly: pongOnlyDecomp(countsOf(hand)) };
        }
        c[i] += 2;
      }
    }
    return { win: false };
  }
  /** 缺门/字牌过滤后,所有能和的牌 id 列表(听牌) */
  function tingTiles(hand, melds, queSuit, hasHonors) {
    var base = hand.slice(), out = [], ids = tileIds(hasHonors);
    var c = countsOf(hand);
    for (var k = 0; k < ids.length; k++) {
      var t = ids[k];
      if (c[t] >= 4) continue;
      if (queSuit >= 0 && tSuit(t) === queSuit) continue;
      base.push(t);
      if (tryWin(base).win) out.push(t);
      base.pop();
    }
    void melds;
    return out;
  }

  /* ---------------- 番型计算 ----------------
     pl: {hand(不含胡牌前?), winTile, melds, selfDrawn, ...}
     hand 含胡的那张。melds: [{type:'pong'|'kong'|'chow', tile}] */
  function calcFans(pl, cfg, ctx) {
    ctx = ctx || {};
    var w = tryWin(pl.hand), fans = [];
    if (!w.win) return { list: [], total: 0, points: 0 };
    var c = countsOf(pl.hand);
    var suits = {}, i, hasHon = false;
    for (i = 0; i < pl.hand.length; i++) { suits[tSuit(pl.hand[i])] = 1; }
    for (i = 0; i < pl.melds.length; i++) {
      var m = pl.melds[i];
      if (m.type === 'chow') suits[tSuit(m.tile)] = 1; else suits[tSuit(m.tile)] = 1;
    }
    var suitCnt = 0;
    for (i = 0; i < 3; i++) if (suits[i]) suitCnt++;
    if (suits[3]) hasHon = true;

    var pongMeldsOnly = true;
    for (i = 0; i < pl.melds.length; i++) if (pl.melds[i].type === 'chow') pongMeldsOnly = false;

    if (w.seven) {
      fans.push(['七对', 2]);
      if (w.dragon) fans.push(['龙七对', 2]);
    } else {
      if (w.pongOnly && pongMeldsOnly) fans.push(['对对胡', 2]);
      else fans.push(['平胡', 1]);
    }
    if (suitCnt === 1 && !hasHon) fans.push(['清一色', 4]);
    else if (suitCnt === 1 && hasHon) fans.push(['混一色', 2]);          // 仅标准
    else if (suitCnt === 2 && hasHon) { /* 混色带字,无加成 */ }

    if (cfg.sichuan) {
      // 根: 四张相同的牌(含杠) 每根+1
      var meldCnt = {};
      for (i = 0; i < pl.melds.length; i++) {
        var mm = pl.melds[i];
        if (mm.type === 'pong' || mm.type === 'kong') meldCnt[mm.tile] = (meldCnt[mm.tile] || 0) + (mm.type === 'kong' ? 4 : 3);
      }
      var gen = 0;
      for (i = 0; i < 40; i++) if ((c[i] + (meldCnt[i] || 0)) >= 4) gen++;
      if (gen) fans.push(['根×' + gen, gen]);
    } else {
      // 役牌: 中/發/白 刻各+1
      var yan = 0;
      for (i = 35; i <= 37; i++) {
        var got = c[i] >= 3;
        for (var q = 0; q < pl.melds.length; q++) if (pl.melds[q].tile === i && pl.melds[q].type !== 'chow') got = true;
        if (got) yan++;
      }
      if (yan) fans.push(['役牌刻×' + yan, yan]);
      // 断幺九
      var duan = true;
      for (i = 0; i < 40; i++) {
        if (!c[i]) continue;
        if (tSuit(i) === 3 || tRank(i) === 1 || tRank(i) === 9) { duan = false; break; }
      }
      for (i = 0; i < pl.melds.length && duan; i++) {
        var mt = pl.melds[i].tile;
        if (tSuit(mt) === 3 || tRank(mt) === 1 || tRank(mt) === 9) duan = false;
      }
      if (duan && !w.seven) fans.push(['断幺九', 1]);
      // 门清: 无副露(暗杠不算破)
      var concealed = true;
      for (i = 0; i < pl.melds.length; i++) if (pl.melds[i].from !== -1) concealed = false;
      if (concealed && !w.seven) fans.push(['门清', 1]);
    }
    if (pl.selfDrawn) fans.push(['自摸', 1]);
    if (ctx.gangDraw) fans.push(['杠上开花', 2]);
    if (ctx.qiangGang) fans.push(['抢杠胡', 2]);
    if (ctx.seaBottom) fans.push(['海底捞月', 1]);
    if (ctx.tianHu) fans.push(['天胡', 4]);
    if (ctx.diHu) fans.push(['地胡', 4]);

    var total = 0;
    for (i = 0; i < fans.length; i++) total += fans[i][1];
    return { list: fans, total: total, points: total * 10 };
  }

  /* ---------------- AI ---------------- */
  // 手牌结构质量: 刻/顺(×9-10) + 对(×2) + 半顺(×1.5); 缺门牌记 0 分会被优先打掉
  function handQuality(c, que) {
    var a = c.slice(), score = 0, i, k;
    if (que >= 0) for (i = 0; i < 40; i++) if (tSuit(i) === que) a[i] = 0;
    for (i = 0; i < 40; i++) { while (a[i] >= 3) { a[i] -= 3; score += 10; } }
    for (k = 0; k < 2; k++) {
      for (i = 0; i < 40; i++) {
        if (tSuit(i) < 3 && tRank(i) <= 7 && a[i] > 0 && a[i + 1] > 0 && a[i + 2] > 0) {
          a[i]--; a[i + 1]--; a[i + 2]--; score += 9;
        }
      }
    }
    for (i = 0; i < 40; i++) { while (a[i] >= 2) { a[i] -= 2; score += 2; } }
    for (i = 0; i < 40; i++) {
      if (tSuit(i) < 3 && tRank(i) <= 7 && a[i] > 0 && a[i + 1] > 0) { a[i]--; a[i + 1]--; score += 1.5; }
    }
    return score;
  }
  function aiPickDiscard(pl) {
    var best = null, bestQ = -1e9, seen = {};
    for (var t = 0; t < pl.hand.length; t++) {
      var id = pl.hand[t];
      if (seen[id]) continue;
      seen[id] = 1;
      var c = countsOf(pl.hand);
      c[id]--;
      var q = handQuality(c, pl.que);
      // 听牌保护: 打出后仍听 → 强保留
      var h2 = pl.hand.slice();
      h2.splice(h2.indexOf(id), 1);
      if (tingTiles(h2, pl.melds, pl.que, pl.hasHonors).length) q += 50;
      if (q > bestQ) { bestQ = q; best = id; }
    }
    return best;
  }
  function aiCallIntent(p, tile, from, game, isNext) {
    // 返回 'win'|'pong'|'kong'|'chow'|null
    var c = countsOf(p.hand);
    var h = p.hand.slice(); h.push(tile);
    if (tryWin(h).win && game.canWinHand(p, h)) return 'win';
    if (game.cfg.sichuan && tSuit(tile) === p.que) return null;
    var i, pairs = 0;
    var suitCnt = [0, 0, 0, 0];
    for (i = 0; i < p.hand.length; i++) suitCnt[tSuit(p.hand[i])]++;
    for (i = 0; i < 40; i++) if (c[i] === 2) pairs++;
    if (c[tile] >= 3) return 'kong';
    if (c[tile] === 2) {
      if (pairs >= 3) return 'pong';                                    // 对对胡趋势
      if (suitCnt[tSuit(tile)] >= 7 && game.rng() < 0.6) return 'pong'; // 同花色浓才碰
      if (tSuit(tile) === 3 && tRank(tile) >= 5) return 'pong';         // 中發白
      return null;
    }
    if (isNext && !game.cfg.sichuan && tSuit(tile) < 3) {
      var s = tSuit(tile);
      for (var d = -2; d <= 0; d++) {
        var a = tile + d;
        if (tRank(a) < 1 || tRank(a + 2) > 9 || tSuit(a) !== s || tSuit(a + 2) !== s) continue;
        var ok2 = true;
        for (var x = a; x <= a + 2; x++) if (x !== tile && !c[x]) ok2 = false;
        if (ok2) {
          // 不拆刻不吃; 花色够浓才吃
          if (!(c[a] === 3 || c[a + 1] === 3 || c[a + 2] === 3) && suitCnt[s] >= 6 && game.rng() < 0.3) return 'chow';
          break;
        }
      }
    }
    return null;
  }

  /* =====================================================================
     游戏控制器
     ===================================================================== */
  function create(canvas, hooks, cfg) {
    cfg = cfg || {};
    cfg.sichuan = !!cfg.sichuan;
    cfg.hasHonors = !cfg.sichuan;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CX = W / 2;

    var seed = 0;
    try {
      var qs = (typeof location !== 'undefined' && location.search) || '';
      var m1 = /mjseed=(\d+)/.exec(qs), m2 = /mjfast=(\d+)/.exec(qs);
      if (m1) seed = parseInt(m1[1], 10);
      if (m2) cfg.fast = parseInt(m2[1], 10) === 1;
    } catch (e) { /* headless */ }

    var game = {
      cfg: cfg,
      rng: seed ? mulberry32(seed) : Math.random,
      players: [], wall: [], turn: 0, phase: 'idle', dealer: 0,
      lastDiscard: null,   // {id, from}
      sessScore: 0, handNo: 0, msg: '', speed: cfg.fast ? 0 : 1,
      ctxFlags: {}, humanDone: false, over: false,
    };

    var NAMES = cfg.sichuan ? ['你', '东家·阿福', '西家·翠花', '南家·幺鸡'] : ['你', '北家·Tom', '东家·Mary', '西家·老王'];
    var SEAT_POS = ['bottom', 'right', 'top', 'left'];

    function log(s) { game.msg = s; }

    /* ---------- 视图状态 ---------- */
    var sel = -1;             // 手牌选中(浮起)
    var btns = [];            // 本帧可点按钮 {x,y,w,h,label,cb,kind}
    var rafId = 0, running = true, paused = false, destroyed = false;
    var timers = [];
    function later(fn, ms) {
      if (destroyed) return;
      if (game.speed === 0) ms = 0;
      var id = setTimeout(function () { fn(); }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    /* ---------- 发牌 ---------- */
    function newHand() {
      clearTimers(); btns.length = 0; sel = -1;
      game.handNo++; game.over = false; game.humanDone = false;
      game.ctxFlags = {}; game.lastDiscard = null;
      game.dealer = (game.handNo - 1) % 4;
      var ids = tileIds(cfg.hasHonors);
      game.wall = [];
      for (var i = 0; i < ids.length; i++) for (var k = 0; k < 4; k++) game.wall.push(ids[i]);
      // 洗牌
      for (var j = game.wall.length - 1; j > 0; j--) {
        var r = Math.floor(game.rng() * (j + 1));
        var tmp = game.wall[j]; game.wall[j] = game.wall[r]; game.wall[r] = tmp;
      }
      game.players = [];
      for (var p = 0; p < 4; p++) {
        game.players.push({
          seat: p, name: NAMES[p], ai: p !== 0, hand: [], melds: [], discards: [],
          out: false, que: -1, win: null, selfDrawn: false, hasHonors: cfg.hasHonors,
          winDetail: null, online: true,
        });
      }
      for (var d = 0; d < 13; d++) for (var q = 0; q < 4; q++) game.players[q].hand.push(game.wall.pop());
      for (var s2 = 0; s2 < 4; s2++) game.players[s2].hand.sort(cmpTile);
      game.turn = game.dealer;
      game.speed = cfg.fast ? 0 : 1;
      game.phase = cfg.sichuan ? 'dingque' : 'draw';
      if (cfg.sichuan) {
        for (var a = 1; a < 4; a++) game.players[a].que = aiDingque(game.players[a]);
        later(function () {
          if (game.phase === 'dingque') { log('请选择定缺门'); showDingque(); }
        }, 400);
      } else {
        scheduleStep(400);
      }
      emitScore();
    }
    function cmpTile(a, b) { return a - b; }
    function aiDingque(p) {
      var c = [0, 0, 0];
      for (var i = 0; i < p.hand.length; i++) c[tSuit(p.hand[i])]++;
      var worst = 0;
      for (var s = 1; s < 3; s++) if (c[s] < c[worst]) worst = s;
      return worst;
    }

    /* ---------- 摸牌/打牌流程 ---------- */
    function scheduleStep(ms) { later(step, ms); }

    function step() {
      if (destroyed || game.over) return;
      var p = game.players[game.turn];
      if (game.phase === 'dingque' || game.phase === 'huan3') return;   // 人类面板驱动
      if (game.phase === 'discard') {           // 等当前玩家打牌
        if (p.ai) {
          var id = aiPickDiscard(p);
          later(function () { doDiscard(p, id); }, 550);
        }
        return;                                  // 人类: 等 tap
      }
      if (game.phase === 'draw') {
        if (!game.wall.length) { endHand('liuju'); return; }
        var t = game.wall.pop();
        p.hand.push(t); p.hand.sort(cmpTile);
        game.ctxFlags.gangDraw = game.ctxFlags.pendingGang;
        game.ctxFlags.pendingGang = false;
        game.ctxFlags.seaBottom = game.wall.length === 0;
        var h = p.hand.slice();
        if (tryWin(h).win && game.canWinHand(p, h)) {
          if (p.ai) { later(function () { doWin(p, { selfDrawn: true }); }, 500); }
          else {
            game.phase = 'discard';
            showSelfActions(p, { canWin: true,
              canAnGang: gangCandidates(p).an.length > 0,
              canBuGang: gangCandidates(p).bu.length > 0 });
            log('你可以胡! 也可杠或打牌');
          }
          return;
        }
        var gc = gangCandidates(p);
        if (p.ai && (gc.an.length || gc.bu.length)) {
          later(function () { doKong(p, null, gangCandidates(p)); }, 500);
          return;
        }
        if (!p.ai && (gc.an.length || gc.bu.length)) {
          game.phase = 'discard';
          showSelfActions(p, { canWin: false, canAnGang: gc.an.length > 0, canBuGang: gc.bu.length > 0 });
          return;
        }
        game.phase = 'discard';
        if (p.ai) scheduleStep(550);
        return;
      }
    }

    function doDiscard(p, id) {
      var ix = p.hand.indexOf(id);
      if (ix < 0) return;
      p.hand.splice(ix, 1);
      p.discards.push(id);
      game.lastDiscard = { id: id, from: p.seat };
      if (game.ctxFlags.firstDiscard === undefined) game.ctxFlags.firstDiscard = true;
      else game.ctxFlags.firstDiscard = false;
      game.phase = 'callwin';
      sel = -1; btns.length = 0;
      log(p.name + ' 打出 ' + tName(id));
      openCallWindow(id, p);
    }

    /* ---------- 别人打牌后的叫牌窗口 ---------- */
    function openCallWindow(tile, from) {
      // 全部 AI 意图先算好, 人类有选择权则弹按钮(胡>碰杠>吃, 胡可一炮多响)
      var asks = [];
      game._pendingAsks = asks;
      game._pendingKind = 'discard';
      var humanPl = null, humanOpts = null;
      for (var k = 1; k <= 4; k++) {
        var seat = (from.seat + k) % 4;
        if (seat === from.seat) break;
        var pl = game.players[seat];
        if (pl.out || pl.win) continue;
        var isNext = k === 1;
        if (pl.ai) {
          var intent = aiCallIntent(pl, tile, from, game, isNext);
          if (intent) asks.push({ p: pl, intent: intent });
        } else if (!humanPl) {
          var c = countsOf(pl.hand);
          var hh = pl.hand.slice(); hh.push(tile);
          var canW = tryWin(hh).win && game.canWinHand(pl, hh);
          var canP = c[tile] === 2, canK = c[tile] >= 3;
          var canC = isNext && !cfg.sichuan && tSuit(tile) < 3 && canChowWith(pl, tile);
          if (canW || canP || canK || canC) {
            humanPl = pl;
            humanOpts = { canW: canW, canP: canP, canK: canK, canC: canC };
          }
        }
      }
      if (humanPl) { showCallButtons(humanPl, tile, from, humanOpts); return; }
      resolveCalls(asks, tile, from);
    }
    function canChowWith(p, tile) {
      var c = countsOf(p.hand), s = tSuit(tile);
      for (var d = -2; d <= 0; d++) {
        var a = tile + d;
        if (tRank(a) < 1 || tRank(a + 2) > 9 || tSuit(a) !== s || tSuit(a + 2) !== s) continue;
        // 三张中弃牌本身那张不需要在手
        var need = 0;
        for (var x = a; x <= a + 2; x++) if (x !== tile && !c[x]) need = -1;
        if (need === 0) return true;
      }
      return false;
    }
    function resolveCalls(asks, tile, from) {
      // 胡 优先(全部胡家结算)
      var winners = asks.filter(function (a) { return a.intent === 'win'; });
      if (winners.length) {
        for (var i = 0; i < winners.length; i++) {
          applyWin(winners[i].p, tile, from);
        }
        afterWinResolution(from, tile);
        return;
      }
      var pk = null;
      for (var j = 0; j < asks.length; j++) if (asks[j].intent === 'pong' || asks[j].intent === 'kong') pk = asks[j];
      if (pk) {
        if (pk.intent === 'pong') doPong(pk.p, tile, from);
        else doKong(pk.p, tile, null);
        return;
      }
      var ch = null;
      for (var m = 0; m < asks.length; m++) if (asks[m].intent === 'chow') ch = asks[m];
      if (ch) { doChow(ch.p, tile, from); return; }
      // 无人叫 → 下家摸牌
      nextTurn(from.seat);
    }
    function nextTurn(seat) {
      var t = seat;
      for (var k = 1; k <= 4; k++) {
        t = (seat + k) % 4;
        var pl = game.players[t];
        if (!pl.out && !pl.win) break;
      }
      game.turn = t;
      game.phase = 'draw';
      scheduleStep(game.speed === 0 ? 0 : 650);
    }
    function afterWinResolution(from, tile) {
      void tile;
      var alive = game.players.filter(function (p) { return !p.out && !p.win; });
      if (!alive.length || (cfg.sichuan && alive.length <= 1) || (!cfg.sichuan && game.players.some(function (p) { return p.win; }))) {
        endHand('win');
        return;
      }
      if (game.players[0].win && game.speed !== 0) { fastResolve(); return; }
      // 从打牌者下家继续(血战)
      nextTurn(from.seat);
    }
    function fastResolve() {
      game.speed = 0;   // 人类已胡, 余局快速演完
      log('你已胡牌,余下牌局快速结算…');
      nextTurn(game.lastDiscard ? game.lastDiscard.from : game.turn);
    }

    /* ---------- 碰杠吃 ---------- */
    function doPong(p, tile, from) {
      remove2(p.hand, tile); remove2(p.hand, tile);
      p.melds.push({ type: 'pong', tile: tile, from: from.seat });
      from.discards.pop();
      log(p.name + ' 碰 ' + tName(tile));
      game.turn = p.seat; game.phase = 'discard';
      if (p.ai) scheduleStep(700);
    }
    function doChow(p, tile, from) {
      var c = countsOf(p.hand), s = tSuit(tile), a = 0;
      for (var d = -2; d <= 0; d++) {
        var x0 = tile + d;
        if (tRank(x0) < 1 || tRank(x0 + 2) > 9 || tSuit(x0) !== s || tSuit(x0 + 2) !== s) continue;
        var ok = true;
        for (var x = x0; x <= x0 + 2; x++) if (x !== tile && !c[x]) ok = false;
        if (ok) { a = x0; break; }
      }
      remove2(p.hand, a); remove2(p.hand, a + 1); remove2(p.hand, a + 2);   // 弃牌那张不在手,no-op
      p.melds.push({ type: 'chow', tile: a, from: from.seat });
      from.discards.pop();
      log(p.name + ' 吃 ' + tName(a) + tName(a + 1) + tName(a + 2));
      game.turn = p.seat; game.phase = 'discard';
      if (p.ai) scheduleStep(700);
    }
    function gangCandidates(p) {
      var c = countsOf(p.hand), an = [], bu = [];
      for (var i = 0; i < 40; i++) {
        if (c[i] >= 4) an.push(i);
        if (c[i] === 1) {
          for (var k = 0; k < p.melds.length; k++) {
            if (p.melds[k].type === 'pong' && p.melds[k].tile === i) { bu.push(i); break; }
          }
        }
      }
      return { an: an, bu: bu };
    }
    // 直杠(tile来自他人打牌) / 暗杠 / 补杠(gc={an,bu} 选第一个)
    function doKong(p, tile, gc) {
      var type, id;
      if (tile !== null && tile !== undefined) {
        remove3(p.hand, tile);
        var from = game.players[game.lastDiscard.from];
        from.discards.pop();
        p.melds.push({ type: 'kong', tile: tile, from: from.seat });
        type = '明杠'; id = tile;
      } else if (gc && gc.bu.length) {
        id = gc.bu[0];
        remove2(p.hand, id);
        for (var k = 0; k < p.melds.length; k++) {
          if (p.melds[k].type === 'pong' && p.melds[k].tile === id) { p.melds[k].type = 'kong'; break; }
        }
        type = '补杠'; // 抢杠窗口
      } else {
        id = (gc && gc.an.length) ? gc.an[0] : null;
        if (id === null) return;
        remove3(p.hand, id); remove2(p.hand, id);
        p.melds.push({ type: 'kong', tile: id, from: -1 });
        type = '暗杠';
      }
      log(p.name + ' ' + type + ' ' + tName(id));
      if (type === '补杠') {
        // 抢杠胡窗口: 他人可胡此牌(可多人)
        var asks = game._pendingAsks = [];
        var humanPl = null;
        for (var s = 1; s <= 3; s++) {
          var pl = game.players[(p.seat + s) % 4];
          if (pl.out || pl.win) continue;
          var hh = pl.hand.slice(); hh.push(id);
          if (!(tryWin(hh).win && game.canWinHand(pl, hh))) continue;
          if (pl.ai) asks.push({ p: pl, intent: 'win' });
          else humanPl = pl;
        }
        if (humanPl) {
          game._pendingKind = 'qiang';
          game._pendingFrom = p;
          showCallButtons(humanPl, id, p, { canW: true, canP: false, canK: false, canC: false, qiang: true });
          return;
        }
        if (asks.length) {
          for (var q = 0; q < asks.length; q++) applyWin(asks[q].p, id, p, true);
          afterWinResolution(p, id);
          return;
        }
      }
      // 杠后摸牌(杠上开花标记)
      game.turn = p.seat;
      game.ctxFlags.pendingGang = true;
      game.phase = 'draw';
      scheduleStep(game.speed === 0 ? 0 : 600);
    }
    function remove2(hand, id) { var i = hand.indexOf(id); if (i >= 0) hand.splice(i, 1); }
    function remove3(hand, id) { remove2(hand, id); remove2(hand, id); remove2(hand, id); }

    /* ---------- 胡牌 ---------- */
    game.canWinHand = function (p, hand) {
      if (cfg.sichuan && p.que >= 0) {
        for (var i = 0; i < hand.length; i++) if (tSuit(hand[i]) === p.que) return false;
        for (var k = 0; k < p.melds.length; k++) if (tSuit(p.melds[k].tile) === p.que) return false;
      }
      return true;
    };
    function applyWin(p, tile, from, qiang) {
      if (qiang && from) {
        // 抢杠: 被抢的杠退回碰, 第四张牌归胡牌者
        for (var q2 = 0; q2 < from.melds.length; q2++) {
          if (from.melds[q2].type === 'kong' && from.melds[q2].tile === tile) { from.melds[q2].type = 'pong'; break; }
        }
      }
      p.hand.push(tile);
      if (from && from.discards.length && from.discards[from.discards.length - 1] === tile && !qiang) from.discards.pop();
      var ctx2 = {
        gangDraw: game.ctxFlags.gangDraw && p.seat === game.turn,
        qiangGang: !!qiang,
        seaBottom: game.ctxFlags.seaBottom,
        tianHu: game.ctxFlags.firstDiscard === true && game.handNo >= 1 && isTian(p, from),
        diHu: game.ctxFlags.firstDiscard === true && isDi(p, from),
      };
      p.selfDrawn = false;
      var det = calcFans({ hand: p.hand.slice(), melds: p.melds, selfDrawn: false }, cfg, ctx2);
      p.win = true; p.winDetail = det;
      if (cfg.sichuan) p.out = true;
      log(p.name + ' 胡! ' + fanText(det));
      if (!p.ai) { game.sessScore += det.points; emitScore(); }
      if (!p.ai || true) game.humanDone = game.humanDone || !p.ai;
    }
    function doWin(p, opt) {
      opt = opt || {};
      p.selfDrawn = true;
      var det = calcFans({ hand: p.hand.slice(), melds: p.melds, selfDrawn: true }, cfg, {
        gangDraw: game.ctxFlags.gangDraw,
        seaBottom: game.ctxFlags.seaBottom,
        tianHu: game.handNo === 1 && p.seat === game.dealer && game.players[p.seat].discards.length === 0 &&
                game.players.reduce(function (a, q) { return a + q.discards.length + q.melds.length; }, 0) === 0,
      });
      p.win = true; p.winDetail = det;
      if (cfg.sichuan) p.out = true;
      log(p.name + (opt.selfDrawn ? ' 自摸! ' : ' 胡! ') + fanText(det));
      if (!p.ai) { game.sessScore += det.points; emitScore(); game.humanDone = true; }
      afterWinResolution(p, null);
    }
    function isTian(p, from) {
      void from;
      return game.handNo === 1 && p.seat === game.dealer && p.discards.length === 0 &&
        game.players.reduce(function (a, q) { return a + q.discards.length + q.melds.length; }, 0) === 0;
    }
    function isDi(p, from) {
      return game.handNo === 1 && p.seat !== game.dealer && from && from.seat === game.dealer &&
        game.players.reduce(function (a, q) { return a + q.discards.length + q.melds.length; }, 0) <= 1;
    }
    function fanText(det) {
      var parts = [];
      for (var i = 0; i < det.list.length; i++) parts.push(det.list[i][0] + det.list[i][1] + '番');
      return parts.join(' ') + ' 共' + det.total + '番';
    }

    /* ---------- 结束 ---------- */
    function endHand(reason) {
      game.over = true; game.phase = 'over'; btns.length = 0; sel = -1;
      if (reason === 'liuju') log('流局(牌墙已尽)');
      // 结算按钮
      addButton(CX - 180, H - 150, 160, 52, '再来一局', 'primary', function () { newHand(); });
      addButton(CX + 20, H - 150, 160, 52, '结束本局', 'ghost', function () { finishSession(); });
    }
    function finishSession() {
      game.over = true;
      hooks.onGameOver && hooks.onGameOver(game.sessScore, 1);
    }
    function emitScore() { hooks.onScore && hooks.onScore(game.sessScore, 1); }

    /* ---------- 定缺 / 换三张 面板 ---------- */
    function showDingque() {
      var p = game.players[0];
      var c = [0, 0, 0];
      for (var i = 0; i < p.hand.length; i++) c[tSuit(p.hand[i])]++;
      for (var s = 0; s < 3; s++) {
        (function (s2) {
          addButton(CX - 225 + s2 * 150, H / 2 - 20, 130, 70, SUIT_NAME[s2] + ' × ' + c[s2], 'primary', function () {
            p.que = s2;
            log('你定了缺' + SUIT_NAME[s2] + ',请换三张');
            game.phase = 'huan3';
            clearBtns();
            showHuan3();
          });
        })(s);
      }
    }
    function showHuan3() {
      var p = game.players[0];
      var pick = [];
      // 预选缺门最大的 3 张
      var q = p.hand.filter(function (t) { return tSuit(t) === p.que; }).sort(function (a, b) { return b - a; });
      pick = q.slice(0, 3);
      if (pick.length < 3) pick = pick.concat(p.hand.filter(function (t) { return tSuit(t) !== p.que; }).slice(0, 3 - pick.length));
      game._huan3 = { pick: pick, confirmed: false };
      addButton(CX + 250, H / 2 - 20, 120, 52, '换牌', 'primary', function () {
        var h = game._huan3;
        if (h.pick.length !== 3) return;
        var ids = h.pick.slice();
        for (var i = 0; i < 3; i++) remove2(p.hand, ids[i]);
        // 对家换给: 简化为从牌墙补 3 张随机(对家 AI 的换牌同样处理)
        for (var k = 0; k < 3; k++) { p.hand.push(game.wall.pop()); }
        p.hand.sort(cmpTile);
        for (var a = 1; a < 4; a++) {
          var ap = game.players[a];
          for (var x = 0; x < 3; x++) {
            var q2 = ap.hand.filter(function (t) { return tSuit(t) === ap.que; });
            var t2 = q2.length ? q2[q2.length - 1] : ap.hand[ap.hand.length - 1];
            remove2(ap.hand, t2);
            ap.hand.push(game.wall.pop());
          }
          ap.hand.sort(cmpTile);
        }
        clearBtns();
        game.phase = 'draw';
        log('换三张完成,庄家先摸牌');
        scheduleStep(600);
      });
    }

    /* ---------- 人类操作按钮 ---------- */
    function showSelfActions(p, opts) {
      var x = CX - (opts.canWin ? 240 : 160);
      if (opts.canWin) addButton(x, H - 250, 96, 46, '胡!', 'primary', function () { clearBtns(); doWin(p, { selfDrawn: true }); }), x += 105;
      if (opts.canAnGang || opts.canBuGang) addButton(x, H - 250, 96, 46, '杠', 'primary', function () { clearBtns(); doKong(p, null, gangCandidates(p)); }), x += 105;
      if (x > CX - 160) addButton(x, H - 250, 96, 46, '过', 'ghost', function () { clearBtns(); game.phase = 'discard'; });
    }
    function showCallButtons(p, tile, from, opts) {
      var n = (opts.canW ? 1 : 0) + (opts.canP || opts.canK ? 1 : 0) + (opts.canC ? 1 : 0) + 1;
      var x = CX - n * 105 / 2, y = H - 250;
      game._call = { p: p, tile: tile, from: from, opts: opts };
      if (opts.canW) addButton(x, y, 96, 46, '胡!', 'primary', function () {
        var cc = game._call; clearBtns();
        var q = !!cc.opts.qiang;
        applyWin(cc.p, cc.tile, cc.from, q);
        var as = game._pendingAsks || [];
        for (var i = 0; i < as.length; i++) if (as[i].intent === 'win' && as[i].p !== cc.p) applyWin(as[i].p, cc.tile, cc.from, q);
        afterWinResolution(cc.from, cc.tile);
      }), x += 105;
      if (opts.canP) addButton(x, y, 96, 46, '碰', 'primary', function () {
        var cc = game._call; clearBtns();
        if (flushPendingWins(cc.tile, cc.from, false)) { afterWinResolution(cc.from, cc.tile); return; }
        doPong(cc.p, cc.tile, cc.from);
      }), x += 105;
      if (opts.canK) addButton(x, y, 96, 46, '杠', 'primary', function () {
        var cc = game._call; clearBtns();
        if (flushPendingWins(cc.tile, cc.from, false)) { afterWinResolution(cc.from, cc.tile); return; }
        doKong(cc.p, cc.tile, null);
      }), x += 105;
      if (opts.canC) addButton(x, y, 96, 46, '吃', 'primary', function () {
        var cc = game._call; clearBtns();
        if (flushPendingWins(cc.tile, cc.from, false)) { afterWinResolution(cc.from, cc.tile); return; }
        doChow(cc.p, cc.tile, cc.from);
      }), x += 105;
      addButton(x, y, 96, 46, '过', 'ghost', function () {
        var cc = game._call; clearBtns();
        passHuman(cc);
      });
    }
    function flushPendingWins(tile, from, qiang) {
      var as = game._pendingAsks || [], did = false;
      for (var i = 0; i < as.length; i++) {
        if (as[i].intent === 'win') { applyWin(as[i].p, tile, from, qiang); did = true; }
      }
      return did;
    }
    function passHuman(cc) {
      var tile = cc ? cc.tile : (game.lastDiscard ? game.lastDiscard.id : 0);
      var from = cc ? cc.from : game.players[game.lastDiscard.from];
      if (game._pendingKind === 'qiang') {
        // 人类放过抢杠 → AI 抢杠者仍可胡, 都不胡则杠生效继续摸牌
        var as = game._pendingAsks || [];
        if (as.length) {
          for (var i = 0; i < as.length; i++) applyWin(as[i].p, tile, from, true);
          afterWinResolution(from, tile);
        } else {
          var kp = game._pendingFrom;
          game.turn = kp.seat;
          game.ctxFlags.pendingGang = true;
          game.phase = 'draw';
          scheduleStep(game.speed === 0 ? 0 : 600);
        }
        return;
      }
      resolveCalls(game._pendingAsks || [], tile, from);
    }

    /* ---------- 渲染 ---------- */
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function drawTile(x, y, w, h, id, dim) {
      ctx.globalAlpha = dim ? 0.45 : 1;
      roundRect(x, y, w, h, 5);
      ctx.fillStyle = '#f6f1e7';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#9a8f7d';
      ctx.stroke();
      var su = tSuit(id), rk = tRank(id);
      ctx.fillStyle = SUIT_COLOR[su];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (su === 3) {
        ctx.font = 'bold ' + Math.floor(h * 0.52) + 'px sans-serif';
        ctx.fillText(HON[rk - 1], x + w / 2, y + h / 2 + 1);
      } else {
        ctx.font = 'bold ' + Math.floor(h * 0.32) + 'px sans-serif';
        ctx.fillText(NUM[rk - 1], x + w / 2, y + h * 0.32);
        ctx.font = 'bold ' + Math.floor(h * 0.30) + 'px sans-serif';
        ctx.fillText(SUIT_NAME[su], x + w / 2, y + h * 0.68);
      }
      ctx.globalAlpha = 1;
    }
    function drawBack(x, y, w, h) {
      roundRect(x, y, w, h, 4);
      ctx.fillStyle = '#2d5f52';
      ctx.fill();
      ctx.strokeStyle = '#173830'; ctx.lineWidth = 1;
      ctx.stroke();
    }
    function drawSmallTileRun(px, py, tiles, w, h, gap) {
      for (var i = 0; i < tiles.length; i++) drawTile(px + i * (w + gap), py, w, h, tiles[i]);
    }
    function render() {
      ctx.clearRect(0, 0, W, H);
      // 桌面
      var bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#12433a'); bg.addColorStop(1, '#0b2c26');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // HUD
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#cfe8df'; ctx.font = '14px sans-serif';
      ctx.fillText((cfg.sichuan ? '四川麻将 · 血战到底' : '标准麻将') + '  第' + game.handNo + '局  牌墙 ' + game.wall.length + '  积分 ' + game.sessScore, 14, 10);
      if (game.msg) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8'; ctx.font = '15px sans-serif'; ctx.fillText(game.msg, CX, 12); }

      drawOpponents();
      drawDiscardPools();
      drawHuman();
      drawPanels();
      drawButtons();
    }
    function drawOpponents() {
      // seat2 top / seat1 right / seat3 left
      for (var s = 1; s < 4; s++) {
        var p = game.players[s];
        var info = p.name + (p.que >= 0 ? '(缺' + SUIT_NAME[p.que] + ')' : '') +
          (p.win ? ' ✓胡' + (p.winDetail ? p.winDetail.total + '番' : '') : '') + (p.out && !p.win ? ' 出局' : '');
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.win ? '#ffd35c' : '#bfe0d6';
        if (s === 2) {
          ctx.fillText(info, CX, 52);
          for (var i = 0; i < p.hand.length; i++) drawBack(CX - p.hand.length * 11 + i * 22, 66, 20, 28);
          drawMeldRow(p, CX - 90, 100, 1);
        } else {
          var vx = s === 1 ? W - 120 : 20;
          ctx.save();
          ctx.translate(vx + 40, 120);
          ctx.fillText(info, 0, 0);
          ctx.restore();
          for (var b = 0; b < Math.min(p.hand.length, 13); b++) drawBack(vx + (b % 2) * 24, 140 + Math.floor(b / 2) * 32, 20, 28);
          drawMeldRow(p, vx, 140 + Math.ceil(Math.min(p.hand.length, 13) / 2) * 32 + 8, 1);
        }
      }
      // 当前回合指示
      if (!game.over && game.phase !== 'idle') {
        var pos = SEAT_POS[game.turn];
        ctx.fillStyle = '#ffd35c'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        var pts = { bottom: [CX, H - 116], right: [W - 80, 104], top: [CX, 34], left: [60, 104] }[pos];
        ctx.fillText('●出牌', pts[0], pts[1]);
      }
    }
    function drawMeldRow(p, x, y, sc) {
      var w = 24 * sc, h = 32 * sc, maxW = 265 * sc;
      var cx = x, cy = y;
      for (var i = 0; i < p.melds.length; i++) {
        var m = p.melds[i], n = m.type === 'kong' ? 4 : 3;
        for (var k = 0; k < n; k++) {
          var tid2 = m.type === 'chow' ? m.tile + k : m.tile;
          drawTile(cx + k * (w + 2), cy, w, h, tid2);
        }
        cx += n * (w + 2) + 4;
        if (cx - x > maxW) { cx = x; cy += h + 4; }
      }
    }
    function drawDiscardPools() {
      var conf = [
        { x: 388, y: 300 }, { x: 552, y: 148 }, { x: 388, y: 148 }, { x: 552, y: 300 },
      ];
      for (var s = 0; s < 4; s++) {
        var p = game.players[s], o = conf[s];
        for (var i = 0; i < p.discards.length; i++) {
          var col = i % 8, row = (i / 8) | 0;
          var t = p.discards[i];
          var isLast = game.lastDiscard && game.lastDiscard.id === t && i === p.discards.length - 1;
          drawTile(o.x + col * 20.5, o.y + row * 27, 19, 25, t);
          if (isLast) { ctx.strokeStyle = '#ffd35c'; ctx.lineWidth = 2; ctx.strokeRect(o.x + col * 20.5 - 1, o.y + row * 27 - 1, 21, 27); }
        }
      }
    }
    function drawHuman() {
      var p = game.players[0];
      // 副露画在手牌上方一行
      drawMeldRow(p, 20, H - 128, 1.05);
      // 手牌
      var n = p.hand.length, tw = 48, th = 64, gap = 6;
      var total = n * tw + (n - 1) * gap;
      var x0 = CX - total / 2, y0 = H - 86;
      game._handRects = [];
      for (var i = 0; i < n; i++) {
        var x = x0 + i * (tw + gap);
        var up = sel === i ? -14 : 0;
        var isQue = p.que >= 0 && tSuit(p.hand[i]) === p.que;
        drawTile(x, y0 + up, tw, th, p.hand[i], isQue);
        game._handRects.push({ x: x, y: y0 + up, w: tw, h: th, i: i });
      }
      // 听牌提示: 打出选中那张后听什么
      if (!game.over && game.phase === 'discard' && !p.win && p.hand.length % 3 === 2) {
        var hint = '';
        if (sel >= 0) {
          var copy = p.hand.slice();
          copy.splice(sel, 1);
          var ting = tingTiles(copy, p.melds, p.que, cfg.hasHonors);
          if (ting.length) hint = '打出「' + tName(p.hand[sel]) + '」听: ' + ting.map(tName).join(' / ');
        }
        if (hint) {
          ctx.fillStyle = '#8fe3b0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
          ctx.fillText(hint, 20, 34);
        }
      }
      if (p.que >= 0) {
        ctx.fillStyle = '#ffb1b1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('我的缺门: ' + SUIT_NAME[p.que], W - 16, 34);
      }
    }
    function drawPanels() {
      if (game.phase === 'dingque' && !game.players[0].ai) {
        dim();
        ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('请选择定缺门(该花色牌必须全部打出)', CX, H / 2 - 70);
      }
      if (game.phase === 'huan3' && !game.players[0].ai && game._huan3) {
        dim();
        ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('换三张: 点击选择 3 张要换出去的牌(建议缺门)', CX, H / 2 - 70);
        var pick = game._huan3.pick;
        ctx.fillStyle = '#cfe8df'; ctx.font = '14px sans-serif';
        ctx.fillText('已选 ' + pick.length + '/3: ' + pick.map(tName).join(' '), CX, H / 2 - 42);
      }
      if (game.phase === 'over') {
        dim();
        var cw = 560, ch2 = 340, px = CX - cw / 2, py = H / 2 - ch2 / 2 - 20;
        roundRect(px, py, cw, ch2, 14);
        ctx.fillStyle = 'rgba(18,42,36,0.96)'; ctx.fill();
        ctx.strokeStyle = '#3f7a6a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(game.players.some(function (q) { return q.win; }) ? '本局结算' : '流局', CX, py + 38);
        ctx.font = '15px sans-serif';
        var ys = py + 78;
        for (var s = 0; s < 4; s++) {
          var p = game.players[s];
          var txt = p.name + ': ' + (p.win ? '胡 ' + fanText(p.winDetail) : (p.out ? '已胡过' : '未胡')) +
            (p.que >= 0 ? '(缺' + SUIT_NAME[p.que] + ')' : '');
          ctx.fillStyle = p.win ? '#ffd35c' : '#cfe8df';
          ctx.fillText(txt, CX, ys + s * 26);
          // 亮出 AI 手牌
          if (!p.ai || p.win) { /* 手牌已在底部展示 */ }
        }
        ctx.fillStyle = '#8fe3b0'; ctx.font = 'bold 16px sans-serif';
        ctx.fillText('你的积分: ' + game.sessScore, CX, ys + 4 * 26 + 14);
      }
    }
    function dim() {
      ctx.fillStyle = 'rgba(4,16,13,0.62)';
      ctx.fillRect(0, 0, W, H);
    }
    function drawButtons() {
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        roundRect(b.x, b.y, b.w, b.h, 9);
        ctx.fillStyle = b.kind === 'primary' ? '#e8b04b' : '#3f6a5e';
        ctx.fill();
        ctx.strokeStyle = b.kind === 'primary' ? '#8a6215' : '#1e3a32';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = b.kind === 'primary' ? '#31200a' : '#dff0ea';
        ctx.font = 'bold ' + Math.floor(b.h * 0.4) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
    }
    function addButton(x, y, w, h, label, kind, cb) { btns.push({ x: x, y: y, w: w, h: h, label: label, kind: kind, cb: cb }); }
    function clearBtns() { btns.length = 0; game._call = null; }
    game._btns = btns;

    /* ---------- 输入 ---------- */
    function onPointer(ev) {
      if (destroyed || paused) return;
      var r = canvas.getBoundingClientRect();
      var x = (ev.clientX - r.left) * W / r.width;
      var y = (ev.clientY - r.top) * H / r.height;
      var i, b;
      for (i = 0; i < btns.length; i++) {
        b = btns[i];
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.cb(); return; }
      }
      var p = game.players[0];
      // 换三张: 点手牌增删
      if (game.phase === 'huan3' && game._huan3) {
        var hit = hitHand(x, y);
        if (hit >= 0) {
          var id = p.hand[hit];
          var h3 = game._huan3;
          var ix2 = h3.pick.indexOf(id);
          if (ix2 >= 0) h3.pick.splice(ix2, 1);
          else if (h3.pick.length < 3) h3.pick.push(id);
        }
        return;
      }
      if (game.over || p.win || game.phase !== 'discard') return;
      var hi = hitHand(x, y);
      if (hi < 0) { sel = -1; return; }
      if (sel === hi) { doDiscard(p, p.hand[hi]); return; }
      sel = hi;
    }
    function hitHand(x, y) {
      var rs = game._handRects || [];
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        if (x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 8 && y < r.y + r.h + 6) return r.i;
      }
      return -1;
    }

    /* ---------- 主循环 ---------- */
    function frame() {
      if (destroyed) return;
      if (!paused) render();
      rafId = requestAnimationFrame(frame);
    }
    newHand();
    rafId = requestAnimationFrame(frame);
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    function onKey(e) { if (e.key === 'p') paused = !paused; }
    // 调试句柄: 仅 ?mjdebug=1 时暴露(测试/排查用)
    try {
      if (typeof location !== 'undefined' && /mjdebug=1/.test(location.search || '')) {
        window.__mjGame = game;
      }
    } catch (e) { /* headless */ }

    var api = {
      pause: function () { paused = true; },
      resume: function () { paused = false; },
      restart: function () { paused = false; newHand(); },
      destroy: function () {
        destroyed = true; running = false;
        clearTimers();
        if (rafId) cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('keydown', onKey);
      },
    };
    api._game = game;
    return api;
  }

  return {
    create: create,
    _pure: {
      tid: tid, tName: tName, tSuit: tSuit, tRank: tRank, tileIds: tileIds,
      countsOf: countsOf, tryWin: tryWin, tingTiles: tingTiles, calcFans: calcFans,
      aiPickDiscard: aiPickDiscard, mulberry32: mulberry32, NUM: NUM, HON: HON,
    },
  };
})();
