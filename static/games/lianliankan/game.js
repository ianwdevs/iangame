/* ========================================================================
   连连看 — 遵循 window.IanGame 接口契约
   经典配对消除:40 关 4 大主题章节(水果/动物/美食/星际),折点≤2 的路径连通即消除。
   机制渐进:第 2 章重力坍缩、第 3 章障碍石块、第 4 章组合快节奏,每章末 BOSS 关。
   三星评价 + 选关地图,进度存 localStorage(ian:llk:progress)。
   难度(壳页选择器):easy/normal/hard → 计时系数 1.3/1.0/0.85,提示 5/3/1,洗牌 3/2/1。
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    /* ---------------- 设计令牌(与全站 CSS 变量一致) ---------------- */
    var C = {
      bg: '#060912', text: '#eaf0fb', text2: '#8b97b3', text3: '#5a6580',
      purple: '#b537f2', cyan: '#00e0ff', ok: '#2ee6a6', warn: '#ffb627',
      danger: '#ff2e63', gold: '#ffd54a', panel: 'rgba(255,255,255,.02)'
    };

    /* ---------------- 四大章节主题 ---------------- */
    var CHAPTERS = [
      { name: '水果乐园', icon: '🍎', bgTop: '#150a24', aura1: 'rgba(181,55,242,.11)', aura2: 'rgba(255,95,143,.08)',
        tileTop: '#3b2b57', tileBot: '#221738', line: '#c084fc',
        icons: ['🍎','🍊','🍋','🍇','🍑','🍓','🍉','🥝','🍍','🥭','🍒','🥥','🍐','🍈'] },
      { name: '动物森林', icon: '🐼', bgTop: '#07231c', aura1: 'rgba(46,230,166,.10)', aura2: 'rgba(0,224,255,.08)',
        tileTop: '#1e4d3c', tileBot: '#0f2f24', line: '#2ee6a6',
        icons: ['🐼','🦊','🐸','🦁','🐵','🐰','🐯','🐨','🦉','🦄','🐺','🦜','🐢','🐙'] },
      { name: '美食夜市', icon: '🍜', bgTop: '#241103', aura1: 'rgba(255,182,39,.10)', aura2: 'rgba(255,95,95,.08)',
        tileTop: '#4d3115', tileBot: '#2b1a08', line: '#ffc44d',
        icons: ['🍜','🍣','🌮','🍕','🍔','🍟','🍩','🍢','🍙','🥟','🍥','🍰','🧁','🥠'] },
      { name: '星际之门', icon: '🚀', bgTop: '#080d2e', aura1: 'rgba(77,124,255,.11)', aura2: 'rgba(181,55,242,.09)',
        tileTop: '#233364', tileBot: '#121a3c', line: '#00e0ff',
        icons: ['🚀','👽','🛸','🌍','⭐','☄️','🌙','🔭','🪐','⚡','🌟','🌌','🛰️','🌠'] }
    ];

    var DIFFS = {
      easy:   { tf: 1.30, hints: 5, shuffles: 3, mult: 0.8 },
      normal: { tf: 1.00, hints: 3, shuffles: 2, mult: 1.0 },
      hard:   { tf: 0.85, hints: 1, shuffles: 1, mult: 1.25 }
    };
    // 计时调参:每对基础秒数从第 1 关到第 40 关线性收紧
    var TUNE = { pp0: 7.5, pp1: 5.0, bossFactor: 0.82, comboWin: 2.5, comboMax: 8, pairBase: 10 };

    /* ---------------- 运行时状态 ---------------- */
    var running = false, paused = false, rafId = 0;
    var mode = 'map';                  // map | intro | play | clear | allclear | fail | over
    var DIFF = 'normal', diffCfg = DIFFS.normal;
    var lvIdx = 0, cur = null;         // 当前关卡(0 基)与参数
    var rows = 0, cols = 0, grid = null, tilesLeft = 0;
    var sel = null, hintPair = null, hintT = 0;
    var score = 0, combo = 1, lastMatchAt = -99, comboPop = null;
    var timeLeft = 0, timeMax = 1;
    var hints = 0, shuffles = 0;
    var introT = 0, clearT = 0, failT = 0, shuffleFlashT = 0, badFlashT = 0;
    var gravDelay = 0, checkDelay = 0, pendingClearT = 0;
    var clearInfo = null, overReported = false;
    var lines = [], dying = [], particles = [], toasts = [], bgDots = [];
    var chapterTab = 0, resetArm = 0, muted = false;
    var tAnim = 0;                     // 环境动画时钟(暂停也走,只驱动背景)
    var mapHits = { tabs: [], nodes: [], reset: null };
    var btnHits = [], clearHits = [], allclearHit = null;
    // 棋盘几何
    var board = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, bw: 0, bh: 0, tw: 0, th: 0, iconPx: 20 };

    /* ---------------- 进度存档 ---------------- */
    var PKEY = 'ian:llk:progress';
    var progress = loadProgress();
    function loadProgress() {
      try {
        var p = JSON.parse(localStorage.getItem(PKEY));
        if (p && p.unlocked >= 1 && p.stars) return p;
      } catch (e) {}
      return { unlocked: 1, stars: {} };
    }
    function saveProgress() {
      try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (e) {}
    }
    function totalStars() {
      var s = 0;
      for (var k in progress.stars) s += progress.stars[k] | 0;
      return s;
    }

    /* ---------------- 音效(WebAudio 合成,无素材) ---------------- */
    var AC = null;
    function au() {
      if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (AC && AC.state === 'suspended' && AC.resume) AC.resume();
      return AC;
    }
    function beep(f, dur, type, vol, f2, delay) {
      if (muted) return;
      var ac = au(); if (!ac) return;
      try {
        var t0 = ac.currentTime + (delay || 0);
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
        g.gain.setValueAtTime(vol || 0.05, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t0); o.stop(t0 + dur + 0.02);
      } catch (e) {}
    }
    var sfx = {
      select: function () { beep(540, 0.07, 'triangle', 0.045); },
      bad: function () { beep(220, 0.12, 'square', 0.035, 150); },
      match: function (cb) { beep(560 + cb * 60, 0.12, 'sine', 0.06, 880 + cb * 60); },
      shuffle: function () { beep(380, 0.22, 'sine', 0.05, 720); },
      clear: function () { beep(523, 0.12, 'triangle', 0.05); beep(659, 0.12, 'triangle', 0.05, null, 0.11); beep(784, 0.12, 'triangle', 0.05, null, 0.22); beep(1046, 0.22, 'triangle', 0.06, null, 0.33); },
      star: function () { beep(880, 0.16, 'triangle', 0.05, 1320); },
      fail: function () { beep(330, 0.45, 'sawtooth', 0.045, 110); },
      click: function () { beep(700, 0.05, 'triangle', 0.035); }
    };

    /* ---------------- 关卡表(程序化生成,集中可调) ---------------- */
    function buildLevels() {
      var grids = [
        [6,5],[6,5],[6,6],[6,6],[6,7],[6,7],[6,8],[6,8],[6,8],[6,9],
        [7,6],[7,6],[7,8],[7,8],[7,8],[7,8],[8,8],[8,8],[8,9],[8,9],
        [7,8],[7,8],[7,8],[8,8],[8,8],[8,8],[8,9],[8,9],[8,9],[9,10],
        [8,8],[8,9],[8,9],[8,10],[8,10],[8,10],[8,10],[9,10],[9,10],[8,12]
      ];
      var gravs = [
        null,null,null,null,null,null,null,null,null,null,
        'down','down','up','up','left','left','right','right','down','down',
        null,null,null,null,null,null,null,null,null,null,
        'down','up','left','right','down','up','left','right','down',null
      ];
      var rocks = [
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,
        2,2,4,4,4,4,6,6,6,6,
        4,4,6,6,6,6,8,8,8,6
      ];
      var LV = [];
      for (var i = 0; i < 40; i++) {
        var pairs = (grids[i][0] * grids[i][1] - rocks[i]) / 2;
        var types = Math.min(pairs, 6 + Math.floor(i / 3), CHAPTERS[0].icons.length);
        var pp = TUNE.pp0 + (TUNE.pp1 - TUNE.pp0) * (i / 39);
        var secs = Math.round(pairs * pp * ((i % 10 === 9) ? TUNE.bossFactor : 1));
        LV.push({
          r: grids[i][0], c: grids[i][1], grav: gravs[i], rocks: rocks[i],
          types: types, secs: secs, boss: i % 10 === 9,
          ch: Math.floor(i / 10), num: i + 1
        });
      }
      return LV;
    }
    var LEVELS = buildLevels();

    /* ---------------- 棋盘几何 ---------------- */
    function layoutBoard() {
      var pad = 14, gap = 7;
      var x0 = 28, y0 = 116, x1 = W - 28, y1 = H - 96;
      board.x = x0; board.y = y0; board.w = x1 - x0; board.h = y1 - y0;
      var availW = board.w - pad * 2, availH = board.h - pad * 2;
      var cw = availW / cols, ch = availH / rows;
      var tw = cw - gap, th = ch - gap;
      if (tw / th > 1.5) tw = th * 1.5;
      if (th / tw > 1.15) th = tw * 1.15;
      board.tw = Math.floor(tw); board.th = Math.floor(th);
      board.bw = board.tw + gap; board.bh = board.th + gap;
      var gw = cols * board.bw + gap, gh = rows * board.bh + gap;
      board.ox = x0 + (board.w - gw) / 2 + gap;
      board.oy = y0 + (board.h - gh) / 2 + gap;
      board.iconPx = Math.floor(Math.min(board.tw, board.th) * 0.56);
    }
    function cellX(vc) { return board.ox + (vc - 0.5) * board.bw; }   // vc 为虚拟列(含外圈)
    function cellY(vr) { return board.oy + (vr - 0.5) * board.bh; }
    function theme() { return CHAPTERS[cur ? cur.ch : 0]; }

    /* ---------------- 棋盘引擎 ---------------- */
    function isFree(vr, vc) {   // 虚拟坐标;外圈永远可通行
      if (vr === 0 || vr === rows + 1 || vc === 0 || vc === cols + 1) return true;
      return !grid[vr - 1][vc - 1];
    }

    // BFS 求折点≤2 的路径,返回虚拟格点序列(含起终点),无解返回 null
    function findPath(a, b) {
      var R = rows + 2, Cl = cols + 2;
      var sr = a.r + 1, sc = a.c + 1, tr = b.r + 1, tc = b.c + 1;
      var D = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      var T = [], P = [];
      for (var d = 0; d < 4; d++) {
        T.push([]); P.push([]);
        for (var i = 0; i < R; i++) {
          var rt = [], rp = [];
          for (var j = 0; j < Cl; j++) { rt.push(9); rp.push(null); }
          T[d].push(rt); P[d].push(rp);
        }
      }
      var q = [], qi = 0;
      for (d = 0; d < 4; d++) {
        var nr = sr + D[d][0], nc = sc + D[d][1];
        if (nr === tr && nc === tc) return [{ r: sr, c: sc }, { r: tr, c: tc }];
        if (isFree(nr, nc)) {
          T[d][nr][nc] = 0; P[d][nr][nc] = { d: -1, r: sr, c: sc };
          q.push([d, nr, nc]);
        }
      }
      while (qi < q.length) {
        var st = q[qi++];
        var cd = st[0], cr = st[1], cc = st[2];
        var base = T[cd][cr][cc];
        for (var nd = 0; nd < 4; nd++) {
          var nt = base + (nd === cd ? 0 : 1);
          if (nt > 2) continue;
          var nr2 = cr + D[nd][0], nc2 = cc + D[nd][1];
          if (nr2 < 0 || nr2 >= R || nc2 < 0 || nc2 >= Cl) continue;
          if (nr2 === tr && nc2 === tc) {
            var pts = [{ r: tr, c: tc }];
            var xd = cd, xr = cr, xc = cc;
            while (true) {
              pts.push({ r: xr, c: xc });
              var pv = P[xd][xr][xc];
              if (pv.d === -1) { pts.push({ r: pv.r, c: pv.c }); break; }
              xd = pv.d; xr = pv.r; xc = pv.c;
            }
            pts.reverse();
            return pts;
          }
          if (!isFree(nr2, nc2)) continue;
          if (nt < T[nd][nr2][nc2]) {
            T[nd][nr2][nc2] = nt;
            P[nd][nr2][nc2] = { d: cd, r: cr, c: cc };
            q.push([nd, nr2, nc2]);
          }
        }
      }
      return null;
    }

    function allTiles() {
      var arr = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var t = grid[r][c];
        if (t && !t.rock) arr.push(t);
      }
      return arr;
    }

    function findAnyPair() {
      var byType = {}, arr = allTiles();
      for (var i = 0; i < arr.length; i++) {
        (byType[arr[i].type] = byType[arr[i].type] || []).push(arr[i]);
      }
      var keys = [];
      for (var k in byType) keys.push(k);
      shuffleArr(keys);
      for (i = 0; i < keys.length; i++) {
        var list = byType[keys[i]];
        var idx = [];
        for (var m = 0; m < list.length; m++) idx.push(m);
        shuffleArr(idx);
        for (var x = 0; x < idx.length; x++) for (var y = x + 1; y < idx.length; y++) {
          var p = findPath(list[idx[x]], list[idx[y]]);
          if (p) return { a: list[idx[x]], b: list[idx[y]], path: p };
        }
      }
      return null;
    }

    function shuffleArr(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
    }

    function permuteTypes() {   // 打乱剩余方块类型(占位不变)
      var arr = allTiles(), types = [];
      for (var i = 0; i < arr.length; i++) types.push(arr[i].type);
      shuffleArr(types);
      for (i = 0; i < arr.length; i++) arr[i].type = types[i];
    }

    function genLevel() {
      cur = LEVELS[lvIdx];
      rows = cur.r; cols = cur.c;
      layoutBoard();
      grid = [];
      for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < cols; c++) row.push(null);
        grid.push(row);
      }
      // 石块
      var cells = [];
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) cells.push({ r: r, c: c });
      shuffleArr(cells);
      for (var i = 0; i < cur.rocks; i++) {
        var rc = cells.pop();
        grid[rc.r][rc.c] = { rock: true, r: rc.r, c: rc.c };
      }
      // 配对填充
      var pairs = cells.length / 2;
      var types = Math.min(pairs, cur.types);
      var bag = [];
      var base = Math.floor(pairs / types), rem = pairs % types;
      for (var t = 1; t <= types; t++) {
        var n = base + (t <= rem ? 1 : 0);
        for (var k = 0; k < n * 2; k++) bag.push(t);
      }
      var tries = 0;
      do {
        shuffleArr(bag);
        for (i = 0; i < cells.length; i++) {
          var rc2 = cells[i];
          grid[rc2.r][rc2.c] = null;
        }
        for (i = 0; i < cells.length; i++) {
          var rc3 = cells[i];
          grid[rc3.r][rc3.c] = {
            type: bag[i], r: rc3.r, c: rc3.c,
            px: cellX(rc3.c + 1), py: cellY(rc3.r + 1),
            born: -(rc3.r + rc3.c) * 0.035
          };
        }
        tilesLeft = cells.length;
        tries++;
      } while (!findAnyPair() && tries < 60);
      sel = null; hintPair = null; hintT = 0;
      lines = []; dying = []; particles = []; toasts = [];
      gravDelay = 0; checkDelay = 0; pendingClearT = 0;
      combo = 1; lastMatchAt = -99; comboPop = null;
    }

    // 重力坍缩:按行列分段(石块分隔),段内方块向重力方向压实、顺序保持
    function applyGravity() {
      var g = cur.grav;
      if (!g) return;
      function compact(list) {
        var tiles = [];
        for (var i = 0; i < list.length; i++) {
          var t = grid[list[i].r][list[i].c];
          if (t && !t.rock) tiles.push(t);
        }
        if (!tiles.length) return;
        for (var j = 0; j < list.length; j++) grid[list[j].r][list[j].c] = null;
        var n = list.length, m = tiles.length;
        for (var k = 0; k < m; k++) {
          var target = (g === 'down' || g === 'right') ? list[n - m + k] : list[k];
          var t2 = tiles[k];
          t2.r = target.r; t2.c = target.c;
          grid[target.r][target.c] = t2;
        }
      }
      if (g === 'down' || g === 'up') {
        for (var c = 0; c < cols; c++) {
          var seg = [];
          for (var r = 0; r <= rows; r++) {
            var isBreak = r === rows || (grid[r][c] && grid[r][c].rock);
            if (isBreak) { compact(seg); seg = []; }
            else seg.push({ r: r, c: c });
          }
        }
      } else {
        for (var r2 = 0; r2 < rows; r2++) {
          var seg2 = [];
          for (var c2 = 0; c2 <= cols; c2++) {
            var isBreak2 = c2 === cols || (grid[r2][c2] && grid[r2][c2].rock);
            if (isBreak2) { compact(seg2); seg2 = []; }
            else seg2.push({ r: r2, c: c2 });
          }
        }
      }
    }

    function autoRescue() {   // 死局检测:自动洗牌;洗不出的残局直接赠送消除
      if (tilesLeft <= 0) return;
      if (findAnyPair()) return;
      var ok = false;
      for (var i = 0; i < 40 && !ok; i++) {
        permuteTypes();
        ok = !!findAnyPair();
      }
      if (ok) {
        shuffleFlashT = 0.45;
        hintPair = null;
        toast('无可连对 · 自动洗牌');
        sfx.shuffle();
        return;
      }
      autoClearLeft();
    }

    function autoClearLeft() {
      var bonus = Math.round((tilesLeft / 2) * 15 * diffCfg.mult);
      score += bonus;
      toast('残局赠送 +' + bonus);
      var arr = allTiles();
      for (var i = 0; i < arr.length; i++) {
        dying.push({ icon: theme().icons[(arr[i].type - 1) % theme().icons.length], x: arr[i].px, y: arr[i].py, k: -i * 0.03 });
        spawnBurst(arr[i].px, arr[i].py, 6);
        grid[arr[i].r][arr[i].c] = null;
      }
      tilesLeft = 0;
      pendingClearT = 0.8;
      emitScore();
    }

    /* ---------------- 对局流程 ---------------- */
    function emitScore() { hooks.onScore && hooks.onScore(score, lvIdx + 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function startLevel(idx, keepScore) {
      lvIdx = idx;
      if (!keepScore) score = 0;
      genLevel();
      timeMax = Math.max(1, Math.round(cur.secs * diffCfg.tf));
      timeLeft = timeMax;
      hints = diffCfg.hints;
      shuffles = diffCfg.shuffles;
      mode = 'intro'; introT = 1.15;
      failT = 0; overReported = false;
      emitScore();
      emitState('playing');
    }

    function trySelect(tile) {
      if (tile.rock) return;
      if (!sel) { sel = tile; sfx.select(); return; }
      if (sel === tile) { sel = null; return; }
      if (sel.type !== tile.type) {
        sel = null; sel = tile; badFlashT = 0.3; sfx.bad();
        return;
      }
      var pts = findPath(sel, tile);
      if (!pts) {
        sel = null; sel = tile; badFlashT = 0.3; sfx.bad();
        return;
      }
      doMatch(sel, tile, pts);
      sel = null;
    }

    function doMatch(a, b, pts) {
      var now = tAnim;
      combo = (now - lastMatchAt <= TUNE.comboWindow) ? Math.min(combo + 1, TUNE.comboMax) : 1;
      lastMatchAt = now;
      var gained = Math.round(TUNE.pairBase * combo * diffCfg.mult);
      score += gained;
      emitScore();
      if (combo >= 2) comboPop = { n: combo, t: 0 };
      hintPair = null; hintT = 0;
      // 连线光轨(虚拟点→像素点,压缩共线)
      var px = [];
      for (var i = 0; i < pts.length; i++) px.push({ x: cellX(pts[i].c), y: cellY(pts[i].r) });
      var cmp = [px[0]];
      for (i = 1; i < px.length - 1; i++) {
        var p0 = px[i - 1], p1 = px[i], p2 = px[i + 1];
        if ((p1.x - p0.x) * (p2.y - p1.y) === (p1.y - p0.y) * (p2.x - p1.x)) continue;
        cmp.push(p1);
      }
      cmp.push(px[px.length - 1]);
      lines.push({ pts: cmp, t: 0 });
      // 移除方块(模型立即移除,视觉走 dying)
      var th = theme();
      dying.push({ icon: th.icons[(a.type - 1) % th.icons.length], x: a.px, y: a.py, k: 0 });
      dying.push({ icon: th.icons[(b.type - 1) % th.icons.length], x: b.px, y: b.py, k: 0 });
      spawnBurst(a.px, a.py, 10);
      spawnBurst(b.px, b.py, 10);
      grid[a.r][a.c] = null;
      grid[b.r][b.c] = null;
      tilesLeft -= 2;
      sfx.match(combo);
      if (tilesLeft <= 0) { pendingClearT = 0.55; return; }
      if (cur.grav) gravDelay = 0.22;
      checkDelay = cur.grav ? 0.55 : 0.12;
    }

    function doClearLevel() {
      var ratio = timeLeft / timeMax;
      var stars = ratio >= 0.5 ? 3 : (ratio >= 0.25 ? 2 : 1);
      var bonus = Math.round(timeLeft * 5 * diffCfg.mult);
      score += bonus;
      emitScore();
      progress.stars[cur.num] = Math.max(progress.stars[cur.num] || 0, stars);
      if (cur.num < 40) progress.unlocked = Math.max(progress.unlocked, cur.num + 1);
      saveProgress();
      clearInfo = { stars: stars, bonus: bonus };
      mode = (cur.num === 40) ? 'allclear' : 'clear';
      clearT = 0;
      spawnConfetti();
      sfx.clear();
    }

    function doFail() {
      mode = 'fail'; failT = 1.4;
      sfx.fail();
    }

    /* ---------------- 特效 ---------------- */
    function spawnBurst(x, y, n) {
      var colors = [theme().line, C.cyan, '#ffffff', C.warn];
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
        particles.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          life: 0.5 + Math.random() * 0.35, max: 0.85,
          size: 2 + Math.random() * 3, color: colors[i % colors.length]
        });
      }
    }
    function spawnConfetti() {
      for (var i = 0; i < 60; i++) {
        particles.push({
          x: Math.random() * W, y: -20 - Math.random() * 160,
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 130,
          life: 1.6 + Math.random(), max: 2.6,
          size: 2.5 + Math.random() * 3.5,
          color: [C.gold, C.cyan, C.purple, C.ok, '#ffffff'][i % 5]
        });
      }
    }
    function toast(text) { toasts.push({ text: text, t: 2.2 }); }

    /* ---------------- 输入 ---------------- */
    function inRect(x, y, r) {
      return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }
    function onTap(x, y) {
      au();  // 解锁音频
      if (!running || paused) return;
      if (mode === 'map') { tapMap(x, y); return; }
      if (mode === 'intro') { introT = 0; return; }
      if (mode === 'play') { tapPlay(x, y); return; }
      if (mode === 'clear') {
        for (var i = 0; i < clearHits.length; i++) {
          if (!inRect(x, y, clearHits[i])) continue;
          sfx.click();
          if (clearHits[i].id === 'next') startLevel(lvIdx + 1, true);
          else if (clearHits[i].id === 'replay') startLevel(lvIdx, false);
          else { goMap(); }
          return;
        }
        return;
      }
      if (mode === 'allclear' && inRect(x, y, allclearHit)) {
        sfx.click();
        if (!overReported) { overReported = true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 40); }
        return;
      }
    }
    function tapMap(x, y) {
      // 章节页签
      for (var i = 0; i < mapHits.tabs.length; i++) {
        if (inRect(x, y, mapHits.tabs[i])) { chapterTab = mapHits.tabs[i].ch; sfx.click(); return; }
      }
      // 重置进度(两次确认)
      if (inRect(x, y, mapHits.reset)) {
        if (resetArm > 0) {
          progress = { unlocked: 1, stars: {} };
          saveProgress();
          resetArm = 0;
          toast('进度已重置');
          sfx.shuffle();
        } else {
          resetArm = 3;
          toast('再点一次「重置进度」确认');
          sfx.bad();
        }
        return;
      }
      // 关卡节点
      for (var j = 0; j < mapHits.nodes.length; j++) {
        var nd = mapHits.nodes[j];
        var dx = x - nd.cx, dy = y - nd.cy;
        if (dx * dx + dy * dy <= nd.r * nd.r) {
          if (nd.lv <= progress.unlocked) { sfx.click(); startLevel(nd.lv - 1, false); }
          else { sfx.bad(); toast('先通过前面的关卡解锁'); }
          return;
        }
      }
    }
    function tapPlay(x, y) {
      for (var i = 0; i < btnHits.length; i++) {
        if (!inRect(x, y, btnHits[i])) continue;
        var id = btnHits[i].id;
        if (id === 'hint') useHint();
        else if (id === 'shuf') useShuffle();
        else if (id === 'mute') { muted = !muted; sfx.click(); }
        return;
      }
      // 棋盘命中
      var c = Math.floor((x - board.ox) / board.bw);
      var r = Math.floor((y - board.oy) / board.bh);
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      var t = grid[r][c];
      if (t && !t.rock) trySelect(t);
    }
    function useHint() {
      if (hints <= 0) { sfx.bad(); toast('提示次数已用完'); return; }
      var p = findAnyPair();
      if (!p) { toast('当前无可连对'); return; }
      hints--;
      hintPair = p; hintT = 3;
      sfx.click();
    }
    function useShuffle() {
      if (shuffles <= 0) { sfx.bad(); toast('洗牌次数已用完'); return; }
      shuffles--;
      var ok = false;
      for (var i = 0; i < 40 && !ok; i++) { permuteTypes(); ok = !!findAnyPair(); }
      shuffleFlashT = 0.45;
      hintPair = null;
      sel = null;
      toast('已洗牌');
      sfx.shuffle();
    }
    function goMap() {
      mode = 'map';
      chapterTab = Math.min(3, Math.floor((progress.unlocked - 1) / 10));
      score = 0;
      sel = null;
      emitState('ready');
    }

    function onPointer(e) {
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (canvas.width / r.width);
      var y = (e.clientY - r.top) * (canvas.height / r.height);
      onTap(x, y);
    }
    function onKey(e) {
      if (e.repeat || !running) return;
      var k = e.key.toLowerCase();
      if (k === 'p') { togglePause(); return; }
      if (paused || mode !== 'play') return;
      if (k === 'h') useHint();
      else if (k === 's') useShuffle();
      else if (k === 'm') { muted = !muted; }
    }
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);

    /* ---------------- 帧循环 ---------------- */
    function step(dt) {
      if (mode === 'intro') {
        introT -= dt;
        if (introT <= 0) mode = 'play';
      }
      if (mode === 'play') {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; doFail(); }
        if (hintT > 0) { hintT -= dt; if (hintT <= 0) hintPair = null; }
        if (gravDelay > 0) { gravDelay -= dt; if (gravDelay <= 0) applyGravity(); }
        if (checkDelay > 0) { checkDelay -= dt; if (checkDelay <= 0) autoRescue(); }
        if (pendingClearT > 0) { pendingClearT -= dt; if (pendingClearT <= 0) doClearLevel(); }
      }
      if (mode === 'fail') {
        failT -= dt;
        if (failT <= 0 && !overReported) {
          overReported = true;
          emitState('over');
          hooks.onGameOver && hooks.onGameOver(score, lvIdx + 1);
        }
      }
      if (resetArm > 0) resetArm -= dt;
      if (shuffleFlashT > 0) shuffleFlashT -= dt;
      if (badFlashT > 0) badFlashT -= dt;
      if (comboPop) { comboPop.t += dt; if (comboPop.t > 0.9) comboPop = null; }
      // 方块补间(出生/重力滑动)
      var arr = allTiles();
      for (var i = 0; i < arr.length; i++) {
        var t = arr[i];
        if (t.born !== undefined && t.born < 0.2) t.born += dt;
        var tx = cellX(t.c + 1), ty = cellY(t.r + 1);
        var k = Math.min(1, dt * 11);
        t.px += (tx - t.px) * k;
        t.py += (ty - t.py) * k;
      }
      for (i = dying.length - 1; i >= 0; i--) {
        dying[i].k += dt / 0.3;
        if (dying[i].k >= 1) dying.splice(i, 1);
      }
      for (i = lines.length - 1; i >= 0; i--) {
        lines[i].t += dt;
        if (lines[i].t > 0.34) lines.splice(i, 1);
      }
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (i = toasts.length - 1; i >= 0; i--) {
        toasts[i].t -= dt;
        if (toasts[i].t <= 0) toasts.splice(i, 1);
      }
    }

    var lastTs = 0;
    function loop(ts) {
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      tAnim += dt;
      if (running && !paused) step(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    /* ---------------- 绘制 ---------------- */
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function starPath(cx2, cy2, R) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var rr = (i % 2 === 0) ? R : R * 0.46;
        var x = cx2 + Math.cos(a) * rr, y = cy2 + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    function drawBg(ch) {
      var th = CHAPTERS[ch];
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.bgTop); g.addColorStop(1, C.bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 极光
      var a1x = W * 0.28 + Math.sin(tAnim * 0.13) * 130, a1y = H * 0.32 + Math.cos(tAnim * 0.17) * 60;
      var a2x = W * 0.74 + Math.cos(tAnim * 0.11) * 150, a2y = H * 0.68 + Math.sin(tAnim * 0.15) * 70;
      var rg = ctx.createRadialGradient(a1x, a1y, 0, a1x, a1y, 430);
      rg.addColorStop(0, th.aura1); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      rg = ctx.createRadialGradient(a2x, a2y, 0, a2x, a2y, 460);
      rg.addColorStop(0, th.aura2); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      // 漂浮微粒
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      for (var i = 0; i < bgDots.length; i++) {
        var d = bgDots[i];
        var dx = (d.x + Math.sin(tAnim * d.sp + d.ph) * 26) % W;
        var dy = (d.y + tAnim * d.vy) % H;
        ctx.globalAlpha = d.a;
        ctx.beginPath(); ctx.arc((dx + W) % W, (dy + H) % H, d.s, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function initDots() {
      bgDots = [];
      for (var i = 0; i < 26; i++) {
        bgDots.push({
          x: Math.random() * W, y: Math.random() * H,
          s: 0.8 + Math.random() * 1.8, a: 0.04 + Math.random() * 0.09,
          vy: 4 + Math.random() * 9, sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6.28
        });
      }
    }

    function drawMap() {
      drawBg(chapterTab);
      var th = CHAPTERS[chapterTab];
      // 标题
      var g = ctx.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
      g.addColorStop(0, th.line); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, th.line);
      ctx.fillStyle = g; ctx.font = 'bold 52px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('连 连 看', W / 2, 76);
      ctx.fillStyle = C.text3; ctx.font = '15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('经典配对消除 · 40 关 · 4 大主题章节', W / 2, 102);
      // 总星数(右上)
      ctx.textAlign = 'right'; ctx.fillStyle = C.gold; ctx.font = 'bold 18px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('★ ' + totalStars() + ' / 120', W - 30, 52);
      ctx.textAlign = 'center';
      // 章节页签
      mapHits.tabs = [];
      var tw = 196, thh = 58, gap = 18;
      var tx0 = W / 2 - (tw * 4 + gap * 3) / 2;
      for (var i = 0; i < 4; i++) {
        var x = tx0 + i * (tw + gap), y = 128;
        var active = i === chapterTab;
        roundRect(x, y, tw, thh, 14);
        ctx.fillStyle = active ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)';
        ctx.fill();
        ctx.strokeStyle = active ? CHAPTERS[i].line : 'rgba(124,58,237,.25)';
        ctx.lineWidth = active ? 2 : 1.2;
        if (active) { ctx.shadowColor = CHAPTERS[i].line; ctx.shadowBlur = 14; }
        roundRect(x, y, tw, thh, 14); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
        ctx.fillStyle = active ? '#ffffff' : C.text3;
        ctx.globalAlpha = active ? 1 : 0.55;
        ctx.fillText(CHAPTERS[i].icon, x + 18, y + thh / 2 + 8);
        ctx.font = (active ? 'bold ' : '') + '19px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(CHAPTERS[i].name, x + 56, y + thh / 2 + 7);
        ctx.globalAlpha = 1;
        // 章节星数
        var chStars = 0;
        for (var s = 1; s <= 10; s++) chStars += progress.stars[i * 10 + s] | 0;
        ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillStyle = C.text3; ctx.textAlign = 'right';
        ctx.fillText('★' + chStars + '/30', x + tw - 14, y + 20);
        ctx.textAlign = 'center';
        mapHits.tabs.push({ x: x, y: y, w: tw, h: thh, ch: i });
      }
      // 关卡节点 2 行 × 5 列
      mapHits.nodes = [];
      var rr = 46;
      var colsX = [];
      for (i = 0; i < 5; i++) colsX.push(150 + i * 200);
      for (i = 0; i < 10; i++) {
        var lv = chapterTab * 10 + i + 1;
        var cx = colsX[i % 5], cy = (i < 5) ? 300 : 448;
        var locked = lv > progress.unlocked;
        var boss = i === 9;
        var earned = progress.stars[lv] | 0;
        ctx.save();
        if (locked) ctx.globalAlpha = 0.32;
        // 圆底
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.29);
        var cg = ctx.createLinearGradient(0, cy - rr, 0, cy + rr);
        cg.addColorStop(0, th.tileTop); cg.addColorStop(1, th.tileBot);
        ctx.fillStyle = cg; ctx.fill();
        ctx.strokeStyle = boss ? 'rgba(255,46,99,.8)' : (earned > 0 ? th.line : 'rgba(124,58,237,.4)');
        ctx.lineWidth = boss ? 2.5 : 1.8;
        if (!locked) { ctx.shadowColor = boss ? C.danger : th.line; ctx.shadowBlur = 12; }
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.29); ctx.stroke();
        ctx.shadowBlur = 0;
        if (locked) {
          ctx.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = C.text2; ctx.fillText('🔒', cx, cy);
        } else {
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(lv), cx, cy - 4);
          if (boss) {
            ctx.fillStyle = C.danger; ctx.font = 'bold 11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
            ctx.fillText('BOSS', cx, cy + 24);
          }
        }
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
        // 星星
        for (var st = 0; st < 3; st++) {
          var on = (!locked) && st < earned;
          starPath(cx - 30 + st * 30, cy + rr + 20, 9);
          ctx.fillStyle = on ? C.gold : 'rgba(255,255,255,.10)';
          if (on) { ctx.shadowColor = C.gold; ctx.shadowBlur = 6; }
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        mapHits.nodes.push({ cx: cx, cy: cy, r: rr + 6, lv: lv });
      }
      // 底部说明 + 重置
      ctx.fillStyle = C.text3; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('点击两个相同图案 · 折点不超过两个即可连通消除', W / 2, H - 46);
      var rw = 120, rh = 34, rx = W - rw - 28, ry = H - rh - 20;
      roundRect(rx, ry, rw, rh, 10);
      ctx.fillStyle = resetArm > 0 ? 'rgba(255,46,99,.18)' : 'rgba(255,255,255,.03)';
      ctx.fill();
      ctx.strokeStyle = resetArm > 0 ? C.danger : 'rgba(124,58,237,.3)';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = resetArm > 0 ? C.danger : C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('重置进度', rx + rw / 2, ry + 21);
      mapHits.reset = { x: rx, y: ry, w: rw, h: rh };
      // 难度徽标
      ctx.textAlign = 'left'; ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('难度:' + ({ easy: '简单', normal: '普通', hard: '困难' })[DIFF] + '(开始前可在上方切换)', 30, 52);
    }

    function drawIntro() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(6,9,18,.62)'; ctx.fillRect(0, 0, W, H);
      var th = theme();
      var a = Math.min(1, introT / 0.25);
      ctx.globalAlpha = a;
      ctx.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(th.icon, W / 2, 220);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关' + (cur.boss ? ' · BOSS' : ''), W / 2, 306);
      ctx.fillStyle = th.line; ctx.font = 'bold 20px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(th.name, W / 2, 344);
      // 机制标签
      var tags = [];
      if (cur.grav) tags.push('重力 ' + ({ down: '↓', up: '↑', left: '←', right: '→' })[cur.grav]);
      if (cur.rocks) tags.push('石块 ×' + cur.rocks);
      tags.push('限时 ' + Math.round(cur.secs * diffCfg.tf) + 's');
      var twd = 130, gap = 14;
      var tx0 = W / 2 - (twd * tags.length + gap * (tags.length - 1)) / 2;
      for (var i = 0; i < tags.length; i++) {
        var x = tx0 + i * (twd + gap);
        roundRect(x, 382, twd, 34, 17);
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(124,58,237,.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.text; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(tags[i], x + twd / 2, 400);
      }
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('点击任意处开始', W / 2, 470);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }

    function drawPlayScene() {
      drawBg(cur.ch);
      // 面板
      roundRect(board.x, board.y, board.w, board.h, 18);
      ctx.fillStyle = 'rgba(10,14,26,.5)'; ctx.fill();
      ctx.strokeStyle = theme().line; ctx.globalAlpha = 0.12; ctx.lineWidth = 1.5;
      roundRect(board.x, board.y, board.w, board.h, 18); ctx.stroke();
      ctx.globalAlpha = 1;
      // 石块
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var o = grid[r][c];
        if (o && o.rock) drawRock(cellX(c + 1), cellY(r + 1));
      }
      // 方块
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        var t = grid[r][c];
        if (t && !t.rock) drawTile(t);
      }
      // 消散中的方块
      for (var i = 0; i < dying.length; i++) {
        var dy2 = dying[i];
        if (dy2.k < 0) continue;
        var s = 1 - dy2.k;
        ctx.globalAlpha = Math.max(0, s);
        ctx.font = Math.floor(board.iconPx * s) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dy2.icon, dy2.x, dy2.y - dy2.k * 18);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'alphabetic';
      // 连线光轨
      for (i = 0; i < lines.length; i++) {
        var ln = lines[i];
        var prog = Math.min(1, ln.t / 0.16);
        var alpha = ln.t < 0.22 ? 1 : Math.max(0, 1 - (ln.t - 0.22) / 0.12);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = theme().line;
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = theme().line; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(ln.pts[0].x, ln.pts[0].y);
        var total = 0, dist = [];
        for (var s2 = 1; s2 < ln.pts.length; s2++) {
          var segLen = Math.abs(ln.pts[s2].x - ln.pts[s2 - 1].x) + Math.abs(ln.pts[s2].y - ln.pts[s2 - 1].y);
          dist.push(segLen); total += segLen;
        }
        var remain = total * prog, drawn = false;
        for (s2 = 1; s2 < ln.pts.length; s2++) {
          var sl = dist[s2 - 1];
          if (remain >= sl) { ctx.lineTo(ln.pts[s2].x, ln.pts[s2].y); remain -= sl; }
          else {
            var k = sl ? remain / sl : 1;
            ctx.lineTo(ln.pts[s2 - 1].x + (ln.pts[s2].x - ln.pts[s2 - 1].x) * k,
                        ln.pts[s2 - 1].y + (ln.pts[s2].y - ln.pts[s2 - 1].y) * k);
            drawn = true; break;
          }
        }
        if (!drawn && prog >= 1) {
          for (s2 = 1; s2 < ln.pts.length; s2++) ctx.lineTo(ln.pts[s2].x, ln.pts[s2].y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 洗牌闪光
      if (shuffleFlashT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.16 * Math.max(0, shuffleFlashT / 0.45)) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      // 选中错配红闪
      if (badFlashT > 0) {
        ctx.strokeStyle = 'rgba(255,46,99,' + (badFlashT / 0.3 * 0.5) + ')';
        ctx.lineWidth = 3;
        roundRect(board.x + 4, board.y + 4, board.w - 8, board.h - 8, 16); ctx.stroke();
      }
      // 粒子
      for (i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawRock(x, y) {
      var w = board.tw, h = board.th;
      var g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, '#333a4a'); g.addColorStop(1, '#171c28');
      roundRect(x - w / 2, y - h / 2, w, h, 9);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.2;
      roundRect(x - w / 2, y - h / 2, w, h, 9); ctx.stroke();
      ctx.font = Math.floor(Math.min(w, h) * 0.5) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText('🪨', x, y + 1);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }

    function drawTile(t) {
      var th = theme();
      var s = 1;
      if (t.born !== undefined && t.born < 0.18) {
        if (t.born < 0) return;
        s = 0.55 + 0.45 * (t.born / 0.18);
      }
      var isSel = (t === sel);
      if (isSel) s = 1.07 + Math.sin(tAnim * 6.5) * 0.02;
      var w = board.tw * s, h = board.th * s;
      var x = t.px - w / 2, y = t.py - h / 2;
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, th.tileTop); g.addColorStop(1, th.tileBot);
      if (isSel) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 18; }
      roundRect(x, y, w, h, 9);
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isSel ? 'rgba(0,224,255,.95)' : 'rgba(255,255,255,.14)';
      ctx.lineWidth = isSel ? 2.2 : 1.2;
      roundRect(x, y, w, h, 9); ctx.stroke();
      // 顶部内高光
      ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 4.5); ctx.lineTo(x + w - 8, y + 4.5); ctx.stroke();
      // 图标
      ctx.font = Math.floor(board.iconPx * (isSel ? 1.05 : 1)) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(th.icons[(t.type - 1) % th.icons.length], t.px, t.py + 1);
      ctx.textBaseline = 'alphabetic';
      // 提示脉冲
      if (hintPair && (t === hintPair.a || t === hintPair.b)) {
        var a = 0.5 + 0.5 * Math.sin(tAnim * 7);
        ctx.strokeStyle = 'rgba(255,213,74,' + (0.35 + 0.55 * a) + ')';
        ctx.lineWidth = 2.5;
        roundRect(x - 3, y - 3, w + 6, h + 6, 11); ctx.stroke();
      }
    }

    function drawHUD() {
      var th = theme();
      // 左:关卡
      ctx.textAlign = 'left';
      ctx.fillStyle = th.line; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关' + (cur.boss ? ' · BOSS' : ''), 30, 40);
      ctx.fillStyle = C.text2; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(th.icon + ' ' + th.name + ' · 剩余 ' + (tilesLeft / 2) + ' 对', 30, 62);
      // 中:分数
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('SCORE', W / 2, 34);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(score), W / 2, 62);
      // 右:时间
      var ratio = timeLeft / timeMax;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('TIME', W - 30, 34);
      var tcol = ratio > 0.5 ? C.ok : (ratio > 0.25 ? C.warn : C.danger);
      if (ratio <= 0.2) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tAnim * 9);
        ctx.shadowColor = C.danger; ctx.shadowBlur = 10;
      }
      ctx.fillStyle = tcol; ctx.font = 'bold 24px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(Math.ceil(timeLeft) + 's', W - 30, 60);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      // 计时条
      var bx = 28, bw2 = W - 56, by = 82, bh2 = 10;
      roundRect(bx, by, bw2, bh2, 5);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
      if (ratio > 0) {
        roundRect(bx, by, Math.max(6, bw2 * ratio), bh2, 5);
        ctx.fillStyle = tcol; ctx.fill();
      }
      ctx.textAlign = 'center';
      // 连击弹字
      if (comboPop) {
        var k = comboPop.t / 0.9;
        var sc = 1 + (k < 0.25 ? (0.25 - k) * 1.6 : 0);
        ctx.save();
        ctx.translate(W / 2, 150 - k * 26);
        ctx.scale(sc, sc);
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.fillStyle = comboPop.n >= 4 ? C.danger : C.warn;
        ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
        ctx.fillText('COMBO ×' + comboPop.n, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    function drawHelpers() {
      btnHits = [];
      var defs = [
        { id: 'hint', label: '💡 提示 ×' + hints, on: hints > 0 },
        { id: 'shuf', label: '🌀 洗牌 ×' + shuffles, on: shuffles > 0 },
        { id: 'mute', label: muted ? '🔇 已静音' : '🔊 音效', on: true }
      ];
      var bw2 = 168, bh2 = 50, gap = 22;
      var x0 = W / 2 - (bw2 * 3 + gap * 2) / 2;
      var y = H - 78;
      for (var i = 0; i < defs.length; i++) {
        var x = x0 + i * (bw2 + gap);
        roundRect(x, y, bw2, bh2, 12);
        ctx.fillStyle = defs[i].on ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)';
        ctx.fill();
        ctx.strokeStyle = defs[i].on ? 'rgba(124,58,237,.45)' : 'rgba(124,58,237,.18)';
        ctx.lineWidth = 1.4;
        roundRect(x, y, bw2, bh2, 12); ctx.stroke();
        ctx.fillStyle = defs[i].on ? C.text : C.text3;
        ctx.font = '16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(defs[i].label, x + bw2 / 2, y + bh2 / 2 + 1);
        ctx.textBaseline = 'alphabetic';
        btnHits.push({ x: x, y: y, w: bw2, h: bh2, id: defs[i].id });
      }
      // 快捷键提示
      ctx.fillStyle = C.text3; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('H 提示 · S 洗牌 · P 暂停 · M 静音', W / 2, H - 10);
    }

    function drawToasts() {
      ctx.textAlign = 'center';
      for (var i = 0; i < toasts.length; i++) {
        var t = toasts[i];
        var a = Math.min(1, t.t / 0.3, (2.2 - t.t) / 0.25 + 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        var y = 112 + i * 34;
        var w2 = ctx.measureText(t.text).width;
        ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        w2 = ctx.measureText(t.text).width + 36;
        roundRect(W / 2 - w2 / 2, y - 15, w2, 28, 14);
        ctx.fillStyle = 'rgba(13,19,32,.92)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,224,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.fillText(t.text, W / 2, y + 4);
      }
      ctx.globalAlpha = 1;
    }

    function drawClear() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(6,9,18,.66)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(cur.boss ? 'BOSS 击破!' : '第 ' + cur.num + ' 关 完成', W / 2, 168);
      // 三星
      for (var i = 0; i < 3; i++) {
        var t0 = 0.18 + i * 0.22;
        var k = Math.max(0, Math.min(1, (clearT - t0) / 0.3));
        if (k <= 0) continue;
        var sc = 1 + (k < 1 ? Math.sin(k * Math.PI) * 0.5 : 0);
        var on = i < clearInfo.stars;
        ctx.save();
        ctx.translate(W / 2 + (i - 1) * 92, 250);
        ctx.scale(sc, sc);
        starPath(0, 0, 40);
        ctx.fillStyle = on ? C.gold : 'rgba(255,255,255,.08)';
        if (on) { ctx.shadowColor = C.gold; ctx.shadowBlur = 24; }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        if (on && k >= 1 && clearT - t0 < 0.4 && Math.random() < 0.2) spawnBurst(W / 2 + (i - 1) * 92, 250, 3);
      }
      // 分数明细
      ctx.fillStyle = C.text2; ctx.font = '17px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('时间加成  +' + clearInfo.bonus + '(剩余 ' + Math.ceil(timeLeft) + 's)', W / 2, 336);
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('难度加成已在每对得分中生效(×' + diffCfg.mult + ')', W / 2, 360);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(score), W / 2, 412);
      ctx.fillStyle = C.text3; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('TOTAL SCORE', W / 2, 432);
      // 按钮
      clearHits = [];
      var defs = [
        { id: 'next', label: '▶ 下一关', primary: true },
        { id: 'replay', label: '↻ 重玩本关', primary: false },
        { id: 'map', label: '▤ 选关', primary: false }
      ];
      var bw2 = 176, bh2 = 54, gap = 18;
      var x0 = W / 2 - (bw2 * 3 + gap * 2) / 2;
      for (i = 0; i < 3; i++) {
        var x = x0 + i * (bw2 + gap), y = 486;
        roundRect(x, y, bw2, bh2, 12);
        ctx.fillStyle = defs[i].primary ? C.purple : 'rgba(255,255,255,.05)';
        ctx.fill();
        if (defs[i].primary) { ctx.shadowColor = C.purple; ctx.shadowBlur = 16; roundRect(x, y, bw2, bh2, 12); ctx.fill(); ctx.shadowBlur = 0; }
        ctx.strokeStyle = defs[i].primary ? 'rgba(181,55,242,.7)' : 'rgba(124,58,237,.4)';
        ctx.lineWidth = 1.5;
        roundRect(x, y, bw2, bh2, 12); ctx.stroke();
        ctx.fillStyle = defs[i].primary ? '#ffffff' : C.text2;
        ctx.font = 'bold 17px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(defs[i].label, x + bw2 / 2, y + bh2 / 2 + 6);
        clearHits.push({ x: x, y: y, w: bw2, h: bh2, id: defs[i].id });
      }
    }

    function drawAllClear() {
      drawBg(3);
      // 礼花
      if (Math.random() < 0.12) spawnBurst(120 + Math.random() * (W - 240), 80 + Math.random() * 240, 14);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var g = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
      g.addColorStop(0, C.gold); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, C.gold);
      ctx.fillStyle = g; ctx.font = 'bold 56px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = C.gold; ctx.shadowBlur = 30;
      ctx.fillText('🏆 全通关!', W / 2, 220);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.text; ctx.font = '20px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('你打通了全部 40 关 · 四大章节全部制霸', W / 2, 272);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(score), W / 2, 352);
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('FINAL SCORE', W / 2, 376);
      var bw2 = 220, bh2 = 58;
      var bx = W / 2 - bw2 / 2, by = 440;
      roundRect(bx, by, bw2, bh2, 12);
      ctx.fillStyle = C.purple; ctx.fill();
      ctx.shadowColor = C.purple; ctx.shadowBlur = 18;
      roundRect(bx, by, bw2, bh2, 12); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('查看结算', W / 2, by + bh2 / 2 + 7);
      allclearHit = { x: bx, y: by, w: bw2, h: bh2 };
    }

    function drawFail() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(30,4,12,.72)'; ctx.fillRect(0, 0, W, H);
      var a = Math.max(0, Math.min(1, (1.4 - failT) / 0.3));
      ctx.globalAlpha = a;
      ctx.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⏰', W / 2, 236);
      ctx.fillStyle = C.danger; ctx.font = 'bold 42px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('时间到', W / 2, 318);
      ctx.fillStyle = C.text2; ctx.font = '17px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + (lvIdx + 1) + ' 关未完成 · 得分 ' + score, W / 2, 356);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }

    function draw() {
      try { drawFrame(); } catch (e) { if (window.console) console.error(e); /* 单帧异常不中断 rAF */ }
    }
    function drawFrame() {
      if (mode === 'map') { drawMap(); return; }
      if (mode === 'intro') { drawIntro(); return; }
      if (mode === 'play') {
        drawPlayScene();
        drawHUD();
        drawHelpers();
        drawToasts();
        if (paused) drawPauseVeil();
        return;
      }
      if (mode === 'clear') { clearT += 0.016; drawClear(); drawToasts(); return; }
      if (mode === 'allclear') { clearT += 0.016; drawAllClear(); return; }
      if (mode === 'fail' || mode === 'over') { drawFail(); return; }
    }
    function drawPauseVeil() {
      ctx.fillStyle = 'rgba(6,9,18,.7)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.text; ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⏸ 已暂停', W / 2, H / 2 - 10);
      ctx.fillStyle = C.text2; ctx.font = '15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('点击工具栏「继续」或按 P 继续', W / 2, H / 2 + 26);
    }

    /* ---------------- 控制器 ---------------- */
    function togglePause() {
      if (!running || (mode !== 'play' && mode !== 'intro')) return;
      paused ? resume() : pause();
    }
    function start(diff) {
      DIFF = DIFFS[diff] ? diff : 'normal';
      diffCfg = DIFFS[DIFF];
      score = 0;
      goMap();
      running = true;
      paused = false;
    }
    function pause() {
      if (!running) return;
      paused = true;
      emitState('paused');
    }
    function resume() {
      paused = false;
      emitState('playing');
    }
    function destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      if (AC) { try { AC.close(); } catch (e) {} AC = null; }
    }

    initDots();
    rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
