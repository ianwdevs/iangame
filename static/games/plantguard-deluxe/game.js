/* ============================================================
 * 植物守卫战 · 精致版 (plantguard-deluxe)  ·  Phase 2
 * ------------------------------------------------------------
 * 单文件 IIFE,实现 IanGame 契约:window.IanGame.init(canvas, hooks)
 *   → 返回 { pause, resume, restart(diff), destroy }
 *
 * Phase 2 新增:
 *   · 元素反应系统(冰/火/毒/电叠层 + 蒸汽 + 电连锁)
 *   · 光环增益系统(同类相邻增益)
 *   · 8 植物 / 8 僵尸 + Boss / 7 关(第 4 关 Boss 战)
 *
 * 分层架构(引擎层隔离,未来可替换为 PlayCanvas/WebGL 而不影响壳页面):
 *   Renderer  绘制原语 + 贝塞尔自绘卡通形象
 *   Input     鼠标/触摸坐标映射
 *   Particles 多层粒子 + 加色混合发光
 *   Elements  冰/火/毒/电叠层与反应
 *   Aura      光环增益
 *   Entities  Plant / Zombie / Projectile
 *   Game      经济(阳光) / 关卡波次 / HUD
 * ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // 配置常量
  // ============================================================
  var COLS = 9, ROWS = 5;
  var LEVELS = 12;                   // Phase 3 扩展到 12 关
  var WAVES_PER_LEVEL = 5;
  var HUD_TOP = 92;
  var FIELD_TOP = 118;
  var COLOR = {
    bg: '#060912',
    grass1: '#1a3a22', grass2: '#205028', grassDark: '#0f2418',
    house: '#2c3e6a', houseDark: '#1a2747', roof: '#5a3a4a',
    sun: '#ffd84d', sunCore: '#fff3a0',
    neon: '#00e0ff', neon2: '#b537f2', ok: '#2ee6a6', warn: '#ffb627', danger: '#ff2e63',
    text: '#eaf0fb', text2: '#8b97b3',
    ice: '#6fd0ff', fire: '#ff7847', poison: '#9b59b6', electric: '#ffe066'
  };

  // ============================================================
  // 植物定义(Phase 3: 12 种)
  //   kind:  sun 产阳光 / shoot 射击 / wall 肉盾 / bomb 爆炸 / eat 吞噬 / spike 地刺
  //   element: ice/fire/poison/electric(仅 shoot 类带元素,触发元素反应)
  // ============================================================
  var PLANTS = {
    sunflower:  { name: '向日葵', cost: 50,  hp: 4,  recharge: 7.5,  interval: 9,  kind: 'sun' },
    peashooter: { name: '豌豆射手', cost: 100, hp: 4,  recharge: 7.5,  fire: 1.4, dmg: 1,   kind: 'shoot' },
    wallnut:    { name: '坚果墙', cost: 50,  hp: 18, recharge: 20,   kind: 'wall' },
    snowpea:    { name: '寒冰射手', cost: 175, hp: 4,  recharge: 7.5,  fire: 1.5, dmg: 1,   kind: 'shoot', element: 'ice' },
    firepea:    { name: '火焰射手', cost: 175, hp: 4,  recharge: 7.5,  fire: 1.4, dmg: 1.2, kind: 'shoot', element: 'fire' },
    'toxic-shoot':{ name: '毒液菇', cost: 150, hp: 4,  recharge: 8,    fire: 1.6, dmg: 0.8, kind: 'shoot', element: 'poison' },
    electric:   { name: '闪电芦苇', cost: 225, hp: 4,  recharge: 9,    fire: 1.8, dmg: 1,   kind: 'shoot', element: 'electric' },
    cherrybomb: { name: '樱桃炸弹', cost: 150, hp: 1,  recharge: 30,   kind: 'bomb', fuse: 1.2, radius: 130, dmg: 25 },
    // Phase 3 新增 4 种
    twinpea:    { name: '双发射手', cost: 200, hp: 4,  recharge: 8,    fire: 1.4, dmg: 1, kind: 'shoot', twin: true },
    chomper:    { name: '食人花', cost: 150, hp: 4, recharge: 12, kind: 'eat', chew: 10, range: 70, dmg: 10 },
    spikerock:  { name: '地刺', cost: 100, hp: 6, recharge: 15, kind: 'spike', dmg: 0.5, slow: 0.6 },
    jalapeno:   { name: '火爆辣椒', cost: 125, hp: 1, recharge: 28, kind: 'bomb', fuse: 1.0, rowBomb: true, dmg: 25 }
  };
  var SHOP_KEYS = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'firepea', 'toxic-shoot', 'electric', 'cherrybomb', 'twinpea', 'chomper', 'spikerock', 'jalapeno'];

  // ============================================================
  // 僵尸定义(Phase 3: 12 种 + Boss)
  //   special: pole 撑杆冲刺 / balloon 气球飞行 / newspaper 读报激怒 /
  //            sled 雪橇加速 / jump 跳过 / screen 铁栅门正面减伤 /
  //            football 高速高血 / dancer 召唤伴舞 / miner 绕后
  // ============================================================
  var ZOMBIES = {
    normal:    { name: '普通僵尸', hp: 3,   sp: 0.22, atk: 0.5, score: 10,  tint: '#7a8a55' },
    cone:      { name: '路障僵尸', hp: 6,   sp: 0.22, atk: 0.5, score: 20,  tint: '#5a6a40', hat: 'cone' },
    bucket:    { name: '铁桶僵尸', hp: 12,  sp: 0.20, atk: 0.5, score: 40,  tint: '#525f6e', hat: 'bucket' },
    pole:      { name: '撑杆僵尸', hp: 5,   sp: 0.30, atk: 0.5, score: 25,  tint: '#6a5a35', special: 'pole' },
    balloon:   { name: '气球僵尸', hp: 2,   sp: 0.24, atk: 0.5, score: 30,  tint: '#8a5a8a', special: 'balloon' },
    newspaper: { name: '读报僵尸', hp: 4,   sp: 0.18, atk: 0.5, score: 25,  tint: '#5a6a5a', special: 'newspaper' },
    sled:      { name: '雪橇僵尸', hp: 7,   sp: 0.18, atk: 0.6, score: 35,  tint: '#5a7a8a', special: 'sled' },
    jump:      { name: '跳跳僵尸', hp: 5,   sp: 0.24, atk: 0.5, score: 30,  tint: '#7a6a3a', special: 'jump' },
    // Phase 3 新增 4 种
    screen:    { name: '铁栅门僵尸', hp: 14,  sp: 0.18, atk: 0.6, score: 45,  tint: '#4a5a4a', special: 'screen' },
    football:  { name: '橄榄球僵尸', hp: 10,  sp: 0.34, atk: 0.7, score: 50,  tint: '#5a4a3a', special: 'football' },
    dancer:    { name: '舞王僵尸', hp: 8,   sp: 0.16, atk: 0.5, score: 40,  tint: '#6a3a5a', special: 'dancer' },
    miner:     { name: '矿工僵尸', hp: 6,   sp: 0.22, atk: 0.5, score: 35,  tint: '#4a4a3a', special: 'miner' },
    boss:      { name: '僵尸博士', hp: 120, sp: 0.12, atk: 2.0, score: 500, tint: '#3a2a5a', special: 'boss', isBoss: true }
  };

  // ============================================================
  // 元素配置(叠层阈值与效果)
  // ============================================================
  var ELEMENT_CFG = {
    ice:      { max: 3, color: COLOR.ice,      icon: '❄', label: '冰' },
    fire:     { max: 3, color: COLOR.fire,     icon: '🔥', label: '火' },
    poison:   { max: 4, color: COLOR.poison,   icon: '☣', label: '毒' },
    electric: { max: 0, color: COLOR.electric, icon: '⚡', label: '电' }  // 电即时连锁,无叠层
  };

  // ============================================================
  // Engine · 工具
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

  // ============================================================
  // Engine · 精细自绘:植物(8 种)
  // ============================================================
  function drawSunflower(ctx, x, y, size, t, hurt) {
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.quadraticCurveTo(x + Math.sin(t * 1.5) * size * 0.04, y + size * 0.2, x, y - size * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x - size * 0.28, y + size * 0.28, size * 0.18, size * 0.09, -0.5, 0, Math.PI * 2); ctx.fill();
    var cx = x, cy = y - size * 0.18, pulse = 1 + Math.sin(t * 2) * 0.05;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + t * 0.3;
      var px = cx + Math.cos(a) * size * 0.30 * pulse, py = cy + Math.sin(a) * size * 0.30 * pulse;
      var grd = ctx.createRadialGradient(px, py, 0, px, py, size * 0.18);
      grd.addColorStop(0, '#ffe066'); grd.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(px, py, size * 0.16, size * 0.10, a, 0, Math.PI * 2); ctx.fill();
    }
    var core = ctx.createRadialGradient(cx - size * 0.05, cy - size * 0.05, 0, cx, cy, size * 0.22);
    core.addColorStop(0, '#7a4a1a'); core.addColorStop(1, '#3a2008');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.03, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + size * 0.07, cy - size * 0.03, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.03, size * 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + size * 0.07, cy - size * 0.03, size * 0.018, 0, Math.PI * 2); ctx.fill();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2); ctx.fill(); }
  }

  // 通用"豆荚射手"骨架,通过主色 + 元素光晕区分不同元素变种
  function drawShooterBase(ctx, x, y, size, t, hurt, opts) {
    opts = opts || {};
    var c1 = opts.c1 || '#7ee06a', c2 = opts.c2 || '#2e9b3a', glow = opts.glow, elemCol = opts.elemCol;
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.quadraticCurveTo(x + Math.sin(t * 2) * size * 0.05, y, x, y - size * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x - size * 0.26, y + size * 0.22, size * 0.16, size * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size * 0.26, y + size * 0.32, size * 0.16, size * 0.08, 0.5, 0, Math.PI * 2); ctx.fill();
    // 元素光晕
    if (elemCol) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var eg = ctx.createRadialGradient(x, y - size * 0.05, 0, x, y - size * 0.05, size * 0.4);
      eg.addColorStop(0, withAlpha(elemCol, 0.4)); eg.addColorStop(1, withAlpha(elemCol, 0));
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(x, y - size * 0.05, size * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    var headX = x + size * 0.08 + (opts.attack ? size * 0.06 : 0), headY = y - size * 0.08;
    var grd = ctx.createRadialGradient(headX - size * 0.08, headY - size * 0.08, 0, headX, headY, size * 0.26);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(headX, headY, size * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f7a2a';
    var mouthOpen = opts.attack ? size * 0.10 : size * 0.06;
    ctx.beginPath(); ctx.ellipse(headX + size * 0.22, headY, size * 0.10, mouthOpen, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(headX - size * 0.02, headY - size * 0.06, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(headX + size * 0.01, headY - size * 0.06, size * 0.025, 0, Math.PI * 2); ctx.fill();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.beginPath(); ctx.arc(headX, headY, size * 0.4, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawPeashooter(ctx, x, y, size, t, hurt, attack) {
    drawShooterBase(ctx, x, y, size, t, hurt, { c1: '#7ee06a', c2: '#2e9b3a', attack: attack });
  }
  function drawSnowpea(ctx, x, y, size, t, hurt, attack) {
    drawShooterBase(ctx, x, y, size, t, hurt, { c1: '#a8e0ff', c2: '#2a8acf', elemCol: COLOR.ice, attack: attack });
  }
  function drawFirepea(ctx, x, y, size, t, hurt, attack) {
    drawShooterBase(ctx, x, y, size, t, hurt, { c1: '#ffb066', c2: '#d04020', elemCol: COLOR.fire, attack: attack });
  }
  function drawToxicShoot(ctx, x, y, size, t, hurt, attack) {
    drawShooterBase(ctx, x, y, size, t, hurt, { c1: '#b8e06a', c2: '#5a8a2a', elemCol: COLOR.poison, attack: attack });
  }
  function drawElectric(ctx, x, y, size, t, hurt, attack) {
    // 芦苇秆 + 电弧
    drawShooterBase(ctx, x, y, size, t, hurt, { c1: '#ffe066', c2: '#b08020', elemCol: COLOR.electric, attack: attack });
    // 顶部电弧闪烁
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(COLOR.electric, 0.8); ctx.lineWidth = 1.5;
    var ex = x + size * 0.08, ey = y - size * 0.32;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    for (var i = 0; i < 4; i++) { ctx.lineTo(ex + rand(-6, 6), ey - i * size * 0.04 - rand(2, 6)); }
    ctx.stroke();
    ctx.restore();
  }

  function drawWallnut(ctx, x, y, size, t, hurt, hpRatio) {
    var sway = Math.sin(t * 1.2) * size * 0.02;
    var grd = ctx.createRadialGradient(x - size * 0.1 + sway, y - size * 0.15, 0, x + sway, y, size * 0.45);
    grd.addColorStop(0, '#d4a36a'); grd.addColorStop(0.6, '#a8703a'); grd.addColorStop(1, '#5a3818');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x + sway, y, size * 0.40, size * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3da935';
    ctx.beginPath(); ctx.ellipse(x + sway, y - size * 0.42, size * 0.08, size * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,5,0.7)'; ctx.lineWidth = 1.5;
    var cracks = hpRatio > 0.66 ? 0 : (hpRatio > 0.33 ? 2 : 4);
    for (var i = 0; i < cracks; i++) {
      var a = (i / 4) * Math.PI * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(x + sway + Math.cos(a) * size * 0.10, y + Math.sin(a) * size * 0.10);
      ctx.lineTo(x + sway + Math.cos(a) * size * 0.32, y + Math.sin(a) * size * 0.32);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + sway - size * 0.10, y - size * 0.04, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway + size * 0.10, y - size * 0.04, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x + sway - size * 0.10, y - size * 0.04, size * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway + size * 0.10, y - size * 0.04, size * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2008'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + sway, y + size * 0.10, size * 0.08, 0.2 + (1 - hpRatio) * 0.3, Math.PI - 0.2 - (1 - hpRatio) * 0.3);
    ctx.stroke();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.ellipse(x + sway, y, size * 0.4, size * 0.46, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawCherrybomb(ctx, x, y, size, t, hurt, fuse) {
    // 引线快烧完时脉动加快 + 变红
    var pulse = 1 + Math.sin(t * (fuse < 0.5 ? 20 : 8)) * 0.08;
    // 双樱桃
    var cx1 = x - size * 0.16, cx2 = x + size * 0.16, cy = y + size * 0.05;
    for (var i = 0; i < 2; i++) {
      var cxi = i === 0 ? cx1 : cx2;
      var grd = ctx.createRadialGradient(cxi - size * 0.06, cy - size * 0.08, 0, cxi, cy, size * 0.26 * pulse);
      grd.addColorStop(0, '#ff6060'); grd.addColorStop(1, '#a01020');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cxi, cy, size * 0.24 * pulse, 0, Math.PI * 2); ctx.fill();
      // 高光
      ctx.fillStyle = 'rgba(255,200,200,0.6)';
      ctx.beginPath(); ctx.arc(cxi - size * 0.08, cy - size * 0.08, size * 0.05, 0, Math.PI * 2); ctx.fill();
      // 怒目
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cxi, cy - size * 0.02, size * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cxi, cy - size * 0.02, size * 0.025, 0, Math.PI * 2); ctx.fill();
    }
    // 茎 + 叶
    ctx.strokeStyle = '#3a5a2a'; ctx.lineWidth = size * 0.05; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx1, cy - size * 0.18); ctx.quadraticCurveTo(x, y - size * 0.38, cx2, cy - size * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x + size * 0.04, y - size * 0.36, size * 0.10, size * 0.05, 0.6, 0, Math.PI * 2); ctx.fill();
    // 危险光晕
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var dg = ctx.createRadialGradient(x, y, 0, x, y, size * 0.5);
    dg.addColorStop(0, withAlpha(COLOR.danger, 0.3 + (1 - fuse) * 0.3)); dg.addColorStop(1, withAlpha(COLOR.danger, 0));
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(x, y, size * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlantByType(ctx, type, x, y, size, t, hurt, extra) {
    extra = extra || {};
    if (type === 'sunflower') drawSunflower(ctx, x, y, size, t, hurt);
    else if (type === 'peashooter') drawPeashooter(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'wallnut') drawWallnut(ctx, x, y, size, t, hurt, extra.hpRatio != null ? extra.hpRatio : 1);
    else if (type === 'snowpea') drawSnowpea(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'firepea') drawFirepea(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'toxic-shoot') drawToxicShoot(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'electric') drawElectric(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'cherrybomb') drawCherrybomb(ctx, x, y, size, t, hurt, extra.fuse != null ? extra.fuse : 1);
    else if (type === 'twinpea') drawTwinpea(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'chomper') drawChomper(ctx, x, y, size, t, hurt, extra.attack);
    else if (type === 'spikerock') drawSpikerock(ctx, x, y, size, t, hurt);
    else if (type === 'jalapeno') drawJalapeno(ctx, x, y, size, t, hurt, extra.fuse != null ? extra.fuse : 1);
  }

  // 双发射手:两个头部并排
  function drawTwinpea(ctx, x, y, size, t, hurt, attack) {
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + size * 0.5); ctx.quadraticCurveTo(x, y, x, y - size * 0.05); ctx.stroke();
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x - size * 0.28, y + size * 0.25, size * 0.16, size * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
    // 左右两个头
    for (var s = -1; s <= 1; s += 2) {
      var hx = x + s * size * 0.14, hy = y - size * 0.10;
      var grd = ctx.createRadialGradient(hx - size * 0.06, hy - size * 0.06, 0, hx, hy, size * 0.20);
      grd.addColorStop(0, '#7ee06a'); grd.addColorStop(1, '#2e9b3a');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(hx, hy, size * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f7a2a';
      ctx.beginPath(); ctx.ellipse(hx + size * 0.16, hy, size * 0.07, attack ? size * 0.08 : size * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx - size * 0.02, hy - size * 0.04, size * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(hx, hy - size * 0.04, size * 0.018, 0, Math.PI * 2); ctx.fill();
    }
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.arc(x, y - size * 0.10, size * 0.35, 0, Math.PI * 2); ctx.fill(); }
  }

  // 食人花:大嘴 + 紫色
  function drawChomper(ctx, x, y, size, t, hurt, attack) {
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + size * 0.5); ctx.quadraticCurveTo(x, y, x, y - size * 0.05); ctx.stroke();
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x - size * 0.28, y + size * 0.28, size * 0.18, size * 0.09, -0.5, 0, Math.PI * 2); ctx.fill();
    // 头(大椭圆)
    var hx = x + size * 0.08, hy = y - size * 0.15;
    var grd = ctx.createRadialGradient(hx - size * 0.08, hy - size * 0.08, 0, hx, hy, size * 0.30);
    grd.addColorStop(0, '#c060d0'); grd.addColorStop(1, '#5a1a6a');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(hx, hy, size * 0.28, size * 0.20, 0, 0, Math.PI * 2); ctx.fill();
    // 嘴(攻击时张开)
    var mouthOpen = attack ? size * 0.14 : size * 0.06;
    ctx.fillStyle = '#1a0a1a';
    ctx.beginPath(); ctx.ellipse(hx + size * 0.18, hy, size * 0.14, mouthOpen, 0, 0, Math.PI * 2); ctx.fill();
    // 牙齿
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx + size * 0.10, hy - mouthOpen + 1, size * 0.03, size * 0.04);
    ctx.fillRect(hx + size * 0.18, hy - mouthOpen + 1, size * 0.03, size * 0.04);
    ctx.fillRect(hx + size * 0.26, hy - mouthOpen + 1, size * 0.03, size * 0.04);
    // 眼
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx - size * 0.04, hy - size * 0.08, size * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(hx - size * 0.03, hy - size * 0.08, size * 0.02, 0, Math.PI * 2); ctx.fill();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.ellipse(hx, hy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  // 地刺:贴地的尖刺
  function drawSpikerock(ctx, x, y, size, t, hurt) {
    // 底座
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.18, size * 0.36, size * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    // 尖刺(3 根,带辉光)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(180,180,200,0.4)'; ctx.lineWidth = size * 0.08; ctx.lineCap = 'round';
    for (var i = -1; i <= 1; i++) {
      var sx = x + i * size * 0.18;
      ctx.beginPath(); ctx.moveTo(sx, y + size * 0.10); ctx.lineTo(sx, y - size * 0.22); ctx.stroke();
    }
    ctx.restore();
    // 尖刺主体
    ctx.fillStyle = '#9a9aaa';
    for (var j = -1; j <= 1; j++) {
      var sx2 = x + j * size * 0.18;
      ctx.beginPath();
      ctx.moveTo(sx2 - size * 0.05, y + size * 0.10);
      ctx.lineTo(sx2 + size * 0.05, y + size * 0.10);
      ctx.lineTo(sx2, y - size * 0.22);
      ctx.closePath(); ctx.fill();
    }
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.fillRect(x - size * 0.3, y, size * 0.6, size * 0.2); }
  }

  // 火爆辣椒:红长条 + 怒容 + 危险光晕
  function drawJalapeno(ctx, x, y, size, t, hurt, fuse) {
    var pulse = 1 + Math.sin(t * (fuse < 0.5 ? 20 : 8)) * 0.06;
    var grd = ctx.createLinearGradient(x, y - size * 0.3, x, y + size * 0.3);
    grd.addColorStop(0, '#ff5040'); grd.addColorStop(1, '#a01010');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.16 * pulse, size * 0.42 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,200,200,0.5)';
    ctx.beginPath(); ctx.ellipse(x - size * 0.05, y - size * 0.10, size * 0.04, size * 0.20, 0, 0, Math.PI * 2); ctx.fill();
    // 蒂
    ctx.strokeStyle = '#3a5a2a'; ctx.lineWidth = size * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - size * 0.40); ctx.lineTo(x + size * 0.06, y - size * 0.30); ctx.stroke();
    // 怒眼
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - size * 0.12, size * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y - size * 0.12, size * 0.02, 0, Math.PI * 2); ctx.fill();
    // 危险光晕
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var dg = ctx.createRadialGradient(x, y, 0, x, y, size * 0.5);
    dg.addColorStop(0, withAlpha(COLOR.fire, 0.3 + (1 - fuse) * 0.3)); dg.addColorStop(1, withAlpha(COLOR.fire, 0));
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(x, y, size * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // Engine · 精细自绘:僵尸(8 种 + Boss,带特殊装饰)
  // ============================================================
  function drawZombieBody(ctx, x, y, size, t, def, z, time) {
    var walkPhase = z.walkPhase;
    var frozen = z.frozen > 0;
    var sw = frozen ? 0 : Math.sin(walkPhase) * size * 0.08;
    var bob = frozen ? 0 : Math.abs(Math.sin(walkPhase)) * size * 0.03;
    var cy = y - bob;
    var flying = def.special === 'balloon';   // 气球僵尸抬高
    if (flying) cy -= size * 0.35;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.42, size * (flying ? 0.18 : 0.28), size * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // 腿
    ctx.strokeStyle = '#2a3018'; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.10, cy + size * 0.10);
    ctx.lineTo(x - size * 0.10 + sw, cy + size * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.10, cy + size * 0.10);
    ctx.lineTo(x + size * 0.10 - sw, cy + size * 0.38);
    ctx.stroke();
    // 身体
    var body = ctx.createLinearGradient(x, cy - size * 0.1, x, cy + size * 0.2);
    body.addColorStop(0, '#3a4458'); body.addColorStop(1, '#1e2638');
    ctx.fillStyle = body;
    roundRectPath(ctx, x - size * 0.18, cy - size * 0.10, size * 0.36, size * 0.30, size * 0.06); ctx.fill();
    ctx.fillStyle = def.tint;
    roundRectPath(ctx, x - size * 0.15, cy - size * 0.05, size * 0.30, size * 0.18, size * 0.04); ctx.fill();
    // 手臂前伸
    ctx.strokeStyle = def.tint; ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, cy - size * 0.02);
    ctx.lineTo(x + size * 0.22, cy + size * 0.02 + Math.sin(walkPhase + 1) * size * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, cy - size * 0.02);
    ctx.lineTo(x + size * 0.26, cy + size * 0.04 + Math.sin(walkPhase) * size * 0.03);
    ctx.stroke();
    // 头
    var headGrd = ctx.createRadialGradient(x - size * 0.06, cy - size * 0.30, 0, x, cy - size * 0.24, size * 0.22);
    headGrd.addColorStop(0, '#a8b878'); try { headGrd.addColorStop(1, def.tint); } catch (e) {}
    ctx.fillStyle = headGrd;
    ctx.beginPath(); ctx.arc(x, cy - size * 0.24, size * 0.18, 0, Math.PI * 2); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#1a0808';
    ctx.beginPath(); ctx.arc(x - size * 0.06, cy - size * 0.26, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.06, cy - size * 0.26, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = def.special === 'newspaper' && z.angered ? '#ffff00' : '#ff3838';
    ctx.beginPath(); ctx.arc(x - size * 0.06, cy - size * 0.26, size * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.06, cy - size * 0.26, size * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d0b0';
    ctx.fillRect(x - size * 0.04, cy - size * 0.16, size * 0.08, size * 0.03);
    // 帽子 / 特殊装饰
    if (def.hat === 'cone') {
      var cgrd = ctx.createLinearGradient(x, cy - size * 0.56, x, cy - size * 0.40);
      cgrd.addColorStop(0, '#ff8a3a'); cgrd.addColorStop(1, '#c04a10');
      ctx.fillStyle = cgrd;
      ctx.beginPath();
      ctx.moveTo(x, cy - size * 0.56); ctx.lineTo(x - size * 0.16, cy - size * 0.40); ctx.lineTo(x + size * 0.16, cy - size * 0.40);
      ctx.closePath(); ctx.fill();
    } else if (def.hat === 'bucket') {
      var bgrd = ctx.createLinearGradient(x, cy - size * 0.50, x, cy - size * 0.32);
      bgrd.addColorStop(0, '#9aa6b4'); bgrd.addColorStop(1, '#4a5664');
      ctx.fillStyle = bgrd;
      roundRectPath(ctx, x - size * 0.20, cy - size * 0.50, size * 0.40, size * 0.18, size * 0.03); ctx.fill();
    }
    // 特殊装备
    if (def.special === 'balloon') {
      // 头顶气球
      var bg = ctx.createRadialGradient(x - size * 0.05, cy - size * 0.62, 0, x, cy - size * 0.58, size * 0.18);
      bg.addColorStop(0, '#e08aff'); bg.addColorStop(1, '#7a3a9a');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.58, size * 0.16, size * 0.20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a3a6a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, cy - size * 0.40); ctx.lineTo(x, cy - size * 0.42); ctx.stroke();
    } else if (def.special === 'pole' && !z.usedPole) {
      // 手持撑杆
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = size * 0.04; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.28, cy - size * 0.34); ctx.lineTo(x + size * 0.40, cy + size * 0.30);
      ctx.stroke();
    } else if (def.special === 'newspaper' && !z.angered) {
      // 手持报纸
      ctx.fillStyle = '#e8e0c8';
      roundRectPath(ctx, x + size * 0.18, cy - size * 0.06, size * 0.18, size * 0.20, size * 0.02); ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      for (var li = 0; li < 4; li++) ctx.fillRect(x + size * 0.21, cy - size * 0.03 + li * size * 0.05, size * 0.12, size * 0.008);
    } else if (def.special === 'sled') {
      // 雪橇板
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = size * 0.05; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.20, cy + size * 0.40); ctx.quadraticCurveTo(x, cy + size * 0.46, x + size * 0.20, cy + size * 0.40);
      ctx.stroke();
    } else if (def.special === 'screen' && !z.angered) {
      // 铁栅门(手持挡在前)
      var sg = ctx.createLinearGradient(x + size * 0.20, cy, x + size * 0.40, cy);
      sg.addColorStop(0, '#9aa6b4'); sg.addColorStop(1, '#4a5664');
      ctx.fillStyle = sg;
      roundRectPath(ctx, x + size * 0.22, cy - size * 0.18, size * 0.16, size * 0.40, size * 0.02); ctx.fill();
      ctx.strokeStyle = '#2a3640'; ctx.lineWidth = 1;
      for (var bi = 0; bi < 4; bi++) {
        ctx.beginPath(); ctx.moveTo(x + size * 0.24, cy - size * 0.14 + bi * size * 0.10); ctx.lineTo(x + size * 0.36, cy - size * 0.14 + bi * size * 0.10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + size * 0.30, cy - size * 0.16 + bi * size * 0.10); ctx.lineTo(x + size * 0.30, cy - size * 0.06 + bi * size * 0.10); ctx.stroke();
      }
    } else if (def.special === 'football') {
      // 橄榄球头盔
      var fh = ctx.createRadialGradient(x - size * 0.04, cy - size * 0.30, 0, x, cy - size * 0.26, size * 0.22);
      fh.addColorStop(0, '#d8a050'); fh.addColorStop(1, '#6a3a10');
      ctx.fillStyle = fh;
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.26, size * 0.22, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      // 面罩
      ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - size * 0.18, cy - size * 0.24); ctx.lineTo(x + size * 0.18, cy - size * 0.24); ctx.stroke();
    } else if (def.special === 'dancer') {
      // 舞王披风(红色)
      ctx.fillStyle = '#7a1a3a';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.16, cy - size * 0.08); ctx.lineTo(x - size * 0.28, cy + size * 0.30); ctx.lineTo(x + size * 0.16, cy + size * 0.30); ctx.lineTo(x + size * 0.16, cy - size * 0.08);
      ctx.closePath(); ctx.fill();
      // 闪亮手套
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + size * 0.24, cy + size * 0.04 + Math.sin(z.walkPhase) * size * 0.03, size * 0.04, 0, Math.PI * 2); ctx.fill();
    } else if (def.special === 'miner') {
      // 矿工头盔 + 灯
      ctx.fillStyle = '#d8a030';
      roundRectPath(ctx, x - size * 0.16, cy - size * 0.42, size * 0.32, size * 0.12, size * 0.03); ctx.fill();
      ctx.fillStyle = '#ffe066';   // 矿灯
      ctx.beginPath(); ctx.arc(x, cy - size * 0.40, size * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var lg = ctx.createRadialGradient(x, cy - size * 0.40, 0, x, cy - size * 0.40, size * 0.20);
      lg.addColorStop(0, 'rgba(255,224,102,0.5)'); lg.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(x, cy - size * 0.40, size * 0.20, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Boss 特殊绘制(巨型 + 护盾 + 机械臂)
    if (def.isBoss) {
      drawBossExtras(ctx, x, cy, size, z, time);
    }
    // 元素覆盖层
    drawZombieElements(ctx, x, cy, size, z, time);
    // 冰冻
    if (frozen) {
      ctx.fillStyle = 'rgba(100,200,255,0.4)';
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.05, size * 0.35, size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(180,230,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, cy - size * 0.05, size * 0.35, 0, Math.PI * 2); ctx.stroke();
    }
    // 受击闪白
    if (z.hurt > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.05, size * 0.32, size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Boss 额外装饰:更大体型已由 size 放大,这里加护盾/王冠/机械臂
  function drawBossExtras(ctx, x, cy, size, z, time) {
    // 王冠
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.14, cy - size * 0.50);
    ctx.lineTo(x - size * 0.14, cy - size * 0.60);
    ctx.lineTo(x - size * 0.07, cy - size * 0.52);
    ctx.lineTo(x, cy - size * 0.62);
    ctx.lineTo(x + size * 0.07, cy - size * 0.52);
    ctx.lineTo(x + size * 0.14, cy - size * 0.60);
    ctx.lineTo(x + size * 0.14, cy - size * 0.50);
    ctx.closePath(); ctx.fill();
    // 护盾(周期性激活)
    if (z.shield > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var sg = ctx.createRadialGradient(x, cy - size * 0.05, size * 0.3, x, cy - size * 0.05, size * 0.6);
      sg.addColorStop(0, 'rgba(180,100,255,0)'); sg.addColorStop(0.8, 'rgba(180,100,255,0.5)'); sg.addColorStop(1, 'rgba(180,100,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(x, cy - size * 0.05, size * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,140,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, cy - size * 0.05, size * 0.55 + Math.sin(time * 4) * size * 0.02, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // 僵尸身上的元素叠层可视化(冰/火/毒小图标 + 光环)
  function drawZombieElements(ctx, x, cy, size, z, time) {
    var stacks = [];
    if (z.ice > 0) stacks.push({ n: z.ice, c: COLOR.ice });
    if (z.fire > 0) stacks.push({ n: z.fire, c: COLOR.fire });
    if (z.poison > 0) stacks.push({ n: z.poison, c: COLOR.poison });
    if (!stacks.length) return;
    // 漂浮的小圆点表示叠层
    for (var i = 0; i < stacks.length; i++) {
      var s = stacks[i];
      var ox = x - size * 0.20 + i * size * 0.18;
      var oy = cy - size * 0.56 + Math.sin(time * 3 + i) * 3;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(s.c, 0.7);
      ctx.beginPath(); ctx.arc(ox, oy, size * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 叠层数字
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Rajdhani, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.n, ox, oy);
    }
  }

  // ============================================================
  // Engine · 阳光 / 豌豆自绘
  // ============================================================
  function drawSun(ctx, s, t) {
    var pulse = 1 + Math.sin(t * 0.18 + s.phase) * 0.08;
    var r = 20 * pulse;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2.2);
    glow.addColorStop(0, 'rgba(255,216,77,0.6)'); glow.addColorStop(1, 'rgba(255,216,77,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(t * 0.5 + s.phase);
    ctx.strokeStyle = 'rgba(255,216,77,0.8)'; ctx.lineWidth = 2;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      ctx.stroke();
    }
    ctx.restore();
    var core = ctx.createRadialGradient(s.x - 4, s.y - 4, 0, s.x, s.y, r);
    core.addColorStop(0, COLOR.sunCore); core.addColorStop(0.6, COLOR.sun); core.addColorStop(1, '#e08a00');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawPea(ctx, p) {
    var col = p.color || '#7cff7c';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
    glow.addColorStop(0, withAlpha(col, 0.5)); glow.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = withAlpha(col, 0.4); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    var grd = ctx.createRadialGradient(p.x - 2, p.y - 2, 0, p.x, p.y, 6);
    grd.addColorStop(0, lighten(col)); grd.addColorStop(1, darken(col));
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
  }
  function lighten(hex) { return hex; }   // 简化:渐变用原色族
  function darken(hex) { return hex; }

  // ============================================================
  // Particles
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
          color: opt.color || '#7cff7c',
          gravity: opt.gravity != null ? opt.gravity : 200,
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
  function withAlpha(hex, a) {
    if (hex.charAt(0) === '#' && hex.length === 7) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    return hex;
  }

  // ============================================================
  // Input · 支持 down/move/up 三阶段 + wheel(商店横向滚动)
  //   handler(pos, phase, extra)  phase: 'down'|'move'|'up'|'esc', extra: {wheel}
  // ============================================================
  function makeInput(canvas, W, H, handler) {
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var cx, cy;
      if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      else { cx = e.clientX; cy = e.clientY; }
      return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
    }
    function onDown(e) { e.preventDefault(); handler(pos(e), 'down'); }
    function onMove(e) { handler(pos(e), 'move'); }
    function onUp(e) { handler(pos(e) || { x: -999, y: -999 }, 'up'); }
    function onWheel(e) { e.preventDefault(); handler(null, 'wheel', { dx: e.deltaX || e.deltaY }); }
    function onKey(e) { if (e.key === 'Escape') handler(null, 'esc'); }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); handler(pos(e), 'move'); }, { passive: false });
    canvas.addEventListener('touchend', function () { handler({ x: -999, y: -999 }, 'up'); });
    window.addEventListener('keydown', onKey);
    return function destroy() {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }

  // ============================================================
  // Audio · WebAudio 合成
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
      gain.gain.setValueAtTime(opt.vol || 0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + opt.dur);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(); osc.stop(ac.currentTime + opt.dur);
    }
    return {
      shoot: function () { tone({ freq: 680, sweep: 380, dur: 0.08, type: 'square', vol: 0.08 }); },
      hit: function () { tone({ freq: 220, sweep: 120, dur: 0.06, type: 'triangle', vol: 0.10 }); },
      sun: function () { tone({ freq: 880, sweep: 1320, dur: 0.15, type: 'sine', vol: 0.12 }); },
      plant: function () { tone({ freq: 440, sweep: 660, dur: 0.12, type: 'sine', vol: 0.10 }); },
      zombieHit: function () { tone({ freq: 180, sweep: 80, dur: 0.10, type: 'sawtooth', vol: 0.08 }); },
      ice: function () { tone({ freq: 1200, sweep: 600, dur: 0.15, type: 'sine', vol: 0.08 }); },
      fire: function () { tone({ freq: 300, sweep: 80, dur: 0.20, type: 'sawtooth', vol: 0.10 }); },
      electric: function () { tone({ freq: 1500, sweep: 400, dur: 0.10, type: 'square', vol: 0.08 }); },
      bomb: function () { tone({ freq: 120, sweep: 40, dur: 0.40, type: 'sawtooth', vol: 0.18 }); },
      boss: function () { tone({ freq: 80, sweep: 200, dur: 0.5, type: 'sawtooth', vol: 0.15 }); },
      win: function () {
        tone({ freq: 523, dur: 0.15, type: 'sine', vol: 0.15 });
        setTimeout(function () { tone({ freq: 659, dur: 0.15, type: 'sine', vol: 0.15 }); }, 120);
        setTimeout(function () { tone({ freq: 784, dur: 0.25, type: 'sine', vol: 0.15 }); }, 240);
      },
      lose: function () { tone({ freq: 300, sweep: 100, dur: 0.4, type: 'sawtooth', vol: 0.15 }); }
    };
  }

  // ============================================================
  // Game · init
  // ============================================================
  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var COL_W = Math.floor((W - 80) / COLS);
    var CELL = COL_W;
    var FIELD_LEFT = 80;
    var FIELD_W = COL_W * COLS;
    var FIELD_H = H - FIELD_TOP - 16;
    var ROW_H = Math.floor(FIELD_H / ROWS);
    FIELD_H = ROW_H * ROWS;

    var state = {
      sun: 75, score: 0, level: 1, wave: 0, waveTotal: WAVES_PER_LEVEL,
      running: false, paused: false, over: false, won: false,
      frame: 0, time: 0, diff: 'normal',
      plants: [], zombies: [], bullets: [], suns: [], effects: [],
      particles: makeParticles(),
      shopCD: {}, selected: null, hoverCell: null,
      waveTimer: 8, zombiesToSpawn: 0, spawnTimer: 0, spawnQueue: [],
      toasts: [], shake: 0,
      skyTimer: rand(6, 10),
      levelStartFlash: 0, waveBanner: 0, waveBannerText: '',
      bossActive: false, bossDef: null,
      autoSun: false           // 自动收取阳光手动开关(默认关)
    };

    var audio = makeAudio();
    var destroyInput = null;

    function cellCenter(col, row) { return { x: FIELD_LEFT + col * COL_W + COL_W / 2, y: FIELD_TOP + row * ROW_H + ROW_H / 2 }; }
    function pickCell(x, y) {
      if (x < FIELD_LEFT || x > FIELD_LEFT + FIELD_W) return null;
      if (y < FIELD_TOP || y > FIELD_TOP + FIELD_H) return null;
      return { col: Math.floor((x - FIELD_LEFT) / COL_W), row: Math.floor((y - FIELD_TOP) / ROW_H) };
    }
    function plantAt(col, row) {
      for (var i = 0; i < state.plants.length; i++) if (state.plants[i].col === col && state.plants[i].row === row) return state.plants[i];
      return null;
    }
    function emitScore() { hooks.onScore && hooks.onScore(state.score, state.level); }
    function emitState(s) { hooks.onState && hooks.onState(s); }
    function toast(text, kind) { state.toasts.push({ text: text, kind: kind || 'info', life: 2.2, max: 2.2 }); }

    // ---- 阳光 ----
    function spawnSky() {
      state.suns.push({ x: rand(FIELD_LEFT + 40, FIELD_LEFT + FIELD_W - 40), y: -20, tx: rand(FIELD_LEFT + 40, FIELD_LEFT + FIELD_W - 40), ty: rand(FIELD_TOP + 40, FIELD_TOP + FIELD_H - 40), vy: 0.6, phase: Math.random() * 6, fromSky: true, life: 12 });
    }
    function spawnFromSunflower(p) {
      state.suns.push({ x: p.x + rand(-10, 10), y: p.y, tx: p.x + rand(-30, 30), ty: p.y + rand(-10, 10), vx: rand(-30, 30), vy: -60, phase: Math.random() * 6, fromSky: false, life: 10 });
    }
    function tryCollectSun(x, y) {
      for (var i = state.suns.length - 1; i >= 0; i--) {
        var s = state.suns[i];
        if (dist2(x, y, s.x, s.y) < 28 * 28) {
          state.sun += 25;
          state.particles.spawn(s.x, s.y, { n: 10, color: COLOR.sun, life: 0.5, sizeMin: 2, sizeMax: 4 });
          state.suns.splice(i, 1);
          audio.sun();
          return true;
        }
      }
      return false;
    }

    // ---- 商店 / 放置 ----
    // 商店:单行平铺,卡片宽度自适应 canvas 宽度(不写死,不滚动)
    var SHOP_AREA_X = 10, SHOP_AREA_Y = 12, SHOP_AREA_H = 66;
    var SHOP_SUN_W = 96;                // 阳光面板宽度
    // 右侧功能区:阳光面板 + 波次信息 + 铲子/自动收阳光按钮(统一预留)
    var RIGHT_PANEL_X = W - 300;        // 右侧功能区起点(阳光面板左边界)
    var RIGHT_BTN_X = W - 52;           // 右侧按钮区起点
    var downPos = null;
    function shopLayout() {
      var rightLimit = RIGHT_PANEL_X - 10;   // 商店右边界(给右侧功能区让位)
      var avail = rightLimit - SHOP_AREA_X;
      var gap = 6;
      var cw = Math.floor((avail - gap * (SHOP_KEYS.length - 1)) / SHOP_KEYS.length);
      cw = Math.max(58, Math.min(cw, 120));   // 卡宽区间 58~120,避免极端
      return { cw: cw, gap: gap, rightLimit: rightLimit };
    }
    function shopCardRect(key) {
      var i = SHOP_KEYS.indexOf(key);
      var L = shopLayout();
      return { x: SHOP_AREA_X + i * (L.cw + L.gap), y: SHOP_AREA_Y, w: L.cw, h: SHOP_AREA_H };
    }
    function trySelectShop(key, mx, my) {
      var card = shopCardRect(key);
      if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
        var def = PLANTS[key];
        if (state.sun >= def.cost && (state.shopCD[key] || 0) <= 0) state.selected = (state.selected === key) ? null : key;
        return true;
      }
      return false;
    }
    function tryPlace(mx, my) {
      if (!state.selected) return false;
      var cell = pickCell(mx, my);
      if (!cell) return false;
      if (plantAt(cell.col, cell.row)) return false;
      var def = PLANTS[state.selected];
      if (state.sun < def.cost) return false;
      state.sun -= def.cost;
      var c = cellCenter(cell.col, cell.row);
      var p = { type: state.selected, col: cell.col, row: cell.row, x: c.x, y: c.y, hp: def.hp, maxHp: def.hp, t: Math.random() * 6, fireTimer: 0, prodTimer: rand(2, def.interval || 9), hurt: 0, attack: 0, placed: 0 };
      if (def.kind === 'bomb') p.fuse = def.fuse;
      state.plants.push(p);
      state.shopCD[state.selected] = def.recharge;
      state.selected = null;
      state.particles.spawn(c.x, c.y, { n: 12, color: '#7ee06a', life: 0.5, gravity: 100 });
      audio.plant();
      return true;
    }
    // 自动收阳光按钮 + 铲子按钮(右侧按钮区,垂直排两行避免和波次信息挤)
    function autoSunBtnRect() { return { x: RIGHT_BTN_X, y: 12, w: 38, h: 30 }; }
    function shovelBtnRect() { return { x: RIGHT_BTN_X, y: 46, w: 38, h: 30 }; }
    function tryAutoSun(mx, my) {
      var r = autoSunBtnRect();
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        state.autoSun = !state.autoSun;
        toast(state.autoSun ? '自动收取阳光:开' : '自动收取阳光:关', state.autoSun ? 'ok' : 'warn');
        return true;
      }
      return false;
    }
    function tryShovel(mx, my) {
      var sr = shovelBtnRect();
      var sx = sr.x, sy = sr.y, sw = sr.w, sh = sr.h;
      if (mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh) { state.shovelActive = !state.shovelActive; return true; }
      if (state.shovelActive) {
        var cell = pickCell(mx, my);
        if (cell) {
          var p = plantAt(cell.col, cell.row);
          if (p) {
            state.plants.splice(state.plants.indexOf(p), 1);
            state.particles.spawn(p.x, p.y, { n: 10, color: '#a8703a', life: 0.4 });
            state.shovelActive = false;
            return true;
          }
        }
      }
      return false;
    }

    function onHandle(pos, phase, extra) {
      if (phase === 'esc') { state.selected = null; state.shovelActive = false; return; }
      if (phase === 'wheel') return;   // 平铺无需滚动
      if (!pos) return;
      // down/up/move 都按"当前坐标"即时响应(平铺后卡片足够大,点击即可,无需拖动手势)
      if (phase === 'move') { state.hoverCell = pickCell(pos.x, pos.y); return; }
      if (phase !== 'down' && phase !== 'up') return;
      // 点击(仅处理 down 即可,up 不重复;触屏 touchstart=down 已覆盖)
      if (phase === 'down') {
        if (pos.y < HUD_TOP) {
          // 顶部 HUD 区:商店卡片优先,再功能按钮
          for (var i = 0; i < SHOP_KEYS.length; i++) if (trySelectShop(SHOP_KEYS[i], pos.x, pos.y)) return;
          if (tryAutoSun(pos.x, pos.y)) return;
          if (tryShovel(pos.x, pos.y)) return;
          return;
        }
        if (tryAutoSun(pos.x, pos.y)) return;
        if (tryShovel(pos.x, pos.y)) return;
        if (tryCollectSun(pos.x, pos.y)) return;
        tryPlace(pos.x, pos.y);
      }
    }

    // ============================================================
    // 元素反应系统:对僵尸应用元素 / 触发反应
    // ============================================================
    function applyElement(z, elem, dmg) {
      if (elem === 'electric') {
        // 电:即时连锁(跳 3 个最近僵尸)
        audio.electric();
        electricChain(z, dmg);
        return;
      }
      // 冰 + 火共存 → 蒸汽(消耗两端,范围伤害)
      if (elem === 'fire' && z.ice > 0) {
        steamBurst(z);
        z.ice = 0; z.fire = 0;
        return;
      }
      if (elem === 'ice' && z.fire > 0) {
        steamBurst(z);
        z.ice = 0; z.fire = 0;
        return;
      }
      var cfg = ELEMENT_CFG[elem];
      if (!cfg) return;
      z[elem] = Math.min((z[elem] || 0) + 1, cfg.max);
      // 达到阈值触发效果
      if (elem === 'ice' && z.ice >= cfg.max) { z.frozen = 3; z.ice = 0; audio.ice(); state.particles.spawn(z.x, z.y - 20, { n: 14, color: COLOR.ice, life: 0.6 }); }
      if (elem === 'fire' && z.fire >= cfg.max) { fireIgnite(z, dmg); z.fire = 0; }
      if (elem === 'poison') { /* 持续掉血在 update 处理 */ z.poisonTimer = 4; }
    }
    // 冰满 → 冻结(applyElement 内处理)
    function fireIgnite(z, baseDmg) {
      // 引燃:立即爆炸范围伤
      audio.fire();
      z.hp -= baseDmg * 3;
      state.particles.spawn(z.x, z.y - 20, { n: 22, color: COLOR.fire, life: 0.7, sizeMin: 3, sizeMax: 6 });
      state.effects.push({ kind: 'ring', x: z.x, y: z.y - 20, r: 10, max: 60, life: 0.4, max0: 0.4, color: COLOR.fire });
      // 范围波及
      for (var i = 0; i < state.zombies.length; i++) {
        var o = state.zombies[i];
        if (o !== z && dist2(o.x, o.y, z.x, z.y) < 70 * 70) { o.hp -= baseDmg; o.hurt = 0.2; }
      }
    }
    function steamBurst(z) {
      // 蒸汽:范围伤 + 减速
      state.particles.spawn(z.x, z.y - 20, { n: 18, color: '#cccccc', life: 0.6, sizeMin: 3, sizeMax: 5 });
      state.effects.push({ kind: 'ring', x: z.x, y: z.y - 20, r: 10, max: 80, life: 0.5, max0: 0.5, color: '#dddddd' });
      for (var i = 0; i < state.zombies.length; i++) {
        var o = state.zombies[i];
        if (dist2(o.x, o.y, z.x, z.y) < 80 * 80) { o.hp -= 2; o.slow = 1.5; o.hurt = 0.2; }
      }
    }
    function electricChain(srcZ, dmg) {
      // 从源僵尸跳到最近的 3 个僵尸
      var hit = [srcZ]; srcZ.hp -= dmg; srcZ.hurt = 0.15;
      var cur = srcZ;
      for (var n = 0; n < 3; n++) {
        var best = null, bestD = 220 * 220;
        for (var i = 0; i < state.zombies.length; i++) {
          var o = state.zombies[i];
          if (hit.indexOf(o) >= 0 || o.hp <= 0) continue;
          var d = dist2(o.x, o.y, cur.x, cur.y);
          if (d < bestD) { bestD = d; best = o; }
        }
        if (!best) break;
        best.hp -= dmg; best.hurt = 0.15;
        state.effects.push({ kind: 'bolt', x1: cur.x, y1: cur.y - 20, x2: best.x, y2: best.y - 20, life: 0.18, max0: 0.18 });
        hit.push(best); cur = best;
      }
      state.effects.push({ kind: 'bolt', x1: srcZ.x, y1: srcZ.y - 20, x2: srcZ.x, y2: srcZ.y - 20, life: 0.18, max0: 0.18 });
    }

    // ============================================================
    // 光环系统:相邻同类增益
    // ============================================================
    function getFireRateMultiplier(p) {
      // 同类 shoot 植物相邻(上下左右)→ 射速 +50%
      if (PLANTS[p.type].kind !== 'shoot') return 1;
      var neighbors = [{ dc: -1, dr: 0 }, { dc: 1, dr: 0 }, { dc: 0, dr: -1 }, { dc: 0, dr: 1 }];
      for (var i = 0; i < neighbors.length; i++) {
        var np = plantAt(p.col + neighbors[i].dc, p.row + neighbors[i].dr);
        if (np && np.type === p.type) return 1.5;
      }
      return 1;
    }

    // ============================================================
    // 波次 / 出怪
    // ============================================================
    function startWave() {
      state.wave++;
      if (state.wave > WAVES_PER_LEVEL) { nextLevel(); return; }
      var count = 3 + state.wave + state.level;
      // Boss 关:第 4 / 8 / 12 关的最后一波出 Boss(Boss hp 逐次翻倍)
      var isBossLevel = (state.level === 4 || state.level === 8 || state.level === 12);
      var isBossWave = isBossLevel && state.wave === WAVES_PER_LEVEL;
      state.zombiesToSpawn = count;
      state.spawnQueue = [];
      // 出怪池随关卡递进解锁更多种类
      var pool = ['normal'];
      if (state.level >= 1) pool.push('cone');
      if (state.level >= 2) pool.push('bucket', 'pole');
      if (state.level >= 3) pool.push('balloon', 'newspaper');
      if (state.level >= 4) pool.push('sled', 'jump');
      if (state.level >= 6) pool.push('screen', 'football');
      if (state.level >= 8) pool.push('miner');
      if (state.level >= 10) pool.push('dancer');
      for (var i = 0; i < count; i++) state.spawnQueue.push(pool[Math.floor(Math.random() * pool.length)]);
      state.spawnTimer = 1.0;
      state.waveBanner = 1.6;
      state.waveBannerText = '第 ' + state.level + ' 章 · 第 ' + state.wave + ' / ' + WAVES_PER_LEVEL + ' 波';
      toast(state.waveBannerText);
      if (isBossWave) {
        // Boss 放最后,且 hp 随次数提升(第4关=1x,第8关=1.6x,第12关=2.4x)
        state.spawnQueue.push('boss');
        state.zombiesToSpawn++;
        state.bossScale = state.level === 4 ? 1 : (state.level === 8 ? 1.6 : 2.4);
        setTimeout(function () {
          state.waveBannerText = '⚠ 僵尸博士出现!(' + (state.bossScale === 1 ? '初代' : state.bossScale === 1.6 ? '强化' : '究极') + ')';
          state.waveBanner = 1.6;
          audio.boss();
          toast('⚠ Boss · 僵尸博士!', 'warn');
        }, 2000);
      }
    }
    function nextLevel() {
      state.level++;
      if (state.level > LEVELS) {
        state.won = true; state.over = true; state.running = false;
        emitState('over'); emitScore();
        hooks.onGameOver && hooks.onGameOver(state.score, state.level);
        audio.win();
        return;
      }
      state.wave = 0;
      state.sun += 50;
      state.waveTimer = 8;
      state.levelStartFlash = 1;
      toast('进入第 ' + state.level + ' 章!+50 阳光', 'ok');
      startWave();
    }
    function spawnZombie(type) {
      var def = ZOMBIES[type];
      var row = Math.floor(Math.random() * ROWS);
      var c = cellCenter(COLS, row);
      // Boss 按 bossScale 强化血量/攻击
      var scale = def.isBoss ? (state.bossScale || 1) : 1;
      var hp = Math.round(def.hp * scale);
      var z = {
        type: type, x: c.x + (def.isBoss ? 20 : 40), y: c.y, row: row,
        hp: hp, maxHp: hp, def: def,
        walkPhase: Math.random() * 6, hurt: 0, eating: false, eatTimer: 0,
        ice: 0, fire: 0, poison: 0, frozen: 0, slow: 0, poisonTimer: 0,
        usedPole: false, angered: false, usedJump: false, jumpAnim: 0,
        shield: def.isBoss ? 4 : 0, shieldTimer: def.isBoss ? 6 : 0,
        spawnTimer: 0, summoned: false
      };
      state.zombies.push(z);
      if (def.isBoss) { state.bossActive = true; state.bossDef = z; state.shake = 0.8; }
    }

    // ============================================================
    // update
    // ============================================================
    function update(dt) {
      state.frame++;
      state.time += dt;
      if (state.shake > 0) state.shake -= dt * 8;
      if (state.levelStartFlash > 0) state.levelStartFlash -= dt;
      if (state.waveBanner > 0) state.waveBanner -= dt;
      for (var i = state.toasts.length - 1; i >= 0; i--) { state.toasts[i].life -= dt; if (state.toasts[i].life <= 0) state.toasts.splice(i, 1); }
      for (var k in state.shopCD) state.shopCD[k] = Math.max(0, state.shopCD[k] - dt);

      // 特效衰减
      for (var i = state.effects.length - 1; i >= 0; i--) {
        var ef = state.effects[i];
        ef.life -= dt;
        if (ef.kind === 'ring') ef.r = lerp(ef.r, ef.max, dt * 6);
        if (ef.life <= 0) state.effects.splice(i, 1);
      }

      state.skyTimer -= dt;
      if (state.skyTimer <= 0) { spawnSky(); state.skyTimer = rand(8, 12); }

      // 阳光
      for (var i = state.suns.length - 1; i >= 0; i--) {
        var s = state.suns[i];
        if (s.fromSky) { if (s.y < s.ty) s.y += 60 * dt * 4; else s.y = s.ty; }
        else { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * dt; if (s.y > s.ty + 20) { s.y = s.ty + 20; s.vy = 0; } }
        s.life -= dt;
        if (s.life <= 0) { state.suns.splice(i, 1); continue; }
        // 自动收取:阳光落地(或接近落地)后自动收集
        if (state.autoSun) {
          var settled = s.fromSky ? s.y >= s.ty : s.vy >= 0 && s.y >= s.ty;
          if (settled) {
            state.sun += 25;
            state.particles.spawn(s.x, s.y, { n: 8, color: COLOR.sun, life: 0.4, sizeMin: 2, sizeMax: 3 });
            state.suns.splice(i, 1);
          }
        }
      }

      // 植物逻辑
      for (var i = state.plants.length - 1; i >= 0; i--) {
        var p = state.plants[i];
        p.t += dt; p.placed += dt;
        if (p.hurt > 0) p.hurt -= dt;
        if (p.attack > 0) p.attack -= dt;
        var def = PLANTS[p.type];
        if (def.kind === 'sun') {
          // 光环:相邻向日葵 → 产阳光更快
          var rateMul = getFireRateMultiplier(p) > 1 ? 0.7 : 1;
          p.prodTimer -= dt * rateMul;
          if (p.prodTimer <= 0) { spawnFromSunflower(p); p.prodTimer = def.interval; }
        } else if (def.kind === 'shoot') {
          p.fireTimer -= dt;
          var rateMul2 = getFireRateMultiplier(p);
          // 检查同行前方有僵尸
          var hasZ = false;
          for (var j = 0; j < state.zombies.length; j++) {
            if (state.zombies[j].row === p.row && state.zombies[j].x > p.x) { hasZ = true; break; }
          }
          if (hasZ && p.fireTimer <= 0) {
            var bColor = '#7cff7c';
            if (def.element === 'ice') bColor = COLOR.ice;
            else if (def.element === 'fire') bColor = COLOR.fire;
            else if (def.element === 'poison') bColor = COLOR.poison;
            else if (def.element === 'electric') bColor = COLOR.electric;
            // 双发射手同时发两颗(微错位)
            state.bullets.push({ x: p.x + 18, y: p.y - 6, vx: 380, dmg: def.dmg, row: p.row, life: 3, element: def.element, color: bColor });
            if (def.twin) state.bullets.push({ x: p.x + 18, y: p.y - 2, vx: 380, dmg: def.dmg, row: p.row, life: 3, element: def.element, color: bColor });
            p.fireTimer = def.fire / rateMul2; p.attack = 0.2;
            audio.shoot();
          }
        } else if (def.kind === 'bomb') {
          p.fuse -= dt;
          if (p.fuse <= 0) {
            audio.bomb(); state.shake = 0.7;
            state.particles.spawn(p.x, p.y, { n: 30, color: COLOR.fire, life: 0.8, sizeMin: 3, sizeMax: 7 });
            state.particles.spawn(p.x, p.y, { n: 16, color: '#ffff00', life: 0.6, glow: true });
            if (def.rowBomb) {
              // 火爆辣椒:整行清屏(横向条带特效)
              for (var m = 0; m < state.zombies.length; m++) {
                var oz = state.zombies[m];
                if (oz.row === p.row) { oz.hp -= def.dmg; oz.hurt = 0.3; }
              }
              state.effects.push({ kind: 'rowbeam', y: p.y, life: 0.6, max0: 0.6, color: COLOR.fire });
            } else {
              // 樱桃炸弹:范围圆伤
              state.effects.push({ kind: 'ring', x: p.x, y: p.y, r: 10, max: def.radius, life: 0.5, max0: 0.5, color: COLOR.fire });
              for (var m = 0; m < state.zombies.length; m++) {
                var oz = state.zombies[m];
                if (dist2(oz.x, oz.y, p.x, p.y) < def.radius * def.radius) { oz.hp -= def.dmg; oz.hurt = 0.3; }
              }
            }
            p.hp = 0;
          }
        } else if (def.kind === 'eat') {
          // 食人花:吞噬前方近距离僵尸,然后咀嚼冷却
          p.chewTimer = (p.chewTimer || 0) - dt;
          if (p.chewTimer <= 0) {
            for (var j = 0; j < state.zombies.length; j++) {
              var zt = state.zombies[j];
              if (zt.row === p.row && zt.x > p.x && zt.x - p.x < def.range) {
                zt.hp -= def.dmg; zt.hurt = 0.3; p.attack = 0.4; p.chewTimer = def.chew;
                state.particles.spawn(zt.x, zt.y - 20, { n: 12, color: '#aa3a5a', life: 0.5 });
                audio.zombieHit();
                break;
              }
            }
          }
        } else if (def.kind === 'spike') {
          // 地刺:对踩到它同格的僵尸持续伤害 + 减速
          for (var j = 0; j < state.zombies.length; j++) {
            var zs = state.zombies[j];
            if (zs.row === p.row && Math.abs(zs.x - p.x) < COL_W * 0.6) {
              zs.hp -= def.dmg * dt; zs.slow = Math.max(zs.slow, def.slow);
            }
          }
        }
        if (p.hp <= 0) {
          state.particles.spawn(p.x, p.y, { n: 14, color: '#5a8a3a', life: 0.6 });
          state.plants.splice(i, 1);
        }
      }

      // 子弹
      for (var i = state.bullets.length - 1; i >= 0; i--) {
        var b = state.bullets[i];
        b.x += b.vx * dt; b.life -= dt;
        if (b.x > W + 20 || b.life <= 0) { state.bullets.splice(i, 1); continue; }
        for (var j = 0; j < state.zombies.length; j++) {
          var z = state.zombies[j];
          if (z.row === b.row && Math.abs(z.x - b.x) < 22 && z.hp > 0) {
            // 铁栅门僵尸正面减伤 60%(手持铁门挡在身前)
            var dmgMul = (z.def.special === 'screen' && !z.angered) ? 0.4 : 1;
            z.hp -= b.dmg * dmgMul; z.hurt = 0.15;
            state.particles.spawn(b.x, b.y, { n: 5, color: b.color, life: 0.3, sizeMin: 1, sizeMax: 3 });
            if (b.element) applyElement(z, b.element, b.dmg);
            state.bullets.splice(i, 1);
            audio.hit();
            break;
          }
        }
      }

      // 僵尸
      for (var i = state.zombies.length - 1; i >= 0; i--) {
        var z = state.zombies[i];
        z.walkPhase += dt * (z.eating ? 6 : 3.5);
        if (z.hurt > 0) z.hurt -= dt;
        // 元素衰减 / 效果
        if (z.frozen > 0) z.frozen -= dt;
        if (z.slow > 0) z.slow -= dt;
        if (z.poison > 0) {
          z.poisonTimer -= dt;
          if (z.poisonTimer <= 0) { z.hp -= 0.5 * z.poison; z.poisonTimer = 0.6; state.particles.spawn(z.x, z.y - 10, { n: 3, color: COLOR.poison, life: 0.4, sizeMin: 1, sizeMax: 3 }); }
        }
        // Boss 护盾周期
        if (z.def.isBoss) {
          z.shieldTimer -= dt;
          if (z.shieldTimer <= 0) { z.shield = z.shield > 0 ? 0 : 4; z.shieldTimer = z.shield > 0 ? 5 : 3; }
          if (z.shield > 0) z.shield -= dt * 0; // 计时由 shieldTimer 控制
        }
        // 读报僵尸:血量低于一半激怒(加速)
        if (z.def.special === 'newspaper' && !z.angered && z.hp < z.maxHp / 2) { z.angered = true; z.def = Object.assign({}, z.def, { sp: 0.40, tint: '#aa3a3a' }); toast('读报僵尸被激怒了!'); }
        // 撑杆僵尸:入场冲刺一段距离
        var speedMul = 1;
        if (z.frozen > 0) speedMul = 0;
        else if (z.slow > 0) speedMul = 0.4;
        if (z.def.special === 'pole' && !z.usedPole && z.x > FIELD_LEFT + FIELD_W - 200) { speedMul *= 2.2; if (z.x < FIELD_LEFT + FIELD_W - 250) z.usedPole = true; }
        if (z.def.special === 'sled') speedMul *= 1.3;
        if (z.def.special === 'football') speedMul *= 1.4;   // 橄榄球僵尸高速
        if (z.def.special === 'miner' && !z.tunneled) {
          // 矿工:入场直接钻到左侧(绕后),钻地期间无敌且不显示碰撞
          z.tunneled = true; z.x = FIELD_LEFT + COL_W * 0.5;
          state.particles.spawn(z.x, z.y, { n: 14, color: '#8a6a3a', life: 0.6 });
          toast('矿工僵尸从后方钻出!');
        }
        if (z.angered) speedMul *= 1.6;
        // 舞王僵尸:周期性召唤伴舞(2 个普通僵尸)
        if (z.def.special === 'dancer' && !z.summoned && z.hp < z.maxHp * 0.8) {
          z.summoned = true; z.summonTimer = 6;
          toast('舞王召唤了伴舞!');
        }
        if (z.summonTimer > 0) {
          z.summonTimer -= dt;
          if (z.summonTimer <= 0 && z.hp > 0) {
            // 召唤 2 个普通僵尸在自己附近
            for (var si = 0; si < 2; si++) {
              var nr = clamp(z.row + (si === 0 ? -1 : 1), 0, ROWS - 1);
              var nc = cellCenter(COLS, nr);
              state.zombies.push({
                type: 'normal', x: z.x + 20, y: nc.y, row: nr, hp: 3, maxHp: 3, def: ZOMBIES.normal,
                walkPhase: Math.random() * 6, hurt: 0, eating: false, eatTimer: 0,
                ice: 0, fire: 0, poison: 0, frozen: 0, slow: 0, poisonTimer: 0,
                usedPole: false, angered: false, usedJump: false, jumpAnim: 0,
                shield: 0, shieldTimer: 0, spawnTimer: 0, summoned: false
              });
            }
            z.summonTimer = 8;   // 周期再召
          }
        }

        // 查前方植物
        var target = null;
        for (var j = 0; j < state.plants.length; j++) {
          var pp = state.plants[j];
          if (pp.row === z.row && pp.x > z.x - 40 && pp.x < z.x + 20) { target = pp; break; }
        }
        // 跳跳僵尸:跳过第一个植物
        if (z.def.special === 'jump' && !z.usedJump && target) {
          z.usedJump = true; z.x -= 60; z.jumpAnim = 0.4; target = null;
          state.particles.spawn(z.x + 30, z.y, { n: 8, color: '#cccccc', life: 0.4 });
        }
        if (target) {
          z.eating = true; z.eatTimer -= dt;
          // Boss 攻击带护盾穿透
          if (z.eatTimer <= 0) { target.hp -= z.def.atk; target.hurt = 0.3; z.eatTimer = 0.6; audio.zombieHit(); }
        } else {
          z.eating = false;
          z.x -= z.def.sp * dt * 60 * speedMul;
        }
        if (z.hp <= 0) {
          state.score += z.def.score; emitScore();
          state.particles.spawn(z.x, z.y - 20, { n: 16, color: z.def.tint, life: 0.7, sizeMin: 2, sizeMax: 5 });
          state.particles.spawn(z.x, z.y - 20, { n: 6, color: '#ff3838', life: 0.4, glow: true });
          if (z.def.isBoss) { state.bossActive = false; state.bossDef = null; state.shake = 1.2; toast('击败僵尸博士!+500', 'ok'); }
          state.zombies.splice(i, 1);
          continue;
        }
        if (z.x < FIELD_LEFT - 20) {
          state.over = true; state.running = false; state.won = false;
          emitState('over');
          hooks.onGameOver && hooks.onGameOver(state.score, state.level);
          audio.lose();
          state.shake = 1;
          return;
        }
      }

      // 波次推进
      if (state.zombiesToSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && state.spawnQueue.length) {
          spawnZombie(state.spawnQueue.shift());
          state.zombiesToSpawn--;
          state.spawnTimer = rand(1.2, 2.4) / (state.diff === 'hard' ? 1.4 : state.diff === 'easy' ? 0.7 : 1);
        }
      } else if (state.zombies.length === 0) {
        if (state.waveTimer > 3) state.waveTimer = 3;
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) { state.waveTimer = 15; startWave(); }
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
      drawGrid();
      drawEffectsBelow();
      drawPlants();
      drawZombies();
      drawBullets();
      drawEffectsAbove();
      drawSuns();
      state.particles.draw(ctx);
      drawHUD();
      if (state.waveBanner > 0) drawWaveBanner();
      if (state.levelStartFlash > 0) drawLevelFlash();
      drawHover();
      drawToasts();
      if (state.bossActive && state.bossDef) drawBossHUD();
      ctx.restore();
    }

    function drawBackground() {
      ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, W, H);
      var sky = ctx.createLinearGradient(0, 0, 0, FIELD_TOP);
      sky.addColorStop(0, '#0a1428'); sky.addColorStop(1, '#0a1f1a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, FIELD_TOP);
      drawHouse();
      for (var r = 0; r < ROWS; r++) {
        var y = FIELD_TOP + r * ROW_H;
        var grd = ctx.createLinearGradient(0, y, 0, y + ROW_H);
        var c1 = r % 2 === 0 ? COLOR.grass1 : COLOR.grass2;
        var c2 = r % 2 === 0 ? COLOR.grassDark : '#152e1c';
        grd.addColorStop(0, c1); grd.addColorStop(1, c2);
        ctx.fillStyle = grd;
        ctx.fillRect(FIELD_LEFT, y, FIELD_W, ROW_H);
      }
      ctx.fillStyle = 'rgba(120,200,90,0.08)'; ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_W, 4);
      ctx.fillStyle = 'rgba(80,160,70,0.5)';
      for (var i = 0; i < 60; i++) { ctx.fillRect(FIELD_LEFT + (i * 137 % FIELD_W), FIELD_TOP + (i * 89 % FIELD_H), 2, 2); }
    }
    function drawHouse() {
      var x = 0, y = FIELD_TOP, w = 76, h = FIELD_H;
      var grd = ctx.createLinearGradient(x, y, x + w, y);
      grd.addColorStop(0, COLOR.houseDark); grd.addColorStop(1, COLOR.house);
      ctx.fillStyle = grd; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COLOR.roof;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.lineTo(w, y - 16); ctx.closePath(); ctx.fill();
      for (var r = 0; r < ROWS; r++) {
        var wy = y + r * ROW_H + ROW_H / 2 - 12;
        var lit = 0.7 + 0.3 * Math.sin(state.time * 0.6 + r);
        ctx.fillStyle = 'rgba(58,90,138,' + lit.toFixed(2) + ')';
        roundRectPath(ctx, 16, wy, 44, 24, 4); ctx.fill();
        ctx.strokeStyle = '#1a2747'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(38, wy); ctx.lineTo(38, wy + 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(16, wy + 12); ctx.lineTo(60, wy + 12); ctx.stroke();
      }
    }
    function drawGrid() {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (var c = 0; c <= COLS; c++) { var x = FIELD_LEFT + c * COL_W; ctx.beginPath(); ctx.moveTo(x, FIELD_TOP); ctx.lineTo(x, FIELD_TOP + FIELD_H); ctx.stroke(); }
      for (var r = 0; r <= ROWS; r++) { var y = FIELD_TOP + r * ROW_H; ctx.beginPath(); ctx.moveTo(FIELD_LEFT, y); ctx.lineTo(FIELD_LEFT + FIELD_W, y); ctx.stroke(); }
    }
    function drawPlants() {
      for (var i = 0; i < state.plants.length; i++) {
        var p = state.plants[i];
        var scale = p.placed < 0.3 ? lerp(0.3, 1, p.placed / 0.3) : 1;
        var size = CELL * 0.62 * scale;
        var hpRatio = p.hp / p.maxHp;
        ctx.save();
        if (p.placed < 0.3) { ctx.translate(p.x, p.y); ctx.scale(scale, scale); ctx.translate(-p.x, -p.y); }
        drawPlantByType(ctx, p.type, p.x, p.y, size, p.t, p.hurt > 0, { attack: p.attack > 0, hpRatio: hpRatio, fuse: PLANTS[p.type].kind === 'bomb' ? (p.fuse / PLANTS[p.type].fuse) : 1 });
        ctx.restore();
        if (hpRatio < 1) {
          var bw = CELL * 0.5, bx = p.x - bw / 2, by = p.y - CELL * 0.42;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, bx - 1, by - 1, bw + 2, 5, 2); ctx.fill();
          ctx.fillStyle = hpRatio > 0.5 ? COLOR.ok : (hpRatio > 0.25 ? COLOR.warn : COLOR.danger);
          roundRectPath(ctx, bx, by, bw * hpRatio, 3, 1.5); ctx.fill();
        }
        // 光环可视化:有增益的植物画一圈青色虚环
        if (PLANTS[p.type].kind === 'shoot' && getFireRateMultiplier(p) > 1) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = withAlpha(COLOR.neon, 0.5); ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.42, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
    }
    function drawZombies() {
      var sorted = state.zombies.slice().sort(function (a, b) { return b.x - a.x; });
      for (var i = 0; i < sorted.length; i++) {
        var z = sorted[i];
        var size = CELL * 0.66 * (z.def.isBoss ? 1.8 : 1);
        // 跳跃动画
        var jumpY = 0;
        if (z.jumpAnim > 0) { z.jumpAnim -= 1 / 60; jumpY = -Math.sin((1 - z.jumpAnim / 0.4) * Math.PI) * 30; }
        ctx.save(); ctx.translate(0, jumpY);
        drawZombieBody(ctx, z.x, z.y, size, state.time, z.def, z, state.time);
        ctx.restore();
        if (z.hp < z.maxHp) {
          var bw = CELL * (z.def.isBoss ? 1.2 : 0.5), bx = z.x - bw / 2, by = z.y - CELL * (z.def.isBoss ? 1.1 : 0.55);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, bx - 1, by - 1, bw + 2, 5, 2); ctx.fill();
          var hr = z.hp / z.maxHp;
          ctx.fillStyle = hr > 0.5 ? COLOR.danger : '#ff6060';
          roundRectPath(ctx, bx, by, bw * hr, 3, 1.5); ctx.fill();
        }
      }
    }
    function drawBullets() { for (var i = 0; i < state.bullets.length; i++) drawPea(ctx, state.bullets[i]); }
    function drawSuns() { for (var i = 0; i < state.suns.length; i++) drawSun(ctx, state.suns[i], state.time); }
    function drawEffectsBelow() {
      for (var i = 0; i < state.effects.length; i++) {
        var ef = state.effects[i];
        if (ef.kind === 'ring') {
          // 范围环
          var alpha = clamp(ef.life / ef.max0, 0, 1);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = withAlpha(ef.color, alpha * 0.8); ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = withAlpha(ef.color, alpha * 0.15);
          ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (ef.kind === 'rowbeam') {
          // 火爆辣椒:整行横向火带
          var alpha2 = clamp(ef.life / ef.max0, 0, 1);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          var bg = ctx.createLinearGradient(0, ef.y - 30, 0, ef.y + 30);
          bg.addColorStop(0, 'rgba(255,120,71,0)'); bg.addColorStop(0.5, withAlpha(COLOR.fire, alpha2 * 0.6)); bg.addColorStop(1, 'rgba(255,120,71,0)');
          ctx.fillStyle = bg;
          ctx.fillRect(0, ef.y - 30, W, 60);
          ctx.restore();
        }
      }
    }
    function drawEffectsAbove() {
      // 电弧(在实体上方)
      for (var i = 0; i < state.effects.length; i++) {
        var ef = state.effects[i];
        if (ef.kind !== 'bolt') continue;
        var alpha = clamp(ef.life / ef.max0, 0, 1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(COLOR.electric, alpha); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(ef.x1, ef.y1);
        // 锯齿
        var segs = 5, dx = (ef.x2 - ef.x1) / segs, dy = (ef.y2 - ef.y1) / segs;
        for (var s = 1; s < segs; s++) ctx.lineTo(ef.x1 + dx * s + rand(-6, 6), ef.y1 + dy * s + rand(-6, 6));
        ctx.lineTo(ef.x2, ef.y2);
        ctx.stroke();
        ctx.restore();
      }
    }
    function drawHover() {
      if (!state.hoverCell || !state.selected) return;
      var c = state.hoverCell;
      if (c.col < 0 || c.col >= COLS || c.row < 0 || c.row >= ROWS) return;
      var cx = FIELD_LEFT + c.col * COL_W, cy = FIELD_TOP + c.row * ROW_H;
      var occupied = plantAt(c.col, c.row);
      ctx.fillStyle = occupied ? 'rgba(255,46,99,0.25)' : 'rgba(46,230,166,0.25)';
      ctx.fillRect(cx, cy, COL_W, ROW_H);
      ctx.strokeStyle = occupied ? COLOR.danger : COLOR.ok; ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, COL_W - 2, ROW_H - 2);
    }

    function drawHUD() {
      ctx.fillStyle = 'rgba(13,19,32,0.85)'; ctx.fillRect(0, 0, W, HUD_TOP);
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, HUD_TOP); ctx.lineTo(W, HUD_TOP); ctx.stroke();

      // 商店:8 张卡片单行平铺,宽度自适应(不滚动)
      var L = shopLayout();
      for (var i = 0; i < SHOP_KEYS.length; i++) {
        var key = SHOP_KEYS[i];
        var def = PLANTS[key];
        var r = shopCardRect(key);
        var affordable = state.sun >= def.cost;
        var cooling = (state.shopCD[key] || 0) > 0;
        var selected = state.selected === key;
        ctx.fillStyle = selected ? 'rgba(0,224,255,0.18)' : 'rgba(20,27,46,0.9)';
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = selected ? COLOR.neon : 'rgba(124,58,237,0.4)'; ctx.lineWidth = selected ? 2 : 1;
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
        // 元素角标
        if (def.element) {
          ctx.fillStyle = ELEMENT_CFG[def.element].color;
          ctx.font = '13px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText(ELEMENT_CFG[def.element].icon, r.x + r.w - 4, r.y + 2);
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 18); ctx.clip();
        drawPlantByType(ctx, key, r.x + r.w / 2, r.y + r.h / 2 + 6, r.w * 0.95, state.time, false, { hpRatio: 1, fuse: 1 });
        ctx.restore();
        if (cooling) { var pct = state.shopCD[key] / def.recharge; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(r.x, r.y, r.w, r.h * pct); }
        if (!affordable || cooling) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill(); }
        ctx.font = 'bold 12px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = affordable ? COLOR.sun : COLOR.text2;
        ctx.fillText(def.cost, r.x + r.w / 2, r.y + r.h - 9);
      }

      // ---- 右侧功能区(阳光面板 + 波次信息 + 按钮区,统一布局避免重叠) ----
      // 阳光面板(RIGHT_PANEL_X 起点)
      var sx = RIGHT_PANEL_X, sy = SHOP_AREA_Y, sw = SHOP_SUN_W, sh = SHOP_AREA_H;
      ctx.fillStyle = 'rgba(13,19,32,0.9)'; roundRectPath(ctx, sx, sy, sw, sh, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,216,77,0.4)'; ctx.lineWidth = 1; roundRectPath(ctx, sx, sy, sw, sh, 10); ctx.stroke();
      drawSun(ctx, { x: sx + 22, y: sy + sh / 2, phase: 0 }, state.time);
      ctx.font = 'bold 22px Orbitron, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR.sun; ctx.shadowColor = 'rgba(255,216,77,0.6)'; ctx.shadowBlur = 8;
      ctx.fillText(state.sun, sx + 46, sy + sh / 2); ctx.shadowBlur = 0;

      // 波次信息(阳光面板右侧 到 按钮区之间)
      var waveX = RIGHT_PANEL_X + SHOP_SUN_W + 12, waveRight = RIGHT_BTN_X - 8;
      var waveW = waveRight - waveX;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = 'bold 14px Rajdhani, sans-serif'; ctx.fillStyle = COLOR.text;
      ctx.fillText('第 ' + state.level + ' / ' + LEVELS + ' 章', waveX, 14);
      ctx.font = '12px Rajdhani, sans-serif'; ctx.fillStyle = COLOR.text2;
      ctx.fillText('第 ' + state.wave + ' / ' + WAVES_PER_LEVEL + ' 波', waveX, 33);
      ctx.fillText('剩余 ' + state.zombies.length, waveX, 49);
      // 波次进度条
      var pw = waveW, px = waveX, py = 67;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRectPath(ctx, px, py, pw, 5, 2.5); ctx.fill();
      var prog = (state.wave - 1 + (1 - state.zombies.length / Math.max(1, state.zombiesToSpawn + state.zombies.length))) / WAVES_PER_LEVEL;
      ctx.fillStyle = COLOR.neon2; roundRectPath(ctx, px, py, pw * clamp(prog, 0, 1), 5, 2.5); ctx.fill();

      // 按钮区:自动收阳光(上行)+ 铲子(下行),垂直排列
      var ar = autoSunBtnRect();
      ctx.fillStyle = state.autoSun ? 'rgba(255,216,77,0.3)' : 'rgba(20,27,46,0.9)';
      roundRectPath(ctx, ar.x, ar.y, ar.w, ar.h, 7); ctx.fill();
      ctx.strokeStyle = state.autoSun ? COLOR.sun : 'rgba(124,58,237,0.4)'; ctx.lineWidth = state.autoSun ? 2 : 1;
      roundRectPath(ctx, ar.x, ar.y, ar.w, ar.h, 7); ctx.stroke();
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = state.autoSun ? COLOR.sun : COLOR.text2;
      ctx.fillText('☀', ar.x + ar.w / 2 - 4, ar.y + ar.h / 2);
      // 开关状态点
      ctx.fillStyle = state.autoSun ? COLOR.ok : COLOR.text3;
      ctx.beginPath(); ctx.arc(ar.x + ar.w - 6, ar.y + ar.h / 2, 3, 0, Math.PI * 2); ctx.fill();

      var sr2 = shovelBtnRect();
      ctx.fillStyle = state.shovelActive ? 'rgba(0,224,255,0.3)' : 'rgba(20,27,46,0.9)';
      roundRectPath(ctx, sr2.x, sr2.y, sr2.w, sr2.h, 7); ctx.fill();
      ctx.strokeStyle = state.shovelActive ? COLOR.neon : 'rgba(124,58,237,0.4)'; ctx.lineWidth = state.shovelActive ? 2 : 1;
      roundRectPath(ctx, sr2.x, sr2.y, sr2.w, sr2.h, 7); ctx.stroke();
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = state.shovelActive ? COLOR.neon : COLOR.text;
      ctx.fillText('🪏', sr2.x + sr2.w / 2, sr2.y + sr2.h / 2);
    }

    function drawBossHUD() {
      // Boss 顶部血条
      var z = state.bossDef;
      var bw = W * 0.5, bx = (W - bw) / 2, by = H - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRectPath(ctx, bx - 2, by - 2, bw + 4, 14, 7); ctx.fill();
      var hr = z.hp / z.maxHp;
      var grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, COLOR.danger); grd.addColorStop(1, COLOR.neon2);
      ctx.fillStyle = grd; roundRectPath(ctx, bx, by, bw * hr, 10, 5); ctx.fill();
      ctx.font = 'bold 13px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff'; ctx.fillText('☠ 僵尸博士', W / 2, by - 4);
    }
    function drawWaveBanner() {
      var alpha = state.waveBanner > 1.2 ? (1.6 - state.waveBanner) / 0.4 : Math.min(1, state.waveBanner / 0.5);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H / 2 - 40, W, 80);
      ctx.font = 'bold 32px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR.neon; ctx.shadowColor = COLOR.neon; ctx.shadowBlur = 16;
      ctx.fillText(state.waveBannerText, W / 2, H / 2);
      ctx.restore();
    }
    function drawLevelFlash() { ctx.save(); ctx.globalAlpha = state.levelStartFlash * 0.3; ctx.fillStyle = COLOR.ok; ctx.fillRect(0, 0, W, H); ctx.restore(); }
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

    // 主循环
    var last = 0, rafId = null;
    function loop(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (state.running && !state.paused && !state.over) update(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function reset() {
      state.sun = 75; state.score = 0; state.level = 1; state.wave = 0;
      state.running = false; state.paused = false; state.over = false; state.won = false;
      state.plants = []; state.zombies = []; state.bullets = []; state.suns = []; state.effects = [];
      state.shopCD = {}; state.selected = null; state.shovelActive = false;
      state.waveTimer = 8; state.zombiesToSpawn = 0; state.spawnQueue = [];
      state.particles.clear(); state.toasts = [];
      state.skyTimer = rand(6, 10);
      state.bossActive = false; state.bossDef = null;
      emitScore(); emitState('playing');
    }
    function start(diff) {
      reset();
      state.diff = diff || 'normal';
      if (state.diff === 'easy') state.sun = 125;
      else if (state.diff === 'hard') state.sun = 50;
      state.running = true;
      state.waveTimer = 4;
      toast('第 1 章 · 准备战斗!', 'ok');
      emitState('playing');
    }
    function pause() { if (state.over) return; state.paused = true; emitState('paused'); }
    function resume() { if (state.over) return; state.paused = false; emitState('playing'); }
    function destroy() { if (rafId) cancelAnimationFrame(rafId); if (destroyInput) destroyInput(); }

    destroyInput = makeInput(canvas, W, H, onHandle);
    reset();
    rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
