/* ========================================================================
   星陨防线 Starfall Defense — 路径式塔防,7 关递进战役
   遵循 window.IanGame 接口契约。纯 Canvas 矢量/emoji 绘制,无外部资源,
   后续可整体拎出做二级域名独立站。
   ======================================================================== */
(function () {
  'use strict';

  // ============== 配置表 ==============
  // 防御塔:cost/range/dmg/cd(秒)/kind 决定特效与逻辑
  var TOWERS = {
    photon:  { name: '光子塔', icon: '🔆', cost: 70,  range: 115, dmg: 14, cd: 0.45, kind: 'beam',   color: '#00e0ff', proj: 'laser' },
    cannon:  { name: '震荡炮', icon: '💥', cost: 110, range: 130, dmg: 30, cd: 1.10, kind: 'splash', color: '#ffb627', proj: 'shell', splash: 52 },
    frost:   { name: '凝冰塔', icon: '❄️', cost: 90,  range: 108, dmg: 6,  cd: 0.75, kind: 'slow',   color: '#7cd6ff', proj: 'ice',   slow: 0.5, slowDur: 1.3 },
    tesla:   { name: '雷电塔', icon: '⚡', cost: 150, range: 120, dmg: 18, cd: 0.85, kind: 'chain',  color: '#b537f2', proj: 'bolt',  chain: 3, chainFall: 0.75 },
    orbital: { name: '天基炮', icon: '☄️', cost: 280, range: 175, dmg: 90, cd: 2.40, kind: 'heavy',  color: '#ff2e63', proj: 'orbital', heavy: true }
  };
  var TOWER_KEYS = ['photon', 'cannon', 'frost', 'tesla', 'orbital'];

  // 每级乘数(1/2/3级): [伤害倍率, 射程加成, 特化值(溅射半径/减速强度/链数)]
  var LEVEL_MULT = [
    { dmg: 1.00, rng: 1.00, aux: 1.00 },
    { dmg: 1.90, rng: 1.12, aux: 1.30 },
    { dmg: 3.10, rng: 1.24, aux: 1.70 }
  ];

  // 敌人:hp/speed(px/秒)/reward/armor('none'|'light'|'heavy')/r(半径)/icon/color
  var ENEMIES = {
    scout:   { hp: 40,   speed: 78, reward: 6,  armor: 'none',  r: 11, color: '#2ee6a6', icon: '🛸' },
    trooper: { hp: 95,   speed: 56, reward: 10, armor: 'light', r: 13, color: '#ff5470', icon: '🛩️' },
    brute:   { hp: 340,  speed: 38, reward: 24, armor: 'heavy', r: 16, color: '#ff8a3c', icon: '🛰️' },
    runner:  { hp: 62,   speed: 122,reward: 12, armor: 'light', r: 10, color: '#ffe14d', icon: '✦' },
    healer:  { hp: 130,  speed: 54, reward: 18, armor: 'light', r: 13, color: '#7cffb0', icon: '✚', heal: 14, healR: 90, healCD: 2.2 },
    boss:    { hp: 4200, speed: 32, reward: 220,armor: 'heavy', r: 24, color: '#ff2e63', icon: '☠' }
  };

  // 难度:起始金币/生命、敌血倍率、敌速倍率
  var DIFFICULTY = {
    easy:   { gold: 300, lives: 25, hpMul: 0.72, spdMul: 0.85, label: '😊 简单' },
    normal: { gold: 200, lives: 20, hpMul: 1.00, spdMul: 1.00, label: '⚔️ 普通' },
    hard:   { gold: 150, lives: 15, hpMul: 1.35, spdMul: 1.15, label: '🔥 困难' }
  };

  // 7 关:每关起始金币加成、波次列表。波次 = [{t:种类, n:数量, gap:间隔(秒), start:延迟}, ...]
  // 编排递进:引导→疾行→重甲→修复→Boss→混编→终极Boss
  var LEVELS = [
    { gold: 0,  name: '前哨接触',   waves: [
      [{ t: 'scout',   n: 8,  gap: 0.9, start: 0 }],
      [{ t: 'scout',   n: 6,  gap: 0.8, start: 0 }, { t: 'trooper', n: 4, gap: 1.2, start: 3 }],
      [{ t: 'trooper', n: 10, gap: 1.0, start: 0 }]
    ]},
    { gold: 30, name: '速度威胁',   waves: [
      [{ t: 'scout',   n: 12, gap: 0.7, start: 0 }],
      [{ t: 'runner',  n: 10, gap: 0.55,start: 1 }, { t: 'trooper', n: 5, gap: 1.1, start: 4 }],
      [{ t: 'trooper', n: 14, gap: 0.85,start: 0 }],
      [{ t: 'runner',  n: 16, gap: 0.45,start: 0 }]
    ]},
    { gold: 40, name: '重甲突袭',   waves: [
      [{ t: 'scout',   n: 14, gap: 0.6, start: 0 }],
      [{ t: 'brute',   n: 4,  gap: 2.0, start: 1 }, { t: 'trooper', n: 8, gap: 0.9, start: 0 }],
      [{ t: 'runner',  n: 12, gap: 0.5, start: 0 }],
      [{ t: 'brute',   n: 6,  gap: 1.6, start: 0 }, { t: 'trooper', n: 10, gap: 0.8, start: 2 }],
      [{ t: 'boss',    n: 1,  gap: 0.5, start: 0 }]
    ]},
    { gold: 50, name: '修复危机',   waves: [
      [{ t: 'trooper', n: 16, gap: 0.7, start: 0 }],
      [{ t: 'healer',  n: 4,  gap: 2.2, start: 0 }, { t: 'scout', n: 14, gap: 0.5, start: 1 }],
      [{ t: 'runner',  n: 20, gap: 0.4, start: 0 }],
      [{ t: 'healer',  n: 6,  gap: 1.6, start: 0 }, { t: 'brute', n: 5, gap: 1.8, start: 2 }],
      [{ t: 'brute',   n: 8,  gap: 1.3, start: 0 }, { t: 'trooper', n: 14, gap: 0.6, start: 1 }],
      [{ t: 'trooper', n: 22, gap: 0.5, start: 0 }]
    ]},
    { gold: 60, name: '毁灭者降临', waves: [
      [{ t: 'runner',  n: 22, gap: 0.4, start: 0 }],
      [{ t: 'brute',   n: 8,  gap: 1.3, start: 0 }],
      [{ t: 'healer',  n: 6,  gap: 1.4, start: 0 }, { t: 'trooper', n: 18, gap: 0.5, start: 1 }],
      [{ t: 'scout',   n: 30, gap: 0.3, start: 0 }, { t: 'brute', n: 6, gap: 1.5, start: 2 }],
      [{ t: 'boss',    n: 1,  gap: 0.5, start: 0 }, { t: 'healer', n: 4, gap: 2.0, start: 3 }],
      [{ t: 'brute',   n: 12, gap: 1.0, start: 0 }, { t: 'runner', n: 18, gap: 0.4, start: 1 }],
      [{ t: 'trooper', n: 30, gap: 0.4, start: 0 }]
    ]},
    { gold: 70, name: '混编风暴',   waves: [
      [{ t: 'trooper', n: 24, gap: 0.5, start: 0 }, { t: 'runner', n: 16, gap: 0.4, start: 1 }],
      [{ t: 'brute',   n: 10, gap: 1.1, start: 0 }, { t: 'healer', n: 5, gap: 1.6, start: 2 }],
      [{ t: 'scout',   n: 36, gap: 0.25,start: 0 }],
      [{ t: 'brute',   n: 12, gap: 0.9, start: 0 }, { t: 'trooper', n: 20, gap: 0.45,start: 1 }, { t: 'runner', n: 14, gap: 0.35,start: 2 }],
      [{ t: 'healer',  n: 8,  gap: 1.2, start: 0 }, { t: 'brute', n: 10, gap: 1.2, start: 2 }],
      [{ t: 'runner',  n: 30, gap: 0.3, start: 0 }, { t: 'scout', n: 24, gap: 0.3, start: 1 }],
      [{ t: 'trooper', n: 28, gap: 0.4, start: 0 }, { t: 'brute', n: 12, gap: 1.0, start: 1 }],
      [{ t: 'brute',   n: 14, gap: 0.8, start: 0 }]
    ]},
    { gold: 100,name: '终焉之战',   waves: [
      [{ t: 'scout',   n: 40, gap: 0.25,start: 0 }, { t: 'runner', n: 24, gap: 0.3, start: 1 }],
      [{ t: 'brute',   n: 16, gap: 0.8, start: 0 }, { t: 'healer', n: 6, gap: 1.4, start: 2 }],
      [{ t: 'trooper', n: 40, gap: 0.35,start: 0 }],
      [{ t: 'boss',    n: 1,  gap: 0.5, start: 0 }, { t: 'brute', n: 14, gap: 1.0, start: 3 }],
      [{ t: 'runner',  n: 40, gap: 0.25,start: 0 }, { t: 'healer', n: 8, gap: 1.2, start: 1 }],
      [{ t: 'brute',   n: 20, gap: 0.7, start: 0 }, { t: 'trooper', n: 30, gap: 0.4, start: 1 }],
      [{ t: 'healer',  n: 10, gap: 1.0, start: 0 }, { t: 'brute', n: 18, gap: 0.8, start: 2 }],
      [{ t: 'trooper', n: 50, gap: 0.3, start: 0 }, { t: 'runner', n: 30, gap: 0.25,start: 1 }],
      [{ t: 'boss',    n: 1,  gap: 0.5, start: 0 }, { t: 'boss', n: 1, gap: 6, start: 4 }, { t: 'healer', n: 6, gap: 1.5, start: 2 }]
    ]}
  ];

  // 画布逻辑分辨率(由 play.html canvas width/height 决定)
  var VW = 1100, VH = 660;
  var STEP = 1000 / 60;          // 固定逻辑步长 ~60fps
  var MAX_PARTICLES = 500;

  // 站点设计令牌配色(与全局 CSS 变量一致)
  var C = {
    bg: '#060912', bgCard: '#0d1320', border: 'rgba(124,58,237,.25)',
    text: '#eaf0fb', text2: '#8b97b3', text3: '#5a6580',
    neonPurple: '#b537f2', neonCyan: '#00e0ff', neonBlue: '#7c3aed',
    ok: '#2ee6a6', warn: '#ffb627', danger: '#ff2e63'
  };

  // ============== 通用工具 ==============
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function shade(hex, t) {
    var c = hex2rgb(hex), r, g, b;
    if (t >= 0) { r = c[0] + (255 - c[0]) * t; g = c[1] + (255 - c[1]) * t; b = c[2] + (255 - c[2]) * t; }
    else { r = c[0] * (1 + t); g = c[1] * (1 + t); b = c[2] * (1 + t); }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 伪 3D 菱形台:返回顶/左/右三组面路径
  function poly3D(ctx, S, H, face) {
    ctx.beginPath();
    if (face === 'top') {
      ctx.moveTo(0, -S + H); ctx.lineTo(S, 0 + H); ctx.lineTo(0, S + H); ctx.lineTo(-S, 0 + H);
    } else if (face === 'left') {
      ctx.moveTo(-S, 0); ctx.lineTo(0, S); ctx.lineTo(0, S + H); ctx.lineTo(-S, 0 + H);
    } else { // right
      ctx.moveTo(S, 0); ctx.lineTo(0, S); ctx.lineTo(0, S + H); ctx.lineTo(S, 0 + H);
    }
    ctx.closePath();
  }

  // 预计算路径几何:航点 + 累计段长 + 总长,用于敌人插值移动
  function buildPath(waypoints) {
    var seg = [], total = 0;
    for (var i = 0; i < waypoints.length - 1; i++) {
      var a = waypoints[i], b = waypoints[i + 1];
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      seg.push({ a: a, b: b, len: len, cum: total });
      total += len;
    }
    return { wp: waypoints, seg: seg, total: total };
  }
  // 沿路径行进 dist 像素,返回 {x,y, done}。done=true 表示到达终点
  function pathAt(path, d) {
    if (d >= path.total) {
      var last = path.wp[path.wp.length - 1];
      return { x: last.x, y: last.y, done: true };
    }
    for (var i = 0; i < path.seg.length; i++) {
      var s = path.seg[i];
      if (d <= s.cum + s.len) {
        var t = (d - s.cum) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, done: false, ang: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) };
      }
    }
    var l = path.wp[path.wp.length - 1];
    return { x: l.x, y: l.y, done: true };
  }

  // ============== 入口 ==============
  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    // 路径:从左入口蜿蜒到右下方基地。航点在画面 1100×660 内布局。
    var WAYPOINTS = [
      { x: -40,  y: 120 },
      { x: 200,  y: 120 },
      { x: 250,  y: 230 },
      { x: 120,  y: 330 },
      { x: 120,  y: 470 },
      { x: 340,  y: 520 },
      { x: 480,  y: 410 },
      { x: 480,  y: 250 },
      { x: 640,  y: 200 },
      { x: 760,  y: 320 },
      { x: 700,  y: 470 },
      { x: 860,  y: 540 },
      { x: 1010, y: 470 },
      { x: 1140, y: 470 }   // 出口(基地在 ~1010,470)
    ];
    var BASE = { x: 1015, y: 470 };
    var PATH = buildPath(WAYPOINTS);
    var PATH_HALF_W = 26;   // 路带半宽,用于可建造格判定

    // 可建造网格:把画布按 40px 切格,排除路径占用与 UI 区
    var CELL = 40;
    var GRID_COLS = Math.floor(W / CELL), GRID_ROWS = Math.floor((H - 96) / CELL); // 底部 96px 留给建塔栏
    var buildable = computeBuildable();

    // 判定某格中心到路径线段的最小距离
    function distToPath(cx, cy) {
      var best = Infinity;
      for (var i = 0; i < PATH.seg.length; i++) {
        var s = PATH.seg[i];
        best = Math.min(best, distToSeg(cx, cy, s.a.x, s.a.y, s.b.x, s.b.y));
      }
      return best;
    }
    function distToSeg(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(px - ax, py - ay);
      var t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    }
    function computeBuildable() {
      var map = [];
      for (var r = 0; r < GRID_ROWS; r++) {
        map[r] = [];
        for (var c = 0; c < GRID_COLS; c++) {
          var cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
          var d = distToPath(cx, cy);
          // 距路径 > 半宽+塔半径,且不在顶/底 UI 区
          map[r][c] = (d > PATH_HALF_W + 14) && cy > 40 && cy < H - 100;
        }
      }
      return map;
    }

    // ============== 运行状态(全闭包) ==============
    var gold, lives, score, level, curDiff;
    var towers, enemies, projectiles, particles, floats, shocks, beams;
    var waveIdx, waveTimer, waveActive, spawnsLeft, spawnTimer, levelCleared;
    var running, over, paused, won;
    var mouseX, mouseY, ghostTower, selectedTower, hoverCell;
    var frame, last, acc, rafId, shake, endDelay, ended;
    var banner;              // {text, sub, t, kind} 关卡过渡横幅
    var towerBtnRects;       // 底栏建塔卡片命中矩形(每帧记录)
    var sellBtnRect, upBtnRect;
    var speedMult;           // 游戏倍速(1 或 2),按 Tab 切换
    var keys;

    function reset(diff) {
      curDiff = diff || 'normal';
      var D = DIFFICULTY[curDiff];
      level = 1;
      score = 0;
      gold = D.gold;
      lives = D.lives;
      towers = []; enemies = []; projectiles = []; particles = []; floats = []; shocks = []; beams = [];
      waveIdx = 0; waveTimer = 0; waveActive = false; spawnsLeft = []; spawnTimer = 0;
      levelCleared = false;
      running = false; over = false; paused = false; won = false;
      endDelay = 0; ended = false;
      ghostTower = null; selectedTower = null; hoverCell = null;
      frame = 0; last = 0; acc = 0; rafId = null; shake = 0;
      banner = { text: LEVELS[0].name, sub: '第 1 关 · 准备防守', t: 2.2, kind: 'level' };
      speedMult = 1; keys = {};
      towerBtnRects = []; sellBtnRect = null; upBtnRect = null;
      emitScore(); emitState('playing');
    }

    function emitScore() { hooks.onScore && hooks.onScore(score | 0, level | 0); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    // 启动下一关(从当前 level 的波次开始)
    function startLevelWaves() {
      var L = LEVELS[level - 1];
      gold += L.gold;            // 关卡起始加成(每关结算后补充经济)
      waveIdx = 0;
      waveActive = false;
      waveTimer = 1.0;           // 短暂缓冲
      levelCleared = false;
    }

    // 开启一波:展开该波次的生成队列
    function startWave() {
      var L = LEVELS[level - 1];
      if (waveIdx >= L.waves.length) { levelCleared = true; return; }
      var groups = L.waves[waveIdx];
      spawnsLeft = [];
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        for (var k = 0; k < g.n; k++) {
          spawnsLeft.push({ t: g.t, delay: g.start + k * g.gap });
        }
      }
      // 按延迟排序,顺序生成
      spawnsLeft.sort(function (a, b) { return a.delay - b.delay; });
      spawnTimer = 0;
      waveActive = true;
    }

    function spawnEnemy(type) {
      var def = ENEMIES[type];
      var D = DIFFICULTY[curDiff];
      var hpScale = def.hp * (1 + 0.18 * (level - 1)) * D.hpMul;
      // 终极关卡 Boss 额外强化
      if (type === 'boss' && level === 7) hpScale *= 1.5;
      enemies.push({
        type: type, def: def, x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
        progress: 0, hp: hpScale, maxHp: hpScale, slowT: 0, healT: 0,
        hitFlash: 0, dead: false, reached: false, phase: Math.random() * 6.28
      });
    }

    // ============== 经济与伤害 ==============
    function armorMul(projKind, armor) {
      // heavy 护甲:低伤武器(伤害<25 的非特化)减伤 50%
      if (armor === 'heavy') {
        return 0.5;
      }
      if (armor === 'light') return 0.85;
      return 1.0;
    }

    function dealDamage(e, raw, srcColor, isCrit) {
      var dmg = raw * armorMul(null, e.def.armor);
      e.hp -= dmg;
      e.hitFlash = 0.12;
      floats.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y - e.def.r - 4, v: Math.round(dmg), life: 0.8, color: isCrit ? C.warn : C.text });
      if (e.hp <= 0 && !e.dead) killEnemy(e);
    }

    function killEnemy(e) {
      e.dead = true;
      gold += e.def.reward;
      score += e.def.reward * (1 + 0.1 * (level - 1)) | 0;
      // 死亡爆炸粒子
      var n = e.type === 'boss' ? 50 : 14;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.28, sp = 40 + Math.random() * 140;
        particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, color: e.def.color, r: 2 + Math.random() * 2.5 });
      }
      if (e.type === 'boss') { shake = Math.max(shake, 14); shocks.push({ x: e.x, y: e.y, r: 20, maxR: 130, life: 0.7, color: C.danger }); }
      emitScore();
    }

    function applySlow(e, factor, dur) {
      // 取更强减速
      if (e.slowT <= 0 || factor < e.slowF) { e.slowF = factor; }
      e.slowT = Math.max(e.slowT, dur);
    }

    // ============== 塔逻辑 ==============
    function buildTower(type, gx, gy) {
      var def = TOWERS[type];
      if (!buildable[gy] || !buildable[gy][gx]) return false;
      // 不能与已有塔同格
      for (var i = 0; i < towers.length; i++) {
        if (towers[i].gx === gx && towers[i].gy === gy) return false;
      }
      if (gold < def.cost) return false;
      gold -= def.cost;
      towers.push({
        type: type, def: def, gx: gx, gy: gy,
        x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2,
        lvl: 1, cd: 0, target: null, angle: 0, spin: Math.random() * 6.28, placeT: 0.3
      });
      spark(gx * CELL + CELL / 2, gy * CELL + CELL / 2, def.color, 10);
      emitScore();
      return true;
    }

    function upgradeCost(t) { return Math.round(t.def.cost * 0.8 * t.lvl); }
    function sellValue(t) {
      var invested = t.def.cost;
      for (var i = 1; i < t.lvl; i++) invested += Math.round(t.def.cost * 0.8 * i);
      return Math.round(invested * 0.6);
    }
    function upgradeTower(t) {
      if (t.lvl >= 3) return false;
      var c = upgradeCost(t);
      if (gold < c) return false;
      gold -= c; t.lvl++; t.placeT = 0.2;
      spark(t.x, t.y, C.ok, 12);
      emitScore();
      return true;
    }
    function sellTower(t) {
      gold += sellValue(t);
      var idx = towers.indexOf(t); if (idx >= 0) towers.splice(idx, 1);
      spark(t.x, t.y, C.warn, 14);
      if (selectedTower === t) selectedTower = null;
      emitScore();
    }

    function towerStat(t) {
      var m = LEVEL_MULT[t.lvl - 1];
      var rng = t.def.range * m.rng;
      var dmg = t.def.dmg * m.dmg;
      var aux = t.def.splash ? t.def.splash * m.aux : (t.def.slow ? t.def.slow * m.aux : (t.def.chain ? Math.round(t.def.chain + (m.aux - 1) * 2) : 1));
      return { rng: rng, dmg: dmg, aux: aux };
    }

    function findTarget(t, rng) {
      var best = null, bestProg = -1;
      var r2 = rng * rng;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead || e.reached) continue;
        if (dist2(t.x, t.y, e.x, e.y) <= r2) {
          // 优先攻击进度最靠前的(最接近基地的)
          if (e.progress > bestProg) { bestProg = e.progress; best = e; }
        }
      }
      return best;
    }

    function fireTower(t) {
      var st = towerStat(t);
      var tgt = findTarget(t, st.rng);
      if (!tgt) return;
      t.cd = t.def.cd;
      t.angle = Math.atan2(tgt.y - t.y, tgt.x - t.x);
      var k = t.def.kind;
      if (k === 'beam') {
        // 激光:瞬时命中,发光线段
        dealDamage(tgt, st.dmg, t.def.color, false);
        beams.push({ x1: t.x, y1: t.y - 14, x2: tgt.x, y2: tgt.y, life: 0.12, color: t.def.color });
        spark(tgt.x, tgt.y, t.def.color, 5);
      } else if (k === 'splash') {
        // 榴弹:抛物线飞行,落点溅射
        projectiles.push({ kind: 'shell', x: t.x, y: t.y - 14, tx: tgt.x, ty: tgt.y, sx: t.x, sy: t.y - 14, prog: 0, speed: 320, dmg: st.dmg, splash: st.aux, color: t.def.color, arc: 70 });
      } else if (k === 'slow') {
        // 冰弹:飞行 + 命中减速
        projectiles.push({ kind: 'ice', x: t.x, y: t.y - 14, tx: tgt.x, ty: tgt.y, prog: 0, speed: 300, dmg: st.dmg, slow: t.def.slow, slowDur: t.def.slowDur, color: t.def.color });
      } else if (k === 'chain') {
        // 雷电:链式跳跃,瞬时
        chainLightning(t, tgt, st.dmg, st.aux);
      } else if (k === 'heavy') {
        // 天基:目标头顶预警圈,短暂延迟后光柱打击
        projectiles.push({ kind: 'orbital', x: tgt.x, y: tgt.y, tx: tgt.x, ty: tgt.y, warn: 0.7, dmg: st.dmg, splash: 60, color: t.def.color, t: 0 });
      }
    }

    function chainLightning(t, first, dmg, chainMax) {
      var hit = [], cur = first, pts = [{ x: t.x, y: t.y - 16 }];
      var d = dmg;
      while (cur && hit.length < chainMax) {
        dealDamage(cur, d, t.def.color, false);
        spark(cur.x, cur.y, t.def.color, 6);
        pts.push({ x: cur.x, y: cur.y });
        hit.push(cur);
        d *= t.def.chainFall;
        // 找下一个最近未命中目标
        var next = null, bestD = Infinity;
        for (var i = 0; i < enemies.length; i++) {
          var e = enemies[i];
          if (e.dead || e.reached || hit.indexOf(e) >= 0) continue;
          var dd = dist2(cur.x, cur.y, e.x, e.y);
          if (dd < 110 * 110 && dd < bestD) { bestD = dd; next = e; }
        }
        cur = next;
      }
      if (pts.length >= 2) beams.push({ chain: pts, life: 0.18, color: t.def.color });
    }

    // ============== 主逻辑步进 ==============
    function step(dt) {
      frame++;
      if (shake > 0) shake = Math.max(0, shake - dt * 40);
      // 粒子
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        p.vx *= 0.96; p.vy *= 0.96;
      }
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
      particles = particles.filter(function (p) { return p.life > 0; });

      // 浮动文字
      for (var f = 0; f < floats.length; f++) { floats[f].y -= 22 * dt; floats[f].life -= dt; }
      floats = floats.filter(function (f) { return f.life > 0; });

      // 光束(瞬时特效,衰减)
      for (var b = 0; b < beams.length; b++) beams[b].life -= dt;
      beams = beams.filter(function (b) { return b.life > 0; });

      // 冲击波环
      for (var s = 0; s < shocks.length; s++) {
        var sh = shocks[s];
        sh.r += (sh.maxR - sh.r) * 0.12; sh.life -= dt;
      }
      shocks = shocks.filter(function (s) { return s.life > 0; });

      // 横幅计时
      if (banner && banner.t > 0) { banner.t -= dt; if (banner.t <= 0) banner = null; }

      // 结束延迟:胜利/失败横幅展示后再上报(让玩家看到庆祝/沦陷动画)
      if (ended && endDelay > 0) {
        endDelay -= dt;
        if (endDelay <= 0) { ended = false; emitState('over'); hooks.onGameOver && hooks.onGameOver(score | 0, level | 0); }
        return;
      }

      if (over || paused) return;

      // 关卡过渡:横幅期间不刷怪,结束后开始该关波次
      if (levelCleared) {
        // 当前关清完,进入下一关
        if (level >= LEVELS.length) {
          // 通关:先展示胜利横幅,延迟上报让玩家看到庆祝动画
          won = true; over = true; ended = true; endDelay = 2.4;
          score += gold * 2;            // 剩余金币折算
          emitScore();
          banner = { text: '🏆 通关胜利!', sub: '第 ' + level + ' 关全部守住 · 总分 ' + (score | 0), t: 2.4, kind: 'win' };
          return;
        }
        level++;
        startLevelWaves();
        banner = { text: LEVELS[level - 1].name, sub: '第 ' + level + ' 关 · ' + LEVELS[level - 1].name, t: 2.0, kind: 'level' };
        emitScore();
        return;
      }

      // 波次控制
      if (!waveActive) {
        waveTimer -= dt;
        if (waveTimer <= 0) startWave();
      } else {
        spawnTimer += dt;
        while (spawnsLeft.length && spawnsLeft[0].delay <= spawnTimer) {
          var s2 = spawnsLeft.shift();
          spawnEnemy(s2.t);
        }
        if (spawnsLeft.length === 0) {
          // 该波生成完毕,等当前敌人清完再开下一波
          var aliveCount = 0;
          for (var ae = 0; ae < enemies.length; ae++) if (!enemies[ae].dead && !enemies[ae].reached) aliveCount++;
          if (aliveCount === 0) {
            waveIdx++;
            score += 50;            // 清波奖励
            gold += 25;             // 清波经济补给
            emitScore();
            if (waveIdx >= LEVELS[level - 1].waves.length) {
              levelCleared = true;
            } else {
              waveActive = false; waveTimer = 3.0;
            }
          }
        }
      }

      // 敌人移动
      var D = DIFFICULTY[curDiff];
      for (var en = 0; en < enemies.length; en++) {
        var e = enemies[en];
        if (e.dead || e.reached) continue;
        if (e.hitFlash > 0) e.hitFlash -= dt;
        var spd = e.def.speed * D.spdMul;
        if (e.slowT > 0) { e.slowT -= dt; spd *= e.slowF; if (e.slowT <= 0) e.slowF = 1; }
        e.progress += spd * dt;
        var pos = pathAt(PATH, e.progress);
        e.x = pos.x; e.y = pos.y; e.ang = pos.ang || 0;
        if (pos.done) {
          e.reached = true;
          lives -= (e.type === 'boss' ? 5 : 1);
          shake = Math.max(shake, e.type === 'boss' ? 12 : 5);
          if (lives <= 0) {
            lives = 0;
            over = true; won = false; ended = true; endDelay = 1.6;
            banner = { text: '💀 防线沦陷', sub: '坚守到第 ' + level + ' 关 · 得分 ' + (score | 0), t: 1.6, kind: 'over' };
            return;
          }
        }
        // 修复体:周期治疗周围友军
        if (e.def.heal && !e.dead && !e.reached) {
          e.healT -= dt;
          if (e.healT <= 0) {
            e.healT = e.def.healCD;
            var healed = [];
            for (var he = 0; he < enemies.length; he++) {
              var o = enemies[he];
              if (o === e || o.dead || o.reached) continue;
              if (dist2(e.x, e.y, o.x, o.y) <= e.def.healR * e.def.healR) {
                o.hp = Math.min(o.maxHp, o.hp + e.def.heal);
                floats.push({ x: o.x, y: o.y - o.def.r - 4, v: '+' + e.def.heal, life: 0.8, color: C.ok });
                healed.push({ x: o.x, y: o.y });
              }
            }
            // 为每个被治疗的友军画一条治疗电弧(可见反馈)
            for (var hd = 0; hd < healed.length; hd++) {
              beams.push({ chain: [{ x: e.x, y: e.y }, healed[hd]], heal: true, life: 0.35, color: C.ok });
            }
            // 即便没治疗到人,也在自身画一个脉冲(保持节奏感)
            if (healed.length === 0) beams.push({ chain: [{ x: e.x, y: e.y }, { x: e.x + 12, y: e.y }], heal: true, life: 0.2, color: C.ok });
          }
        }
      }
      enemies = enemies.filter(function (e) { return !e.dead && !e.reached; });

      // 塔攻击
      for (var ti = 0; ti < towers.length; ti++) {
        var t = towers[ti];
        if (t.placeT > 0) { t.placeT -= dt; continue; }
        if (t.cd > 0) t.cd -= dt;
        t.spin += dt * 1.2;
        // 重选目标
        var st = towerStat(t);
        if (t.target && (t.target.dead || t.target.reached || dist2(t.x, t.y, t.target.x, t.target.y) > st.rng * st.rng)) t.target = null;
        if (!t.target) t.target = findTarget(t, st.rng);
        if (t.target) {
          // 瞄准旋转
          var want = Math.atan2(t.target.y - t.y, t.target.x - t.x);
          var da = want - t.angle;
          while (da > Math.PI) da -= 6.2832;
          while (da < -Math.PI) da += 6.2832;
          t.angle += da * Math.min(1, dt * 10);
          if (t.cd <= 0) fireTower(t);
        } else {
          // 无目标时炮管缓慢回中
          t.angle += (0 - t.angle) * Math.min(1, dt * 2);
        }
      }

      // 抛射物
      for (var pj = 0; pj < projectiles.length; pj++) {
        var pr = projectiles[pj];
        if (pr.kind === 'shell') {
          pr.prog += dt * (pr.speed / Math.max(40, Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy)));
          if (pr.prog >= 1) {
            // 落点溅射
            impactSplash(pr.tx, pr.ty, pr.splash, pr.dmg, pr.color);
            pr.dead = true;
          } else {
            pr.x = pr.sx + (pr.tx - pr.sx) * pr.prog;
            pr.y = pr.sy + (pr.ty - pr.sy) * pr.prog - Math.sin(pr.prog * Math.PI) * pr.arc;
            if (frame % 2 === 0) particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.3, color: pr.color, r: 3 });
          }
        } else if (pr.kind === 'ice') {
          pr.prog += dt * (pr.speed / Math.max(40, Math.hypot(pr.tx - pr.x, pr.ty - pr.y)));
          if (pr.prog >= 1) {
            impactSingle(pr.tx, pr.ty, pr.dmg, pr.slow, pr.slowDur, pr.color);
            pr.dead = true;
          } else {
            var nx = pr.x + (pr.tx - pr.x) * pr.prog;
            var ny = pr.y + (pr.ty - pr.y) * pr.prog;
            pr.x = nx; pr.y = ny;
            if (frame % 2 === 0) particles.push({ x: pr.x, y: pr.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, color: pr.color, r: 2 });
          }
        } else if (pr.kind === 'orbital') {
          pr.t += dt;
          if (pr.t >= pr.warn) {
            // 光柱降临
            impactSplash(pr.tx, pr.ty, pr.splash, pr.dmg, pr.color);
            shake = Math.max(shake, 8);
            shocks.push({ x: pr.tx, y: pr.ty, r: 10, maxR: pr.splash, life: 0.5, color: pr.color });
            // 垂直光柱粒子
            for (var ci = 0; ci < 24; ci++) {
              particles.push({ x: pr.tx + (Math.random() - 0.5) * pr.splash, y: pr.ty - 120 + ci * 6, vx: 0, vy: 200, life: 0.3, color: pr.color, r: 3 });
            }
            pr.dead = true;
          }
        }
      }
      projectiles = projectiles.filter(function (p) { return !p.dead; });
    }

    function impactSplash(x, y, radius, dmg, color) {
      var r2 = radius * radius;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead || e.reached) continue;
        var dd = dist2(x, y, e.x, e.y);
        if (dd <= r2) {
          var falloff = 1 - Math.sqrt(dd) / radius * 0.4;   // 边缘衰减
          dealDamage(e, dmg * falloff, color, false);
        }
      }
      shocks.push({ x: x, y: y, r: 10, maxR: radius, life: 0.4, color: color });
      spark(x, y, color, 16);
    }
    function impactSingle(x, y, dmg, slow, slowDur, color) {
      // 命中最近敌人(冰弹追踪单体)
      var best = null, bestD = 24 * 24;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead || e.reached) continue;
        var dd = dist2(x, y, e.x, e.y);
        if (dd < bestD) { bestD = dd; best = e; }
      }
      if (best) {
        dealDamage(best, dmg, color, false);
        applySlow(best, slow, slowDur);
        for (var si = 0; si < 8; si++) {
          var a = Math.random() * 6.28;
          particles.push({ x: best.x, y: best.y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 0.4, color: color, r: 2 });
        }
      }
    }

    function spark(x, y, col, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.28, sp = 40 + Math.random() * 110;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, color: col, r: 2 + Math.random() * 2 });
      }
    }

    // ============== 渲染 ==============
    function draw() {
      // 背景
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      drawStarfield();

      // 屏幕震动偏移
      var sx = 0, sy = 0;
      if (shake > 0) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
      ctx.save();
      ctx.translate(sx, sy);

      drawBuildGrid();
      drawPath();
      drawBase();
      drawTowers();
      drawEnemies();
      drawProjectiles();
      drawBeams();
      drawParticles();
      drawShocks();
      drawFloats();
      drawGhost();
      ctx.restore();

      drawHUD();
      drawTowerBar();
      drawSelectedPanel();
      drawBanner();
      if (paused && running && !over) drawPaused();
    }

    // 星空背景(离屏缓存优化:只在 frame%30 重绘到离屏画布)
    var starCanvas = null, starCtx = null;
    function ensureStars() {
      if (starCanvas) return;
      starCanvas = document.createElement('canvas');
      starCanvas.width = W; starCanvas.height = H;
      starCtx = starCanvas.getContext('2d');
      for (var i = 0; i < 140; i++) {
        var x = Math.random() * W, y = Math.random() * H, r = Math.random() * 1.3;
        starCtx.globalAlpha = 0.15 + Math.random() * 0.5;
        starCtx.fillStyle = i % 7 === 0 ? C.neonPurple : (i % 3 === 0 ? C.neonCyan : '#9fb4d8');
        starCtx.fillRect(x, y, r, r);
      }
      starCtx.globalAlpha = 1;
    }
    function drawStarfield() {
      ensureStars();
      ctx.drawImage(starCanvas, 0, 0);
    }

    function drawBuildGrid() {
      // 可建造格淡色提示;悬停时高亮
      var hc = hoverCell;
      for (var r = 0; r < GRID_ROWS; r++) {
        for (var c = 0; c < GRID_COLS; c++) {
          if (!buildable[r][c]) continue;
          // 仅画微弱点,避免噪杂
          ctx.fillStyle = 'rgba(124,58,237,0.05)';
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
        }
      }
      // 悬停格高亮
      if (hc && ghostTower) {
        var ok = canBuildAt(hc.gx, hc.gy, ghostTower);
        ctx.fillStyle = ok ? 'rgba(46,230,166,0.18)' : 'rgba(255,46,99,0.18)';
        ctx.strokeStyle = ok ? C.ok : C.danger;
        ctx.lineWidth = 2;
        roundRect(ctx, hc.gx * CELL + 2, hc.gy * CELL + 2, CELL - 4, CELL - 4, 6);
        ctx.fill(); ctx.stroke();
      }
    }

    function canBuildAt(gx, gy, type) {
      if (!buildable[gy] || !buildable[gy][gx]) return false;
      for (var i = 0; i < towers.length; i++) if (towers[i].gx === gx && towers[i].gy === gy) return false;
      return gold >= TOWERS[type].cost;
    }

    function drawPath() {
      // 外发光霓虹路带
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 阴影底层(粗 + 模糊)
      ctx.strokeStyle = 'rgba(0,224,255,0.10)';
      ctx.lineWidth = PATH_HALF_W * 2 + 10;
      tracePath(); ctx.stroke();
      // 主体
      ctx.shadowBlur = 14; ctx.shadowColor = C.neonCyan;
      ctx.strokeStyle = 'rgba(0,224,255,0.22)';
      ctx.lineWidth = PATH_HALF_W * 2;
      tracePath(); ctx.stroke();
      ctx.shadowBlur = 0;
      // 内核流光线(随帧流动)
      ctx.strokeStyle = 'rgba(180,230,255,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 18]);
      ctx.lineDashOffset = -(frame * 0.6);
      tracePath(); ctx.stroke();
      ctx.setLineDash([]);
      // 路径边缘描边
      ctx.strokeStyle = 'rgba(124,58,237,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      tracePath(); ctx.stroke();
      ctx.setLineDash([]);
    }
    function tracePath() {
      ctx.beginPath();
      ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
      for (var i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
    }

    function drawBase() {
      var x = BASE.x, y = BASE.y;
      // 地面圈
      ctx.fillStyle = 'rgba(0,224,255,0.10)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 30, 12, 0, 0, 6.28); ctx.fill();
      // 3D 台
      var S = 22, H3 = 18, col = C.neonCyan;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(2, y + 6, S, S * 0.35, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = shade(col, -0.45); poly3D(ctx, S, H3, 'left'); ctx.fill();
      ctx.fillStyle = shade(col, -0.28); poly3D(ctx, S, H3, 'right'); ctx.fill();
      ctx.shadowBlur = 14; ctx.shadowColor = col;
      ctx.fillStyle = shade(col, 0.12); poly3D(ctx, S, H3, 'top'); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 1.5; poly3D(ctx, S * 0.8, H3 * 0.9, 'top'); ctx.stroke();
      // 顶部图腾
      ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🏰', x, y - 2);
      ctx.textBaseline = 'alphabetic';
    }

    function drawTowers() {
      for (var i = 0; i < towers.length; i++) {
        var t = towers[i];
        // 选中圈/射程圈
        if (selectedTower === t) {
          var st = towerStat(t);
          ctx.fillStyle = 'rgba(0,224,255,0.06)';
          ctx.strokeStyle = 'rgba(0,224,255,0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(t.x, t.y, st.rng, 0, 6.28); ctx.fill(); ctx.stroke();
        }
        // 放置弹跳
        var scale = 1;
        if (t.placeT > 0) { scale = 1 + t.placeT * 1.5; }
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.scale(scale, scale);

        var col = t.def.color;
        var S = 15, H3 = 14;
        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(2, 6, S, S * 0.35, 0, 0, 6.28); ctx.fill();
        // 三面台
        ctx.fillStyle = shade(col, -0.45); poly3D(ctx, S, H3, 'left'); ctx.fill();
        ctx.fillStyle = shade(col, -0.28); poly3D(ctx, S, H3, 'right'); ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = col;
        ctx.fillStyle = shade(col, 0.12); poly3D(ctx, S, H3, 'top'); ctx.fill();
        ctx.shadowBlur = 0;
        // 顶面描边
        ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 1.2; poly3D(ctx, S * 0.78, H3 * 0.9, 'top'); ctx.stroke();

        // 顶部动态细节(随塔类型)
        ctx.translate(0, -H3);
        drawTowerTop(t, col);
        ctx.restore();

        // 等级标记
        if (t.lvl > 1) {
          ctx.fillStyle = C.warn; ctx.font = 'bold 11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center';
          for (var li = 0; li < t.lvl - 1; li++) {
            ctx.fillRect(t.x - 6 + li * 5, t.y + 14, 3, 3);
          }
        }
      }
    }

    function drawTowerTop(t, col) {
      var k = t.def.kind;
      ctx.save();
      if (k === 'beam') {
        // 旋转炮管瞄准
        ctx.rotate(t.angle);
        ctx.fillStyle = shade(col, 0.3);
        ctx.fillRect(0, -2.5, 16, 5);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 8; ctx.shadowColor = col;
        ctx.beginPath(); ctx.arc(14, 0, 2.5, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
      } else if (k === 'splash') {
        // 粗炮管
        ctx.rotate(t.angle);
        ctx.fillStyle = shade(col, -0.1);
        ctx.fillRect(0, -4, 18, 8);
        ctx.fillStyle = shade(col, -0.4);
        ctx.fillRect(16, -5, 4, 10);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.28); ctx.fill();
      } else if (k === 'slow') {
        // 旋转冰晶
        ctx.rotate(t.spin);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        for (var i = 0; i < 6; i++) {
          var a = i * Math.PI / 3;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.stroke();
        }
        ctx.fillStyle = shade(col, 0.4);
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.28); ctx.fill();
      } else if (k === 'chain') {
        // 电极球 + 跳动电弧
        ctx.fillStyle = col;
        ctx.shadowBlur = 10; ctx.shadowColor = col;
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = shade(col, 0.6); ctx.lineWidth = 1.2;
        for (var s = 0; s < 3; s++) {
          var aa = t.spin * 2 + s * 2.094;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(aa) * 5, Math.sin(aa) * 5);
          ctx.lineTo(Math.cos(aa + 0.3) * 10, Math.sin(aa + 0.3) * 10);
          ctx.stroke();
        }
      } else if (k === 'heavy') {
        // 天基:瞄准碟
        ctx.rotate(t.spin * 0.3);
        ctx.fillStyle = shade(col, -0.2);
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = col;
        ctx.shadowBlur = 10; ctx.shadowColor = col;
        ctx.beginPath(); ctx.arc(0, -3, 4, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
      }
      ctx.restore();
    }

    function drawEnemies() {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var x = e.x, y = e.y, def = e.def;
        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y + def.r * 0.7, def.r * 0.9, def.r * 0.35, 0, 0, 6.28); ctx.fill();
        // 主体
        var col = def.color;
        if (e.hitFlash > 0) col = '#ffffff';
        ctx.shadowBlur = e.type === 'boss' ? 18 : 8;
        ctx.shadowColor = def.color;
        ctx.fillStyle = col;
        if (e.type === 'boss') {
          // Boss:大菱形 + 旋转尖刺
          ctx.save(); ctx.translate(x, y); ctx.rotate(e.phase + frame * 0.01);
          ctx.beginPath();
          ctx.moveTo(0, -def.r); ctx.lineTo(def.r, 0); ctx.lineTo(0, def.r); ctx.lineTo(-def.r, 0); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = shade(def.color, 0.4); ctx.lineWidth = 2; ctx.stroke();
          for (var sp = 0; sp < 6; sp++) {
            var sa = sp * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(Math.cos(sa) * def.r, Math.sin(sa) * def.r);
            ctx.lineTo(Math.cos(sa) * (def.r + 6), Math.sin(sa) * (def.r + 6)); ctx.stroke();
          }
          ctx.restore();
        } else if (e.type === 'runner') {
          // 流线三角
          ctx.save(); ctx.translate(x, y); ctx.rotate(e.ang);
          ctx.beginPath();
          ctx.moveTo(def.r, 0); ctx.lineTo(-def.r * 0.7, -def.r * 0.7); ctx.lineTo(-def.r * 0.4, 0); ctx.lineTo(-def.r * 0.7, def.r * 0.7); ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(x, y, def.r, 0, 6.28); ctx.fill();
          // 内核
          ctx.fillStyle = shade(def.color, 0.4);
          ctx.beginPath(); ctx.arc(x, y, def.r * 0.5, 0, 6.28); ctx.fill();
        }
        ctx.shadowBlur = 0;
        // 图标
        ctx.font = (def.r * 1.1) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.9; ctx.fillText(def.icon, x, y); ctx.globalAlpha = 1;
        ctx.textBaseline = 'alphabetic';
        // 减速冰罩
        if (e.slowT > 0) {
          ctx.strokeStyle = 'rgba(124,214,255,0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, def.r + 3, 0, 6.28); ctx.stroke();
        }
        // 血条
        if (e.hp < e.maxHp) {
          var bw = def.r * 2, bh = 3;
          var bx = x - bw / 2, by = y - def.r - 8;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          var pct = clamp(e.hp / e.maxHp, 0, 1);
          ctx.fillStyle = pct > 0.5 ? C.ok : (pct > 0.25 ? C.warn : C.danger);
          ctx.fillRect(bx, by, bw * pct, bh);
        }
      }
    }

    function drawProjectiles() {
      for (var i = 0; i < projectiles.length; i++) {
        var p = projectiles[i];
        if (p.kind === 'shell') {
          ctx.shadowBlur = 10; ctx.shadowColor = p.color;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.28); ctx.fill();
          ctx.shadowBlur = 0;
        } else if (p.kind === 'ice') {
          ctx.shadowBlur = 8; ctx.shadowColor = p.color;
          ctx.fillStyle = '#e8faff';
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(frame * 0.3);
          ctx.beginPath();
          for (var s = 0; s < 4; s++) {
            var a = s * Math.PI / 2;
            ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 4, Math.sin(a) * 4);
          }
          ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
          ctx.shadowBlur = 0;
        } else if (p.kind === 'orbital') {
          // 警告圈:随接近触发收缩闪烁
          var prog = p.t / p.warn;
          var r = p.splash * (1 - prog * 0.5);
          ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          ctx.globalAlpha = 0.4 + 0.4 * Math.sin(frame * 0.8);
          ctx.beginPath(); ctx.arc(p.tx, p.ty, r, 0, 6.28); ctx.stroke();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.tx, p.ty, r, 0, 6.28); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawBeams() {
      for (var i = 0; i < beams.length; i++) {
        var b = beams[i];
        var alpha = clamp(b.life / 0.18, 0, 1);
        ctx.globalAlpha = alpha;
        if (b.chain) {
          // 雷电链 / 治疗链:锯齿折线
          ctx.strokeStyle = b.color;
          ctx.shadowBlur = 12; ctx.shadowColor = b.color;
          ctx.lineWidth = b.heal ? 2 : 2.5;
          ctx.beginPath();
          for (var s = 0; s < b.chain.length - 1; s++) {
            var p1 = b.chain[s], p2 = b.chain[s + 1];
            jaggedLine(p1.x, p1.y, p2.x, p2.y, b.heal ? 3 : 6);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          // 直线激光
          ctx.strokeStyle = b.color;
          ctx.shadowBlur = 12; ctx.shadowColor = b.color;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }
    }
    function jaggedLine(x1, y1, x2, y2, amp) {
      var segs = 5, dx = (x2 - x1) / segs, dy = (y2 - y1) / segs;
      ctx.moveTo(x1, y1);
      for (var i = 1; i < segs; i++) {
        var jx = x1 + dx * i + (Math.random() - 0.5) * amp * 2;
        var jy = y1 + dy * i + (Math.random() - 0.5) * amp * 2;
        ctx.lineTo(jx, jy);
      }
      ctx.lineTo(x2, y2);
    }

    function drawParticles() {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      }
      ctx.globalAlpha = 1;
    }

    function drawShocks() {
      for (var i = 0; i < shocks.length; i++) {
        var s = shocks[i];
        ctx.globalAlpha = clamp(s.life / 0.5, 0, 1) * 0.8;
        ctx.strokeStyle = s.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.stroke();
        ctx.globalAlpha = clamp(s.life / 0.5, 0, 1) * 0.3;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.7, 0, 6.28); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawFloats() {
      ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      for (var i = 0; i < floats.length; i++) {
        var f = floats[i];
        ctx.globalAlpha = clamp(f.life, 0, 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.v, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    function drawGhost() {
      if (!ghostTower || !hoverCell) return;
      var gx = hoverCell.gx, gy = hoverCell.gy;
      var x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
      var def = TOWERS[ghostTower];
      var ok = canBuildAt(gx, gy, ghostTower);
      // 射程圈
      ctx.fillStyle = ok ? 'rgba(46,230,166,0.06)' : 'rgba(255,46,99,0.06)';
      ctx.strokeStyle = ok ? 'rgba(46,230,166,0.5)' : 'rgba(255,46,99,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, def.range, 0, 6.28); ctx.fill(); ctx.stroke();
      // 幽灵塔体
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = ok ? def.color : C.danger;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, x, y);
      ctx.textBaseline = 'alphabetic';
    }

    // ============== HUD ==============
    function drawHUD() {
      // 顶栏背景
      ctx.fillStyle = 'rgba(13,19,32,0.85)';
      roundRect(ctx, 10, 10, W - 20, 44, 10); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1; roundRect(ctx, 10, 10, W - 20, 44, 10); ctx.stroke();

      ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var D = DIFFICULTY[curDiff];
      var x = 24;
      // 关卡
      ctx.fillStyle = C.neonPurple; ctx.fillText('第 ' + level + '/' + LEVELS.length + ' 关', x, 32); x += 90;
      // 金币
      ctx.fillStyle = C.warn; ctx.fillText('💰 ' + gold, x, 32); x += 90;
      // 生命
      ctx.fillStyle = lives <= 5 ? C.danger : C.ok; ctx.fillText('❤️ ' + lives, x, 32); x += 80;
      // 波次
      var L = LEVELS[level - 1];
      var waveText = '🌊 ' + (Math.min(waveIdx + (waveActive ? 1 : 0), L.waves.length) + (waveActive ? 0 : 0)) + '/' + L.waves.length;
      ctx.fillStyle = C.neonCyan; ctx.fillText(waveText, x, 32); x += 90;
      // 分数
      ctx.fillStyle = C.text; ctx.fillText('🏆 ' + score, x, 32); x += 110;
      // 难度
      ctx.fillStyle = C.text2; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(D.label, x, 32);

      // 右侧:倍速指示
      ctx.textAlign = 'right'; ctx.fillStyle = C.text2;
      ctx.fillText(speedMult > 1 ? '⏩ x' + speedMult + ' (Tab)' : 'Tab 加速', W - 24, 32);
      ctx.textBaseline = 'alphabetic';
    }

    function drawTowerBar() {
      towerBtnRects = [];
      var barH = 80, y0 = H - barH - 6;
      ctx.fillStyle = 'rgba(13,19,32,0.9)';
      roundRect(ctx, 10, y0, W - 20, barH, 10); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1; roundRect(ctx, 10, y0, W - 20, barH, 10); ctx.stroke();

      var n = TOWER_KEYS.length;
      var cardW = 150, gap = 10, totalW = n * cardW + (n - 1) * gap;
      var startX = (W - totalW) / 2;
      ctx.textBaseline = 'middle';
      for (var i = 0; i < n; i++) {
        var key = TOWER_KEYS[i], def = TOWERS[key];
        var bx = startX + i * (cardW + gap), by = y0 + 8;
        var active = ghostTower === key;
        var afford = gold >= def.cost;
        var rect = { x: bx, y: by, w: cardW, h: barH - 16, key: key };
        towerBtnRects.push(rect);

        // 卡片背景
        ctx.fillStyle = active ? 'rgba(0,224,255,0.18)' : 'rgba(20,27,46,0.7)';
        roundRect(ctx, bx, by, cardW, barH - 16, 8); ctx.fill();
        ctx.strokeStyle = active ? C.neonCyan : (afford ? C.border : 'rgba(255,46,99,0.3)');
        ctx.lineWidth = active ? 2 : 1;
        roundRect(ctx, bx, by, cardW, barH - 16, 8); ctx.stroke();

        // 图标方块
        ctx.fillStyle = def.color; ctx.globalAlpha = afford ? 1 : 0.4;
        roundRect(ctx, bx + 8, by + 8, 38, 38, 6); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(def.icon, bx + 27, by + 28);

        // 名称 + 快捷键
        ctx.fillStyle = afford ? C.text : C.text3;
        ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(def.name, bx + 54, by + 18);
        ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('键 ' + (i + 1), bx + 54, by + 34);

        // 费用
        ctx.fillStyle = afford ? C.warn : C.danger;
        ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('💰' + def.cost, bx + cardW - 8, by + 18);
        // 特性简述
        ctx.fillStyle = C.text2; ctx.font = '10px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(towerDesc(key), bx + cardW - 8, by + 36);
      }
      ctx.textBaseline = 'alphabetic';
    }
    function towerDesc(key) {
      return ({
        photon: '单体·快射', cannon: '溅射·群杀', frost: '减速·控场', tesla: '链击·3体', orbital: '重击·破甲'
      })[key] || '';
    }

    function drawSelectedPanel() {
      if (!selectedTower) { sellBtnRect = null; upBtnRect = null; return; }
      var t = selectedTower;
      var st = towerStat(t);
      var pw = 220, ph = 110, px = W - pw - 14, py = 64;
      ctx.fillStyle = 'rgba(13,19,32,0.92)';
      roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
      ctx.strokeStyle = t.def.color; ctx.lineWidth = 1.5; roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillText(t.def.icon, px + 14, py + 20);
      ctx.fillStyle = C.text; ctx.font = 'bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(t.def.name + ' Lv.' + t.lvl, px + 40, py + 20);
      ctx.fillStyle = C.text2; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('伤害 ' + Math.round(st.dmg) + ' · 射程 ' + Math.round(st.rng), px + 40, py + 38);

      // 升级按钮
      var upY = py + 54;
      var canUp = t.lvl < 3;
      var upCost = canUp ? upgradeCost(t) : 0;
      var upAfford = canUp && gold >= upCost;
      upBtnRect = canUp ? { x: px + 10, y: upY, w: 96, h: 30 } : null;
      ctx.fillStyle = canUp ? (upAfford ? 'rgba(46,230,166,0.2)' : 'rgba(90,101,128,0.3)') : 'rgba(40,46,64,0.4)';
      roundRect(ctx, px + 10, upY, 96, 30, 6); ctx.fill();
      ctx.strokeStyle = canUp ? (upAfford ? C.ok : C.text3) : C.text3; ctx.lineWidth = 1;
      roundRect(ctx, px + 10, upY, 96, 30, 6); ctx.stroke();
      ctx.fillStyle = canUp ? (upAfford ? C.ok : C.text3) : C.text3;
      ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(canUp ? ('⬆ 升级 💰' + upCost) : '已满级', px + 58, upY + 15);

      // 卖出按钮
      sellBtnRect = { x: px + 114, y: upY, w: 96, h: 30 };
      ctx.fillStyle = 'rgba(255,46,99,0.15)';
      roundRect(ctx, px + 114, upY, 96, 30, 6); ctx.fill();
      ctx.strokeStyle = C.danger; ctx.lineWidth = 1;
      roundRect(ctx, px + 114, upY, 96, 30, 6); ctx.stroke();
      ctx.fillStyle = C.danger; ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('💰 卖出 +' + sellValue(t), px + 162, upY + 15);
      ctx.textBaseline = 'alphabetic';
    }

    function drawBanner() {
      if (!banner) return;
      var alpha = banner.t > 1.6 ? (2.2 - banner.t) / 0.6 : (banner.t < 0.4 ? banner.t / 0.4 : 1);
      alpha = clamp(alpha, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(6,9,18,0.7)';
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.fillStyle = banner.kind === 'over' ? C.danger : (banner.kind === 'win' ? C.warn : C.neonCyan);
      ctx.font = 'bold 38px Orbitron, Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowBlur = 16; ctx.shadowColor = ctx.fillStyle;
      ctx.fillText(banner.text, W / 2, H / 2 - 14);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.text2; ctx.font = '16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(banner.sub, W / 2, H / 2 + 22);
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }

    function drawPaused() {
      ctx.fillStyle = 'rgba(6,9,18,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.neonCyan; ctx.font = 'bold 40px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⏸ 已暂停', W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
    }

    // ============== 输入 ==============
    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (W / r.width),
        y: (e.clientY - r.top) * (H / r.height)
      };
    }
    function onDown(e) {
      e.preventDefault();
      if (!running || over) return;
      var p = toLocal(e);
      // 优先:建塔卡片
      for (var i = 0; i < towerBtnRects.length; i++) {
        var rr = towerBtnRects[i];
        if (p.x >= rr.x && p.x <= rr.x + rr.w && p.y >= rr.y && p.y <= rr.y + rr.h) {
          var def = TOWERS[rr.key];
          if (gold >= def.cost) { ghostTower = rr.key; selectedTower = null; }
          return;
        }
      }
      // 选中塔的升级/卖出按钮
      if (selectedTower) {
        if (upBtnRect && hitRect(p, upBtnRect)) { upgradeTower(selectedTower); return; }
        if (sellBtnRect && hitRect(p, sellBtnRect)) { sellTower(selectedTower); return; }
      }
      // 点击空地:建造 或 选塔
      var cell = pickCell(p.x, p.y);
      if (ghostTower && cell) {
        if (buildTower(ghostTower, cell.gx, cell.gy)) {
          // 建造成功后保持选中该类型便于连建(金币不足则取消)
          if (gold < TOWERS[ghostTower].cost) ghostTower = null;
        }
        return;
      }
      // 选已有塔
      var hit = pickTower(p.x, p.y);
      selectedTower = hit;
    }
    function hitRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
    function pickCell(x, y) {
      var gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return null;
      return { gx: gx, gy: gy };
    }
    function pickTower(x, y) {
      for (var i = 0; i < towers.length; i++) {
        var t = towers[i];
        if (dist2(x, y, t.x, t.y) <= 16 * 16) return t;
      }
      return null;
    }
    function onMove(e) {
      var p = toLocal(e);
      mouseX = p.x; mouseY = p.y;
      if (ghostTower) hoverCell = pickCell(p.x, p.y);
      else hoverCell = null;
    }
    function onKey(e) {
      var k = e.key.toLowerCase();
      keys[k] = (e.type === 'keydown');
      if (!running || over) return;
      if (k === 'escape') { ghostTower = null; selectedTower = null; }
      else if (k >= '1' && k <= '5') {
        var idx = parseInt(k, 10) - 1;
        var key = TOWER_KEYS[idx];
        if (key && gold >= TOWERS[key].cost) { ghostTower = key; selectedTower = null; }
      } else if (k === 'tab') {
        e.preventDefault();
        speedMult = speedMult === 1 ? 2 : 1;
      } else if (k === 'u' && selectedTower) {
        upgradeTower(selectedTower);
      } else if (k === 's' && selectedTower) {
        sellTower(selectedTower);
      }
    }
    function onContext(e) { e.preventDefault(); }
    function onBlur() { keys = {}; }

    // ============== 主循环 ==============
    function loop(ts) {
      if (!last) last = ts;
      var dt = (ts - last) / 1000; last = ts;
      if (dt > 0.1) dt = 0.1;
      // 正常游戏逻辑(步进);以及胜负横幅倒计时阶段也要 step(否则 onGameOver 永不触发)
      if (running && !paused && (!over || (ended && endDelay > 0))) {
        acc += dt * speedMult;
        var max = 6;
        while (acc >= STEP / 1000 && max-- > 0) { step(STEP / 1000); acc -= STEP / 1000; }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function start(diff) {
      reset(diff);
      startLevelWaves();
      running = true; paused = false;
    }
    function pause() { if (!running || over) return; paused = true; emitState('paused'); }
    function resume() { if (over) return; paused = false; emitState('playing'); }
    function destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    }

    // 注册输入
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);

    // 初始:reset 出首屏画面(等壳页面点开始)
    reset('normal');
    running = false;
    rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
