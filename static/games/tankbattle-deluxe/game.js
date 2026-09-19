/* ============================================================
 * 坦克大战 · 精致版 (tankbattle-deluxe)  ·  Phase 1
 * ------------------------------------------------------------
 * 单文件 IIFE,实现 IanGame 契约:window.IanGame.init(canvas, hooks)
 *   → 返回 { pause, resume, restart(diff), destroy }
 *
 * Phase 1 交付:
 *   · 复用 plantguard-deluxe 的 Engine 层(工具/粒子/音效/输入/主循环)
 *   · 玩家坦克 3 星成长(1星单发→2星双发→3星三发+穿甲+护盾)
 *   · 3 种敌方坦克(轻/重/快)+ 差异化 AI 雏形
 *   · 5 关手工设计地图
 *   · 5 种道具(火力★/护盾/加命/加速/全屏炸弹)
 *   · 5 种地形(砖墙可破坏/钢墙/草丛/水/基地)
 *   · 贝塞尔自绘精细坦克 + 多层粒子 + WebAudio 音效
 *
 * 分层架构(引擎层隔离):
 *   Engine   工具 + 粒子 + 音效 + 输入
 *   Map      手工地图 + 地形渲染 + 破坏判定
 *   Tank     玩家(3星)/ 敌方(多种)/ 自绘 + AI
 *   Bullet   普通 / 穿甲 / 散射,敌我分色
 *   Powerup  5 种掉落 + 拾取 + 效果
 *   Game     关卡 / HUD
 * ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // 配置常量
  // ============================================================
  var COLS = 15, ROWS = 13;            // 网格
  var LEVELS = 20;                      // Phase 2 扩展到 20 关
  var HUD_TOP = 56;                     // 顶部 HUD 高度
  // 地形类型
  var T = { EMPTY: 0, BRICK: 1, STEEL: 2, GRASS: 3, WATER: 4, BASE: 5 };
  var COLOR = {
    bg: '#060912', field: '#0a0f1c',
    neon: '#00e0ff', neon2: '#b537f2', ok: '#2ee6a6', warn: '#ffb627', danger: '#ff2e63',
    text: '#eaf0fb', text2: '#8b97b3',
    brick: '#a0522d', brickDark: '#6b3410', steel: '#b8c0cc', steelDark: '#5a6470',
    grass: '#3a7a3a', water: '#2a6ad8',
    base: '#00e0ff',
    p1: '#00e0ff', p1d: '#005566',     // 玩家青蓝
    e1: '#ff2e63', e1d: '#7a1430',     // 敌方红
    e2: '#ff7847', e2d: '#7a3a10',     // 敌方橙(重)
    e3: '#b537f2', e3d: '#5a1a6a',     // 敌方紫(快)
    e4: '#9aa6b4', e4d: '#3a4654',     // 敌方灰(装甲)
    e5: '#2ee6a6', e5d: '#0a5a3a'      // 敌方绿(狙击)
  };

  // ============================================================
  // 玩家坦克 3 星等级配置
  //   star 1: 单发 / 中速
  //   star 2: 双发 / 快速
  //   star 3: 三发 + 穿甲 + 护盾 / 最快
  // ============================================================
  var PLAYER_TIERS = [
    { star: 1, hp: 3, speed: 2.0, fireRate: 0.35, bullets: 1, pierce: false, shield: false, name: '轻型' },
    { star: 2, hp: 4, speed: 2.4, fireRate: 0.28, bullets: 2, pierce: false, shield: false, name: '中型' },
    { star: 3, hp: 5, speed: 2.8, fireRate: 0.22, bullets: 3, pierce: true, shield: true, name: '重型' }
  ];

  // ============================================================
  // 敌方坦克定义(Phase 2: 5 种)
  //   ai: patrol 巡逻 / chase 追击 / sniper 狙击(远程保持距离)/ charge 冲锋(直冲基地)
  // ============================================================
  var ENEMIES = {
    light:  { name: '轻型坦克', hp: 1, speed: 1.6, fireRate: 1.2, score: 100, color: COLOR.e1, colorD: COLOR.e1d, ai: 'patrol' },
    heavy:  { name: '重型坦克', hp: 3, speed: 1.0, fireRate: 1.5, score: 200, color: COLOR.e2, colorD: COLOR.e2d, ai: 'patrol' },
    fast:   { name: '快速坦克', hp: 1, speed: 2.4, fireRate: 0.9, score: 150, color: COLOR.e3, colorD: COLOR.e3d, ai: 'chase' },
    armor:  { name: '装甲坦克', hp: 5, speed: 0.9, fireRate: 1.4, score: 300, color: COLOR.e4, colorD: COLOR.e4d, ai: 'charge', frontArmor: true },
    sniper: { name: '狙击坦克', hp: 2, speed: 1.4, fireRate: 0.7, score: 250, color: COLOR.e5, colorD: COLOR.e5d, ai: 'sniper', longShot: true }
  };
  // Boss 坦克(第 5/10/15/20 关)
  var BOSS = {
    name: '装甲巨兽', hp: 20, speed: 0.8, fireRate: 0.6, score: 1000, color: COLOR.neon2, colorD: '#3a0a5a', isBoss: true
  };

  // ============================================================
  // 道具定义(Phase 1: 5 种)
  // ============================================================
  var POWERUPS = {
    star:    { name: '火力升级', icon: '★', color: COLOR.warn, desc: '坦克升 1 星' },
    shield:  { name: '护盾', icon: '🛡', color: COLOR.neon, desc: '短暂无敌' },
    life:    { name: '加命', icon: '❤', color: COLOR.danger, desc: '+1 生命' },
    speed:   { name: '加速', icon: '⚡', color: COLOR.ok, desc: '移速提升' },
    bomb:    { name: '全屏炸弹', icon: '💥', color: COLOR.neon2, desc: '清空全屏敌人' },
    freeze:  { name: '停敌', icon: '❄', color: COLOR.ice2, desc: '冻结所有敌人' },
    pierce:  { name: '穿甲弹', icon: '➤', color: COLOR.neon2, desc: '临时穿透钢墙' },
    ironwall:{ name: '基地铁墙', icon: '⬢', color: COLOR.steel2, desc: '基地变钢墙防御' }
  };
  // 道具颜色补充
  COLOR.ice2 = '#6fd0ff';
  COLOR.steel2 = '#b8c0cc';

  // ============================================================
  // 手工地图(5 关)。字符表示地形:
  //   . 空  B 砖  S 钢  G 草  W 水  X 基地
  // 每关 13 行 × 15 列。基地固定在底部中央。
  // ============================================================
  var MAP_TEMPLATES = [
    // 第 1 关:简单开放
    [
      "...............",
      "..BB.....BB....",
      "..BB.....BB....",
      "...............",
      "...BB...BB.....",
      "...............",
      ".......G.......",
      "...............",
      ".....BB.BB.....",
      "...............",
      "..BB.......BB..",
      "..BB..B.B..BB..",
      ".......X......."
    ],
    // 第 2 关:钢墙屏障
    [
      "...............",
      "..SS.....SS....",
      "..BB.....BB....",
      "...............",
      "...SS...SS.....",
      ".......G.......",
      "..BB.......BB..",
      ".......G.......",
      ".....SS.SS.....",
      "...............",
      "..BB.......BB..",
      "..BB..B.B..BB..",
      ".......X......."
    ],
    // 第 3 关:水域分隔
    [
      "...............",
      "..BB.....BB....",
      "...............",
      "..WWWWWWWWWWW..",
      "...............",
      "...BB.G.BB.....",
      ".......G.......",
      ".....BB.BB.....",
      "...............",
      "..WWWWWWWWWWW..",
      "...............",
      "..BB..B.B..BB..",
      ".......X......."
    ],
    // 第 4 关:迷宫
    [
      "...............",
      ".B.B.B.B.B.B.B.",
      ".B.B.B.B.B.B.B.",
      "...............",
      "BB.BB.SSS.BB.BB",
      "...............",
      "..G..G.G..G....",
      "...............",
      "BB.BB.SSS.BB.BB",
      "...............",
      ".B.B.B.B.B.B.B.",
      ".B.B.B.B.B.B.B.",
      ".......X......."
    ],
    // 第 5 关:要塞
    [
      "..S.........S..",
      "..B.........B..",
      "..B.BB.BB.B.B..",
      "..S.........S..",
      "...............",
      "BBB.G.G.G.G.BBB",
      "...............",
      "BBB.G.G.G.G.BBB",
      "...............",
      "..S.........S..",
      "..B.BB.BB.B.B..",
      "..B.........B..",
      "..S....X....S.."
    ],
    // 第 6 关:十字走廊
    [
      ".......B.......",
      "...B...B...B...",
      "...B...B...B...",
      ".......B.......",
      "BBB.........BBB",
      "....G.....G....",
      ".......X.......",
      "....G.....G....",
      "BBB.........BBB",
      ".......B.......",
      "...B...B...B...",
      "...B...B...B...",
      ".......B......."
    ],
    // 第 7 关:钢铁堡垒
    [
      ".SSS.......SSS.",
      ".S.B.B.B.B.S...",
      ".S.B.B.B.B.S...",
      ".SSS.......SSS.",
      "...............",
      "..W...GGG...W..",
      "..W..........W.",
      "..W...GGG...W..",
      "...............",
      ".SSS.......SSS.",
      ".S.B.B.B.B.S...",
      ".S.B.B.B.B.S...",
      ".SSS...X...SSS."
    ],
    // 第 8 关:棋盘
    [
      ".B.B.B.B.B.B.B.",
      "B.B.B.B.B.B.B.B",
      ".B.B.B.B.B.B.B.",
      "B.B.B.B.B.B.B.B",
      "...............",
      "GGG...SSS...GGG",
      "...............",
      "GGG...SSS...GGG",
      "...............",
      ".B.B.B.B.B.B.B.",
      "B.B.B.B.B.B.B.B",
      ".B.B.B.B.B.B.B.",
      "B.B.B...X.B.B.B"
    ],
    // 第 9 关:河道
    [
      "...............",
      "..BBB.....BBB..",
      "..B.B.WWW.B.B..",
      "..BBB.WWW.BBB..",
      ".......WWW.....",
      "..G.......G....",
      ".......WWW.....",
      "..BBB.WWW.BBB..",
      "..B.B.WWW.B.B..",
      "..BBB.....BBB..",
      "...............",
      "..BB.BBB.BB....",
      ".......X......."
    ],
    // 第 10 关:Boss 之厅(开阔,适合 Boss 战)
    [
      "...............",
      "...............",
      "...S.......S...",
      "...B.......B...",
      "...............",
      "...............",
      "GGGGGGGXGGGGGGG",
      "...............",
      "...............",
      "...B.......B...",
      "...S.......S...",
      "...............",
      "..............."
    ],
    // 第 11 关:迷雾森林
    [
      "GGGGGGGGGGGGGGG",
      "G.B.B.B.B.B.B.G",
      "G.B.B.B.B.B.B.G",
      "GGG.........GGG",
      "...............",
      "..S...BBB...S..",
      ".......X.......",
      "..S...BBB...S..",
      "...............",
      "GGG.........GGG",
      "G.B.B.B.B.B.B.G",
      "G.B.B.B.B.B.B.G",
      "GGGGGGGGGGGGGGG"
    ],
    // 第 12 关:螺旋
    [
      "...............",
      ".BBBBBBBBBBBBB.",
      ".B...........B.",
      ".B.SSSSSSSSS.B.",
      ".B.S.......S.B.",
      ".B.S..GGG..S.B.",
      ".B.S..GXG..S.B.",
      ".B.S..GGG..S.B.",
      ".B.S.......S.B.",
      ".B.SSSSSSSSS.B.",
      ".B...........B.",
      ".BBBBBBBBBBBBB.",
      "..............."
    ],
    // 第 13 关:双河
    [
      "...............",
      "..B.B.WWW.B.B..",
      "..B.B.WWW.B.B..",
      "...............",
      "WWWW.......WWWW",
      "...G..B..G.....",
      "...............",
      "...G..B..G.....",
      "WWWW.......WWWW",
      "...............",
      "..B.B.WWW.B.B..",
      "..B.B.WWW.B.B..",
      ".......X......."
    ],
    // 第 14 关:炮台阵
    [
      ".S.B.S.B.S.B.S.",
      ".B.S.B.S.B.S.B.",
      "...............",
      "BB.BB.B.B.BB.BB",
      "...............",
      "..G...SSS...G..",
      ".......X.......",
      "..G...SSS...G..",
      "...............",
      "BB.BB.B.B.BB.BB",
      "...............",
      ".B.S.B.S.B.S.B.",
      ".S.B.S.B.S.B.S."
    ],
    // 第 15 关:终极迷宫(Boss)
    [
      "SBSBSBSBSBSBSBS",
      "B.B.B.B.B.B.B.B",
      "S.B.S.B.S.B.S.B",
      "...............",
      "B.BB.B.B.B.BB.B",
      "..G...SSS...G..",
      "GGGGGGGXGGGGGGG",
      "..G...SSS...G..",
      "B.BB.B.B.B.BB.B",
      "...............",
      "S.B.S.B.S.B.S.B",
      "B.B.B.B.B.B.B.B",
      "SBSBSBSBSBSBSBS"
    ]
  ];

  // ============================================================
  // Engine · 工具(与 plantguard-deluxe 一致)
  // ============================================================
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function withAlpha(hex, a) {
    if (hex && hex.charAt(0) === '#' && hex.length === 7) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    return hex;
  }

  // ============================================================
  // Engine · 粒子(与 plantguard-deluxe 一致)
  // ============================================================
  function makeParticles() {
    var list = [];
    function spawn(x, y, opt) {
      opt = opt || {};
      var n = opt.n || 8;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = rand(opt.spMin || 40, opt.spMax || 160);
        list.push({
          x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 0),
          life: opt.life || 0.6, max: opt.life || 0.6,
          size: rand(opt.sizeMin || 2, opt.sizeMax || 5),
          color: opt.color || '#ffb627',
          gravity: opt.gravity != null ? opt.gravity : 0,
          glow: opt.glow !== false
        });
      }
    }
    function update(dt) {
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt;
        if (p.life <= 0) list.splice(i, 1);
      }
    }
    function draw(ctx) {
      ctx.save();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var alpha = clamp(p.life / p.max, 0, 1);
        if (p.glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = withAlpha(p.color, alpha * 0.5);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = withAlpha(p.color, alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function clear() { list.length = 0; }
    return { spawn: spawn, update: update, draw: draw, clear: clear };
  }

  // ============================================================
  // Engine · 音效(WebAudio 合成,与 plantguard-deluxe 一致)
  // ============================================================
  function makeAudio() {
    var actx = null, enabled = true;
    function ensure() {
      if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { enabled = false; } }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(opt) {
      if (!enabled) return;
      var ac = ensure(); if (!ac) return;
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.freq, ac.currentTime);
      if (opt.sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.sweep), ac.currentTime + opt.dur);
      gain.gain.setValueAtTime(opt.vol || 0.12, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + opt.dur);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(); osc.stop(ac.currentTime + opt.dur);
    }
    return {
      shoot: function () { tone({ freq: 720, sweep: 360, dur: 0.07, type: 'square', vol: 0.07 }); },
      hit: function () { tone({ freq: 200, sweep: 100, dur: 0.06, type: 'triangle', vol: 0.08 }); },
      explode: function () { tone({ freq: 140, sweep: 40, dur: 0.35, type: 'sawtooth', vol: 0.16 }); },
      pickup: function () { tone({ freq: 880, sweep: 1320, dur: 0.15, type: 'sine', vol: 0.12 }); },
      levelup: function () {
        tone({ freq: 523, dur: 0.12, type: 'sine', vol: 0.12 });
        setTimeout(function () { tone({ freq: 784, dur: 0.18, type: 'sine', vol: 0.12 }); }, 110);
      },
      win: function () {
        tone({ freq: 523, dur: 0.15, type: 'sine', vol: 0.15 });
        setTimeout(function () { tone({ freq: 659, dur: 0.15, type: 'sine', vol: 0.15 }); }, 120);
        setTimeout(function () { tone({ freq: 784, dur: 0.25, type: 'sine', vol: 0.15 }); }, 240);
      },
      lose: function () { tone({ freq: 300, sweep: 100, dur: 0.4, type: 'sawtooth', vol: 0.15 }); }
    };
  }

  // ============================================================
  // Engine · 输入(键盘持续移动 + 射击 + 暂停)
  // ============================================================
  function makeInput(canvas) {
    var keys = {};
    function onDown(e) {
      var k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'p'].indexOf(k) >= 0) {
        e.preventDefault();
        keys[k] = true;
      }
    }
    function onUp(e) {
      var k = e.key.toLowerCase();
      keys[k] = false;
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return {
      keys: keys,
      isDown: function (k) { return !!keys[k]; },
      destroy: function () {
        window.removeEventListener('keydown', onDown);
        window.removeEventListener('keyup', onUp);
      }
    };
  }

  // ============================================================
  // Engine · 精细自绘:坦克
  //   dir: 0上 1右 2下 3左
  //   tier: 玩家星级(1-3),敌方传 null
  //   t: 全局时间(驱动履带滚动)
  //   hurt: 受击闪白
  //   shield: 护盾环
  // ============================================================
  function drawTank(ctx, x, y, size, dir, t, color, colorD, opt) {
    opt = opt || {};
    var moving = opt.moving, hurt = opt.hurt, shield = opt.shield, tier = opt.tier || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir * Math.PI / 2);

    var w = size, h = size;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, h * 0.42, w * 0.42, w * 0.12, 0, 0, Math.PI * 2); ctx.fill();

    // 履带(左右两条,带滚动条纹)
    var trackPhase = moving ? Math.floor(t * 12) % 4 : 0;
    ctx.fillStyle = colorD;
    ctx.fillRect(-w / 2, -h / 2, w * 0.18, h);     // 左履带
    ctx.fillRect(w * 0.32, -h / 2, w * 0.18, h);   // 右履带
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (var i = 0; i < 5; i++) {
      var ty = -h / 2 + i * h / 5 + (trackPhase * h / 20);
      ctx.fillRect(-w / 2, ty, w * 0.18, h * 0.06);
      ctx.fillRect(w * 0.32, ty, w * 0.18, h * 0.06);
    }

    // 车身(渐变 + 圆角)
    var bodyGrd = ctx.createLinearGradient(-w * 0.32, 0, w * 0.32, 0);
    bodyGrd.addColorStop(0, colorD); bodyGrd.addColorStop(0.5, color); bodyGrd.addColorStop(1, colorD);
    ctx.fillStyle = bodyGrd;
    roundRectPath(ctx, -w * 0.32, -h * 0.40, w * 0.64, h * 0.80, size * 0.08); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
    roundRectPath(ctx, -w * 0.32, -h * 0.40, w * 0.64, h * 0.80, size * 0.08); ctx.stroke();

    // 炮塔(中心圆,带渐变)
    var turretGrd = ctx.createRadialGradient(-w * 0.04, -w * 0.04, 0, 0, 0, w * 0.20);
    turretGrd.addColorStop(0, color); turretGrd.addColorStop(1, colorD);
    ctx.fillStyle = turretGrd;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();

    // 炮管(根据星级 1-3 根)
    var barrels = tier >= 3 ? 3 : (tier >= 2 ? 2 : 1);
    ctx.fillStyle = colorD;
    for (var b = 0; b < barrels; b++) {
      var offset = barrels === 1 ? 0 : (b - (barrels - 1) / 2) * w * 0.10;
      ctx.fillRect(offset - w * 0.025, -h / 2 - w * 0.12, w * 0.05, w * 0.32);
    }

    // 星级标记(玩家)
    if (opt.isPlayer) {
      ctx.fillStyle = COLOR.warn;
      ctx.font = 'bold ' + (size * 0.22) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 画对应星数
      var starStr = '';
      for (var s = 0; s < tier; s++) starStr += '★';
      // 反旋转,让星正立
      ctx.save(); ctx.rotate(-dir * Math.PI / 2);
      ctx.fillText(starStr, 0, size * 0.02);
      ctx.restore();
    }

    // 受击闪白
    if (hurt) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRectPath(ctx, -w * 0.40, -h * 0.46, w * 0.80, h * 0.92, size * 0.1); ctx.fill();
    }

    ctx.restore();

    // 护盾环(不随坦克旋转)
    if (shield) {
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';
      var sg = ctx.createRadialGradient(0, 0, size * 0.35, 0, 0, size * 0.62);
      sg.addColorStop(0, 'rgba(0,224,255,0)'); sg.addColorStop(0.7, 'rgba(0,224,255,0.4)'); sg.addColorStop(1, 'rgba(0,224,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, size * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(COLOR.neon, 0.7 + Math.sin(t * 6) * 0.2); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, size * 0.55 + Math.sin(t * 4) * size * 0.02, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // ============================================================
  // Engine · 精细自绘:子弹(发光 + 拖尾)
  // ============================================================
  function drawBullet(ctx, b, t) {
    var col = b.color || COLOR.warn;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 10);
    glow.addColorStop(0, withAlpha(col, 0.6)); glow.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 拖尾
    var tx = b.x - b.vx * 0.015, ty = b.y - b.vy * 0.015;
    ctx.strokeStyle = withAlpha(col, 0.5); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    // 弹头
    var grd = ctx.createRadialGradient(b.x - 1, b.y - 1, 0, b.x, b.y, 4);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, col);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.pierce ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // ============================================================
  // Engine · 精细自绘:道具(发光图标 + 旋转光环)
  // ============================================================
  function drawPowerup(ctx, p, t) {
    var pulse = 1 + Math.sin(t * 3) * 0.1;
    ctx.save();
    ctx.translate(p.x, p.y);
    // 光环
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22 * pulse);
    glow.addColorStop(0, withAlpha(p.def.color, 0.5)); glow.addColorStop(1, withAlpha(p.def.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 旋转方框
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(t * 0.8);
    ctx.strokeStyle = p.def.color; ctx.lineWidth = 2;
    roundRectPath(ctx, -12, -12, 24, 24, 5); ctx.stroke();
    ctx.restore();
    // 图标(不旋转)
    ctx.fillStyle = p.def.color;
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.def.icon, p.x, p.y);
  }

  // ============================================================
  // Game · init
  // ============================================================
  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CELL = Math.floor(Math.min((W - 40) / COLS, (H - HUD_TOP - 20) / ROWS));
    var FIELD_W = CELL * COLS, FIELD_H = CELL * ROWS;
    var offX = Math.floor((W - FIELD_W) / 2);
    var offY = HUD_TOP + Math.floor((H - HUD_TOP - FIELD_H) / 2);

    var state = {
      level: 1, score: 0, lives: 3,
      running: false, paused: false, over: false, won: false,
      diff: 'normal', time: 0, shake: 0,
      map: null, baseAlive: true,
      player: null, enemies: [], bullets: [], powerups: [], effects: [],
      particles: makeParticles(),
      enemiesLeft: 0, spawnCool: 0, maxOnField: 3,
      toasts: [], levelBanner: 0, levelBannerText: '',
      freezeTimer: 0, speedBoostTimer: 0, bossActive: false, boss: null,
      // 玩家成长状态(跨关继承,过关不清零;只有 start/reset 时重置)
      carryTier: 0, carryMaxHp: PLAYER_TIERS[0].hp, carryShield: 0, carryPierce: 0
    };

    var audio = makeAudio();
    var input = makeInput(canvas);

    function emitScore() { hooks.onScore && hooks.onScore(state.score, state.level); }
    function emitState(s) { hooks.onState && hooks.onState(s); }
    function toast(text, kind) { state.toasts.push({ text: text, kind: kind || 'info', life: 2.2, max: 2.2 }); }

    // ---- 地图加载 ----
    function loadMap(idx) {
      var tpl = MAP_TEMPLATES[(idx - 1) % MAP_TEMPLATES.length];
      var grid = [];
      var baseR = ROWS - 1, baseC = Math.floor(COLS / 2);
      for (var r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < COLS; c++) {
          var ch = tpl[r][c];
          grid[r][c] = ch === 'B' ? T.BRICK : ch === 'S' ? T.STEEL : ch === 'G' ? T.GRASS :
                       ch === 'W' ? T.WATER : ch === 'X' ? T.BASE : T.EMPTY;
          if (ch === 'X') { baseR = r; baseC = c; }
        }
      }
      // 基地保护壳:给基地上/左/右三面加砖墙(经典老家防御,可被打掉但争取反应时间)
      function safeSet(r, c, v) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] !== T.BASE) grid[r][c] = v;
      }
      safeSet(baseR - 1, baseC, T.BRICK);      // 正上方
      safeSet(baseR, baseC - 1, T.BRICK);      // 左侧
      safeSet(baseR, baseC + 1, T.BRICK);      // 右侧
      safeSet(baseR - 1, baseC - 1, T.BRICK);  // 左上
      safeSet(baseR - 1, baseC + 1, T.BRICK);  // 右上
      // 清空玩家出生位(基地左上一格)及上方撤退通道,避免坦克卡墙里
      var pCol = baseC - 1, pRow = baseR - 1;
      var clears = [[0, 0], [-1, 0], [-2, 0]];   // 玩家自身 + 上方两格
      for (var ci = 0; ci < clears.length; ci++) {
        var rr = pRow + clears[ci][0], cc = pCol + clears[ci][1];
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr][cc] !== T.BASE) grid[rr][cc] = T.EMPTY;
      }
      state.map = grid;
      state.baseAlive = true;
    }
    function cellAt(px, py) {
      var c = Math.floor((px - offX) / CELL), r = Math.floor((py - offY) / CELL);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
      return state.map[r][c];
    }
    function setCell(c, r, v) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) state.map[r][c] = v; }
    function isBlockingTerrain(t, forTank) {
      // 坦克:砖/钢/水/基地 都挡;子弹:只砖/钢/基地 挡(草和水可穿过)
      if (forTank) return t === T.BRICK || t === T.STEEL || t === T.WATER || t === T.BASE;
      return t === T.BRICK || t === T.STEEL || t === T.BASE;
    }

    // ---- 坦克工厂 ----
    // keepTier=true 时继承跨关成长(等级/血量上限),用于过关进入下一关;
    // keepTier=false 时重置为初始 1 星,用于开新局/reset/复活。
    function makePlayer(keepTier) {
      var tier = keepTier ? state.carryTier : 0;
      var maxHp = keepTier ? state.carryMaxHp : PLAYER_TIERS[0].hp;
      var baseC = Math.floor(COLS / 2), baseR = ROWS - 1;
      // 出生在基地左上(紧邻老家,已由 loadMap 清空该区域)
      var pc = baseC - 1, pr = baseR - 1;
      return {
        x: offX + pc * CELL + CELL / 2, y: offY + pr * CELL + CELL / 2,
        dir: 0, cool: 0, hurt: 0, shieldTimer: 0, tierIdx: tier, isPlayer: true,
        moving: false, size: CELL * 0.86, spawnProtect: 1.5,
        hp: maxHp, maxHp: maxHp,
        pierceTimer: keepTier ? (state.carryPierce || 0) : 0,
        shieldTimer: keepTier ? (state.carryShield || 0) : 0
      };
    }
    function getTier() { return PLAYER_TIERS[state.player.tierIdx]; }
    // 把当前玩家成长状态保存到 state(供下一关继承)
    function saveCarry() {
      if (!state.player) return;
      state.carryTier = state.player.tierIdx;
      state.carryMaxHp = state.player.maxHp;
      state.carryShield = Math.max(0, state.player.shieldTimer);
      state.carryPierce = Math.max(0, state.player.pierceTimer);
    }
    function makeEnemy(type, spawnIdx) {
      var def = ENEMIES[type];
      // 三个出生点:顶部左/中/右
      var sx = [1, Math.floor(COLS / 2), COLS - 2][spawnIdx % 3];
      return {
        type: type, def: def,
        x: offX + sx * CELL + CELL / 2, y: offY + CELL / 2,
        dir: 2, cool: rand(0.5, def.fireRate), hp: def.hp, hurt: 0,
        moving: true, size: CELL * 0.86, aiTimer: 0, isPlayer: false, spawnProtect: 0.8
      };
    }

    // ---- 移动 + 碰撞 ----
    function tryMove(tank, nx, ny) {
      var half = tank.size / 2;
      // 边界
      if (nx - half < offX || nx + half > offX + FIELD_W) return false;
      if (ny - half < offY || ny + half > offY + FIELD_H) return false;
      // 地形(检查坦克四角)
      var corners = [[nx - half, ny - half], [nx + half, ny - half], [nx - half, ny + half], [nx + half, ny + half]];
      for (var i = 0; i < 4; i++) {
        if (isBlockingTerrain(cellAt(corners[i][0], corners[i][1]), true)) return false;
      }
      // 坦克间碰撞(避免重叠)
      var all = [state.player].concat(state.enemies);
      for (var j = 0; j < all.length; j++) {
        var o = all[j];
        if (o === tank || !o) continue;
        if (Math.abs(nx - o.x) < tank.size * 0.9 && Math.abs(ny - o.y) < tank.size * 0.9) return false;
      }
      return true;
    }
    function moveTank(tank, dir, speed, dt) {
      var nx = tank.x, ny = tank.y;
      var sp = speed * dt * 60;
      if (dir === 0) ny -= sp;
      else if (dir === 1) nx += sp;
      else if (dir === 2) ny += sp;
      else if (dir === 3) nx -= sp;
      // 网格吸附:移动时把垂直轴吸附到网格中线,便于过通道
      if (dir === 0 || dir === 2) {
        var line = offX + Math.round((tank.x - offX) / CELL) * CELL + CELL / 2;
        if (Math.abs(nx - line) < sp * 1.5) nx = line;
      } else {
        var lineY = offY + Math.round((tank.y - offY) / CELL) * CELL + CELL / 2;
        if (Math.abs(ny - lineY) < sp * 1.5) ny = lineY;
      }
      if (tryMove(tank, nx, ny)) { tank.x = nx; tank.y = ny; tank.dir = dir; tank.moving = true; return true; }
      tank.moving = false;
      return false;
    }

    // ---- 射击 ----
    function fire(tank, tier) {
      if (tank.cool > 0) return;
      var rate = tier ? tier.fireRate : (tank.def ? tank.def.fireRate : 0.5);
      tank.cool = rate;
      var bcount = tier ? tier.bullets : 1;
      var pierce = tier ? tier.pierce : false;
      // 穿甲弹道具激活时,玩家子弹临时穿透
      if (tank.isPlayer && state.player.pierceTimer > 0) pierce = true;
      var col = tank.isPlayer ? COLOR.warn : COLOR.danger;
      var speed = 360;
      for (var i = 0; i < bcount; i++) {
        var offset = bcount === 1 ? 0 : (i - (bcount - 1) / 2) * 8;
        var bx = tank.x, by = tank.y;
        var vx = 0, vy = 0;
        if (tank.dir === 0) { vy = -speed; bx += offset; by -= tank.size / 2; }
        else if (tank.dir === 1) { vx = speed; by += offset; bx += tank.size / 2; }
        else if (tank.dir === 2) { vy = speed; bx += offset; by += tank.size / 2; }
        else if (tank.dir === 3) { vx = -speed; by += offset; bx -= tank.size / 2; }
        state.bullets.push({ x: bx, y: by, vx: vx, vy: vy, pierce: pierce, en: !tank.isPlayer, color: col, life: 2, hits: 0 });
      }
      // 枪口焰
      var mx = tank.x + [0, tank.size / 2, 0, -tank.size / 2][tank.dir];
      var my = tank.y + [-tank.size / 2, 0, tank.size / 2, 0][tank.dir];
      state.particles.spawn(mx, my, { n: 5, color: col, life: 0.2, sizeMin: 1, sizeMax: 3 });
      audio.shoot();
    }

    // ---- 道具掉落 / 拾取 ----
    function maybeDropPowerup(x, y) {
      // 25% 概率掉落,随机 5 种
      if (Math.random() < 0.25) {
        var keys = Object.keys(POWERUPS);
        var k = keys[Math.floor(Math.random() * keys.length)];
        state.powerups.push({ x: x, y: y, def: POWERUPS[k], type: k, life: 12, phase: Math.random() * 6 });
      }
    }
    function applyPowerup(p) {
      audio.pickup();
      toast(p.def.name + ':' + p.def.desc, 'ok');
      state.particles.spawn(p.x, p.y, { n: 16, color: p.def.color, life: 0.6 });
      if (p.type === 'star') {
        if (state.player.tierIdx < PLAYER_TIERS.length - 1) {
          state.player.tierIdx++;
          // 升级同步血量上限并回满
          var nt = PLAYER_TIERS[state.player.tierIdx];
          state.player.maxHp = nt.hp;
          state.player.hp = nt.hp;
          saveCarry();   // 持久化到跨关成长
          audio.levelup();
          toast('升级到 ' + (state.player.tierIdx + 1) + ' 星!', 'ok');
        } else { state.score += 500; emitScore(); }
      } else if (p.type === 'shield') {
        state.player.shieldTimer = 8;
      } else if (p.type === 'life') {
        state.lives++;
      } else if (p.type === 'speed') {
        state.speedBoostTimer = 10;
      } else if (p.type === 'bomb') {
        // 清空全屏敌人
        for (var i = 0; i < state.enemies.length; i++) {
          var e = state.enemies[i];
          state.particles.spawn(e.x, e.y, { n: 20, color: COLOR.neon2, life: 0.7, sizeMin: 2, sizeMax: 6 });
          state.score += e.def.score;
        }
        state.enemies.length = 0;
        state.shake = 0.8;
        audio.explode();
      } else if (p.type === 'freeze') {
        // 停敌:冻结所有敌人 5 秒
        state.freezeTimer = 5;
        for (var fi = 0; fi < state.enemies.length; fi++) {
          state.particles.spawn(state.enemies[fi].x, state.enemies[fi].y, { n: 8, color: COLOR.ice2, life: 0.5 });
        }
      } else if (p.type === 'pierce') {
        // 穿甲弹:玩家临时穿透(持续 8 秒)
        state.player.pierceTimer = 8;
      } else if (p.type === 'ironwall') {
        // 基地铁墙:基地周围的砖墙变钢墙
        var baseC2 = Math.floor(COLS / 2), baseR2 = ROWS - 1;
        var walls2 = [[baseR2-1, baseC2], [baseR2, baseC2-1], [baseR2, baseC2+1], [baseR2-1, baseC2-1], [baseR2-1, baseC2+1]];
        for (var wi = 0; wi < walls2.length; wi++) {
          var wr = walls2[wi][0], wc = walls2[wi][1];
          if (state.map[wr] && state.map[wr][wc] === T.BRICK) state.map[wr][wc] = T.STEEL;
        }
        toast('基地防御升级为钢铁!', 'ok');
      }
    }

    // ---- 出生点 ----
    function spawnEnemy() {
      if (state.enemies.length >= state.maxOnField) return;
      if (state.enemiesLeft <= 0) return;
      var type;
      var lv = state.level;
      // 关卡解锁敌人类型(递进)
      var pool = ['light'];
      if (lv >= 2) pool.push('heavy');
      if (lv >= 3) pool.push('fast');
      if (lv >= 6) pool.push('armor');
      if (lv >= 8) pool.push('sniper');
      type = pool[Math.floor(Math.random() * pool.length)];
      var spawnIdx = state.enemiesLeft % 3;
      var e = makeEnemy(type, spawnIdx);
      for (var i = 0; i < state.enemies.length; i++) {
        if (Math.abs(e.x - state.enemies[i].x) < CELL && Math.abs(e.y - state.enemies[i].y) < CELL) return;
      }
      state.enemies.push(e);
      state.enemiesLeft--;
    }
    // Boss 生成(第 5/10/15/20 关,血量随次数提升)
    function spawnBoss() {
      var scale = state.level === 5 ? 1 : (state.level === 10 ? 1.5 : (state.level === 15 ? 2 : 2.6));
      var hp = Math.round(BOSS.hp * scale);
      var sx = Math.floor(COLS / 2);
      state.boss = {
        type: 'boss', def: BOSS,
        x: offX + sx * CELL + CELL / 2, y: offY + CELL / 2,
        dir: 2, cool: 1, hp: hp, maxHp: hp, hurt: 0,
        moving: true, size: CELL * 1.5, aiTimer: 0, isPlayer: false, spawnProtect: 1.2,
        isBoss: true, summonTimer: 8, stage: 1
      };
      state.enemies.push(state.boss);
      state.bossActive = true;
      state.shake = 0.9;
      toast('⚠ Boss · ' + BOSS.name + ' 出现!', 'warn');
      audio.explode();
    }

    // ---- 敌方 AI ----
    function updateEnemyAI(e, dt) {
      if (state.freezeTimer > 0) { e.moving = false; return; }   // 停敌道具
      e.aiTimer -= dt;
      var def = e.def;
      var changed = false;
      // AI 差异化
      if (def.ai === 'chase' && state.player) {
        // 追击型:朝玩家方向
        if (e.aiTimer <= 0) {
          e.aiTimer = rand(0.6, 1.4);
          var dx = state.player.x - e.x, dy = state.player.y - e.y;
          if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 1 : 3;
          else e.dir = dy > 0 ? 2 : 0;
          changed = true;
        }
      } else if (def.ai === 'sniper') {
        // 狙击型:朝玩家方向瞄准(远程精准射击),保持距离少移动
        if (e.aiTimer <= 0) {
          e.aiTimer = rand(1.0, 2.0);
          if (state.player) {
            var sdx = state.player.x - e.x, sdy = state.player.y - e.y;
            if (Math.abs(sdx) > Math.abs(sdy)) e.dir = sdx > 0 ? 1 : 3;
            else e.dir = sdy > 0 ? 2 : 0;
          }
          changed = true;
        }
      } else if (def.ai === 'charge') {
        // 冲锋型:直冲底部基地(优先向下)
        if (e.aiTimer <= 0 || !moveTank(e, e.dir, def.speed, dt)) {
          e.aiTimer = rand(0.4, 1.0);
          // 优先向下,其次朝基地方向
          var cdx = offX + Math.floor(COLS / 2) * CELL - e.x;
          if (moveTank(e, 2, def.speed, dt)) e.dir = 2;
          else if (cdx > 0 && moveTank(e, 1, def.speed, dt)) e.dir = 1;
          else if (cdx < 0 && moveTank(e, 3, def.speed, dt)) e.dir = 3;
          else e.dir = 2;
          changed = true;
        }
      } else if (e.isBoss) {
        // Boss:缓慢追击玩家 + 周期召唤小怪 + 多向射击
        if (e.aiTimer <= 0) {
          e.aiTimer = rand(0.8, 1.6);
          if (state.player) {
            var bdx = state.player.x - e.x, bdy = state.player.y - e.y;
            if (Math.abs(bdx) > Math.abs(bdy)) e.dir = bdx > 0 ? 1 : 3;
            else e.dir = bdy > 0 ? 2 : 0;
          }
          changed = true;
        }
        // 召唤小怪(每 8 秒,2 个普通敌人)
        e.summonTimer -= dt;
        if (e.summonTimer <= 0 && state.enemies.length < state.maxOnField + 3) {
          e.summonTimer = 8;
          for (var si = 0; si < 2; si++) {
            var nr = clamp(e.row != null ? e.row : Math.floor((e.y - offY) / CELL) + (si === 0 ? -1 : 1), 1, ROWS - 3);
            state.enemies.push(makeEnemy('light', si));
            toast('Boss 召唤了援军!');
          }
        }
      } else {
        // 巡逻:撞墙或随机变向
        if (e.aiTimer <= 0 || !moveTank(e, e.dir, def.speed, dt)) {
          e.aiTimer = rand(0.8, 2.0);
          var dirs = [0, 1, 2, 3].sort(function () { return Math.random() - 0.5; });
          for (var i = 0; i < 4; i++) {
            if (moveTank(e, dirs[i], def.speed, dt)) { break; }
          }
          changed = true;
        }
      }
      if (!changed) moveTank(e, e.dir, def.speed, dt);
      // 射击(Boss 多向散射)
      e.cool -= dt;
      if (e.cool <= 0) {
        if (e.isBoss) {
          // Boss 同时朝当前方向 + 两侧射击
          fire(e, null);
          var oldDir = e.dir;
          e.dir = (oldDir + 1) % 4; fire(e, null);
          e.dir = (oldDir + 3) % 4; fire(e, null);
          e.dir = oldDir;
          e.cool = def.fireRate * 1.5;
        } else {
          fire(e, null);
          e.cool = def.fireRate * rand(0.7, 1.3);
        }
      }
    }

    // ---- 玩家更新 ----
    function updatePlayer(dt) {
      var p = state.player;
      if (!p) return;
      if (p.cool > 0) p.cool -= dt;
      if (p.hurt > 0) p.hurt -= dt;
      if (p.shieldTimer > 0) p.shieldTimer -= dt;
      if (p.spawnProtect > 0) p.spawnProtect -= dt;
      if (p.pierceTimer > 0) p.pierceTimer -= dt;
      var tier = getTier();
      var speed = tier.speed * (state.speedBoostTimer > 0 ? 1.5 : 1);
      p.moving = false;
      // 方向输入
      var dir = -1;
      if (input.isDown('arrowup') || input.isDown('w')) dir = 0;
      else if (input.isDown('arrowright') || input.isDown('d')) dir = 1;
      else if (input.isDown('arrowdown') || input.isDown('s')) dir = 2;
      else if (input.isDown('arrowleft') || input.isDown('a')) dir = 3;
      if (dir >= 0) {
        // 优先换向(若方向不同先转方向)
        if (p.dir !== dir) {
          // 尝试吸附+移动
          p.dir = dir;
        }
        moveTank(p, dir, speed, dt);
      }
      // 射击
      if (input.isDown(' ')) fire(p, tier);
    }

    // ---- 子弹更新 + 碰撞 ----
    function updateBullets(dt) {
      for (var i = state.bullets.length - 1; i >= 0; i--) {
        var b = state.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < offX || b.x > offX + FIELD_W || b.y < offY || b.y > offY + FIELD_H) {
          state.bullets.splice(i, 1); continue;
        }
        // 地形碰撞
        var cc = Math.floor((b.x - offX) / CELL), cr = Math.floor((b.y - offY) / CELL);
        if (cc < 0 || cc >= COLS || cr < 0 || cr >= ROWS) continue;
        var tt = state.map[cr][cc];
        if (tt === T.BRICK) {
          setCell(cc, cr, T.EMPTY);
          state.particles.spawn(b.x, b.y, { n: 6, color: COLOR.brick, life: 0.3, sizeMin: 1, sizeMax: 3 });
          if (!b.pierce) { state.bullets.splice(i, 1); audio.hit(); continue; }
          b.hits++;
        } else if (tt === T.STEEL) {
          state.particles.spawn(b.x, b.y, { n: 4, color: COLOR.steel, life: 0.25, sizeMin: 1, sizeMax: 2 });
          if (b.pierce) { setCell(cc, cr, T.EMPTY); }   // 穿甲弹可破钢墙
          else { state.bullets.splice(i, 1); audio.hit(); continue; }
        } else if (tt === T.BASE) {
          // 基地被击中
          if (!b.en) { continue; }   // 玩家弹不伤基地
          state.baseAlive = false; setCell(cc, cr, T.EMPTY);
          state.particles.spawn(offX + cc * CELL + CELL / 2, offY + cr * CELL + CELL / 2, { n: 30, color: COLOR.danger, life: 0.8, sizeMin: 3, sizeMax: 7 });
          state.shake = 1; audio.explode();
          state.bullets.splice(i, 1);
          gameOver(false);
          continue;
        }
        // 穿甲弹最多穿 3 个
        if (b.pierce && b.hits >= 3) { state.bullets.splice(i, 1); continue; }
        // 坦克碰撞
        var hit = false;
        if (b.en) {
          // 敌弹打玩家
          var pl = state.player;
          if (pl && pl.spawnProtect <= 0 && Math.abs(b.x - pl.x) < pl.size / 2 && Math.abs(b.y - pl.y) < pl.size / 2) {
            if (pl.shieldTimer > 0) {
              state.particles.spawn(b.x, b.y, { n: 8, color: COLOR.neon, life: 0.3 });
            } else {
              pl.hp = (pl.hp || 0) - 1;
              pl.hurt = 0.3;
              if (pl.hp <= 0) { playerDie(); }
              else { state.particles.spawn(b.x, b.y, { n: 8, color: COLOR.danger, life: 0.3 }); }
            }
            hit = true;
          }
        } else {
          // 玩家弹打敌人
          for (var j = 0; j < state.enemies.length; j++) {
            var e = state.enemies[j];
            if (e.spawnProtect > 0) continue;
            if (Math.abs(b.x - e.x) < e.size / 2 && Math.abs(b.y - e.y) < e.size / 2) {
              // 装甲坦克正面(朝玩家方向)减伤 50%
              var dmg = 1;
              if (e.def.frontArmor) {
                // 子弹从坦克正面来(即 e.dir 的反方向)→ 减伤
                var fromFront = (e.dir === 0 && b.vy > 0) || (e.dir === 2 && b.vy < 0) || (e.dir === 1 && b.vx < 0) || (e.dir === 3 && b.vx > 0);
                if (fromFront) dmg = 0.5;
              }
              e.hp -= dmg; e.hurt = 0.2;
              state.particles.spawn(b.x, b.y, { n: 6, color: e.def.color, life: 0.3 });
              if (e.hp <= 0) {
                state.score += e.def.score; emitScore();
                state.particles.spawn(e.x, e.y, { n: 22, color: e.def.color, life: 0.7, sizeMin: 2, sizeMax: 6 });
                state.particles.spawn(e.x, e.y, { n: 10, color: COLOR.warn, life: 0.5, glow: true });
                maybeDropPowerup(e.x, e.y);
                if (e.isBoss) {
                  // Boss 死亡:大爆炸 + 清场
                  state.bossActive = false; state.boss = null;
                  state.shake = 1.2;
                  state.particles.spawn(e.x, e.y, { n: 40, color: COLOR.neon2, life: 1.0, sizeMin: 3, sizeMax: 8 });
                  toast('击败 Boss!+' + e.def.score, 'ok');
                  // Boss 死后清空残余敌人
                  state.enemies.length = 0;
                  state.enemiesLeft = 0;
                }
                state.enemies.splice(j, 1);
                audio.explode();
              } else { audio.hit(); }
              hit = true;
              if (!b.pierce) break;
            }
          }
        }
        if (hit && !b.pierce) { state.bullets.splice(i, 1); continue; }
      }
    }

    function playerDie() {
      state.lives--;
      state.particles.spawn(state.player.x, state.player.y, { n: 26, color: COLOR.p1, life: 0.8, sizeMin: 3, sizeMax: 7 });
      audio.explode();
      state.shake = 0.8;
      if (state.lives <= 0) { gameOver(false); return; }
      // 复活:保留当前等级(被打死不降级),血量回满
      saveCarry();
      state.player = makePlayer(true);
      toast('剩余 ' + state.lives + ' 命', 'warn');
    }

    function gameOver(won) {
      state.over = true; state.running = false; state.won = won;
      emitState('over');
      hooks.onGameOver && hooks.onGameOver(state.score, state.level);
      if (won) audio.win(); else audio.lose();
    }

    function nextLevel() {
      state.level++;
      if (state.level > LEVELS) { gameOver(true); return; }
      startLevel();
      toast('第 ' + state.level + ' 关!', 'ok');
    }
    function startLevel() {
      loadMap(state.level);
      // 过关进入下一关:继承玩家等级与血量上限(buff 清零,重新吃道具)
      var isContinue = state.player != null;
      if (isContinue) saveCarry();
      state.player = makePlayer(isContinue);
      state.enemies = []; state.bullets = []; state.powerups = []; state.effects = [];
      state.particles.clear();
      state.bossActive = false; state.boss = null;
      var isBossLevel = (state.level === 5 || state.level === 10 || state.level === 15 || state.level === 20);
      state.enemiesLeft = isBossLevel ? 6 + state.level : 4 + state.level * 2;
      state.spawnCool = 1.5;
      state.maxOnField = state.diff === 'easy' ? 3 : (state.diff === 'hard' ? 5 : 4);
      state.levelBanner = 1.8;
      state.levelBannerText = '第 ' + state.level + ' 关' + (isBossLevel ? ' · ⚠ Boss 战!' : ' · ' + state.enemiesLeft + ' 辆敌坦');
      emitScore();
      // Boss 关:延迟生成 Boss(让玩家先就位)
      if (isBossLevel) {
        setTimeout(function () { if (state.running && !state.over) spawnBoss(); }, 2500);
      }
    }

    // ============================================================
    // update
    // ============================================================
    function update(dt) {
      state.time += dt;
      if (state.shake > 0) state.shake -= dt * 5;
      if (state.levelBanner > 0) state.levelBanner -= dt;
      if (state.freezeTimer > 0) state.freezeTimer -= dt;
      if (state.speedBoostTimer > 0) state.speedBoostTimer -= dt;
      for (var i = state.toasts.length - 1; i >= 0; i--) {
        state.toasts[i].life -= dt;
        if (state.toasts[i].life <= 0) state.toasts.splice(i, 1);
      }
      // 道具倒计时
      for (var i = state.powerups.length - 1; i >= 0; i--) {
        var p = state.powerups[i];
        p.life -= dt;
        if (p.life <= 0) { state.powerups.splice(i, 1); continue; }
        // 拾取检测
        if (state.player && dist2(p.x, p.y, state.player.x, state.player.y) < CELL * 0.8 * CELL * 0.8) {
          applyPowerup(p);
          state.powerups.splice(i, 1);
        }
      }

      updatePlayer(dt);
      // 敌人
      for (var i = state.enemies.length - 1; i >= 0; i--) {
        var e = state.enemies[i];
        if (e.hurt > 0) e.hurt -= dt;
        if (e.spawnProtect > 0) e.spawnProtect -= dt;
        updateEnemyAI(e, dt);
        // 敌人到家 = 失败(撞基地)
        if (cellAt(e.x, e.y) === T.BASE) { state.baseAlive = false; gameOver(false); return; }
      }
      updateBullets(dt);
      // 刷怪
      state.spawnCool -= dt;
      if (state.spawnCool <= 0 && state.enemiesLeft > 0) { spawnEnemy(); state.spawnCool = rand(2, 3.5); }
      // 过关
      if (state.enemiesLeft <= 0 && state.enemies.length === 0 && state.baseAlive) {
        state.score += 300; emitScore();
        nextLevel();
        return;
      }
      state.particles.update(dt);
    }

    // ============================================================
    // 渲染
    // ============================================================
    function draw() {
      ctx.save();
      if (state.shake > 0) ctx.translate(rand(-state.shake * 8, state.shake * 8), rand(-state.shake * 8, state.shake * 8));
      drawBackground();
      drawTerrain();
      drawPowerups();
      drawTanks();
      drawBullets();
      drawGrassOverlay();   // 草丛在坦克之上
      state.particles.draw(ctx);
      drawHUD();
      if (state.bossActive && state.boss) drawBossHUD();
      if (state.levelBanner > 0) drawLevelBanner();
      drawToasts();
      ctx.restore();
    }

    function drawBackground() {
      ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, W, H);
      // 战场区底
      ctx.fillStyle = COLOR.field; ctx.fillRect(offX, offY, FIELD_W, FIELD_H);
      // 网格细线
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
      for (var c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(offX + c * CELL, offY); ctx.lineTo(offX + c * CELL, offY + FIELD_H); ctx.stroke();
      }
      for (var r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(offX, offY + r * CELL); ctx.lineTo(offX + FIELD_W, offY + r * CELL); ctx.stroke();
      }
      // 边框
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, FIELD_W, FIELD_H);
    }

    function drawTerrain() {
      if (!state.map) return;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var t = state.map[r][c];
          var x = offX + c * CELL, y = offY + r * CELL;
          if (t === T.BRICK) drawBrick(x, y, CELL);
          else if (t === T.STEEL) drawSteel(x, y, CELL);
          else if (t === T.WATER) drawWater(x, y, CELL, state.time);
          else if (t === T.BASE) drawBase(x, y, CELL, state.time);
        }
      }
    }
    function drawBrick(x, y, s) {
      var grd = ctx.createLinearGradient(x, y, x, y + s);
      grd.addColorStop(0, COLOR.brick); grd.addColorStop(1, COLOR.brickDark);
      ctx.fillStyle = grd; ctx.fillRect(x, y, s, s);
      // 砖纹(横竖缝)
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2);
      ctx.moveTo(x + s / 3, y); ctx.lineTo(x + s / 3, y + s / 2);
      ctx.moveTo(x + s * 2 / 3, y + s / 2); ctx.lineTo(x + s * 2 / 3, y + s);
      ctx.stroke();
    }
    function drawSteel(x, y, s) {
      var grd = ctx.createLinearGradient(x, y, x + s, y + s);
      grd.addColorStop(0, COLOR.steel); grd.addColorStop(0.5, '#e0e8f0'); grd.addColorStop(1, COLOR.steelDark);
      ctx.fillStyle = grd; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = COLOR.steelDark; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      // 螺丝点
      ctx.fillStyle = COLOR.steelDark;
      ctx.beginPath(); ctx.arc(x + s * 0.2, y + s * 0.2, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + s * 0.8, y + s * 0.8, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    function drawWater(x, y, s, t) {
      var grd = ctx.createLinearGradient(x, y, x, y + s);
      grd.addColorStop(0, '#3a7ad8'); grd.addColorStop(1, COLOR.water);
      ctx.fillStyle = grd; ctx.fillRect(x, y, s, s);
      // 波纹
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath();
      var wave = Math.sin(t * 2 + x * 0.1) * 2;
      ctx.moveTo(x + 2, y + s / 2 + wave); ctx.lineTo(x + s - 2, y + s / 2 + wave);
      ctx.stroke();
    }
    function drawBase(x, y, s, t) {
      // 发光底
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(x + s / 2, y + s / 2, 0, x + s / 2, y + s / 2, s * 0.7);
      g.addColorStop(0, withAlpha(COLOR.base, 0.5 + Math.sin(t * 3) * 0.2)); g.addColorStop(1, withAlpha(COLOR.base, 0));
      ctx.fillStyle = g; ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
      ctx.restore();
      // 基地本体(鹰徽)
      ctx.fillStyle = state.baseAlive ? COLOR.base : COLOR.text3;
      roundRectPath(ctx, x + 3, y + 3, s - 6, s - 6, 4); ctx.fill();
      ctx.fillStyle = '#060912';
      ctx.font = 'bold ' + (s * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state.baseAlive ? '⚔' : '☠', x + s / 2, y + s / 2);
    }

    function drawTanks() {
      // 玩家
      var pl = state.player;
      if (pl) {
        var tier = getTier();
        // 出生保护闪烁
        if (pl.spawnProtect <= 0 || Math.floor(state.time * 10) % 2 === 0) {
          drawTank(ctx, pl.x, pl.y, pl.size, pl.dir, state.time, COLOR.p1, COLOR.p1d, {
            moving: pl.moving, hurt: pl.hurt > 0, shield: pl.shieldTimer > 0 || pl.spawnProtect > 0,
            tier: pl.tierIdx + 1, isPlayer: true
          });
        }
        // 血条
        if (pl.hp < tier.hp && pl.hp > 0) drawHpBar(pl.x, pl.y - pl.size * 0.6, pl.hp, tier.hp);
      }
      // 敌人
      for (var i = 0; i < state.enemies.length; i++) {
        var e = state.enemies[i];
        if (e.spawnProtect > 0 && Math.floor(state.time * 10) % 2 !== 0) continue;   // 出生闪烁
        drawTank(ctx, e.x, e.y, e.size, e.dir, state.time, e.def.color, e.def.colorD, {
          moving: e.moving, hurt: e.hurt > 0, tier: 1
        });
        if (e.hp < e.def.hp && e.hp > 0) drawHpBar(e.x, e.y - e.size * 0.6, e.hp, e.def.hp);
      }
    }
    function drawHpBar(x, y, hp, maxHp) {
      var w = CELL * 0.7, h = 4, bx = x - w / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, bx - 1, y - 1, w + 2, h + 2, 2); ctx.fill();
      var ratio = hp / maxHp;
      ctx.fillStyle = ratio > 0.5 ? COLOR.ok : (ratio > 0.25 ? COLOR.warn : COLOR.danger);
      roundRectPath(ctx, bx, y, w * ratio, h, 2); ctx.fill();
    }

    function drawBullets() { for (var i = 0; i < state.bullets.length; i++) drawBullet(ctx, state.bullets[i], state.time); }
    function drawPowerups() { for (var i = 0; i < state.powerups.length; i++) drawPowerup(ctx, state.powerups[i], state.time); }

    function drawGrassOverlay() {
      // 草丛画在坦克之上(遮蔽效果)
      if (!state.map) return;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (state.map[r][c] === T.GRASS) {
            var x = offX + c * CELL, y = offY + r * CELL;
            ctx.fillStyle = withAlpha(COLOR.grass, 0.55);
            ctx.fillRect(x, y, CELL, CELL);
            // 草纹
            ctx.strokeStyle = withAlpha('#5aaa5a', 0.6); ctx.lineWidth = 1;
            for (var i = 0; i < 4; i++) {
              ctx.beginPath();
              ctx.moveTo(x + 3 + i * CELL / 4, y + CELL - 3);
              ctx.lineTo(x + 3 + i * CELL / 4, y + CELL - 8);
              ctx.stroke();
            }
          }
        }
      }
    }

    function drawHUD() {
      ctx.fillStyle = 'rgba(13,19,32,0.85)'; ctx.fillRect(0, 0, W, HUD_TOP);
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, HUD_TOP); ctx.lineTo(W, HUD_TOP); ctx.stroke();

      // 关卡 + 敌数
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px Orbitron, sans-serif'; ctx.fillStyle = COLOR.text;
      ctx.fillText('第 ' + state.level + ' / ' + LEVELS + ' 关', 16, HUD_TOP / 2);
      ctx.font = '13px Rajdhani, sans-serif'; ctx.fillStyle = COLOR.text2;
      ctx.fillText('剩余敌坦 ' + (state.enemies.length + state.enemiesLeft), 120, HUD_TOP / 2);

      // 生命 + 装甲
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px Orbitron, sans-serif'; ctx.fillStyle = COLOR.danger;
      ctx.fillText('❤ ' + state.lives, W / 2 - 60, HUD_TOP / 2);
      if (state.player) {
        var tier = getTier();
        ctx.fillStyle = COLOR.warn;
        ctx.fillText('★'.repeat(state.player.tierIdx + 1), W / 2, HUD_TOP / 2);
        ctx.fillStyle = COLOR.neon; ctx.font = '13px Rajdhani, sans-serif';
        ctx.fillText('装甲 ' + (state.player.hp || tier.hp), W / 2 + 70, HUD_TOP / 2);
      }

      // 操作提示
      ctx.textAlign = 'right'; ctx.font = '12px Rajdhani, sans-serif'; ctx.fillStyle = COLOR.text2;
      ctx.fillText('WASD 移动 · 空格开炮', W - 16, HUD_TOP / 2);

      // 状态 buff 提示(护盾/加速)
      var buffX = W - 200;
      if (state.player && state.player.shieldTimer > 0) {
        ctx.textAlign = 'left'; ctx.fillStyle = COLOR.neon; ctx.font = '12px Rajdhani, sans-serif';
        ctx.fillText('🛡' + Math.ceil(state.player.shieldTimer) + 's', buffX, HUD_TOP / 2);
      }
      if (state.speedBoostTimer > 0) {
        ctx.textAlign = 'left'; ctx.fillStyle = COLOR.ok; ctx.font = '12px Rajdhani, sans-serif';
        ctx.fillText('⚡' + Math.ceil(state.speedBoostTimer) + 's', buffX + 60, HUD_TOP / 2);
      }
      if (state.freezeTimer > 0) {
        ctx.textAlign = 'left'; ctx.fillStyle = COLOR.ice2; ctx.font = '12px Rajdhani, sans-serif';
        ctx.fillText('❄' + Math.ceil(state.freezeTimer) + 's', buffX + 120, HUD_TOP / 2);
      }
      if (state.player && state.player.pierceTimer > 0) {
        ctx.textAlign = 'left'; ctx.fillStyle = COLOR.neon2; ctx.font = '12px Rajdhani, sans-serif';
        ctx.fillText('➤' + Math.ceil(state.player.pierceTimer) + 's', buffX + 180, HUD_TOP / 2);
      }
    }

    // Boss 血条(底部居中)
    function drawBossHUD() {
      var z = state.boss;
      var bw = W * 0.5, bx = (W - bw) / 2, by = H - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRectPath(ctx, bx - 2, by - 2, bw + 4, 14, 7); ctx.fill();
      var hr = z.hp / z.maxHp;
      var grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, COLOR.danger); grd.addColorStop(1, COLOR.neon2);
      ctx.fillStyle = grd; roundRectPath(ctx, bx, by, bw * hr, 10, 5); ctx.fill();
      ctx.font = 'bold 13px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff'; ctx.fillText('☠ ' + z.def.name, W / 2, by - 4);
    }

    function drawLevelBanner() {
      var alpha = state.levelBanner > 1.4 ? (1.8 - state.levelBanner) / 0.4 : Math.min(1, state.levelBanner / 0.5);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H / 2 - 40, W, 80);
      ctx.font = 'bold 30px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR.neon; ctx.shadowColor = COLOR.neon; ctx.shadowBlur = 16;
      ctx.fillText(state.levelBannerText, W / 2, H / 2);
      ctx.restore();
    }
    function drawToasts() {
      ctx.font = 'bold 14px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (var i = 0; i < state.toasts.length; i++) {
        var t = state.toasts[i];
        var alpha = t.life > t.max - 0.3 ? (t.max - t.life) / 0.3 : Math.min(1, t.life / 0.5);
        var y = H - 70 - i * 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.kind === 'ok' ? 'rgba(46,230,166,0.9)' : (t.kind === 'warn' ? 'rgba(255,182,39,0.9)' : 'rgba(0,224,255,0.9)');
        var tw = ctx.measureText(t.text).width + 24;
        roundRectPath(ctx, W / 2 - tw / 2, y, tw, 26, 13); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(t.text, W / 2, y + 6);
      }
      ctx.globalAlpha = 1;
    }

    // ---- 主循环 ----
    var last = 0, rafId = null;
    function loop(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      // 暂停键
      if (input.isDown('p')) { input.keys['p'] = false; if (state.running && !state.over) { state.paused = !state.paused; emitState(state.paused ? 'paused' : 'playing'); } }
      try {
        if (state.running && !state.paused && !state.over) update(dt);
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[tankbattle-deluxe] update 异常:', err);
        state.running = false;
      }
      try { draw(); } catch (err2) {
        if (typeof console !== 'undefined') console.error('[tankbattle-deluxe] draw 异常:', err2);
      }
      rafId = requestAnimationFrame(loop);
    }

    // ---- 生命周期 ----
    function reset() {
      state.level = 1; state.score = 0; state.lives = 3;
      state.running = false; state.paused = false; state.over = false; state.won = false;
      state.enemies = []; state.bullets = []; state.powerups = []; state.effects = [];
      state.particles.clear(); state.toasts = [];
      state.freezeTimer = 0; state.speedBoostTimer = 0;
      // 开新局:清空玩家与跨关成长,从初始 1 星开始
      state.player = null;
      state.carryTier = 0; state.carryMaxHp = PLAYER_TIERS[0].hp;
      state.carryShield = 0; state.carryPierce = 0;
      state.speedBoostTimer = 0; state.freezeTimer = 0;
      startLevel();
      emitScore(); emitState('playing');
    }
    function start(diff) {
      reset();
      state.diff = diff || 'normal';
      if (state.diff === 'easy') state.lives = 5;
      else if (state.diff === 'hard') state.lives = 2;
      state.running = true;
      emitState('playing');
    }
    function pause() { if (state.over) return; state.paused = true; emitState('paused'); }
    function resume() { if (state.over) return; state.paused = false; emitState('playing'); }
    function destroy() { if (rafId) cancelAnimationFrame(rafId); input.destroy(); }

    reset();
    rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
