/* ========================================================================
   铁幕指挥官 — 原创经典风 RTS · 遵循 window.IanGame 接口契约
   玩法:采矿 → 建造科技树 → 产兵 → 指挥作战 → 摧毁敌方建造厂
   ======================================================================== */
(function () {
  'use strict';

  var NUKE_ENABLED = true; // ★ 核弹开关:false 则科技树不出现核弹发射井

  var MAP_W = 1600, MAP_H = 1000;   // 虚拟地图大小
  var STEP = 1 / 60;                  // 固定逻辑步长

  // ---------- 建筑定义 ----------
  // kind, name, cost矿, power(正=供/负=耗), hp, buildTime秒, sight视野, prereq前置, prod可生产单位kind列表, role
var BUILDINGS = {
  base:       { name: '建造厂',   icon: '🏛️', cost: 0,   power: -10, hp: 2000, build: 0,  sight: 220, prereq: [],               prod: [], side:'core' },
  power:      { name: '发电厂',   icon: '⚡', cost: 200,  power: 80,  hp: 400,  build: 5,  sight: 80,  prereq: ['base'],         prod: [], side:'econ' },
  refinery:   { name: '精炼厂',   icon: '🏭', cost: 400,  power: -20, hp: 600,  build: 8,  sight: 110, prereq: ['base'],         prod: ['harvester'], side:'econ' },
  barracks:   { name: '兵营',     icon: '🪖', cost: 300,  power: -20, hp: 500,  build: 7,  sight: 110, prereq: ['power'],        prod: ['soldier','missile'], side:'mil' },
  warfactory: { name: '战车工厂', icon: '🏗️', cost: 600,  power: -30, hp: 700,  build: 10, sight: 110, prereq: ['power'],        prod: ['tank','artillery'], side:'mil' },
  radar:      { name: '雷达站',   icon: '📡', cost: 500,  power: -30, hp: 450,  build: 9,  sight: 260, prereq: ['barracks'],     prod: [], side:'util' },
  turret:     { name: '炮塔',     icon: '🗼', cost: 350,  power: -25, hp: 500,  build: 6,  sight: 200, prereq: ['barracks'],     prod: [], side:'def', atk:{dmg:18,range:180,cool:0.8} },
  nuclearplant:{name: '核电站',   icon: '⚛️', cost: 1200, power: 300, hp: 600,  build: 14, sight: 120, prereq: ['radar'],        prod: [], side:'econ' },
  lab:        { name: '作战实验室',icon: '🧪', cost: 1000, power: -40, hp: 550,  build: 12, sight: 130, prereq: ['radar'],        prod: [], side:'util' },
  nuke:       { name: '核弹井',   icon: '☢️', cost: 1500, power: -60, hp: 900,  build: 18, sight: 140, prereq: ['radar'],        prod: [], side:'super' },
};
  // ---------- 单位定义 ----------
  // kind, name, cost, hp, speed(像素/秒), sight, builtFrom, role, dmg?, range?, cool?
var UNITS = {
  harvester: { name: '矿车',     icon: '🚛', cost: 300, hp: 300, speed: 70, sight: 90,  from: 'warfactory', role:'mine',  cap: 2, armor:'vehicle' },
  soldier:   { name: '步兵',     icon: '🪖', cost: 100, hp: 80,  speed: 55, sight: 120, from: 'barracks', role:'atk',  dmg:8,  range:70, cool:0.7, target:'inf',     armor:'inf' },
  missile:   { name: '导弹兵',   icon: '🚀', cost: 175, hp: 70,  speed: 50, sight: 130, from: 'barracks', role:'atk',  dmg:22, range:110, cool:1.2, target:'vehicle', armor:'inf', bonus:{vehicle:2.0} },
  tank:      { name: '主战坦克', icon: '🛡️', cost: 500, hp: 280, speed: 60, sight: 150, from: 'warfactory', role:'atk', dmg:30, range:90, cool:1.0, target:'any',     armor:'vehicle', bonus:{inf:1.5} },
  artillery: { name: '火箭车',   icon: '💥', cost: 700, hp: 180, speed: 50, sight: 160, from: 'warfactory', role:'atk', dmg:45, range:220, cool:2.0, target:'any',    armor:'vehicle', bonus:{building:1.5} },
  // —— 高级兵种(需作战实验室)——
  apocalypse:{ name: '天启坦克', icon: '☠️', cost: 900, hp: 500, speed: 45, sight: 140, from: 'warfactory', role:'atk', dmg:45, range:100, cool:1.4, target:'any', armor:'heavy', prereq:['lab'], bonus:{inf:1.8, vehicle:1.3} },
  prism:     { name: '光棱坦克', icon: '💎', cost: 800, hp: 200, speed: 55, sight: 170, from: 'warfactory', role:'atk', dmg:55, range:200, cool:1.8, target:'any', armor:'vehicle', prereq:['lab'], atk:'laser', bonus:{building:1.8} },
  tesla:     { name: '磁暴步兵', icon: '⚡', cost: 400, hp: 120, speed: 50, sight: 130, from: 'barracks', role:'atk', dmg:35, range:90, cool:1.0, target:'inf', armor:'inf', prereq:['lab'], atk:'tesla', bonus:{inf:2.0, heavy:1.5} },
};
// 兵种克制倍率表:bonus[攻击者护甲偏好][目标护甲] = 伤害倍率(默认1.0)
// 已在各单位 bonus 字段内联,这里集中保留默认倍率
var ARMOR_TYPES = ['inf', 'vehicle', 'heavy', 'building'];
// 难度配置:oreP玩家初始矿/oreE敌方初始矿/waveTime进攻波次间隔秒/unitCap敌兵力上限/aiAggro AI积极性倍率
var DIFFICULTY = {
  easy:   { name: '简单', oreP: 2500, oreE: 600,  waveTime: 70, unitCap: 10, aiAggro: 0.5 },
  normal: { name: '普通', oreP: 1500, oreE: 1000, waveTime: 50, unitCap: 14, aiAggro: 1.0 },
  hard:   { name: '困难', oreP: 1000, oreE: 1600, waveTime: 35, unitCap: 20, aiAggro: 1.5 },
};

  var TEAM_COLOR = { player: '#3da9fc', enemy: '#ff4d4d' };
  var MINE_COLOR = '#ffd54a';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var VW = canvas.width, VH = canvas.height;   // 视口 800x500
    var fogCanvas = document.createElement('canvas');
    fogCanvas.width = MAP_W; fogCanvas.height = MAP_H;
    var fogCtx = fogCanvas.getContext('2d');

    // ---------- 状态 ----------
    var cam, view, keys, running, paused, over, won, rafId, last, acc, frame;
    var oreP, oreE, powerP, powerE;            // 双方资源/电力
    var buildings, units, mines, bullets, particles, floatTexts;
    var nukeMissiles;      // 飞行中的核弹 {sx,sy,tx,ty,t,dur,team}
    var shockwaves;        // 冲击波 {x,y,r,maxR,life}
    var camShake;          // 屏幕震动强度
    var selected,             // 选中的单位数组
        buildMode,            // 待放置建筑kind | null
        prodQueue,            // 双方生产队列 {team, from, kind, t, total}
        nukeCharge,           // {player:0..1, enemy:0..1}
        nukeTargeting,        // bool 玩家是否在选核弹落点
        enemyAItimer, enemyAIwave;
    var score, kills;
    // 输入
    var mouse, dragStart, isDragging;
    var lastClick = { t: 0, kind: null, count: 0 };  // 双击/三连击时序检测
    var curDiff = 'normal';  // 当前难度

    function reset() {
      cam = { x: 0, y: 0 };
      panelScroll = 0;
      lastClick = { t: 0, kind: null, count: 0 };
      keys = {};
      var D = DIFFICULTY[curDiff] || DIFFICULTY.normal;
      oreP = D.oreP; oreE = D.oreE; powerP = 0; powerE = 0;
      buildings = []; units = []; bullets = []; particles = []; floatTexts = [];
      nukeMissiles = []; shockwaves = []; camShake = 0;
      mines = []; selected = []; buildMode = null; prodQueue = [];
      nukeCharge = { player: 0, enemy: 0 }; nukeTargeting = false;
      enemyAItimer = D.waveTime * 0.8; enemyAIwave = 0; score = 0; kills = 0;
      over = false; won = false; frame = 0; acc = 0; last = 0;
      initFog();
      // 生成矿脉(地图各处)
      var spots = [[300,300],[1300,700],[800,200],[800,800],[500,750],[1100,250],[250,500],[1350,500]];
      spots.forEach(function (s) { mines.push({ x: s[0], y: s[1], r: 40, amount: 99999 }); });
      // 玩家初始基地(左下)
      addBuilding('base', 'player', 250, 820);
      addBuilding('power', 'player', 360, 820);
      addBuilding('refinery', 'player', 250, 700);
      // 敌方初始基地(右上)
      addBuilding('base', 'enemy', 1350, 180);
      addBuilding('power', 'enemy', 1240, 180);
      addBuilding('refinery', 'enemy', 1350, 300);
      // 各送一辆矿车
      addUnit('harvester', 'player', 320, 760);
      addUnit('harvester', 'enemy', 1280, 240);
      recomputePower('player'); recomputePower('enemy');
      emitScore(); emitState('playing');
    }

    function emitScore() { hooks.onScore && hooks.onScore(score | 0, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function addBuilding(kind, team, x, y) {
      var def = BUILDINGS[kind];
      buildings.push({ kind: kind, team: team, x: x, y: y, hp: def.hp, maxhp: def.hp,
                       t: def.build, building: def.build > 0, prod: def.atk ? 0 : null,
                       rally: null });  // 集结点(兵营/车厂用),默认无
    }
    function addUnit(kind, team, x, y) {
      var def = UNITS[kind];
      var u = { kind: kind, team: team, x: x, y: y, hp: def.hp, maxhp: def.hp, def: def,
                tx: x, ty: y, cmd: 'idle', target: null, cool: 0, cargo: 0,
                miningState: 'toMine', mineTarget: null };
      units.push(u);
      return u;
    }
    function recomputePower(team) {
      var p = 0;
      buildings.filter(function (b) { return b.team === team && !b.building; }).forEach(function (b) {
        p += BUILDINGS[b.kind].power;
      });
      if (team === 'player') powerP = p; else powerE = p;
    }
    function hasBuilding(team, kind) {
      return buildings.some(function (b) { return b.team === team && b.kind === kind && !b.building; });
    }
    function countUnits(team) { return units.filter(function (u) { return u.team === team; }).length; }
    function powerOk(team) { return (team === 'player' ? powerP : powerE) >= 0; }
    function canBuild(team, kind) {
      var def = BUILDINGS[kind];
      if (!def.prereq.every(function (p) { return hasBuilding(team, p); })) return false;
      if (kind === 'nuke' && !NUKE_ENABLED) return false;
      return true;
    }
    function canProduce(team, kind) {
      var def = UNITS[kind];
      if (!hasBuilding(team, def.from)) return false;
      // 兵种前置建筑(如高级兵种需作战实验室)
      if (def.prereq && !def.prereq.every(function (p) { return hasBuilding(team, p); })) return false;
      // 矿车数量受精炼厂限制
      if (kind === 'harvester') {
        var refs = buildings.filter(function (b) { return b.team === team && b.kind === 'refinery' && !b.building; }).length;
        var hvs = units.filter(function (u) { return u.team === team && u.kind === 'harvester'; }).length;
        if (hvs >= refs * 2) return false;
      }
      return true;
    }

    // ---------- 主逻辑 ----------
    function step(dt) {
      frame++;
      // 生产队列推进
      for (var i = prodQueue.length - 1; i >= 0; i--) {
        var q = prodQueue[i];
        var eff = powerOk(q.team) ? 1 : 0.4;   // 缺电减速
        q.t -= dt * eff;
        if (q.t <= 0) {
          // 出生:从队列分配的来源建筑(bid);若该建筑已被毁则 fallback 到同类第一个
          var src = q.bid;
          if (!src || src.hp <= 0 || src.building) {
            src = buildings.filter(function (b) { return b.team === q.team && b.kind === q.from && !b.building; })[0];
          }
          if (src) {
            // 默认部署点:建筑正下方(固定,去随机抖动)
            var ox = src.x, oy = Math.min(MAP_H - 20, src.y + 70);
            var newU = addUnit(q.kind, q.team, ox, oy);
            // 若该建筑设了集结点,新单位出生后自动前往
            if (newU && src.rally) {
              newU.cmd = 'move'; newU.target = null;
              newU.tx = src.rally.x; newU.ty = src.rally.y;
            }
          }
          prodQueue.splice(i, 1);
        }
      }
      // 建筑建造中倒计时
      buildings.forEach(function (b) {
        if (b.building) { b.t -= dt; if (b.t <= 0) {
          b.building = false; recomputePower(b.team);
          // 精炼厂建好附赠一辆矿车(初始经济启动)
          if (b.kind === 'refinery') {
            var cnt = units.filter(function (u) { return u.team === b.team && u.kind === 'harvester'; }).length;
            var refs = buildings.filter(function (bb) { return bb.team === b.team && bb.kind === 'refinery' && !bb.building; }).length;
            if (cnt < refs * 2) addUnit('harvester', b.team, b.x + 40, b.y + 30);
          }
        } }
        // 炮塔开火
        if (b.kind === 'turret' && !b.building) {
          var def = BUILDINGS.turret.atk;
          b.prod = (b.prod || 0) - dt;
          if (b.prod <= 0) {
            var enemy = nearestEnemy(b.x, b.y, b.team, def.range);
            if (enemy) {
              fireBullet(b.x, b.y - 10, enemy, def.dmg, b.team, BUILDINGS.turret.atk);
              b.prod = def.cool;
            }
          }
        }
      });
      // 单位逻辑
      units.forEach(updateUnit);
      // 子弹
      bullets.forEach(function (bl) {
        bl.t -= dt;
        if (bl.target && bl.target.hp > 0) {
          var tx = bl.target.x, ty = bl.target.y - 10;
          var dx = tx - bl.x, dy = ty - bl.y, d = Math.hypot(dx, dy) || 1;
          bl.x += dx / d * 360 * dt; bl.y += dy / d * 360 * dt;
          if (d < 16) {
            var mult = counterMult(bl.atkDef, bl.target);
            var realDmg = Math.round(bl.dmg * mult);
            damage(bl.target, realDmg, bl.team);
            if (mult > 1.2) showFloat(bl.target.x, bl.target.y - 14, Math.round(realDmg) + '!', '#ffd54a');
            bl.dead = true;
            // 攻击特效差异化
            var col = bl.atkDef && bl.atkDef.atk === 'laser' ? '#00e0ff' : bl.atkDef && bl.atkDef.atk === 'tesla' ? '#7cf6ff' : '#ffb627';
            spark(bl.x, bl.y, col, bl.atkDef && bl.atkDef.atk ? 8 : 6);
          }
        } else bl.dead = true;
      });
      bullets = bullets.filter(function (b) { return !b.dead && b.t > 0; });
      // 核弹飞行:推进时间,到达后落地爆炸
      for (var ni = nukeMissiles.length - 1; ni >= 0; ni--) {
        var nm = nukeMissiles[ni];
        nm.t += dt;
        // 飞行拖尾(火焰+烟雾)
        var prog = nm.t / nm.dur;
        // 抛物线位置:起点→高点→落点
        var mx = nm.sx + (nm.tx - nm.sx) * prog;
        var my = nm.sy + (nm.ty - nm.sy) * prog - Math.sin(prog * Math.PI) * 120; // 拱起120px
        if (Math.random() < 0.9) {
          particles.push({ x: mx + (Math.random()-0.5)*4, y: my + (Math.random()-0.5)*4,
            vx: (Math.random()-0.5)*30, vy: 30 + Math.random()*30, life: 0.4 + Math.random()*0.3,
            color: Math.random() < 0.5 ? '#ff4d4d' : '#888', r: 3 + Math.random()*2 });
        }
        if (nm.t >= nm.dur) { nukeImpact(nm.tx, nm.ty, nm.team); nukeMissiles.splice(ni, 1); }
      }
      // 冲击波扩散
      shockwaves.forEach(function (s) { s.r += (s.maxR - s.r) * 0.12; s.life -= dt; });
      shockwaves = shockwaves.filter(function (s) { return s.life > 0; });
      // 震屏衰减
      if (camShake > 0) camShake = Math.max(0, camShake - dt * 40);
      // 粒子
      particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter(function (p) { return p.life > 0; });
      // 粒子上限:超过 500 个时丢弃最旧的,防止堆积卡顿
      if (particles.length > 500) particles.splice(0, particles.length - 500);
      floatTexts.forEach(function (f) { f.y -= 20 * dt; f.life -= dt; });
      floatTexts = floatTexts.filter(function (f) { return f.life > 0; });
      // 单位软碰撞分离
      separateUnits();
      // 战争迷雾(玩家视野)
      updateFog(dt);
      // 核弹充能
      if (hasBuilding('player', 'nuke') && nukeCharge.player < 1) nukeCharge.player = Math.min(1, nukeCharge.player + dt / 90);
      // 敌方 AI
      enemyAI(dt);
      // 相机贴边卷动
      edgePan(dt);
      // 胜负
      if (!hasBuilding('player', 'base')) { endGame(false); }
      else if (!hasBuilding('enemy', 'base')) { endGame(true); }
      // 分数:矿 + 击杀*10
      score = (oreP | 0) + kills * 10;
      if (frame % 30 === 0) emitScore();
    }

    function updateUnit(u) {
      u.cool = Math.max(0, u.cool - STEP);
      if (u.def.role === 'mine') { updateHarvester(u); return; }
      // 战斗单位
      if (u.cmd === 'attack' && u.target) {
        if (u.target.hp <= 0) { u.cmd = 'idle'; u.target = null; return; }
        var d = dist(u, u.target);
        if (d > u.def.range) {
          moveToward(u, u.target.x, u.target.y, STEP);
        } else if (u.cool <= 0) {
          fireBullet(u.x, u.y - 6, u.target, u.def.dmg, u.team, u.def); u.cool = u.def.cool;
        }
        // 自动索敌(若闲置或目标走远,自动打最近敌人)
      } else if (u.cmd === 'move') {
        if (dist(u, { x: u.tx, y: u.ty }) < 6) { u.cmd = 'idle'; }
        else moveToward(u, u.tx, u.ty, STEP);
        // 移动中遇敌自动反击(视野内)
        autoEngage(u);
      } else {
        autoEngage(u);
      }
    }
    function autoEngage(u) {
      if (u.cool > 0) return;
      // 索敌节流:不是每帧都全图扫描,每 0.2 秒扫一次(单位自带 engageCD)
      u.engageCD = (u.engageCD || 0) - STEP;
      var e;
      if (u.engageCD > 0) {
        // 复用上次目标(若还活着且在射程)
        if (u.lastTarget && u.lastTarget.hp > 0 && dist(u, u.lastTarget) < u.def.range) e = u.lastTarget;
        else return;
      } else {
        u.engageCD = 0.25;
        e = nearestEnemy(u.x, u.y, u.team, u.def.sight);
        u.lastTarget = e;
      }
      if (e) {
        if (dist(u, e) > u.def.range) return; // 视野内但射程外,不开火
        fireBullet(u.x, u.y - 6, e, u.def.dmg, u.team, u.def); u.cool = u.def.cool;
      }
    }
    function updateHarvester(u) {
      if (!u.mineTarget) {
        var m = nearestMine(u.x, u.y);
        if (m) { u.mineTarget = m; u.miningState = 'toMine'; }
        else return;
      }
      if (u.miningState === 'toMine') {
        if (dist(u, u.mineTarget) < u.mineTarget.r + 10) {
          u.miningState = 'mining'; u.cargo = 0; u.mineT = 0;
        } else moveToward(u, u.mineTarget.x, u.mineTarget.y, STEP);
      } else if (u.miningState === 'mining') {
        u.mineT += STEP;
        if (u.mineT > 1.5) { u.cargo = 50; u.miningState = 'toBase'; }
      } else { // toBase
        var ref = nearestRefinery(u.x, u.y, u.team);
        if (!ref) { u.miningState = 'toMine'; return; }
        if (dist(u, ref) < 70) {
          if (u.team === 'player') oreP += u.cargo; else oreE += u.cargo;
          u.cargo = 0; u.miningState = 'toMine';
        } else moveToward(u, ref.x, ref.y, STEP);
      }
    }
    function moveToward(u, x, y, dt) {
      var dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
      u.x += dx / d * u.def.speed * dt; u.y += dy / d * u.def.speed * dt;
      u.x = Math.max(8, Math.min(MAP_W - 8, u.x)); u.y = Math.max(8, Math.min(MAP_H - 8, u.y));
    }
    function separateUnits() {
      var us = units, n = us.length;
      var minD = 26, minD2 = minD * minD;
      for (var i = 0; i < n; i++) {
        var a = us[i];
        // 快速剔除:屏幕外的单位不参与分离(可见区内才处理)
        if (a.x < cam.x - 40 || a.x > cam.x + VW + 40 || a.y < cam.y - 40 || a.y > cam.y + VH + 40) continue;
        for (var j = i + 1; j < n; j++) {
          var b = us[j];
          var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= minD2 || d2 === 0) continue; // 平方距离剔除,省开方
          var d = Math.sqrt(d2), push = (minD - d) / 2 * 0.5;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
    function nearestEnemy(x, y, team, range) {
      var best = null, bd = range, bd2 = range * range;
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.team === team || u.hp <= 0) continue;
        var dx = u.x - x, dy = u.y - y, d2 = dx * dx + dy * dy; // 平方距离,省 Math.hypot 开方
        if (d2 < bd2) { bd2 = d2; best = u; }
      }
      for (var j = 0; j < buildings.length; j++) {
        var b = buildings[j];
        if (b.team === team || b.hp <= 0) continue;
        var bx = b.x - x, by = b.y - y, d2b = bx * bx + by * by;
        if (d2b < bd2) { bd2 = d2b; best = b; }
      }
      return best;
    }
    function nearestMine(x, y) {
      var best = null, bd = 1e9;
      mines.forEach(function (m) { var d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } });
      return best;
    }
    // 找最近的己方精炼厂(修复矿车不回最近精炼厂的 bug:原 filter[0] 固定取第一个)
    function nearestRefinery(x, y, team) {
      var best = null, bd = 1e9;
      buildings.forEach(function (b) {
        if (b.team !== team || b.kind !== 'refinery' || b.building) return;
        var d = Math.hypot(b.x - x, b.y - y);
        if (d < bd) { bd = d; best = b; }
      });
      return best;
    }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    // 开火:子弹记录攻击者 def,落地时按克制倍率结算伤害
    function fireBullet(x, y, target, dmg, team, atkDef) {
      bullets.push({ x: x, y: y, target: target, dmg: dmg, team: team, atkDef: atkDef, t: 2.0 });
    }
    // 目标护甲类型(单位读 def.armor,建筑统一 'building')
    function armorOf(obj) {
      if (obj.def) return obj.def.armor || 'inf';
      return 'building';
    }
    // 克制倍率:atkDef.bonus[目标armor] × ,无则 1.0
    function counterMult(atkDef, target) {
      if (!atkDef || !atkDef.bonus) return 1;
      var arm = armorOf(target);
      return atkDef.bonus[arm] || 1;
    }
    function damage(obj, dmg, fromTeam) {
      obj.hp -= dmg;
      if (obj.hp <= 0) {
        obj.hp = 0;
        // 移除
        var idx;
        if ((idx = units.indexOf(obj)) >= 0) {
          units.splice(idx, 1);
          spark(obj.x, obj.y, '#ff4d4d', 16);
          if (fromTeam === 'player') kills++;
        } else if ((idx = buildings.indexOf(obj)) >= 0) {
          buildings.splice(idx, 1);
          spark(obj.x, obj.y, '#ff8800', 30);
          recomputePower(obj.team);
        }
      }
    }
    function spark(x, y, col, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 7, sp = 40 + Math.random() * 120;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color: col, r: 2 + Math.random() * 2 });
      }
    }
    // 浮动文字(伤害数字/暴击提示),向上飘 + 淡出
    function showFloat(x, y, text, col) {
      floatTexts.push({ x: x, y: y, text: text, color: col, life: 0.9 });
    }

    // ---------- 战争迷雾(性能优化版)----------
    // 双层:fogExplored(已探索,永久擦开)+ fogView(当前视野,每帧重建)
    // 旧版每帧对每个实体 createRadialGradient 是性能杀手,改为:
    // 1) 已探索层只在实体移动时增量擦开;2) 视野层用纯实心圆(无渐变)每帧重画
    var fogExplored, fogView;
    function initFog() {
      fogExplored = document.createElement('canvas'); fogExplored.width = MAP_W; fogExplored.height = MAP_H;
      var ec = fogExplored.getContext('2d');
      ec.fillStyle = 'rgba(0,0,0,1)'; ec.fillRect(0, 0, MAP_W, MAP_H);
      fogView = document.createElement('canvas'); fogView.width = MAP_W; fogView.height = MAP_H;
    }
    function updateFog(dt) {
      // 1) 已探索层:增量擦开(只对屏幕内实体,destination-out 实心圆)
      fogCtx._ec = fogCtx._ec || fogExplored.getContext('2d');
      var ec = fogCtx._ec;
      ec.globalCompositeOperation = 'destination-out';
      ec.fillStyle = 'rgba(0,0,0,1)';
      var ents = playerEntsInView();
      ents.forEach(function (e) {
        var def = e.def ? e.def : BUILDINGS[e.kind];
        var s = (def ? def.sight : 100) * 0.8;
        ec.beginPath(); ec.arc(e.x, e.y, s, 0, 7); ec.fill();
      });
      ec.globalCompositeOperation = 'source-over';
      // 2) 视野层:每帧清空重画当前视野(实心圆,无渐变,快)
      var vc = fogView.getContext('2d');
      vc.clearRect(0, 0, MAP_W, MAP_H);
      vc.globalCompositeOperation = 'destination-out';
      vc.fillStyle = 'rgba(0,0,0,1)';
      ents.forEach(function (e) {
        var def = e.def ? e.def : BUILDINGS[e.kind];
        var s = def ? def.sight : 100;
        vc.beginPath(); vc.arc(e.x, e.y, s, 0, 7); vc.fill();
      });
      vc.globalCompositeOperation = 'source-over';
    }
    // 屏幕可见区域内的玩家实体(剔除屏幕外,减少迷雾计算量)
    function playerEntsInView() {
      var res = [];
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.team !== 'player') continue;
        if (u.x < cam.x - 200 || u.x > cam.x + VW + 200 || u.y < cam.y - 200 || u.y > cam.y + VH + 200) continue;
        res.push(u);
      }
      for (var j = 0; j < buildings.length; j++) {
        var b = buildings[j];
        if (b.team !== 'player') continue;
        if (b.x < cam.x - 300 || b.x > cam.x + VW + 300 || b.y < cam.y - 300 || b.y > cam.y + VH + 300) continue;
        res.push(b);
      }
      return res;
    }

    // ---------- 敌方 AI(简单,偏弱) ----------
    function enemyAI(dt) {
      enemyAItimer -= dt;
      // 经济:精炼厂<2 且有钱就造
      if (oreE >= 400 && buildings.filter(function (b) { return b.team === 'enemy' && b.kind === 'refinery'; }).length < 2) {
        tryBuild('enemy', 'refinery');
      }
      if (oreE >= 200 && buildings.filter(function (b) { return b.team === 'enemy' && b.kind === 'power'; }).length < 3) {
        tryBuild('enemy', 'power');
      }
      if (oreE >= 300 && !hasBuilding('enemy', 'barracks')) tryBuild('enemy', 'barracks');
      if (oreE >= 600 && !hasBuilding('enemy', 'warfactory')) tryBuild('enemy', 'warfactory');
      if (oreE >= 350 && !hasBuilding('enemy', 'turret') && hasBuilding('enemy', 'barracks')) tryBuild('enemy', 'turret');
      if (oreE >= 500 && !hasBuilding('enemy', 'radar') && hasBuilding('enemy', 'barracks')) tryBuild('enemy', 'radar');
      // 高级建筑:雷达后造核电站(解电)和作战实验室(解锁高级兵)
      if (oreE >= 1200 && !hasBuilding('enemy', 'nuclearplant') && hasBuilding('enemy', 'radar')) tryBuild('enemy', 'nuclearplant');
      if (oreE >= 1000 && !hasBuilding('enemy', 'lab') && hasBuilding('enemy', 'radar')) tryBuild('enemy', 'lab');
      // 造兵(兵力上限)
      var dCap = (DIFFICULTY[curDiff] || DIFFICULTY.normal).unitCap;
      var dAggro = (DIFFICULTY[curDiff] || DIFFICULTY.normal).aiAggro;
      if (countUnits('enemy') < dCap) {
        // 优先补矿车保经济(矿车从战车工厂生产,数量受精炼厂上限)
        var ehvs = units.filter(function (u) { return u.team === 'enemy' && u.kind === 'harvester'; }).length;
        var erefs = buildings.filter(function (b) { return b.team === 'enemy' && b.kind === 'refinery' && !b.building; }).length;
        if (ehvs < erefs * 2 && hasBuilding('enemy', 'warfactory') && oreE >= 300) tryProduce('enemy', 'harvester');
        // 高级兵种(有作战实验室时优先造,提升威胁)
        else if (hasBuilding('enemy', 'lab') && hasBuilding('enemy', 'warfactory') && oreE >= 900 && Math.random() < 0.4 * dAggro) tryProduce('enemy', 'apocalypse');
        else if (hasBuilding('enemy', 'lab') && hasBuilding('enemy', 'warfactory') && oreE >= 800 && Math.random() < 0.3 * dAggro) tryProduce('enemy', 'prism');
        else if (hasBuilding('enemy', 'lab') && hasBuilding('enemy', 'barracks') && oreE >= 400 && Math.random() < 0.3 * dAggro) tryProduce('enemy', 'tesla');
        else if (hasBuilding('enemy', 'warfactory') && oreE >= 500) tryProduce('enemy', 'tank');
        else if (hasBuilding('enemy', 'barracks') && oreE >= 100) tryProduce('enemy', 'soldier');
      }
      // 进攻波次:每 ~50s 集结所有战斗单位冲玩家基地
      if (enemyAItimer <= 0) {
        enemyAIwave++;
        enemyAItimer = (DIFFICULTY[curDiff] || DIFFICULTY.normal).waveTime;
        var pbase = buildings.filter(function (b) { return b.team === 'player' && b.kind === 'base'; })[0];
        if (pbase) {
          units.filter(function (u) { return u.team === 'enemy' && u.def.role === 'atk'; }).forEach(function (u) {
            u.cmd = 'attack'; u.target = pbase; u.tx = pbase.x; u.ty = pbase.y;
          });
        }
      }
    }
    function tryBuild(team, kind) {
      if (!canBuild(team, kind)) return;
      var cost = BUILDINGS[kind].cost;
      if (team === 'enemy') { if (oreE < cost) return; oreE -= cost; } else { if (oreP < cost) return; oreP -= cost; }
      var base = buildings.filter(function (b) { return b.team === team && b.kind === 'base'; })[0];
      var sign = team === 'player' ? 1 : -1;
      var x = base.x + sign * (100 + Math.random() * 200);
      var y = base.y + (Math.random() * 240 - 120);
      x = Math.max(40, Math.min(MAP_W - 40, x)); y = Math.max(40, Math.min(MAP_H - 40, y));
      addBuilding(kind, team, x, y);
    }
    function tryProduce(team, kind) {
      if (!canProduce(team, kind)) return;
      var cost = UNITS[kind].cost;
      if (team === 'enemy') { if (oreE < cost) return; } else { if (oreP < cost) return; }
      if (!queueProduce(team, kind)) return;
      if (team === 'enemy') oreE -= cost; else oreP -= cost;
    }

    // ---------- 玩家指令 ----------
    // 卖出建筑:返还 50% 矿石,基地不可卖
    function sellBuilding() {
      if (selected.length !== 1 || !selected[0] || !selected[0].kind) return; // 仅建筑(有 kind 无 def)
      var b = selected[0];
      if (b.team !== 'player') return;
      if (b.kind === 'base') { toast('建造厂不可卖出'); return; }
      var refund = Math.floor(BUILDINGS[b.kind].cost * 0.5);
      oreP += refund;
      spark(b.x, b.y, '#ffb627', 24);
      var idx = buildings.indexOf(b);
      if (idx >= 0) buildings.splice(idx, 1);
      recomputePower('player');
      selected = [];
      toast('💰 卖出 ' + BUILDINGS[b.kind].name + ',返还 ' + refund + ' 矿石');
    }
    function cmdBuild(kind) {
      if (!canBuild('player', kind)) { toast('前置建筑未满足'); return; }
      if (oreP < BUILDINGS[kind].cost) { toast('矿石不足'); return; }
      buildMode = kind; nukeTargeting = false;
    }
    // 为生产分配来源建筑:选同类建筑中队列最短的那个(多建筑均衡出兵)
    function assignProducer(team, fromKind) {
      var cands = buildings.filter(function (b) { return b.team === team && b.kind === fromKind && !b.building; });
      if (!cands.length) return null;
      if (cands.length === 1) return cands[0];
      // 按该建筑正在排队的数量排序,取最少的
      var best = cands[0], bestN = 1e9;
      cands.forEach(function (b) {
        var n = prodQueue.filter(function (q) { return q.bid === b; }).length;
        if (n < bestN) { bestN = n; best = b; }
      });
      return best;
    }
    function queueProduce(team, kind) {
      var def = UNITS[kind];
      var src = assignProducer(team, def.from);
      if (!src) return false;
      prodQueue.push({ team: team, bid: src, from: def.from, kind: kind, t: def.cost / 100 * 2 + 1, total: 0 });
      return true;
    }
    function cmdProduce(kind) {
      if (!canProduce('player', kind)) { toast('需要 ' + BUILDINGS[UNITS[kind].from].name); return; }
      if (oreP < UNITS[kind].cost) { toast('矿石不足'); return; }
      if (!queueProduce('player', kind)) { toast('没有可用的生产建筑'); return; }
      oreP -= UNITS[kind].cost;
      toast(UNITS[kind].name + ' 生产中');
    }
    function placeBuilding(wx, wy) {
      var kind = buildMode;
      if (!kind) return;
      // 简单查重叠
      oreP -= BUILDINGS[kind].cost;
      addBuilding(kind, 'player', wx, wy);
      recomputePower('player');
      buildMode = null;
    }
    function commandUnits(wx, wy, isAttack) {
      if (selected.length === 0) return;
      if (isAttack) {
        // 找点击处敌人
        var tgt = pickEntity(wx, wy, 'enemy');
        selected.forEach(function (u) {
          u.cmd = tgt ? 'attack' : 'move'; u.target = tgt;
          u.tx = wx; u.ty = wy;
        });
      } else {
        // 编队散开
        var n = selected.length, cols = Math.ceil(Math.sqrt(n));
        selected.forEach(function (u, i) {
          u.cmd = 'move'; u.target = null;
          u.tx = wx + (i % cols) * 30 - cols * 15; u.ty = wy + Math.floor(i / cols) * 30 - cols * 15;
        });
      }
    }
    function pickEntity(wx, wy, team) {
      for (var i = 0; i < units.length; i++) { var u = units[i]; if ((!team || u.team === team) && Math.hypot(u.x - wx, u.y - wy) < 20) return u; }
      for (var j = 0; j < buildings.length; j++) { var b = buildings[j]; if ((!team || b.team === team) && Math.hypot(b.x - wx, b.y - wy) < 45) return b; }
      return null;
    }
    // 拾取矿脉(用于右键指派矿车)
    function pickMine(wx, wy) {
      for (var i = 0; i < mines.length; i++) { var m = mines[i]; if (Math.hypot(m.x - wx, m.y - wy) < m.r + 8) return m; }
      return null;
    }
    function launchNuke(wx, wy) {
      if (nukeCharge.player < 1) { toast('核弹尚未充能'); return; }
      nukeCharge.player = 0; nukeTargeting = false;
      // 找发射井作为起点
      var silo = buildings.filter(function (b) { return b.team === 'player' && b.kind === 'nuke' && !b.building; })[0];
      var sx = silo ? silo.x : 0, sy = silo ? silo.y - 30 : 0;
      toast('☢️ 核弹发射!');
      // 发射特效:发射井闪光 + 烟雾
      if (silo) { spark(silo.x, silo.y, '#ffd54a', 24); spark(silo.x, silo.y, '#ff4d4d', 16); }
      // 推入飞行核弹(抛物线,1.6秒到达)
      nukeMissiles.push({ sx: sx, sy: sy, tx: wx, ty: wy, t: 0, dur: 1.6, team: 'player' });
    }
    // 核弹落地:范围伤害 + 冲击波 + 蘑菇云 + 震屏
    function nukeImpact(wx, wy, team) {
      var R = 220;
      units.forEach(function (u) { if (Math.hypot(u.x - wx, u.y - wy) < R) damage(u, 9999, team); });
      buildings.forEach(function (b) { if (b.team !== team && Math.hypot(b.x - wx, b.y - wy) < R) damage(b, 1500, team); });
      // 冲击波环
      shockwaves.push({ x: wx, y: wy, r: 20, maxR: R * 1.4, life: 0.8 });
      // 蘑菇云:多层粒子(柱状上升 + 四散)
      for (var i = 0; i < 60; i++) {
        var a = -Math.PI/2 + (Math.random() - 0.5) * 0.8; // 向上
        var sp = 60 + Math.random() * 180;
        particles.push({ x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2 + Math.random() * 0.5, color: i % 3 === 0 ? '#ff4d4d' : (i % 3 === 1 ? '#ffd54a' : '#888'), r: 4 + Math.random() * 4 });
      }
      for (var j = 0; j < 40; j++) { // 水平四散
        var a2 = Math.random() * 7, sp2 = 150 + Math.random() * 250;
        particles.push({ x: wx, y: wy, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2, life: 0.8, color: '#ffd54a', r: 3 + Math.random() * 3 });
      }
      camShake = 18;  // 屏幕震动
      showFloat(wx, wy - 30, '☠️ 核爆', '#ff4d4d');
    }

    // ---------- 相机 ----------
    function edgePan(dt) {
      var sp = 480 * dt;
      var m = mouse;
      var pad = 24;
      // 键盘卷动始终生效
      if (keys['w'] || keys['arrowup']) cam.y -= sp;
      if (keys['s'] || keys['arrowdown']) cam.y += sp;
      if (keys['a'] || keys['arrowleft']) cam.x -= sp;
      if (keys['d'] || keys['arrowright']) cam.x += sp;
      // 鼠标贴边卷动:仅在鼠标不在面板/小地图区域时生效(避免操作面板时误卷屏)
      if (m && !inUIArea(m.x, m.y)) {
        if (m.y < pad) cam.y -= sp;
        if (m.y > VH - pad) cam.y += sp;
        if (m.x < pad) cam.x -= sp;
        if (m.x > VW - pad) cam.x += sp;
      }
      cam.x = Math.max(0, Math.min(MAP_W - VW, cam.x));
      cam.y = Math.max(0, Math.min(MAP_H - VH, cam.y));
    }
    // 判断屏幕坐标是否落在 UI 面板/小地图上(这些区域不卷屏、不框选)
    function inUIArea(sx, sy) {
      if (sx >= PANEL_X && sx <= PANEL_X + PANEL_W && sy >= 60 && sy <= VH - 16) return true; // 左侧建造面板
      if (sx >= VW - 172 && sy >= VH - 112) return true;                                        // 右下小地图
      if (sx >= VW - 152 && sy >= VH - 96 && sy <= VH - 56) return true;                        // 核弹按钮
      if (sy <= 52) return true;                                                                 // 顶栏
      return false;
    }
    function screenToWorld(sx, sy) { return { x: sx + cam.x, y: sy + cam.y }; }

    // ---------- 渲染 ----------
    function draw() {
      // 背景
      ctx.fillStyle = '#0a1410'; ctx.fillRect(0, 0, VW, VH);
      ctx.save();
      // 震屏:核弹落地时相机随机抖动
      var shx = 0, shy = 0;
      if (camShake > 0) { shx = (Math.random() - 0.5) * camShake; shy = (Math.random() - 0.5) * camShake; }
      ctx.translate(-cam.x + shx, -cam.y + shy);
      // 地形网格
      drawTerrain();
      // 矿脉
      mines.forEach(drawMine);
      // 雾(双层合成,只画屏幕可见视口,不全图拷贝)
      // 第一层:已探索雾(永久擦开的区域透明,未探索全黑)— 灰雾半透
      ctx.globalAlpha = 0.55;
      ctx.drawImage(fogExplored, cam.x, cam.y, VW, VH, cam.x, cam.y, VW, VH);
      // 第二层:当前视野雾(视野外再叠一层更深的雾)— 完全黑
      ctx.globalAlpha = 0.5;
      ctx.drawImage(fogView, cam.x, cam.y, VW, VH, cam.x, cam.y, VW, VH);
      ctx.globalAlpha = 1;
      // 建筑
      buildings.forEach(drawBuilding);
      // 单位
      units.forEach(drawUnit);
      // 子弹
      bullets.forEach(function (bl) {
        ctx.fillStyle = TEAM_COLOR[bl.team]; ctx.shadowBlur = 8; ctx.shadowColor = TEAM_COLOR[bl.team];
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      });
      // 核弹飞行物(抛物线上的导弹)
      nukeMissiles.forEach(function (nm) {
        var prog = Math.min(1, nm.t / nm.dur);
        var mx = nm.sx + (nm.tx - nm.sx) * prog;
        var my = nm.sy + (nm.ty - nm.sy) * prog - Math.sin(prog * Math.PI) * 120;
        ctx.save(); ctx.translate(mx, my);
        var dx = (nm.tx - nm.sx), dy = (nm.ty - nm.sy) - Math.cos(prog * Math.PI) * 120 * Math.PI;
        ctx.rotate(Math.atan2(dy, dx) + Math.PI/2);
        ctx.shadowBlur = 14; ctx.shadowColor = '#ff4d4d';
        ctx.fillStyle = '#eaf0fb'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
        ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(3, 11); ctx.lineTo(-3, 11); ctx.fill();
        ctx.shadowBlur = 0; ctx.restore();
      });
      // 冲击波环
      shockwaves.forEach(function (s) {
        ctx.globalAlpha = Math.max(0, s.life / 0.8);
        ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.85, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      });
      // 粒子
      particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); });
      ctx.globalAlpha = 1;
      // 浮动文字(伤害数字)
      floatTexts.forEach(function (f) {
        ctx.globalAlpha = Math.min(1, f.life / 0.9); ctx.fillStyle = f.color;
        ctx.font = 'bold 14px Rajdhani, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
      });
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
      // 框选
      if (isDragging && dragStart) {
        var x0 = Math.min(dragStart.x, mouse.x) + cam.x, y0 = Math.min(dragStart.y, mouse.y) + cam.y;
        var x1 = Math.max(dragStart.x, mouse.x) + cam.x, y1 = Math.max(dragStart.y, mouse.y) + cam.y;
        ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = 'rgba(61,169,252,0.1)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      // 放置预览
      if (buildMode && mouse) {
        var w = screenToWorld(mouse.x, mouse.y);
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#3da9fc';
        ctx.fillRect(w.x - 30, w.y - 30, 60, 60); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#3da9fc'; ctx.strokeRect(w.x - 30, w.y - 30, 60, 60);
      }
      // 核弹目标圈 + 范围填充
      if (nukeTargeting && mouse) {
        var nw = screenToWorld(mouse.x, mouse.y);
        ctx.fillStyle = 'rgba(255,77,77,0.12)'; ctx.beginPath(); ctx.arc(nw.x, nw.y, 220, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(nw.x, nw.y, 220, 0, 7); ctx.stroke();
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(nw.x, nw.y, 100, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      ctx.restore();
      // 核弹目标态全屏红罩 + 提示(屏幕坐标层)
      if (nukeTargeting) {
        ctx.fillStyle = 'rgba(255,77,77,0.08)'; ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 22px Rajdhani'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☢️ 点击地图选择核弹落点(右键/ESC 取消)', VW / 2, VH - 40);
        ctx.textBaseline = 'alphabetic';
      }
      // HUD
      drawHUD();
      drawMinimap();
    }
    function drawTerrain() {
      // 视口内画网格
      var x0 = cam.x, y0 = cam.y;
      ctx.strokeStyle = 'rgba(80,140,100,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = Math.floor(x0 / 40) * 40; x < x0 + VW; x += 40) { ctx.moveTo(x, y0); ctx.lineTo(x, y0 + VH); }
      for (var y = Math.floor(y0 / 40) * 40; y < y0 + VH; y += 40) { ctx.moveTo(x0, y); ctx.lineTo(x0 + VW, y); }
      ctx.stroke();
    }
    function drawMine(m) {
      ctx.save(); ctx.translate(m.x, m.y);
      var pulse = 0.7 + 0.3 * Math.sin(frame * 0.05);
      ctx.shadowBlur = 14; ctx.shadowColor = MINE_COLOR;
      ctx.fillStyle = MINE_COLOR; ctx.globalAlpha = pulse;
      for (var i = 0; i < 6; i++) { var a = i / 6 * 7; ctx.beginPath(); ctx.arc(Math.cos(a) * 20, Math.sin(a) * 15, 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.restore();
    }
    function drawBuilding(b) {
      var def = BUILDINGS[b.kind]; var col = TEAM_COLOR[b.team];
      // 视口裁剪
      if (b.x < cam.x - 70 || b.x > cam.x + VW + 70 || b.y < cam.y - 70 || b.y > cam.y + VH + 70) return;
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.building) ctx.globalAlpha = 0.55;
      // —— 3D 伪等距底座:顶面 + 右侧面 + 左侧面(暗→亮层次)——
      var S = 34, H3D = 16; // 底座半径与高度
      // 地面投影阴影
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(2, S + 4, S, S * 0.35, 0, 0, 7); ctx.fill();
      // 左侧面(最暗)
      ctx.fillStyle = shade(col, -0.45);
      poly3D(S, H3D, 'left'); ctx.fill();
      // 右侧面(中暗)
      ctx.fillStyle = shade(col, -0.28);
      poly3D(S, H3D, 'right'); ctx.fill();
      // 顶面(亮) + 阵营色辉光
      ctx.shadowBlur = 12; ctx.shadowColor = col;
      ctx.fillStyle = shade(col, 0.15);
      poly3D(S, H3D, 'top'); ctx.fill();
      ctx.shadowBlur = 0;
      // 顶面内描边(科技感)
      ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 1.5;
      poly3D(S * 0.82, H3D * 0.9, 'top'); ctx.stroke(); ctx.lineWidth = 1;
      // —— 建筑差异化造型(顶面上的结构) ——
      drawBuildingTop(b, col, H3D);
      ctx.restore();
      // 选中态视觉反馈(己方建筑被选中时):四角直角标记 + 旋转光环
      var isSelB = selected.indexOf(b) >= 0;
      if (isSelB && b.team === 'player') {
        ctx.strokeStyle = '#2ee6a6'; ctx.lineWidth = 2;
        var cs = 42 + Math.sin(frame * 0.1) * 2;
        // 四角 L 形标记
        [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function (s) {
          var x = b.x + s[0] * cs, y = b.y + s[1] * cs;
          ctx.beginPath(); ctx.moveTo(x, y - s[1] * 9); ctx.lineTo(x, y); ctx.lineTo(x - s[0] * 9, y); ctx.stroke();
        });
        ctx.lineWidth = 1;
      }
      // 集结点(兵营/车厂设了 rally):旗帜 + 虚线连线
      if (b.rally && (b.kind === 'barracks' || b.kind === 'warfactory')) {
        ctx.strokeStyle = 'rgba(46,230,166,0.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b.x, b.y + 30); ctx.lineTo(b.rally.x, b.rally.y); ctx.stroke();
        ctx.setLineDash([]);
        // 旗帜
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b.rally.x, b.rally.y - 14); ctx.lineTo(b.rally.x, b.rally.y + 2); ctx.stroke();
        ctx.fillStyle = '#2ee6a6';
        ctx.beginPath(); ctx.moveTo(b.rally.x, b.rally.y - 14); ctx.lineTo(b.rally.x + 10, b.rally.y - 11); ctx.lineTo(b.rally.x, b.rally.y - 8); ctx.fill();
        ctx.lineWidth = 1;
      }
      // 血条
      if (b.hp < b.maxhp) drawBar(b.x, b.y - 46, b.hp / b.maxhp, 56);
      // —— 建筑名标签(半透明底条 + 白字)——
      if (!b.building) drawLabel(def.name, b.x, b.y + S + 12, col);
      // 建造进度
      if (b.building) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 32, b.y + S + 2, 64, 6);
        ctx.fillStyle = '#3da9fc'; ctx.fillRect(b.x - 32, b.y + S + 2, 64 * (1 - b.t / def.build), 6);
      }
    }
    // 3D 伪等距多边形:返回一个菱形台的三组面路径(top/left/right)
    function poly3D(S, H, face) {
      ctx.beginPath();
      if (face === 'top') {
        ctx.moveTo(0, -S + H); ctx.lineTo(S, 0 + H); ctx.lineTo(0, S + H); ctx.lineTo(-S, 0 + H);
      } else if (face === 'left') {
        ctx.moveTo(-S, 0 + H); ctx.lineTo(0, S + H); ctx.lineTo(0, S + H + 0); ctx.lineTo(-S, 0 + H + 0);
        ctx.moveTo(-S, 0); ctx.lineTo(0, S); ctx.lineTo(0, S + H); ctx.lineTo(-S, 0 + H);
      } else { // right
        ctx.moveTo(S, 0); ctx.lineTo(0, S); ctx.lineTo(0, S + H); ctx.lineTo(S, 0 + H);
      }
      ctx.closePath();
    }
    // 颜色明暗调节:t>0 变亮,t<0 变暗
    function shade(hex, t) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      if (t >= 0) { r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
      else { r *= (1 + t); g *= (1 + t); b *= (1 + t); }
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    // 每种建筑在顶面上画独特精细结构(让玩家一眼区分)
    function drawBuildingTop(b, col, H) {
      var kind = b.kind;
      var accent = shade(col, 0.6), mid = shade(col, 0.3), dark = shade(col, -0.2);
      if (kind === 'base') {
        // 建造厂:中央高圆顶(多层渐变)+ 四角塔楼 + 顶部飘旗
        ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, H, 11, 0, 7); ctx.fill();
        ctx.fillStyle = shade(col, 0.5); ctx.beginPath(); ctx.arc(0, H - 3, 8, 0, 7); ctx.fill();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, H - 5, 4, 0, 7); ctx.fill();
        // 四角塔楼
        ctx.fillStyle = dark;
        [[-15,-7],[15,-7],[-15,11],[15,11]].forEach(function (p) { ctx.fillRect(p[0] - 2, p[1] + H - 4, 4, 8); });
        // 旗杆 + 飘动的旗
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, H - 5); ctx.lineTo(0, H - 18); ctx.stroke();
        var fw = Math.sin(frame * 0.1) * 2 + 6;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H - 18); ctx.lineTo(fw + 5, H - 15); ctx.lineTo(0, H - 12); ctx.fill();
        ctx.lineWidth = 1;
      } else if (kind === 'power') {
        // 发电厂:三根冷却塔(带圆顶)+ 顶部红灯 + 蒸汽雾
        [-13, 0, 13].forEach(function (dx, i) {
          ctx.fillStyle = mid; ctx.fillRect(dx - 4, H - 16, 8, 16);
          ctx.fillStyle = shade(col, 0.5); ctx.beginPath(); ctx.arc(dx, H - 16, 5, 0, 7); ctx.fill();
          ctx.fillStyle = accent; ctx.fillRect(dx - 1, H - 19, 2, 4);
          // 蒸汽(向上飘动的半透明白)
          var rise = (frame * 0.5 + i * 30) % 40;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.3 - rise / 130) + ')';
          ctx.beginPath(); ctx.arc(dx, H - 22 - rise * 0.3, 3 + rise * 0.05, 0, 7); ctx.fill();
        });
      } else if (kind === 'refinery') {
        // 精炼厂:大烟囱(冒烟)+ 矿石传送带 + 金色矿堆
        ctx.fillStyle = mid; ctx.fillRect(9, H - 22, 11, 22);
        ctx.fillStyle = dark; ctx.fillRect(9, H - 22, 11, 4);
        ctx.fillStyle = '#ff4d4d'; ctx.fillRect(12, H - 20, 5, 2); // 烟囱红条
        // 烟
        var sr = (frame * 0.4) % 30;
        ctx.fillStyle = 'rgba(180,180,180,' + (0.35 - sr / 90) + ')';
        ctx.beginPath(); ctx.arc(14, H - 26 - sr * 0.3, 4 + sr * 0.08, 0, 7); ctx.fill();
        // 传送带
        ctx.fillStyle = '#444'; ctx.fillRect(-18, H - 4, 24, 5);
        ctx.fillStyle = '#666'; for (var bi = 0; bi < 5; bi++) ctx.fillRect(-18 + bi * 5 + (frame % 5), H - 4, 2, 5);
        // 金矿堆
        ctx.fillStyle = MINE_COLOR; ctx.beginPath(); ctx.moveTo(-16, H + 2); ctx.lineTo(-10, H - 6); ctx.lineTo(-4, H + 2); ctx.fill();
        ctx.fillStyle = shade(MINE_COLOR, -0.2); ctx.beginPath(); ctx.moveTo(-10, H - 6); ctx.lineTo(-4, H + 2); ctx.lineTo(-7, H + 2); ctx.fill();
      } else if (kind === 'barracks') {
        // 兵营:尖顶营房 + ★军徽 + 两侧岗亭 + 飘旗 + 门灯脉动
        ctx.fillStyle = mid;
        ctx.beginPath(); ctx.moveTo(-14, H + 4); ctx.lineTo(0, H - 12); ctx.lineTo(14, H + 4); ctx.fill(); // 尖顶
        ctx.fillStyle = dark; ctx.fillRect(-14, H + 2, 28, 4); // 屋檐
        // 军徽
        ctx.fillStyle = accent; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, H - 1);
        // 两侧岗亭
        ctx.fillStyle = dark; ctx.fillRect(-17, H - 4, 4, 10); ctx.fillRect(13, H - 4, 4, 10);
        // 尖顶飘旗(动画)
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 12); ctx.lineTo(0, H - 22); ctx.stroke();
        var bfw = Math.sin(frame * 0.12) * 2 + 5;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H - 22); ctx.lineTo(bfw + 4, H - 19); ctx.lineTo(0, H - 16); ctx.fill();
        // 门灯(脉动)
        var bpulse = 0.5 + 0.5 * Math.sin(frame * 0.15);
        ctx.fillStyle = 'rgba(255,213,74,' + bpulse + ')';
        ctx.fillRect(-2, H + 4, 4, 2);
        ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
      } else if (kind === 'warfactory') {
        // 战车工厂:履带传送带(滚动)+ 中央齿轮(旋转)+ 起重机臂
        ctx.fillStyle = '#333'; ctx.fillRect(-16, H + 0, 32, 5);
        ctx.fillStyle = '#555'; for (var ti = 0; ti < 7; ti++) ctx.fillRect(-16 + ti * 5 + (frame % 5), H + 0, 3, 5);
        // 齿轮(旋转)
        ctx.save(); ctx.translate(0, H - 5); ctx.rotate(frame * 0.04);
        ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
        ctx.fillStyle = accent;
        for (var gi = 0; gi < 8; gi++) { var ga = gi / 8 * 7; ctx.fillRect(Math.cos(ga) * 8 - 1.5, Math.sin(ga) * 8 - 1.5, 3, 3); }
        ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
        ctx.restore();
        // 起重机臂(摆动动画)
        var craneAng = Math.sin(frame * 0.03) * 0.4 - 0.6; // 摆动范围
        ctx.strokeStyle = dark; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-14, H - 8); ctx.lineTo(-14 + Math.cos(craneAng) * 18, H - 8 + Math.sin(craneAng) * 18); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(-14 + Math.cos(craneAng) * 18, H - 8 + Math.sin(craneAng) * 18, 2.5, 0, 7); ctx.fill(); // 吊钩
        ctx.fillRect(-15, H - 10, 3, 4); // 基座
        ctx.lineWidth = 1;
      } else if (kind === 'radar') {
        // 雷达站:抛物面圆顶 + 双旋转扫描线
        ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, H, 14, Math.PI, 7); ctx.fill();
        ctx.fillStyle = shade(col, 0.45); ctx.beginPath(); ctx.arc(0, H, 10, Math.PI, 7); ctx.fill();
        // 扫描扇形
        var ang = frame * 0.06;
        ctx.fillStyle = 'rgba(0,224,255,0.25)';
        ctx.beginPath(); ctx.moveTo(0, H); ctx.arc(0, H, 13, ang - 0.5, ang); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(Math.cos(ang) * 13, H + Math.sin(ang) * 13); ctx.stroke();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, H, 2.5, 0, 7); ctx.fill();
        ctx.lineWidth = 1;
      } else if (kind === 'turret') {
        // 炮塔:基座 + 双联装炮管(指向最近敌人,补上之前漏画的炮管)
        ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, H, 13, 0, 7); ctx.fill();
        ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, H, 10, 0, 7); ctx.fill();
        // 旋转炮管:指向最近敌人
        var tgt = nearestEnemy(b.x, b.y, b.team, 250);
        var ba = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : (frame * 0.02);
        ctx.save(); ctx.translate(0, H); ctx.rotate(ba);
        ctx.fillStyle = '#222'; ctx.fillRect(0, -4, 20, 3); ctx.fillRect(0, 1, 20, 3); // 双联炮管
        ctx.fillStyle = accent; ctx.fillRect(18, -4, 3, 3); ctx.fillRect(18, 1, 3, 3); // 炮口
        ctx.restore();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, H, 5, 0, 7); ctx.fill();
      } else if (kind === 'nuke') {
        // 核弹井:同心圆发射井 + 升降井盖(脉动)+ 红色警告灯
        var pulse = 0.5 + 0.5 * Math.sin(frame * 0.12);
        var lift = (Math.sin(frame * 0.04) + 1) * 3;
        ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, H, 14, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, H, 10, 0, 7); ctx.stroke();
        // 井内深色
        ctx.fillStyle = '#1a0000'; ctx.beginPath(); ctx.arc(0, H, 8, 0, 7); ctx.fill();
        // 升降井盖(导弹头)
        ctx.fillStyle = shade(col, 0.4); ctx.beginPath(); ctx.arc(0, H - lift, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#eaf0fb'; ctx.fillRect(-1, H - lift - 6, 2, 4);
        // 警告灯
        ctx.fillStyle = 'rgba(255,77,77,' + pulse + ')';
        ctx.shadowBlur = 8; ctx.shadowColor = '#ff4d4d';
        ctx.beginPath(); ctx.arc(0, H, 3, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
      } else if (kind === 'nuclearplant') {
        // 核电站:反应堆圆顶 + 冷却塔 + 绿色辐射光环(脉动)+ 蒸汽
        var npulse = 0.4 + 0.4 * Math.sin(frame * 0.08);
        // 辐射光环
        ctx.strokeStyle = 'rgba(46,230,166,' + npulse + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, H, 15 + npulse * 3, 0, 7); ctx.stroke();
        // 中央反应堆圆顶(多层渐变)
        ctx.fillStyle = dark; ctx.fillRect(-8, H - 14, 16, 14);
        ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, H - 14, 8, 0, 7); ctx.fill();
        ctx.fillStyle = shade(col, 0.5); ctx.beginPath(); ctx.arc(0, H - 16, 5, 0, 7); ctx.fill();
        // 辐射符号(黄)
        ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☢', 0, H - 14);
        ctx.textBaseline = 'alphabetic';
        // 两侧冷却塔 + 蒸汽
        [-14, 14].forEach(function (dx, i) {
          ctx.fillStyle = mid; ctx.fillRect(dx - 3, H - 12, 6, 12);
          ctx.fillStyle = shade(col, 0.4); ctx.beginPath(); ctx.arc(dx, H - 12, 4, 0, 7); ctx.fill();
          var rise = (frame * 0.4 + i * 20) % 30;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.25 - rise / 120) + ')';
          ctx.beginPath(); ctx.arc(dx, H - 16 - rise * 0.3, 2.5 + rise * 0.04, 0, 7); ctx.fill();
        });
        ctx.lineWidth = 1;
      } else if (kind === 'lab') {
        // 作战实验室:旋转分子模型 + 蓝色能量场 + 试管
        var lpulse = 0.3 + 0.3 * Math.sin(frame * 0.1);
        // 能量场
        ctx.fillStyle = 'rgba(0,224,255,' + (lpulse * 0.3) + ')'; ctx.beginPath(); ctx.arc(0, H, 14, 0, 7); ctx.fill();
        // 试管/烧瓶基座
        ctx.fillStyle = dark; ctx.fillRect(-10, H - 10, 20, 10);
        // 旋转分子(3球绕中心)
        ctx.save(); ctx.translate(0, H - 8); ctx.rotate(frame * 0.05);
        ctx.fillStyle = '#00e0ff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
        for (var mi = 0; mi < 3; mi++) {
          var ma = mi / 3 * 7;
          ctx.fillStyle = shade('#00e0ff', 0.3); ctx.beginPath(); ctx.arc(Math.cos(ma) * 8, Math.sin(ma) * 8, 3, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(0,224,255,0.4)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ma) * 8, Math.sin(ma) * 8); ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#00e0ff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔬', 0, H - 24);
        ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 1;
      }
    }
    // 名字标签:半透明底条 + 白字
    function drawLabel(text, x, y, col) {
      ctx.font = 'bold 11px Rajdhani, sans-serif';
      var w = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(6,9,18,0.78)';
      roundRect(x - w / 2, y, w, 15, 4); ctx.fill();
      ctx.strokeStyle = col + '88'; roundRect(x - w / 2, y, w, 15, 4); ctx.stroke();
      ctx.fillStyle = '#eaf0fb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 8);
    }
    function drawUnit(u) {
      if (u.x < cam.x - 30 || u.x > cam.x + VW + 30 || u.y < cam.y - 30 || u.y > cam.y + VH + 30) return;
      var col = TEAM_COLOR[u.team]; var isSel = selected.indexOf(u) >= 0;
      ctx.save(); ctx.translate(u.x, u.y);
      // 地面阴影
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 10, 13, 4.5, 0, 0, 7); ctx.fill();
      // 选中圈(地面光环)
      if (isSel) {
        ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 10, 16, 6, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(61,169,252,0.12)'; ctx.beginPath(); ctx.ellipse(0, 10, 16, 6, 0, 0, 7); ctx.fill();
        ctx.lineWidth = 1;
      }
      ctx.shadowBlur = 6; ctx.shadowColor = col;
      var topCol = shade(col, 0.25), sideCol = shade(col, -0.3);
      if (u.def.role === 'mine') {
        // 矿车:3D 货箱
        ctx.fillStyle = sideCol; roundRect(-11, -4, 22, 14, 3); ctx.fill();
        ctx.fillStyle = topCol; roundRect(-11, -10, 22, 8, 3); ctx.fill();
        // 轮子
        ctx.shadowBlur = 0; ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(-7, 8, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(7, 8, 3, 0, 7); ctx.fill();
        if (u.cargo > 0) { ctx.fillStyle = MINE_COLOR; ctx.fillRect(-7, -8, 14, 5); }
      } else if (u.kind === 'tank') {
        // 坦克:履带底 + 炮塔 + 炮管(3D)
        ctx.fillStyle = sideCol; roundRect(-13, -2, 26, 12, 3); ctx.fill(); // 履带
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-14, 6, 28, 3); ctx.fillRect(-14, -3, 28, 2);
        ctx.fillStyle = topCol; ctx.beginPath(); ctx.arc(0, -3, 8, 0, 7); ctx.fill(); // 炮塔
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-2, -16, 4, 13); // 炮管
      } else if (u.kind === 'artillery') {
        // 火箭车:车体 + 多管发射器
        ctx.fillStyle = sideCol; roundRect(-11, -3, 22, 12, 3); ctx.fill();
        ctx.fillStyle = topCol; roundRect(-11, -9, 22, 7, 3); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(6, -8, 16, 3); // 长炮管
        ctx.fillRect(-3, -8, 3, 6); ctx.fillRect(2, -8, 3, 6); // 多管
      } else if (u.kind === 'apocalypse') {
        // 天启坦克:重型履带 + 大车身 + 双管炮塔
        ctx.fillStyle = sideCol; roundRect(-16, -3, 32, 13, 3); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-17, 6, 34, 3); ctx.fillRect(-17, -4, 34, 2); // 履带
        ctx.fillStyle = topCol; ctx.beginPath(); ctx.arc(0, -4, 10, 0, 7); ctx.fill(); // 大炮塔
        ctx.fillStyle = '#0d0d0d'; ctx.fillRect(-5, -18, 3, 14); ctx.fillRect(2, -18, 3, 14); // 双管
        ctx.fillStyle = shade(col, 0.5); ctx.beginPath(); ctx.arc(0, -4, 4, 0, 7); ctx.fill();
      } else if (u.kind === 'prism') {
        // 光棱坦克:细长车身 + 棱镜水晶顶 + 蓝色激光炮管
        ctx.fillStyle = sideCol; roundRect(-12, -2, 24, 12, 3); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-13, 5, 26, 2);
        // 棱镜水晶(闪烁蓝)
        var pshine = 0.6 + 0.4 * Math.sin(frame * 0.15);
        ctx.fillStyle = 'rgba(0,224,255,' + pshine + ')'; ctx.shadowBlur = 10; ctx.shadowColor = '#00e0ff';
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(5, -6); ctx.lineTo(0, -2); ctx.lineTo(-5, -6); ctx.fill();
        ctx.shadowBlur = 6; ctx.shadowColor = col;
        ctx.fillStyle = '#0d0d0d'; ctx.fillRect(-1, -18, 2, 8); // 细激光管
      } else if (u.kind === 'tesla') {
        // 磁暴步兵:身背电击枪 + 周围电弧粒子(蓝色闪电)
        ctx.fillStyle = topCol; ctx.beginPath(); ctx.arc(0, -5, 5, 0, 7); ctx.fill(); // 头
        ctx.fillStyle = sideCol; roundRect(-6, -1, 12, 10, 2); ctx.fill(); // 身(略大)
        // 电击枪(双叉)
        ctx.fillStyle = '#0d0d0d'; ctx.fillRect(-1, -7, 2, 4); ctx.fillRect(-3, -9, 2, 3); ctx.fillRect(1, -9, 2, 3);
        // 电弧特效(随机闪电粒子)
        if (frame % 4 < 2) {
          ctx.strokeStyle = 'rgba(124,246,255,0.8)'; ctx.lineWidth = 1.5;
          for (var ei = 0; ei < 2; ei++) {
            var ea = Math.random() * 7, er = 8 + Math.random() * 6;
            ctx.beginPath(); ctx.moveTo(0, -4);
            ctx.lineTo(Math.cos(ea) * er * 0.5 - 2, -4 + Math.sin(ea) * er * 0.5);
            ctx.lineTo(Math.cos(ea) * er, -4 + Math.sin(ea) * er); ctx.stroke();
          }
          ctx.lineWidth = 1;
        }
      } else {
        // 步兵:圆头身(3D 小人)
        ctx.fillStyle = topCol; ctx.beginPath(); ctx.arc(0, -4, 5, 0, 7); ctx.fill(); // 头
        ctx.fillStyle = sideCol; roundRect(-5, -1, 10, 9, 2); ctx.fill(); // 身
        ctx.fillStyle = shade(col, 0.5); ctx.fillRect(-1, -6, 2, 3); // 枪
      }
      ctx.shadowBlur = 0;
      ctx.restore();
      if (u.hp < u.maxhp) drawBar(u.x, u.y - 18, u.hp / u.maxhp, 26);
      // 选中单位显示名字
      if (isSel) drawLabel(u.def.name, u.x, u.y + 16, col);
    }
    function drawBar(x, y, pct, w) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y, w, 4);
      ctx.fillStyle = pct > 0.5 ? '#2ee6a6' : pct > 0.25 ? '#ffb627' : '#ff4d4d';
      ctx.fillRect(x - w / 2, y, w * pct, 4);
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    // ---------- HUD ----------
    function drawHUD() {
      // 顶栏:矿石/电力/核弹
      ctx.fillStyle = 'rgba(6,9,18,0.85)'; roundRectH(8, 8, VW - 16, 44, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; roundRectH(8, 8, VW - 16, 44, 10); ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.font = 'bold 16px Rajdhani';
      ctx.fillStyle = MINE_COLOR; ctx.textAlign = 'left'; ctx.fillText('💰 ' + (oreP | 0), 20, 30);
      ctx.fillStyle = powerP >= 0 ? '#2ee6a6' : '#ff4d4d'; ctx.fillText('⚡ ' + powerP, 130, 30);
      ctx.fillStyle = '#8b97b3'; ctx.fillText('🎯 击杀 ' + kills, 220, 30);
      if (hasBuilding('player', 'nuke')) {
        ctx.fillStyle = nukeCharge.player >= 1 ? '#ff4d4d' : '#8b97b3';
        ctx.fillText('☢️ ' + Math.floor(nukeCharge.player * 100) + '%', 330, 30);
      }
      // 右侧:卖出按钮(选中可卖建筑时)+ 核弹按钮(有核弹井时)+ 敌方HP
      var rx = VW - 20;
      ctx.fillStyle = '#8b97b3'; ctx.textAlign = 'right';
      ctx.fillText('敌方基地HP ' + (baseHp('enemy') | 0), rx, 30);
      rx -= ctx.measureText('敌方基地HP ' + (baseHp('enemy') | 0)).width + 14;
      // 核弹按钮(顶栏,避开小地图)
      if (hasBuilding('player', 'nuke') && NUKE_ENABLED) {
        var ready = nukeCharge.player >= 1;
        var nbw = 92;
        rx -= nbw;
        ctx.fillStyle = ready ? 'rgba(255,77,77,0.35)' : 'rgba(6,9,18,0.6)';
        roundRectH(rx, 14, nbw, 32, 8); ctx.fill();
        ctx.strokeStyle = ready ? '#ff4d4d' : 'rgba(255,255,255,0.2)'; roundRectH(rx, 14, nbw, 32, 8); ctx.stroke();
        ctx.fillStyle = ready ? '#ff4d4d' : '#8b97b3'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Rajdhani';
        ctx.fillText(nukeTargeting ? '点落点' : (ready ? '☢️ 发射' : '☢️ ' + Math.floor(nukeCharge.player * 100) + '%'), rx + nbw / 2, 30);
        // 记录核弹按钮区域供点击检测
        NUKE_BTN = { x: rx, y: 14, w: nbw, h: 32 };
        rx -= 8;
      } else { NUKE_BTN = null; }
      // 卖出按钮(选中己方可卖建筑时)
      SELL_BTN = null;
      if (selected.length === 1 && selected[0] && selected[0].kind && !selected[0].def &&
          selected[0].team === 'player' && selected[0].kind !== 'base') {
        var sbw = 80; rx -= sbw;
        ctx.fillStyle = 'rgba(255,182,39,0.25)'; roundRectH(rx, 14, sbw, 32, 8); ctx.fill();
        ctx.strokeStyle = '#ffb627'; roundRectH(rx, 14, sbw, 32, 8); ctx.stroke();
        ctx.fillStyle = '#ffd54a'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Rajdhani';
        ctx.fillText('💰 卖出', rx + sbw / 2, 30);
        SELL_BTN = { x: rx, y: 14, w: sbw, h: 32, bid: selected[0] };
      }

      // 左侧建造面板
      drawBuildPanel();
      // 提示
      ctx.fillStyle = '#5a6580'; ctx.textAlign = 'left'; ctx.font = '12px Rajdhani';
      ctx.fillText('左键框选·右键移动/攻击·WASD移视野·双击选同兵种', 12, VH - 14);
    }
    function baseHp(team) {
      var b = buildings.filter(function (x) { return x.team === team && x.kind === 'base'; })[0];
      return b ? b.hp : 0;
    }
    var PANEL_X, PANEL_W, PANEL_ITEMS, panelScroll, panelScrollMax;
    var NUKE_BTN = null, SELL_BTN = null;  // 顶栏按钮区域(每帧由 drawHUD 更新,供 onDown 检测)
    var PANEL_ITEM_H = 40;   // 每项高度(加大,容纳更大图标)
    function drawBuildPanel() {
      // 建造面板:【移到左侧】,避开右下小地图;固定宽度,可滚动
      PANEL_X = 8; PANEL_W = 156;
      var y0 = 60, panelH = VH - y0 - 16;
      // 面板背景
      ctx.fillStyle = 'rgba(6,9,18,0.92)'; roundRectH(PANEL_X, y0, PANEL_W, panelH, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.4)'; ctx.lineWidth = 1.5; roundRectH(PANEL_X, y0, PANEL_W, panelH, 10); ctx.stroke(); ctx.lineWidth = 1;
      // 标题栏
      ctx.fillStyle = 'rgba(124,58,237,0.25)'; roundRectH(PANEL_X, y0, PANEL_W, 26, 10); ctx.fill();
      ctx.fillStyle = '#eaf0fb'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Rajdhani'; ctx.textBaseline = 'middle';
      ctx.fillText('🏗 建造 / ⚔ 单位', PANEL_X + PANEL_W / 2, y0 + 13);
      ctx.textBaseline = 'alphabetic';

      // 收集所有面板项(建筑组 + 单位组,带分组标题)
      var items = [];
      var bkeys = ['power', 'refinery', 'barracks', 'warfactory', 'radar', 'turret', 'nuclearplant', 'lab'].concat(NUKE_ENABLED ? ['nuke'] : []);
      items.push({ divider: '🏗 建筑' });
      bkeys.forEach(function (k) { items.push({ type: 'building', kind: k }); });
      items.push({ divider: '⚔ 单位' });
      ['soldier', 'missile', 'tesla', 'harvester', 'tank', 'artillery', 'apocalypse', 'prism'].forEach(function (k) { items.push({ type: 'unit', kind: k }); });

      // 计算内容总高,裁剪 + 滚动
      var contentTop = y0 + 32;
      var viewportBottom = y0 + panelH - 6;
      var contentH = items.length * PANEL_ITEM_H;
      panelScrollMax = Math.max(0, contentH - (viewportBottom - contentTop));
      if (panelScroll > panelScrollMax) panelScroll = panelScrollMax;
      if (panelScroll < 0) panelScroll = 0;

      PANEL_ITEMS = [];
      // 裁剪到面板内(滚动区域)
      ctx.save();
      ctx.beginPath(); ctx.rect(PANEL_X, contentTop - 4, PANEL_W, viewportBottom - contentTop + 4); ctx.clip();
      items.forEach(function (it, i) {
        var iy = contentTop + i * PANEL_ITEM_H - panelScroll;
        if (iy + PANEL_ITEM_H < contentTop || iy > viewportBottom) return; // 视口外跳过
        if (it.divider) {
          ctx.fillStyle = '#8b97b3'; ctx.font = 'bold 11px Rajdhani'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(it.divider, PANEL_X + 10, iy + 12);
          ctx.textBaseline = 'alphabetic';
        } else {
          var def = it.type === 'building' ? BUILDINGS[it.kind] : UNITS[it.kind];
          var avail = it.type === 'building' ? canBuild('player', it.kind) : canProduce('player', it.kind);
          var afford = oreP >= def.cost;
          drawPanelItem(def, it.type, PANEL_X + 6, iy, PANEL_W - 12, PANEL_ITEM_H - 4, avail, afford);
          PANEL_ITEMS.push({ type: it.type, kind: it.kind, x: PANEL_X + 6, y: iy, w: PANEL_W - 12, h: PANEL_ITEM_H - 4 });
        }
      });
      ctx.restore();
      // 滚动条
      if (panelScrollMax > 0) {
        var barH = (viewportBottom - contentTop) * (viewportBottom - contentTop) / contentH;
        var barY = contentTop + panelScroll * (viewportBottom - contentTop - barH) / panelScrollMax;
        ctx.fillStyle = 'rgba(124,58,237,0.5)'; ctx.fillRect(PANEL_X + PANEL_W - 4, barY, 3, barH);
      }
      // 滚动提示
      if (panelScrollMax > 0) {
        ctx.fillStyle = '#5a6580'; ctx.font = '10px Rajdhani'; ctx.textAlign = 'center';
        ctx.fillText('📜 滚轮滚动', PANEL_X + PANEL_W / 2, y0 + panelH - 4);
      }
    }
    function drawPanelItem(def, type, x, y, w, h, avail, afford) {
      // 卡片底:可用=蓝调,不可用=灰红禁用
      ctx.fillStyle = avail ? 'rgba(61,169,252,0.15)' : 'rgba(90,40,40,0.4)';
      roundRectH(x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = avail ? (afford ? '#3da9fc' : '#ffb627') : 'rgba(255,77,77,0.5)';
      ctx.lineWidth = avail ? 1.5 : 1; roundRectH(x, y, w, h, 8); ctx.stroke(); ctx.lineWidth = 1;

      // 左侧彩色图标方块(建筑=蓝/单位=橙),让 icon 醒目
      var iconBg = type === 'building' ? shade('#3da9fc', -0.35) : shade('#ffb627', -0.3);
      ctx.fillStyle = iconBg; roundRectH(x + 4, y + 4, h - 8, h - 8, 6); ctx.fill();
      // 图标 emoji(大字号,居中)
      ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, x + 4 + (h - 8) / 2, y + h / 2 + 1);
      ctx.textBaseline = 'alphabetic';

      // 右侧:名字 + 价格
      var tx = x + h + 2;
      ctx.fillStyle = avail ? '#eaf0fb' : '#8b97b3'; ctx.font = 'bold 12px Rajdhani'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(def.name, tx, y + 13);
      // 价格 / 状态
      if (!avail) {
        ctx.fillStyle = '#ff4d4d'; ctx.font = '10px Rajdhani'; ctx.fillText('🔒 前置未满足', tx, y + 28);
      } else if (!afford) {
        ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 11px Rajdhani'; ctx.fillText('💰 ' + def.cost + ' (不足)', tx, y + 28);
      } else {
        ctx.fillStyle = MINE_COLOR; ctx.font = 'bold 11px Rajdhani'; ctx.fillText('💰 ' + def.cost, tx, y + 28);
      }
      ctx.textBaseline = 'alphabetic';
    }
    function roundRectH(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    // ---------- 小地图 ----------
    function drawMinimap() {
      var mw = 160, mh = 100, mx = VW - mw - 12, my = VH - mh - 12;
      var sx = mw / MAP_W, sy = mh / MAP_H;
      ctx.fillStyle = 'rgba(6,9,18,0.85)'; roundRectH(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.4)'; roundRectH(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.stroke();
      ctx.fillStyle = '#0a1f14'; ctx.fillRect(mx, my, mw, mh);
      // 矿
      ctx.fillStyle = MINE_COLOR; mines.forEach(function (m) { ctx.fillRect(mx + m.x * sx - 1, my + m.y * sy - 1, 2, 2); });
      // 建筑
      buildings.forEach(function (b) { if (fogVisible(b.x, b.y)) { ctx.fillStyle = TEAM_COLOR[b.team]; ctx.fillRect(mx + b.x * sx - 2, my + b.y * sy - 2, 4, 4); } });
      // 单位(玩家全显示,敌人仅雾内)
      units.forEach(function (u) { if (u.team === 'player' || fogVisible(u.x, u.y)) { ctx.fillStyle = TEAM_COLOR[u.team]; ctx.fillRect(mx + u.x * sx - 1, my + u.y * sy - 1, 2, 2); } });
      // 视口框
      ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 1; ctx.strokeRect(mx + cam.x * sx, my + cam.y * sy, VW * sx, VH * sy); ctx.lineWidth = 1;
    }
    function fogVisible(wx, wy) {
      // 查询雾 alpha:用 getImageData 太慢,简化为玩家视野内有单位/建筑则可见
      var vis = false;
      var ents = units.concat(buildings).filter(function (e) { return e.team === 'player'; });
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i], def = e.def ? e.def : BUILDINGS[e.kind], s = def ? def.sight : 100;
        if (Math.hypot(e.x - wx, e.y - wy) < s) { vis = true; break; }
      }
      return vis;
    }

    function endGame(victory) {
      if (over) return;
      over = true; won = victory;
      if (victory) score += 3000 + Math.max(0, 2000 - (frame * STEP | 0));
      emitScore(); emitState('over');
      hooks.onGameOver && hooks.onGameOver(score | 0, 1);
    }

    // ---------- 输入 ----------
    function onDown(e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      var sx = (e.clientX - r.left) * (VW / r.width), sy = (e.clientY - r.top) * (VH / r.height);
      mouse = { x: sx, y: sy };
      // 核弹目标选择
      if (nukeTargeting) { var w = screenToWorld(sx, sy); launchNuke(w.x, w.y); return; }
      // 卖出按钮(顶栏,选中可卖建筑时)
      if (SELL_BTN && sx >= SELL_BTN.x && sx <= SELL_BTN.x + SELL_BTN.w && sy >= SELL_BTN.y && sy <= SELL_BTN.y + SELL_BTN.h) {
        sellBuilding(); return;
      }
      // 核弹按钮(顶栏,有核弹井时)
      if (NUKE_BTN && sx >= NUKE_BTN.x && sx <= NUKE_BTN.x + NUKE_BTN.w && sy >= NUKE_BTN.y && sy <= NUKE_BTN.y + NUKE_BTN.h) {
        if (nukeCharge.player >= 1) { nukeTargeting = true; toast('点击地图选择核弹落点'); }
        else toast('核弹充能中 ' + Math.floor(nukeCharge.player * 100) + '%');
        return;
      }
      // 点击建造面板(左侧)
      if (PANEL_ITEMS && sx >= PANEL_X && sx <= PANEL_X + PANEL_W) {
        for (var i = 0; i < PANEL_ITEMS.length; i++) {
          var it = PANEL_ITEMS[i];
          if (sx >= it.x && sx <= it.x + it.w && sy >= it.y && sy <= it.y + it.h) {
            if (it.type === 'building') cmdBuild(it.kind); else cmdProduce(it.kind);
            return;
          }
        }
        return; // 点在面板空白区,不触发框选
      }
      // 小地图点击跳转
      if (sx >= VW - 172 && sy >= VH - 112) {
        var mw = 160, mh = 100, mx = VW - mw - 12, my = VH - mh - 12;
        cam.x = (sx - mx) / (mw / MAP_W) - VW / 2; cam.y = (sy - my) / (mh / MAP_H) - VH / 2;
        cam.x = Math.max(0, Math.min(MAP_W - VW, cam.x)); cam.y = Math.max(0, Math.min(MAP_H - VH, cam.y));
        return;
      }
      // 右键 = 指令 或 设集结点
      if (e.button === 2) {
        var w2 = screenToWorld(sx, sy);
        // 若选中了己方兵营/车厂,右键点地 = 设集结点
        if (selected.length === 1 && selected[0] && selected[0].team === 'player' &&
            (selected[0].kind === 'barracks' || selected[0].kind === 'warfactory')) {
          var rb = selected[0];
          rb.rally = { x: w2.x, y: w2.y };
          toast('🚩 ' + BUILDINGS[rb.kind].name + ' 集结点已设置');
          return;
        }
        // 选中含矿车且右键点中矿脉 → 指派矿车去该矿场
        var hasMine = selected.some(function (s) { return s.def && s.def.role === 'mine'; });
        if (hasMine) {
          var mine = pickMine(w2.x, w2.y);
          if (mine) {
            selected.forEach(function (u) {
              if (u.def && u.def.role === 'mine') {
                u.mineTarget = mine; u.miningState = 'toMine'; u.cargo = 0;
              }
            });
            toast('🚛 矿车已指派到该矿场');
            return;
          }
        }
        commandUnits(w2.x, w2.y, !!pickEntity(w2.x, w2.y, 'enemy'));
        return;
      }
      // 左键:建造模式放置
      if (buildMode) { var wp = screenToWorld(sx, sy); placeBuilding(wp.x, wp.y); return; }
      // 左键:开始框选
      dragStart = { x: sx, y: sy }; isDragging = true;
    }
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      mouse = { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (VH / r.height) };
    }
    function onUp(e) {
      if (!isDragging) return;
      isDragging = false;
      var sx = mouse.x, sy = mouse.y;
      var x0 = Math.min(dragStart.x, sx) + cam.x, y0 = Math.min(dragStart.y, sy) + cam.y;
      var x1 = Math.max(dragStart.x, sx) + cam.x, y1 = Math.max(dragStart.y, sy) + cam.y;
      // 框选范围太小 = 单击选一个(含双击/三连击多选同兵种)
      if (x1 - x0 < 6 && y1 - y0 < 6) {
        var ent = pickEntity(x0, y0, 'player');
        if (ent && ent.def) {
          // 点到单位:检测双击/三连击
          var now = Date.now();
          var sameKind = lastClick.kind === ent.kind;
          var inTime = now - lastClick.t < 350;
          if (sameKind && inTime) lastClick.count++; else lastClick.count = 1;
          lastClick.t = now; lastClick.kind = ent.kind;
          if (lastClick.count === 2) {
            // 双击:选屏幕内视野中所有同兵种己方单位(含矿车)
            selected = units.filter(function (u) {
              return u.team === 'player' && u.kind === ent.kind && u.def &&
                     u.x >= cam.x && u.x <= cam.x + VW && u.y >= cam.y && u.y <= cam.y + VH;
            });
          } else if (lastClick.count >= 3) {
            // 三连击:选全地图所有同兵种己方单位(含矿车)
            selected = units.filter(function (u) {
              return u.team === 'player' && u.kind === ent.kind && u.def;
            });
          } else {
            selected = [ent];
          }
        } else {
          selected = ent ? [ent] : [];
          lastClick.count = 0;  // 点空地/建筑重置计数
        }
      } else {
        selected = units.filter(function (u) {
          return u.team === 'player' && u.def && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1;
        });
        // 若没选到战斗单位,尝试选己方建筑
        if (selected.length === 0) {
          var b = buildings.filter(function (bb) { return bb.team === 'player' && bb.x >= x0 && bb.x <= x1 && bb.y >= y0 && bb.y <= y1; });
          if (b.length) selected = [b[0]];
        }
      }
      dragStart = null;
    }
    function onKey(e) {
      var k = e.key.toLowerCase();
      keys[k] = (e.type === 'keydown');
      keys[e.key.toLowerCase()] = (e.type === 'keydown');
      if (e.type === 'keydown') {
        if (k === 'escape') { buildMode = null; nukeTargeting = false; selected = []; }
        if (k === ' ' && hasBuilding('player', 'nuke') && NUKE_ENABLED && nukeCharge.player >= 1) { nukeTargeting = !nukeTargeting; }
        // Delete/Backspace 卖出选中建筑
        if ((k === 'delete' || k === 'backspace') && selected.length === 1) { sellBuilding(); e.preventDefault(); }
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    }
    function onContext(e) { e.preventDefault(); }
    // 鼠标滚轮:在面板区域内滚动建造列表
    function onWheel(e) {
      var r = canvas.getBoundingClientRect();
      var sx = (e.clientX - r.left) * (VW / r.width), sy = (e.clientY - r.top) * (VH / r.height);
      // 鼠标在面板上才滚动(否则不拦截,让页面正常滚)
      if (sx >= PANEL_X && sx <= PANEL_X + PANEL_W && sy >= 60 && sy <= VH - 16) {
        panelScroll += (e.deltaY > 0 ? 1 : -1) * PANEL_ITEM_H;
        panelScroll = Math.max(0, Math.min(panelScrollMax || 0, panelScroll));
        e.preventDefault();
      }
    }
    function onTouch(e, type) {
      var t = e.touches[0] || e.changedTouches[0];
      var r = canvas.getBoundingClientRect();
      var fake = { clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: function () {} };
      if (type === 'down') { onDown(fake); e.preventDefault(); }
      else if (type === 'up') { onUp(fake); }
    }

    function toast(m) { if (window.IanToast) window.IanToast(m); }

    // ---------- 主循环(固定步长)----------
    function loop(ts) {
      if (!last) last = ts;
      var dt = (ts - last) / 1000; last = ts;
      if (dt > 0.1) dt = 0.1; // 钳制
      if (running && !over && !paused) {
        acc += dt;
        var max = 5;
        while (acc >= STEP && max-- > 0) { step(STEP); acc -= STEP; }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }
    function start(diff) { if (diff) curDiff = diff; reset(); running = true; paused = false; last = 0; acc = 0; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { if (over) return; paused = false; emitState('playing'); }
    function destroy() {
      running = false; if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    }

    // 绑定
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    reset();
    running = false; rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: function (diff) { start(diff); }, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
