/* ========================================================================
   符文守卫 RuneGuard — 连连看 × 塔防 同屏实时融合
   遵循 window.IanGame 接口契约。纯 Canvas 矢量/emoji 绘制,无外部资源。
   下半屏连连看棋盘即军火库:每连一对符文,即向战场施放对应武器;
   上半屏怪物沿发光路径进攻法师塔,金币建塔自动防御。
   30 关 5 章节;普通关过关三选一解锁武器(肉鸽式),BOSS 关固定掉落章节终极符文;
   石块/锁定/冰封/魔弹四种棋盘机制渐次登场;三星选关地图 + 武器收藏馆;
   进度与武器库存存 localStorage(ian:rg:progress)。
   难度(壳页选择器):easy/normal/hard → 基地HP 15/12/9、怪HP×0.75/1.0/1.25、hard+8%速度。
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    /* ---------------- 设计令牌(与全站 CSS 变量一致) ---------------- */
    var C = {
      bg: '#0a0714', text: '#eaf0fb', text2: '#8b97b3', text3: '#5a6580',
      purple: '#b537f2', cyan: '#00e0ff', ok: '#2ee6a6', warn: '#ffb627',
      danger: '#ff2e63', gold: '#ffd54a', panel: 'rgba(255,255,255,.03)'
    };

    /* ---------------- 五大章节主题(魔法奇幻) ---------------- */
    var CHAPTERS = [
      { name: '翠绿森林', icon: '🌲', bgTop: '#0a1a12', aura1: 'rgba(46,230,166,.10)', aura2: 'rgba(120,255,170,.06)',
        tileTop: '#1e4d3c', tileBot: '#0f2f24', line: '#2ee6a6', road: '#123324', fx: 'leaf',
        intro: '连成符文对即可施法,金币符文是建塔的经济来源' },
      { name: '幽暗墓穴', icon: '💀', bgTop: '#150a24', aura1: 'rgba(181,55,242,.10)', aura2: 'rgba(90,60,200,.07)',
        tileTop: '#3b2b57', tileBot: '#221738', line: '#b537f2', road: '#241a3a', fx: 'wisp',
        intro: '新机制:石块格 🪨 占据棋盘阻挡连线,规划绕行路线' },
      { name: '熔岩洞窟', icon: '🌋', bgTop: '#241103', aura1: 'rgba(255,120,71,.10)', aura2: 'rgba(255,84,114,.07)',
        tileTop: '#4d3115', tileBot: '#2b1a08', line: '#ff7847', road: '#3a1e0a', fx: 'ember',
        intro: '新机制:锁链符文 🔒 被禁锢,累计消除 3 对后自行解开' },
      { name: '冰霜峰顶', icon: '❄️', bgTop: '#081226', aura1: 'rgba(124,214,255,.10)', aura2: 'rgba(46,160,255,.07)',
        tileTop: '#23405f', tileBot: '#122036', line: '#7cd6ff', road: '#16283f', fx: 'snow',
        intro: '新机制:每波来袭时冰封 2 行符文 5 秒,把握解冻窗口' },
      { name: '魔王城', icon: '👹', bgTop: '#26060f', aura1: 'rgba(255,46,99,.10)', aura2: 'rgba(150,30,80,.08)',
        tileTop: '#55182a', tileBot: '#2e0c18', line: '#ff2e63', road: '#38101d', fx: 'ash',
        intro: '终章:全部机制轮番登场,魔王还会向棋盘投掷魔弹吞噬符文' }
    ];

    /* ---------------- 符文武器表(等级 1/2/3 数值) ---------------- */
    var RUNES = {
      gold:  { icon: '💰', name: '黄金符文', color: '#ffd54a', kind: 'gold',  v: [12, 16, 20],            desc: '获得金币(建造/升级的经济源)' },
      fire:  { icon: '🔥', name: '火球术',   color: '#ff7847', kind: 'proj',  dmg: [26, 40, 58], splash: 52, desc: '火球轰击最前敌人并溅射' },
      ice:   { icon: '❄️', name: '冰霜新星', color: '#7cd6ff', kind: 'nova',  dmg: [8, 12, 18],  slow: 0.42, dur: 3, desc: '全场怪物减速 3 秒' },
      volt:  { icon: '⚡', name: '闪电链',   color: '#ffe14d', kind: 'chain', dmg: [20, 30, 44], jumps: 3,  desc: '闪电劈中最前 3 个敌人' },
      nature:{ icon: '💚', name: '治愈之泉', color: '#2ee6a6', kind: 'heal',  v: [1, 2, 3],                desc: '法师塔恢复 HP' },
      light: { icon: '🌟', name: '圣光裁决', color: '#fff3b0', kind: 'holy',  dmg: [16, 24, 36],           desc: '圣光灼烧全场(无视护甲)' },
      arcane:{ icon: '🌀', name: '奥术传送', color: '#b537f2', kind: 'tp',    dmg: [12, 18, 27],           desc: '最前敌人传送回起点' },
      thorn: { icon: '🌿', name: '荆棘缠绕', color: '#7cffb0', kind: 'dot',   dmg: [60, 90, 135], dur: 4, slow: 0.3, bossRune: 0, desc: '全场怪物减速并持续受创' },
      necro: { icon: '💀', name: '死灵诅咒', color: '#a78bfa', kind: 'dot',   dmg: [90, 135, 200], dur: 5, bossRune: 1, desc: '诅咒全场怪物持续掉血' },
      lava:  { icon: '🌋', name: '熔岩喷发', color: '#ff5470', kind: 'erupt', dmg: [70, 105, 160], r: 80, bossRune: 2, desc: '路径上三处熔岩喷发' },
      zero:  { icon: '🔮', name: '绝对零度', color: '#9be7ff', kind: 'freeze',dmg: [20, 30, 45], dur: [2.2, 2.8, 3.5], bossRune: 3, desc: '全场怪物冻结数秒' },
      meteor:{ icon: '☄️', name: '陨石术',   color: '#ff2e63', kind: 'meteor',dmg: [130, 195, 290], r: 110, bossRune: 4, desc: '陨石轰炸最密集的怪群' }
    };
    var RUNE_KEYS = ['gold', 'fire', 'ice', 'volt', 'nature', 'light', 'arcane',
                     'thorn', 'necro', 'lava', 'zero', 'meteor'];

    /* ---------------- 防御塔表 ---------------- */
    var TOWERS = {
      arrow: { icon: '🏹', name: '奥术箭塔', cost: 60,  up: [70, 120], range: 120, dmg: 10, cd: 0.5, color: '#00e0ff', kind: 'arrow' },
      mage:  { icon: '💠', name: '法师塔',   cost: 110, up: [120, 200], range: 132, dmg: 26, cd: 1.0, color: '#b537f2', kind: 'orb', splash: 48 },
      frost: { icon: '🧊', name: '寒冰塔',   cost: 90,  up: [100, 170], range: 112, dmg: 5,  cd: 0.7, color: '#7cd6ff', kind: 'shard', slow: 0.45, sdur: 1.3 },
      tesla: { icon: '⚡', name: '特斯拉塔', cost: 150, up: [160, 260], range: 126, dmg: 20, cd: 0.9, color: '#ffe14d', kind: 'bolt', chain: 3 },
      quake: { icon: '⛰️', name: '地震塔',   cost: 200, up: [210, 340], range: 96,  dmg: 42, cd: 2.0, color: '#ff8a3c', kind: 'quake', aoe: true }
    };
    var TOWER_KEYS = ['arrow', 'mage', 'frost', 'tesla', 'quake'];
    var TW_MULT = [
      { dmg: 1.00, rng: 1.00 },
      { dmg: 1.90, rng: 1.10 },
      { dmg: 3.10, rng: 1.22 }
    ];

    /* ---------------- 强化遗物表 ---------------- */
    var RELICS = {
      heart: { icon: '❤️', name: '永恒之心', desc: '基地 HP +3/级', v: 3 },
      purse: { icon: '👛', name: '财富金袋', desc: '开局金币 +50/级', v: 50 },
      tome:  { icon: '📜', name: '符文秘典', desc: '符文伤害 +12%/级', v: 0.12 },
      midas: { icon: '🪙', name: '点金秘术', desc: '黄金符文 +4 金币/级', v: 4 }
    };
    var RELIC_KEYS = ['heart', 'purse', 'tome', 'midas'];

    /* ---------------- 怪物图鉴(hp 为出场章节基准值) ---------------- */
    var ENEMIES = {
      slime:   { icon: '🟢', name: '史莱姆',   hp: 42,   spd: 52,  rwd: 5,   r: 12, sc: 10 },
      wolf:    { icon: '🐺', name: '疾风狼',   hp: 78,   spd: 92,  rwd: 8,   r: 12, sc: 15 },
      goblin:  { icon: '👺', name: '哥布林',   hp: 135,  spd: 58,  rwd: 10,  r: 13, sc: 20 },
      skel:    { icon: '💀', name: '骷髅兵',   hp: 215,  spd: 60,  rwd: 12,  r: 13, sc: 25 },
      ghost:   { icon: '👻', name: '幽魂',     hp: 150,  spd: 104, rwd: 12,  r: 12, sc: 25 },
      ghoul:   { icon: '🧟', name: '食尸鬼',   hp: 430,  spd: 46,  rwd: 18,  r: 15, sc: 35 },
      imp:     { icon: '🔥', name: '火元素',   hp: 450,  spd: 72,  rwd: 15,  r: 13, sc: 35 },
      golem:   { icon: '🗿', name: '石魔',     hp: 980,  spd: 34,  rwd: 26,  r: 17, sc: 50, armor: 0.5 },
      fae:     { icon: '🧚', name: '冰风精灵', hp: 580,  spd: 85,  rwd: 18,  r: 12, sc: 40 },
      yeti:    { icon: '🐻‍❄️', name: '雪怪',  hp: 1300, spd: 44,  rwd: 30,  r: 18, sc: 60, armor: 0.4 },
      demon:   { icon: '😈', name: '恶魔',     hp: 1550, spd: 65,  rwd: 32,  r: 15, sc: 70 },
      drake:   { icon: '🐉', name: '双头龙',   hp: 2500, spd: 52,  rwd: 45,  r: 19, sc: 90, armor: 0.45 },
      treant:  { icon: '🌳', name: '腐化树人', hp: 3000, spd: 30,  rwd: 150, r: 24, sc: 300, armor: 0.3, boss: true },
      bonelord:{ icon: '☠️', name: '骨魔王',   hp: 5200, spd: 30,  rwd: 180, r: 24, sc: 400, armor: 0.3, boss: true },
      lavaking:{ icon: '👹', name: '熔岩魔王', hp: 8500, spd: 30,  rwd: 220, r: 25, sc: 500, armor: 0.35, boss: true },
      frostdr:{ icon: '🐲', name: '冰霜巨龙', hp: 13000,spd: 30,  rwd: 260, r: 25, sc: 650, armor: 0.4, boss: true },
      demonking:{icon:'👿', name: '深渊魔王', hp: 19000,spd: 28,  rwd: 320, r: 26, sc: 900, armor: 0.45, boss: true, magic: true }
    };
    var CH_POOLS = [['slime', 'wolf', 'goblin'], ['skel', 'ghost', 'ghoul'],
                    ['imp', 'golem', 'skel'], ['fae', 'yeti', 'ghost'], ['demon', 'drake', 'ghoul']];
    var CH_BOSSES = ['treant', 'bonelord', 'lavaking', 'frostdr', 'demonking'];

    /* ---------------- 路径模板(战场坐标 y 66..300) ---------------- */
    var PATHS = [
      { pts: [[46, 120], [520, 120], [520, 240], [1054, 240]],
        slots: [[230, 66], [420, 66], [340, 178], [720, 178], [930, 178], [640, 296]] },
      { pts: [[46, 250], [320, 250], [320, 110], [760, 110], [760, 250], [1054, 250]],
        slots: [[180, 180], [420, 180], [560, 52], [660, 180], [860, 180], [990, 180]] },
      { pts: [[46, 90], [420, 90], [420, 200], [880, 200], [880, 90], [1054, 90]],
        slots: [[220, 160], [330, 40], [620, 140], [620, 262], [990, 150], [520, 262]] },
      { pts: [[46, 286], [820, 286], [820, 90], [240, 90], [240, 188], [1054, 188]],
        slots: [[300, 220], [520, 220], [700, 220], [940, 150], [160, 150], [560, 40]] },
      { pts: [[46, 90], [300, 90], [300, 240], [560, 240], [560, 90], [820, 90], [820, 240], [1054, 240]],
        slots: [[170, 160], [420, 160], [690, 160], [940, 160], [240, 40], [930, 296]] }
    ];
    var CH_PATHS = [[0, 1], [1, 2], [3, 0], [2, 4], [4, 3]];   // 每章 [普通模板, BOSS模板]

    /* ---------------- 难度(壳页选择器) ---------------- */
    var DIFFS = {
      easy:   { hp: 15, ehp: 0.75, espd: 1.00, gold: 30 },
      normal: { hp: 12, ehp: 1.00, espd: 1.00, gold: 0 },
      hard:   { hp: 9,  ehp: 1.25, espd: 1.08, gold: 0 }
    };

    var TUNE = {
      comboWin: 4, comboMax: 8, comboDmg: 0.15,     // 连击窗口/上限/每档增伤
      waveGap: 8, firstWaveDelay: 6, tutWaveDelay: 20,
      refillAt: 8,                                   // 剩余对数≤此值时棋盘补给
      lockNeed: 3, freezeDur: 5, bossBoltEvery: 25,
      baseR: 26, leakScore: 0
    };

    /* ---------------- 关卡表(30 关程序化,集中可调) ---------------- */
    function buildLevels() {
      var LV = [];
      for (var i = 0; i < 30; i++) {
        var ch = Math.floor(i / 6), inCh = i % 6, boss = inCh === 5;
        var pool = CH_POOLS[ch];
        var waveCount = boss ? 4 : Math.min(6, 3 + Math.floor(inCh / 2) + (ch >= 2 ? 1 : 0));
        var waves = [];
        for (var w = 0; w < waveCount; w++) {
          if (boss && w === waveCount - 1) {          // BOSS 波
            waves.push([
              { t: CH_BOSSES[ch], n: 1, gap: 1, start: 0 },
              { t: pool[0], n: 6 + ch * 3, gap: 1.2, start: 3 }
            ]);
            break;
          }
          var n = 6 + Math.round(i * 0.55) + w * 2;
          var gap = Math.max(0.55, 1.5 - i * 0.02 - w * 0.06);
          // 怪物类型随 关卡+波次 渐进引入(第 1 关教学全史莱姆,重型怪后期才登场)
          var tier = Math.min(2, Math.floor((i + w) / 6));
          var wave = [{ t: pool[tier], n: n, gap: gap, start: 0 }];
          if (w >= 1 && w % 2 === 1) {
            var tier2 = Math.min(2, Math.floor((i + w + 2) / 6));
            wave.push({ t: pool[tier2], n: Math.floor(n * 0.5), gap: gap * 1.2, start: 2 });
          }
          waves.push(wave);
        }
        var rocks = 0, lockRatio = 0, frozen = false, magic = false;
        if (ch === 1) rocks = boss ? 4 : 2 + inCh;
        if (ch === 2) lockRatio = 0.3;
        if (ch === 3) frozen = true;
        if (ch === 4) {                                // 终章机制轮换
          if (inCh <= 1) rocks = 3 + inCh * 2;
          else if (inCh <= 3) lockRatio = 0.3;
          else if (inCh === 4) frozen = true;
        }
        if (i === 29) magic = true;
        LV.push({
          num: i + 1, ch: ch, inCh: inCh, boss: boss,
          waves: waves, rocks: rocks, lockRatio: lockRatio, frozen: frozen, magic: magic,
          gold: 60 + i * 3, hpMul: 1 + 0.07 * inCh,
          tpl: CH_PATHS[ch][boss ? 1 : (inCh % 2)], mirror: boss
        });
      }
      return LV;
    }
    var LEVELS = buildLevels();

    /* ---------------- 进度存档(含武器库存) ---------------- */
    var PKEY = 'ian:rg:progress';
    var progress = loadProgress();
    function loadProgress() {
      try {
        var p = JSON.parse(localStorage.getItem(PKEY));
        if (p && p.unlocked >= 1 && p.stars && p.weapons) {
          if (!p.weapons.fire) p.weapons.fire = 1;      // 兜底:初始武器
          if (!p.weapons.arrow) p.weapons.arrow = 1;
          return p;
        }
      } catch (e) {}
      return { unlocked: 1, stars: {}, weapons: { fire: 1, arrow: 1 } };
    }
    function saveProgress() {
      try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (e) {}
    }
    function totalStars() {
      var s = 0;
      for (var k in progress.stars) s += progress.stars[k] | 0;
      return s;
    }
    function wlv(id) { return progress.weapons[id] || 0; }
    function addWeapon(id) {                            // 新得=1,已有且<3 升级
      progress.weapons[id] = Math.min(3, (progress.weapons[id] || 0) + 1);
      saveProgress();
    }
    function relicV(id) { return wlv(id) * RELICS[id].v; }
    function pickPool() {                               // 三选一卡池:未满级的武器/塔/遗物
      var arr = [];
      for (var i = 0; i < RUNE_KEYS.length; i++) {
        var k = RUNE_KEYS[i];
        if (k === 'gold' || RUNES[k].bossRune !== undefined) continue;
        if (wlv(k) < 3) arr.push({ cat: 'rune', id: k });
      }
      for (i = 0; i < TOWER_KEYS.length; i++) {
        if (TOWER_KEYS[i] !== 'arrow' && wlv(TOWER_KEYS[i]) < 3) arr.push({ cat: 'tower', id: TOWER_KEYS[i] });
      }
      for (i = 0; i < RELIC_KEYS.length; i++) {
        if (wlv(RELIC_KEYS[i]) < 3) arr.push({ cat: 'relic', id: RELIC_KEYS[i] });
      }
      return arr;
    }
    function draw3(pool) {                              // 从卡池抽 3 张不重复
      var copy = pool.slice(), out = [];
      for (var i = 0; i < 3 && copy.length; i++) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
      }
      return out;
    }
    // 本关棋盘符文池:gold 常驻 + 已拥有的战斗符文(最新优先,上限 6 种)
    function boardRunePool() {
      var owned = [], k;
      for (var i = 0; i < RUNE_KEYS.length; i++) {
        k = RUNE_KEYS[i];
        if (k !== 'gold' && wlv(k) > 0) owned.push(k);
      }
      owned.reverse();                                  // 后解锁的排前(weapons 插入序=解锁序)
      var pool = ['gold'].concat(owned.slice(0, 5));
      return pool;
    }

    /* ---------------- 音效(WebAudio 合成,无素材) ---------------- */
    var AC = null, muted = false;
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
        if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
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
      gold: function () { beep(1046, 0.07, 'square', 0.04); beep(1568, 0.09, 'square', 0.04, null, 0.06); },
      castFire: function () { beep(300, 0.3, 'sawtooth', 0.06, 90); },
      castIce: function () { beep(1200, 0.25, 'sine', 0.05, 2100); },
      castVolt: function () { beep(140, 0.16, 'square', 0.055, 900); beep(180, 0.12, 'square', 0.04, 1200, 0.05); },
      castHeal: function () { beep(523, 0.14, 'triangle', 0.05); beep(659, 0.16, 'triangle', 0.05, null, 0.1); },
      castHoly: function () { beep(784, 0.3, 'sine', 0.05, 1568); },
      castTp: function () { beep(880, 0.22, 'sine', 0.05, 220); },
      castBoss: function () { beep(160, 0.5, 'sawtooth', 0.06, 60); beep(520, 0.35, 'triangle', 0.045, 130, 0.08); },
      build: function () { beep(180, 0.12, 'sine', 0.06, 120); beep(320, 0.1, 'triangle', 0.05, null, 0.09); },
      upgrade: function () { beep(440, 0.1, 'triangle', 0.05); beep(660, 0.12, 'triangle', 0.05, null, 0.08); },
      sell: function () { beep(500, 0.1, 'sine', 0.04, 240); },
      wave: function () { beep(220, 0.3, 'sawtooth', 0.045, 330); beep(330, 0.25, 'sawtooth', 0.04, 440, 0.12); },
      bossRoar: function () { beep(90, 0.7, 'sawtooth', 0.08, 45); beep(140, 0.5, 'square', 0.045, 70, 0.1); },
      hit: function () { beep(240, 0.05, 'square', 0.022, 170); },
      kill: function () { beep(340, 0.09, 'triangle', 0.04, 120); },
      rescue: function () { beep(380, 0.22, 'sine', 0.05, 720); },
      win: function () { beep(523, 0.12, 'triangle', 0.05); beep(659, 0.12, 'triangle', 0.05, null, 0.11); beep(784, 0.12, 'triangle', 0.05, null, 0.22); beep(1046, 0.22, 'triangle', 0.06, null, 0.33); },
      star: function () { beep(880, 0.16, 'triangle', 0.05, 1320); },
      fail: function () { beep(330, 0.45, 'sawtooth', 0.045, 110); },
      click: function () { beep(700, 0.05, 'triangle', 0.035); }
    };

    /* ---------------- 通用工具 ---------------- */
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
    function inRect(x, y, r) {
      return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }
    function shuffleArr(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
    }
    function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

    /* ---------------- 运行时状态 ---------------- */
    var running = false, paused = false, rafId = 0;
    var mode = 'map';                    // map | gallery | intro | play | pick | clear | fail | allclear
    var DIFF = 'normal', diffCfg = DIFFS.normal;
    var lvIdx = 0, cur = null;
    var score = 0, overReported = false, sessionBest = 0;
    // 战场
    var base = { hp: 12, hpMax: 12 };
    var gold = 0;
    var path = null;                     // {pts, segs, len, slots, end}
    var enemies = [], towers = [], projs = [], flights = [], effects = [], floats = [];
    var particles = [], toasts = [], lines = [], dying = [];
    var waveIdx = 0, waveT = 0, waveClock = 0, spawnList = [], waveActive = false;
    var bossBoltT = 0, shakeT = 0, shakeMag = 0;
    var banner = null;                   // {text, sub, t, dur, color}
    // 棋盘
    var rows = 6, cols = 7, grid = null, tilesLeft = 0;
    var sel = null, badFlashT = 0, shuffleFlashT = 0, refillFlashT = 0;
    var frozenRows = [], frozenT = 0;
    var combo = 1, lastMatchAt = -99, comboPop = null;
    var board = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, bw: 0, bh: 0, tw: 0, th: 0, iconPx: 20 };
    var runePool = ['gold', 'fire'];
    // UI 命中区
    var mapHits = { tabs: [], nodes: [], reset: null, gallery: null, back: null };
    var btnHits = [], slotHits = [], popupHits = null, pickHits = [], clearHits = [], galleryHits = [];
    var popup = null;                    // 建造/升级弹出菜单 {x,y,slot,kind,tower}
    // 流程
    var introT = 0, clearT = 0, failT = 0, chapterTab = 0, resetArm = 0;
    var clearInfo = null, pickCards = null, pickTier = 0;
    var tut = null;                      // {step:0..3}
    var tAnim = 0, bgDots = [], sceneFx = [];
    var portraitHintT = 0, portraitShown = false;

    /* ================= 棋盘引擎(复用连连看折点≤2 判定) ================= */
    var BX0 = 258, BX1 = 842, BY0 = 340, BY1 = 650;    // 棋盘区
    function layoutBoard() {
      var pad = 12, gap = 7;
      board.x = BX0; board.y = BY0; board.w = BX1 - BX0; board.h = BY1 - BY0;
      var availW = board.w - pad * 2, availH = board.h - pad * 2;
      var cw = availW / cols, ch = availH / rows;
      var tw = cw - gap, th = ch - gap;
      if (tw / th > 1.55) tw = th * 1.55;
      board.tw = Math.floor(tw); board.th = Math.floor(th);
      board.bw = board.tw + gap; board.bh = board.th + gap;
      var gw = cols * board.bw + gap, gh = rows * board.bh + gap;
      board.ox = BX0 + (board.w - gw) / 2 + gap;
      board.oy = BY0 + (board.h - gh) / 2 + gap;
      board.iconPx = Math.floor(Math.min(board.tw, board.th) * 0.52);
    }
    function cellX(vc) { return board.ox + (vc - 0.5) * board.bw; }
    function cellY(vr) { return board.oy + (vr - 0.5) * board.bh; }
    function theme() { return CHAPTERS[cur ? cur.ch : 0]; }

    function isFree(vr, vc) {
      if (vr === 0 || vr === rows + 1 || vc === 0 || vc === cols + 1) return true;
      return !grid[vr - 1][vc - 1];
    }
    function findPath(a, b) {          // 分层 BFS,折点≤2;返回虚拟格点序列
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
    function findAnyPair(includeLocked) {
      var byType = {}, arr = allTiles();
      for (var i = 0; i < arr.length; i++) {
        if (!includeLocked && arr[i].locked) continue;
        (byType[arr[i].rune] = byType[arr[i].rune] || []).push(arr[i]);
      }
      var keys = [];
      for (var k in byType) keys.push(k);
      shuffleArr(keys);
      for (i = 0; i < keys.length; i++) {
        var list = byType[keys[i]];
        var idx = [];
        for (var m = 0; m < list.length; m++) idx.push(m);
        shuffleArr(idx);
        for (var x = 0; x < idx.length; x++) for (var y = x + 1; y < list.length; y++) {
          var p = findPath(list[idx[x]], list[idx[y]]);
          if (p) return { a: list[idx[x]], b: list[idx[y]], path: p };
        }
      }
      return null;
    }
    function permuteTypes() {
      var arr = allTiles(), types = [];
      for (var i = 0; i < arr.length; i++) types.push(arr[i].rune);
      shuffleArr(types);
      for (i = 0; i < arr.length; i++) arr[i].rune = types[i];
    }

    function genBoard(keepRocks) {
      layoutBoard();
      if (!keepRocks || !grid) {
        grid = [];
        for (var r = 0; r < rows; r++) {
          var row = [];
          for (var c = 0; c < cols; c++) row.push(null);
          grid.push(row);
        }
        // 石块障碍
        var cells = [];
        for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) cells.push({ r: r, c: c });
        shuffleArr(cells);
        for (var i = 0; i < (cur ? cur.rocks : 0) && cells.length; i++) {
          var rc = cells.pop();
          grid[rc.r][rc.c] = { rock: true, r: rc.r, c: rc.c };
        }
      } else {
        // 保留石块,清空符文
        var cells2 = [];
        for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
          if (grid[r][c] && grid[r][c].rock) continue;
          grid[r][c] = null;
          cells2.push({ r: r, c: c });
        }
        cells = cells2;
      }
      // 配对填充(池内符文均匀分布)
      var pairs = cells.length / 2;
      var bag = [];
      var base2 = Math.floor(pairs / runePool.length), rem = pairs % runePool.length;
      for (var t = 0; t < runePool.length; t++) {
        var n = base2 + (t < rem ? 1 : 0);
        for (var k = 0; k < n * 2; k++) bag.push(runePool[t]);
      }
      // 锁定符文(熔岩机制)
      var lockCells = {};
      if (cur && cur.lockRatio > 0) {
        var lc = cells.slice();
        shuffleArr(lc);
        var lockN = Math.floor(pairs * cur.lockRatio) * 2;
        for (i = 0; i < lockN && i < lc.length; i++) lockCells[lc[i].r + '_' + lc[i].c] = true;
      }
      var tries = 0;
      do {
        shuffleArr(bag);
        for (i = 0; i < cells.length; i++) {
          var rc3 = cells[i];
          grid[rc3.r][rc3.c] = {
            rune: bag[i % bag.length], r: rc3.r, c: rc3.c,
            locked: !!lockCells[rc3.r + '_' + rc3.c],
            px: cellX(rc3.c + 1), py: cellY(rc3.r + 1),
            born: -((rc3.r + rc3.c) * 0.03)
          };
        }
        tilesLeft = cells.length;
        tries++;
      } while (!findAnyPair(true) && tries < 60);
      sel = null;
    }
    function autoRescue() {            // 死局检测:自动重排
      if (tilesLeft <= 0) return;
      if (findAnyPair()) return;
      var ok = false;
      for (var i = 0; i < 40 && !ok; i++) {
        permuteTypes();
        ok = !!findAnyPair();
      }
      if (ok) {
        shuffleFlashT = 0.45;
        sel = null;
        toast('符文紊乱 · 自动重排');
        sfx.rescue();
      }
    }

    function tileSelectable(t) {
      if (t.locked) { toast('锁链符文:再消 ' + TUNE.lockNeed + ' 对即解锁'); sfx.bad(); return false; }
      if (frozenRows.indexOf(t.r) >= 0 && frozenT > 0) { toast('该行被冰封 ' + Math.ceil(frozenT) + 's'); sfx.bad(); return false; }
      return true;
    }
    function trySelect(tile) {
      if (tile.rock) return;
      if (tut && tut.step === 0 && tile.rune !== 'gold') { toast('先连接一对 💰 黄金符文'); sfx.bad(); return; }
      if (tut && tut.step === 2 && tile.rune !== 'fire') { toast('现在连接一对 🔥 火焰符文'); sfx.bad(); return; }
      if (!tileSelectable(tile)) return;
      if (!sel) { sel = tile; sfx.select(); return; }
      if (sel === tile) { sel = null; return; }
      if (sel.rune !== tile.rune) {
        sel = tile; badFlashT = 0.3; sfx.bad();
        return;
      }
      var pts = findPath(sel, tile);
      if (!pts) {
        sel = tile; badFlashT = 0.3; sfx.bad();
        return;
      }
      doMatch(sel, tile, pts);
      sel = null;
    }

    function doMatch(a, b, pts) {
      var now = tAnim;
      combo = (now - lastMatchAt <= TUNE.comboWin) ? Math.min(combo + 1, TUNE.comboMax) : 1;
      lastMatchAt = now;
      if (combo >= 2) comboPop = { n: combo, t: 0 };
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
      lines.push({ pts: cmp, t: 0, color: RUNES[a.rune] ? RUNES[a.rune].color : theme().line });
      // 视觉消散
      dying.push({ icon: RUNES[a.rune].icon, x: a.px, y: a.py, k: 0 });
      dying.push({ icon: RUNES[b.rune].icon, x: b.px, y: b.py, k: 0 });
      spawnBurst(a.px, a.py, 8, RUNES[a.rune].color);
      spawnBurst(b.px, b.py, 8, RUNES[b.rune].color);
      var rune = a.rune, midX = (a.px + b.px) / 2, midY = (a.py + b.py) / 2;
      grid[a.r][a.c] = null;
      grid[b.r][b.c] = null;
      tilesLeft -= 2;
      sfx.match(combo);
      // 解锁进度
      if (cur && cur.lockRatio > 0) {
        var arr = allTiles();
        var unlocked = false;
        for (i = 0; i < arr.length; i++) {
          if (arr[i].locked) {
            arr[i].lockN = (arr[i].lockN === undefined ? TUNE.lockNeed : arr[i].lockN) - 1;
            if (arr[i].lockN <= 0) { arr[i].locked = false; unlocked = true; }
          }
        }
        if (unlocked) { toast('⛓ 锁链崩解!'); sfx.upgrade(); }
      }
      // 施法
      castRune(rune, midX, midY);
      // 教学推进
      if (tut) {
        if (tut.step === 0 && rune === 'gold') { tut.step = 1; sfx.star(); }
        else if (tut.step === 2 && rune === 'fire') { tut.step = 3; sfx.star(); }
      }
      // 弹药补给
      if (tilesLeft <= TUNE.refillAt * 2) {
        refillFlashT = 0.5;
        setTimeout0(function () { genBoard(true); toast('🔮 符文补给!'); });
      }
      checkDelay = 0.3;
    }
    // 帧内延时(暂停安全,不走 setTimeout)
    var pendingFns = [];
    function setTimeout0(fn) { pendingFns.push({ fn: fn, t: 0.45 }); }
    // 教学死局保护:指定符文无可连对时强制重排
    var tutChkT = 1;
    function findTypedPair(id) {
      var arr = allTiles(), list = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].rune === id && !arr[i].locked) list.push(arr[i]);
      }
      for (i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        var p = findPath(list[i], list[j]);
        if (p) return true;
      }
      return false;
    }
    function rescueType(id) {
      for (var t = 0; t < 60; t++) {
        permuteTypes();
        if (findTypedPair(id)) { shuffleFlashT = 0.45; sel = null; return; }
      }
    }

    /* ================= 融合层:符文施法 ================= */
    var GOLD_POS = { x: 620, y: 30 };
    function runeDmg(r) {
      var lv = Math.max(1, wlv(r.id));
      var d = r.dmg ? r.dmg[lv - 1] : 0;
      return d * (1 + TUNE.comboDmg * (combo - 1)) * (1 + relicV('tome'));
    }
    function lvOf(id) { return Math.max(1, wlv(id)); }
    function frontEnemy() {
      var best = null;
      for (var i = 0; i < enemies.length; i++) {
        if (!enemies[i].dead && (!best || enemies[i].dist2 > best.dist2)) best = enemies[i];
      }
      return best;
    }
    function densestEnemy() {
      var best = null, bestN = -1;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        var n = 0;
        for (var j = 0; j < enemies.length; j++) {
          if (!enemies[j].dead && dist(e, enemies[j]) < 90) n++;
        }
        if (n > bestN) { bestN = n; best = e; }
      }
      return best;
    }
    function castRune(id, x, y) {
      var R = RUNES[id];
      if (id === 'gold') {
        var amount = R.v[lvOf(id) - 1] + relicV('midas') + Math.floor(combo / 2);
        addGold(amount, x, y);
        flight(x, y, GOLD_POS.x, GOLD_POS.y, 'coin', R.color, 0.4, function () {});
        sfx.gold();
        return;
      }
      var lv = lvOf(id);
      var dmg = runeDmg(R);
      var target, i;
      switch (R.kind) {
        case 'proj':        // 火球:飞向最前敌人,溅射
          target = frontEnemy();
          flight(x, y, target ? target.x : path.end.x, target ? target.y : path.end.y, 'orb', R.color, 0.35, function (tx, ty) {
            explode(tx, ty, R.splash, dmg, R.color, false);
            sfx.castFire();
          });
          break;
        case 'nova':        // 冰霜新星:全场减速
          flight(x, y, path.end.x, path.end.y, 'orb', R.color, 0.3, function (tx, ty) {
            effects.push({ kind: 'nova', x: tx, y: ty, t: 0, dur: 0.7, color: R.color });
            for (var j = 0; j < enemies.length; j++) {
              var e = enemies[j];
              if (e.dead) continue;
              applySlow(e, R.slow, R.dur);
              damageEnemy(e, dmg, true);
            }
            sfx.castIce();
          });
          break;
        case 'chain':       // 闪电链
          target = frontEnemy();
          flight(x, y, target ? target.x : path.end.x, target ? target.y : path.end.y, 'spark', R.color, 0.22, function (tx, ty) {
            var chain = [], cur2 = target;
            var cand = enemies.filter(function (e) { return !e.dead; });
            var used = {};
            while (cur2 && chain.length < R.jumps) {
              chain.push(cur2); used[cur2.id] = 1;
              damageEnemy(cur2, dmg * Math.pow(0.78, chain.length - 1), true);
              var next = null, nd = 1e9;
              for (var j2 = 0; j2 < cand.length; j2++) {
                if (used[cand[j2].id]) continue;
                var dd = dist(cur2, cand[j2]);
                if (dd < 150 && dd < nd) { nd = dd; next = cand[j2]; }
              }
              cur2 = next;
            }
            if (chain.length) {
              effects.push({ kind: 'bolt', pts: [{ x: tx, y: ty - 40 }].concat(chain), t: 0, dur: 0.3, color: R.color });
            }
            sfx.castVolt();
          });
          break;
        case 'heal':        // 治愈之泉
          flight(x, y, path.end.x, path.end.y, 'orb', R.color, 0.35, function (tx, ty) {
            healBase(R.v[lv - 1]);
            effects.push({ kind: 'nova', x: tx, y: ty, t: 0, dur: 0.6, color: R.color });
            sfx.castHeal();
          });
          break;
        case 'holy':        // 圣光裁决:全场真伤
          flight(x, y, path.end.x, path.end.y, 'orb', R.color, 0.3, function () {
            effects.push({ kind: 'holy', t: 0, dur: 0.8, color: R.color });
            for (var j3 = 0; j3 < enemies.length; j3++) {
              if (!enemies[j3].dead) damageEnemy(enemies[j3], dmg, true);
            }
            sfx.castHoly();
          });
          break;
        case 'tp':          // 奥术传送
          target = frontEnemy();
          flight(x, y, target ? target.x : path.end.x, target ? target.y : path.end.y, 'orb', R.color, 0.3, function (tx, ty) {
            if (target && !target.dead) {
              effects.push({ kind: 'tp', x: tx, y: ty, t: 0, dur: 0.5, color: R.color });
              target.dist2 = 0;
              damageEnemy(target, dmg, true);
              toast('🌀 ' + ENEMIES[target.type].name + ' 被传回起点');
            }
            sfx.castTp();
          });
          break;
        case 'dot':         // 荆棘/死灵:全场持续伤
          flight(x, y, path.end.x, path.end.y, 'orb', R.color, 0.3, function () {
            effects.push({ kind: 'haze', t: 0, dur: 0.8, color: R.color });
            for (var j4 = 0; j4 < enemies.length; j4++) {
              var e4 = enemies[j4];
              if (e4.dead) continue;
              applyDot(e4, R.dmg[lv - 1] / R.dur, R.dur);
              if (R.slow) applySlow(e4, R.slow, R.dur);
            }
            sfx.castBoss();
          });
          break;
        case 'erupt':       // 熔岩喷发:路径三处
          for (i = 0; i < 3; i++) {
            (function (idx) {
              var d = path.len * (0.25 + 0.25 * idx) + (Math.random() - 0.5) * 120;
              var p = pathPosAt(Math.max(20, Math.min(path.len - 10, d)));
              flight(x, y, p.x, p.y, 'orb', R.color, 0.3 + idx * 0.12, function (tx, ty) {
                explode(tx, ty, R.r, dmg, R.color, true);
                effects.push({ kind: 'erupt', x: tx, y: ty, t: 0, dur: 0.9, color: R.color });
                sfx.castBoss();
              });
            })(i);
          }
          break;
        case 'freeze':      // 绝对零度
          flight(x, y, path.end.x, path.end.y, 'orb', R.color, 0.3, function () {
            effects.push({ kind: 'holy', t: 0, dur: 0.7, color: R.color });
            for (var j5 = 0; j5 < enemies.length; j5++) {
              var e5 = enemies[j5];
              if (e5.dead) continue;
              e5.frzT = Math.max(e5.frzT || 0, R.dur[lv - 1]);
              damageEnemy(e5, dmg, true);
            }
            shake(0.25, 5);
            sfx.castIce(); sfx.castBoss();
          });
          break;
        case 'meteor':      // 陨石
          target = densestEnemy();
          var mtx = target ? target.x : path.end.x, mty = target ? target.y : path.end.y;
          flight(mtx + 200, -60, mtx, mty, 'meteor', R.color, 0.55, function (tx, ty) {
            explode(tx, ty, R.r, dmg, R.color, true);
            effects.push({ kind: 'erupt', x: tx, y: ty, t: 0, dur: 1.1, color: R.color });
            shake(0.4, 9);
            sfx.castBoss();
          });
          break;
      }
    }
    function flight(x, y, tx, ty, kind, color, dur, cb) {
      flights.push({ x: x, y: y, sx: x, sy: y, tx: tx, ty: ty, kind: kind, color: color, t: 0, dur: dur, cb: cb });
    }
    function addGold(n, x, y) {
      gold += n;
      floats.push({ x: x, y: y - 10, text: '+' + n, color: C.gold, t: 0, dur: 0.9, vy: -42 });
    }
    function healBase(n) {
      if (base.hp >= base.hpMax) { floats.push({ x: path.end.x, y: path.end.y - 30, text: 'HP 已满', color: C.text2, t: 0, dur: 0.8, vy: -30 }); return; }
      base.hp = Math.min(base.hpMax, base.hp + n);
      floats.push({ x: path.end.x, y: path.end.y - 30, text: '+' + n + ' HP', color: C.ok, t: 0, dur: 0.9, vy: -36 });
    }
    function shake(t, mag) { shakeT = Math.max(shakeT, t); shakeMag = Math.max(shakeMag, mag); }

    /* ================= 战场层:路径 / 怪物 / 塔 / 弹道 / 波次 ================= */
    function buildPath(tplIdx, mirror) {
      var tpl = PATHS[tplIdx];
      var pts = tpl.pts.map(function (p) { return mirror ? { x: W - p[0], y: p[1] } : { x: p[0], y: p[1] }; });
      var slots = tpl.slots.map(function (s) { return mirror ? { x: W - s[0], y: s[1], tower: null } : { x: s[0], y: s[1], tower: null }; });
      var segs = [], len = 0;
      for (var i = 1; i < pts.length; i++) {
        var l = Math.sqrt(Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2));
        segs.push({ a: pts[i - 1], b: pts[i], len: l, acc: len });
        len += l;
      }
      return { pts: pts, segs: segs, len: len, slots: slots, end: pts[pts.length - 1] };
    }
    function pathPosAt(d) {
      d = Math.max(0, Math.min(path.len, d));
      for (var i = 0; i < path.segs.length; i++) {
        var s = path.segs[i];
        if (d <= s.acc + s.len) {
          var k = s.len ? (d - s.acc) / s.len : 0;
          return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
        }
      }
      return { x: path.end.x, y: path.end.y };
    }
    var enemySeq = 0;
    function makeEnemy(type) {
      var def = ENEMIES[type];
      var hp = Math.round(def.hp * (cur ? cur.hpMul : 1) * diffCfg.ehp);
      return {
        id: ++enemySeq, type: type, def: def,
        hp: hp, hpMax: hp, dist2: 0, x: path.pts[0].x, y: path.pts[0].y,
        slowT: 0, slowF: 1, frzT: 0, dotT: 0, dotDps: 0,
        flash: 0, dead: false, bornT: 0.25
      };
    }
    function enemySpeed(e) {
      var s = e.def.spd * diffCfg.espd;
      if (e.slowT > 0) s *= (1 - e.slowF);
      return s;
    }
    function updateEnemies(dt) {
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        if (e.dead) { enemies.splice(i, 1); continue; }
        if (e.bornT > 0) { e.bornT -= dt; continue; }
        if (e.slowT > 0) e.slowT -= dt;
        if (e.frzT > 0) e.frzT -= dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.dotT > 0) {
          e.dotT -= dt;
          damageEnemy(e, e.dotDps * dt, true, true);
          if (e.dead) continue;
        }
        if (e.frzT <= 0) e.dist2 += enemySpeed(e) * dt;
        var p = pathPosAt(e.dist2);
        e.x = p.x; e.y = p.y;
        if (e.dist2 >= path.len - 2) {      // 漏怪:伤害基地
          e.dead = true;
          var dmgB = e.def.boss ? 5 : (e.def.hp > 800 ? 2 : 1);
          hitBase(dmgB);
        }
      }
    }
    function hitBase(n) {
      base.hp -= n;
      shake(0.3, 7);
      floats.push({ x: path.end.x, y: path.end.y - 34, text: '-' + n, color: C.danger, t: 0, dur: 1, vy: -40, big: true });
      spawnBurst(path.end.x, path.end.y, 14, C.danger);
      sfx.hit(); sfx.fail();
      if (base.hp <= 0) { base.hp = 0; doFail(); }
    }
    function damageEnemy(e, dmg, pierce, quiet) {
      if (e.dead) return;
      if (!pierce && e.def.armor) dmg *= (1 - e.def.armor);
      e.hp -= dmg;
      if (!quiet) {
        e.flash = 0.1;
        if (dmg >= 1) floats.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y - 16, text: String(Math.round(dmg)), color: pierce ? '#fff3b0' : '#ffffff', t: 0, dur: 0.7, vy: -52 });
        sfx.hit();
      }
      if (e.hp <= 0) killEnemy(e);
    }
    function killEnemy(e) {
      e.dead = true;
      gold += e.def.rwd;
      score += e.def.sc;
      emitScore();
      floats.push({ x: e.x, y: e.y - 8, text: '+' + e.def.rwd + '💰', color: C.gold, t: 0, dur: 0.9, vy: -46 });
      spawnBurst(e.x, e.y, e.def.boss ? 30 : 10, e.def.boss ? C.danger : theme().line);
      if (e.def.boss) { shake(0.5, 10); banner = { text: 'BOSS 击破!', sub: '', t: 0, dur: 1.6, color: C.gold }; }
      sfx.kill();
    }
    function applySlow(e, f, dur) {
      if (e.frzT > 0) return;
      e.slowF = Math.max(f, e.slowT > 0 ? e.slowF : 0);
      e.slowT = Math.max(e.slowT, dur);
    }
    function applyDot(e, dps, dur) { e.dotDps = Math.max(e.dotDps, dps); e.dotT = Math.max(e.dotT, dur); }

    function explode(x, y, r, dmg, color, big) {
      effects.push({ kind: 'ring', x: x, y: y, t: 0, dur: big ? 0.5 : 0.35, r: r, color: color });
      spawnBurst(x, y, big ? 16 : 9, color);
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        var d = dist({ x: x, y: y }, e);
        if (d <= r + e.def.r) damageEnemy(e, dmg * (1 - 0.4 * d / (r + 1)), false);
      }
    }

    /* ----- 塔 ----- */
    function buildTower(slot, id) {
      var def = TOWERS[id];
      if (gold < def.cost) { toast('金币不足(需 ' + def.cost + ')'); sfx.bad(); return false; }
      gold -= def.cost;
      slot.tower = { id: id, lv: 1, cd: 0, ang: 0, spent: def.cost, fireT: 0 };
      spawnBurst(slot.x, slot.y, 10, def.color);
      sfx.build();
      if (tut && tut.step === 1) { tut.step = 2; sfx.star(); }
      return true;
    }
    function upgradeTower(t) {
      var def = TOWERS[t.id];
      if (t.lv >= 3) { toast('已满级'); sfx.bad(); return; }
      var cost = def.up[t.lv - 1];
      if (gold < cost) { toast('金币不足(需 ' + cost + ')'); sfx.bad(); return; }
      gold -= cost; t.spent += cost; t.lv++;
      var slot = slotOfTower(t);
      if (slot) spawnBurst(slot.x, slot.y, 12, def.color);
      sfx.upgrade();
    }
    function slotOfTower(t) {
      for (var i = 0; i < path.slots.length; i++) if (path.slots[i].tower === t) return path.slots[i];
      return null;
    }
    function sellTower(t) {
      var back = Math.floor(t.spent * 0.6);
      gold += back;
      var slot = slotOfTower(t);
      if (slot) { spawnBurst(slot.x, slot.y, 8, C.gold); slot.tower = null; }
      floats.push({ x: (slot || { x: W / 2, y: 150 }).x, y: (slot || { y: 150 }).y - 14, text: '+' + back + '💰', color: C.gold, t: 0, dur: 0.8, vy: -40 });
      sfx.sell();
    }
    function towerRange(t) { return TOWERS[t.id].range * TW_MULT[t.lv - 1].rng; }
    function updateTowers(dt) {
      for (var i = 0; i < path.slots.length; i++) {
        var slot = path.slots[i], t = slot.tower;
        if (!t) continue;
        var def = TOWERS[t.id];
        t.cd -= dt;
        if (t.fireT > 0) t.fireT -= dt;
        // 索敌:射程内最前者
        var target = null, rng = towerRange(t);
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (e.dead || e.bornT > 0) continue;
          if (dist(slot, e) <= rng + e.def.r && (!target || e.dist2 > target.dist2)) target = e;
        }
        if (target) {
          t.ang = Math.atan2(target.y - slot.y, target.x - slot.x);
          if (t.cd <= 0) {
            t.cd = def.cd;
            t.fireT = 0.12;
            fireTower(slot, t, def, target);
          }
        }
      }
    }
    function fireTower(slot, t, def, target) {
      var mult = TW_MULT[t.lv - 1].dmg;
      var dmg = def.dmg * mult;
      if (def.kind === 'bolt') {           // 特斯拉:即时闪电链
        var chain = [target], used = {}; used[target.id] = 1;
        for (var k = 1; k < def.chain; k++) {
          var next = null, nd = 1e9;
          for (var j = 0; j < enemies.length; j++) {
            var e = enemies[j];
            if (e.dead || used[e.id]) continue;
            var dd = dist(target, e);
            if (dd < 130 && dd < nd) { nd = dd; next = e; }
          }
          if (!next) break;
          chain.push(next); used[next.id] = 1; target = next;
        }
        effects.push({ kind: 'bolt', pts: [{ x: slot.x, y: slot.y - 18 }].concat(chain), t: 0, dur: 0.22, color: def.color });
        for (k = 0; k < chain.length; k++) damageEnemy(chain[k], dmg * Math.pow(0.78, k), false);
        sfx.castVolt();
        return;
      }
      if (def.kind === 'quake') {          // 地震:范围脉冲
        effects.push({ kind: 'quake', x: slot.x, y: slot.y, t: 0, dur: 0.45, r: towerRange(t), color: def.color });
        for (j = 0; j < enemies.length; j++) {
          if (!enemies[j].dead && dist(slot, enemies[j]) <= towerRange(t) + enemies[j].def.r) {
            damageEnemy(enemies[j], dmg, false);
          }
        }
        shake(0.15, 3);
        return;
      }
      // 弹道类:箭/法球/冰晶
      projs.push({
        x: slot.x, y: slot.y - 16, target: target, tx: target.x, ty: target.y,
        spd: def.kind === 'arrow' ? 460 : 320, dmg: dmg,
        kind: def.kind, color: def.color,
        slow: def.slow, sdur: def.sdur, splash: def.splash
      });
    }
    function updateProjs(dt) {
      for (var i = projs.length - 1; i >= 0; i--) {
        var p = projs[i];
        if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
        var dx = p.tx - p.x, dy = p.ty - p.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var step = p.spd * dt;
        if (d <= step + 8) {
          // 命中
          if (p.splash) {
            explode(p.tx, p.ty, p.splash, p.dmg, p.color, false);
          } else if (p.target && !p.target.dead) {
            damageEnemy(p.target, p.dmg, false);
            if (p.slow) applySlow(p.target, p.slow, p.sdur);
            spawnBurst(p.tx, p.ty, 5, p.color);
          }
          projs.splice(i, 1);
          continue;
        }
        p.x += dx / d * step; p.y += dy / d * step;
        if (p.kind === 'orb' && Math.random() < 0.5) {
          particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.3, max: 0.3, size: 1.6, color: p.color });
        }
      }
    }

    /* ----- 波次调度 ----- */
    function startWave() {
      var w = cur.waves[waveIdx];
      spawnList = [];
      for (var g = 0; g < w.length; g++) {
        for (var i = 0; i < w[g].n; i++) {
          spawnList.push({ type: w[g].t, at: w[g].start + i * w[g].gap });
        }
      }
      spawnList.sort(function (a, b) { return a.at - b.at; });
      waveClock = 0;
      waveActive = true;
      var hasBoss = false;
      for (g = 0; g < w.length; g++) if (ENEMIES[w[g].t].boss) hasBoss = true;
      if (hasBoss) {
        banner = { text: '⚠ BOSS 来袭', sub: ENEMIES[w[0].t].name + ' 现身!', t: 0, dur: 2.2, color: C.danger };
        sfx.bossRoar();
        shake(0.5, 6);
      } else {
        banner = { text: '第 ' + (waveIdx + 1) + ' / ' + cur.waves.length + ' 波', sub: '', t: 0, dur: 1.2, color: theme().line };
        sfx.wave();
      }
      // 冰封机制:每波开始冻 2 行
      if (cur.frozen) {
        frozenRows = [];
        var r1 = Math.floor(Math.random() * rows), r2 = (r1 + 1 + Math.floor(Math.random() * (rows - 1))) % rows;
        frozenRows = [r1, r2];
        frozenT = TUNE.freezeDur;
        toast('❄ 棋盘第 ' + (r1 + 1) + '/' + (r2 + 1) + ' 行被冰封!');
      }
    }
    function updateWaves(dt) {
      if (!waveActive) {
        waveT -= dt;
        if (waveT <= 0) startWave();
        return;
      }
      waveClock += dt;
      while (spawnList.length && spawnList[0].at <= waveClock) {
        var s = spawnList.shift();
        enemies.push(makeEnemy(s.type));
      }
      if (!spawnList.length && !enemies.length) {      // 本波清空
        waveActive = false;
        waveIdx++;
        gold += 10 + cur.ch * 2;                        // 波间补给
        if (waveIdx >= cur.waves.length) {
          pendingClearT = 0.7;
        } else {
          waveT = TUNE.waveGap;
        }
      }
    }
    function earlyCall() {
      if (waveActive || waveIdx === 0) return;
      var bonus = Math.ceil(waveT * 2);
      gold += bonus;
      floats.push({ x: W / 2, y: 320, text: '+' + bonus + '💰 提前召唤', color: C.gold, t: 0, dur: 1, vy: -30 });
      waveT = 0.01;
      sfx.gold();
    }

    /* ----- 魔王魔弹(终章) ----- */
    function updateBossMagic(dt) {
      if (!cur.magic) return;
      var bossAlive = false;
      for (var i = 0; i < enemies.length; i++) {
        if (!enemies[i].dead && enemies[i].def.magic) { bossAlive = true; break; }
      }
      if (!bossAlive) return;
      bossBoltT -= dt;
      if (bossBoltT <= 0) {
        bossBoltT = TUNE.bossBoltEvery;
        var arr = allTiles();
        if (arr.length) {
          var victim = arr[Math.floor(Math.random() * arr.length)];
          var bpos = null;
          for (i = 0; i < enemies.length; i++) if (!enemies[i].dead && enemies[i].def.magic) { bpos = enemies[i]; break; }
          flight(bpos.x, bpos.y, victim.px, victim.py, 'dark', '#8b5cf6', 0.5, function (tx, ty) {
            effects.push({ kind: 'ring', x: tx, y: ty, t: 0, dur: 0.4, r: 46, color: '#8b5cf6' });
            spawnBurst(tx, ty, 8, '#8b5cf6');
          });
          dying.push({ icon: RUNES[victim.rune] ? RUNES[victim.rune].icon : '🔮', x: victim.px, y: victim.py, k: 0 });
          grid[victim.r][victim.c] = null;
          tilesLeft -= 2;
          toast('👿 魔王吞噬了你的符文!');
          sfx.castBoss();
        }
      }
    }

    /* ================= 关卡流程 / 武器解锁 ================= */
    var checkDelay = 0, pendingClearT = 0;
    function emitScore() { hooks.onScore && hooks.onScore(Math.round(score), cur ? cur.num : 0); }
    function emitState(s) { hooks.onState && hooks.onState(s); }
    function spawnBurst(x, y, n, color) {
      var colors = [color || theme().line, C.cyan, '#ffffff', C.gold];
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 200;
        particles.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          life: 0.5 + Math.random() * 0.35, max: 0.85,
          size: 2 + Math.random() * 3, color: colors[i % colors.length]
        });
      }
    }
    function toast(text) { toasts.push({ text: text, t: 2.2 }); }

    function startLevel(idx, keepScore) {
      lvIdx = idx;
      cur = LEVELS[idx];
      if (!keepScore) score = 0;
      overReported = false;
      base.hpMax = diffCfg.hp + relicV('heart');
      base.hp = base.hpMax;
      gold = cur.gold + relicV('purse');
      path = buildPath(cur.tpl, cur.mirror);
      enemies = []; projs = []; flights = []; effects = []; floats = [];
      lines = []; dying = []; toasts = [];
      runePool = boardRunePool();
      genBoard(false);
      initSceneFx(cur.ch);
      frozenRows = []; frozenT = 0;
      bossBoltT = TUNE.bossBoltEvery;
      waveIdx = 0; waveActive = false; spawnList = [];
      waveT = (cur.num === 1) ? TUNE.tutWaveDelay : TUNE.firstWaveDelay;
      tut = (cur.num === 1) ? { step: 0 } : null;
      popup = null; banner = null;
      checkDelay = 0; pendingClearT = 0;
      combo = 1; lastMatchAt = -99; comboPop = null;
      mode = 'intro'; introT = 1.25;
      emitScore();
      emitState('playing');
    }
    function bossRuneOf(ch) {
      for (var i = 0; i < RUNE_KEYS.length; i++) {
        if (RUNES[RUNE_KEYS[i]].bossRune === ch) return RUNE_KEYS[i];
      }
      return null;
    }
    function doLevelClear() {
      var ratio = base.hp / base.hpMax;
      var stars = ratio >= 0.9 ? 3 : (ratio >= 0.5 ? 2 : 1);
      var bonus = Math.round(base.hp * 8 * (DIFF === 'easy' ? 0.8 : DIFF === 'hard' ? 1.25 : 1));
      score += bonus;
      emitScore();
      progress.stars[cur.num] = Math.max(progress.stars[cur.num] || 0, stars);
      if (cur.num < 30) progress.unlocked = Math.max(progress.unlocked, cur.num + 1);
      // BOSS 固定掉落章节终极符文
      var bossGain = null;
      if (cur.boss) {
        var bid = bossRuneOf(cur.ch);
        if (bid && wlv(bid) < 1) {
          addWeapon(bid);
          bossGain = bid;
        }
      }
      saveProgress();
      clearInfo = { stars: stars, bonus: bonus, bossGain: bossGain };
      var pool = pickPool();
      pickCards = pool.length ? draw3(pool) : [];
      mode = pickCards.length ? 'pick' : (cur.num === 30 ? 'allclear' : 'clear');
      clearT = 0;
      spawnConfetti();
      sfx.win();
    }
    function applyPick(card) {
      var isNew = wlv(card.id) === 0;
      addWeapon(card.id);
      var meta = card.cat === 'rune' ? RUNES[card.id] : (card.cat === 'tower' ? TOWERS[card.id] : RELICS[card.id]);
      toast((isNew ? '🆕 解锁 ' : '⬆ 升级 ') + meta.icon + ' ' + meta.name);
      sfx.star();
      mode = (cur.num === 30) ? 'allclear' : 'clear';
      clearT = 0;
    }
    function doFail() {
      mode = 'fail'; failT = 1.6;
      banner = { text: '法师塔陷落…', sub: '', t: 0, dur: 2, color: C.danger };
      sfx.fail();
    }
    function reportOver() {
      if (overReported) return;
      overReported = true;
      emitState('over');
      hooks.onGameOver && hooks.onGameOver(Math.round(score), cur ? cur.num : 0);
    }
    function spawnConfetti() {
      for (var i = 0; i < 50; i++) {
        particles.push({
          x: Math.random() * W, y: -20 - Math.random() * 140,
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 120,
          life: 1.6 + Math.random(), max: 2.6,
          size: 2.5 + Math.random() * 3.5,
          color: [C.gold, C.cyan, C.purple, C.ok, '#ffffff'][i % 5]
        });
      }
    }
    function goMap() {
      mode = 'map';
      chapterTab = Math.min(4, Math.floor((progress.unlocked - 1) / 6));
      score = 0;
      sel = null; tut = null; banner = null;
      emitState('ready');
    }

    /* ================= 渲染层(一):背景 / 地图 / 收藏馆 / 引入 ================= */
    function initDots() {
      bgDots = [];
      for (var i = 0; i < 22; i++) {
        bgDots.push({
          x: Math.random() * W, y: Math.random() * H,
          s: 0.8 + Math.random() * 1.6, a: 0.04 + Math.random() * 0.08,
          vy: 4 + Math.random() * 8, sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6.28
        });
      }
    }
    function initSceneFx(ch) {
      sceneFx = [];
      var kind = CHAPTERS[ch].fx, n = kind === 'leaf' ? 14 : 26;
      for (var i = 0; i < n; i++) {
        sceneFx.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 24, vy: kind === 'wisp' || kind === 'ember' ? -(14 + Math.random() * 26) : 18 + Math.random() * 26,
          s: 1.5 + Math.random() * 2.5, a: 0.12 + Math.random() * 0.3, ph: Math.random() * 6.28
        });
      }
    }
    function drawSceneFx(dt) {
      var kind = CHAPTERS[cur ? cur.ch : chapterTab].fx;
      for (var i = 0; i < sceneFx.length; i++) {
        var p = sceneFx[i];
        p.x += (p.vx + Math.sin(tAnim * 0.7 + p.ph) * 18) * dt;
        p.y += p.vy * dt;
        if (p.y > H + 10) p.y = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.x < -10) p.x = W + 10;
        var col, glow;
        if (kind === 'leaf') { col = 'rgba(120,220,150,' + p.a + ')'; }
        else if (kind === 'wisp') { col = 'rgba(167,139,250,' + p.a + ')'; }
        else if (kind === 'ember') { col = 'rgba(255,140,80,' + p.a * (0.7 + 0.3 * Math.sin(tAnim * 6 + p.ph)) + ')'; }
        else if (kind === 'snow') { col = 'rgba(220,240,255,' + p.a + ')'; }
        else { col = 'rgba(200,120,120,' + p.a + ')'; }
        ctx.fillStyle = col;
        ctx.beginPath();
        if (kind === 'leaf') ctx.ellipse(p.x, p.y, p.s * 1.6, p.s * 0.7, tAnim + p.ph, 0, 6.29);
        else ctx.arc(p.x, p.y, p.s, 0, 6.29);
        ctx.fill();
      }
    }
    function drawBg(ch) {
      var th = CHAPTERS[ch];
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.bgTop); g.addColorStop(1, C.bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var a1x = W * 0.28 + Math.sin(tAnim * 0.13) * 130, a1y = H * 0.3 + Math.cos(tAnim * 0.17) * 60;
      var a2x = W * 0.74 + Math.cos(tAnim * 0.11) * 150, a2y = H * 0.68 + Math.sin(tAnim * 0.15) * 70;
      var rg = ctx.createRadialGradient(a1x, a1y, 0, a1x, a1y, 430);
      rg.addColorStop(0, th.aura1); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      rg = ctx.createRadialGradient(a2x, a2y, 0, a2x, a2y, 460);
      rg.addColorStop(0, th.aura2); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
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

    function drawMap() {
      drawBg(chapterTab);
      drawSceneFx(0);
      var th = CHAPTERS[chapterTab];
      // 标题
      var g = ctx.createLinearGradient(W / 2 - 220, 0, W / 2 + 220, 0);
      g.addColorStop(0, th.line); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, th.line);
      ctx.fillStyle = g; ctx.font = 'bold 50px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('符 文 守 卫', W / 2, 72);
      ctx.fillStyle = C.text3; ctx.font = '15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('连连看 × 塔防 · 连符文施法守卫法师塔 · 30 关 5 章节', W / 2, 98);
      ctx.textAlign = 'right'; ctx.fillStyle = C.gold; ctx.font = 'bold 18px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('★ ' + totalStars() + ' / 90', W - 30, 52);
      ctx.textAlign = 'left'; ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('难度:' + ({ easy: '简单', normal: '普通', hard: '困难' })[DIFF] + '(开始前可在上方切换)', 30, 52);
      ctx.textAlign = 'center';
      // 章节页签 ×5
      mapHits.tabs = [];
      var tw = 178, thh = 56, gap = 14;
      var tx0 = W / 2 - (tw * 5 + gap * 4) / 2;
      for (var i = 0; i < 5; i++) {
        var x = tx0 + i * (tw + gap), y = 124;
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
        ctx.fillText(CHAPTERS[i].icon, x + 16, y + thh / 2 + 8);
        ctx.font = (active ? 'bold ' : '') + '18px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(CHAPTERS[i].name, x + 52, y + thh / 2 + 7);
        ctx.globalAlpha = 1;
        var chStars = 0;
        for (var s = 1; s <= 6; s++) chStars += progress.stars[i * 6 + s] | 0;
        ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillStyle = C.text3; ctx.textAlign = 'right';
        ctx.fillText('★' + chStars + '/18', x + tw - 12, y + 20);
        ctx.textAlign = 'center';
        mapHits.tabs.push({ x: x, y: y, w: tw, h: thh, ch: i });
      }
      // 关卡节点 2 行 × 3 列
      mapHits.nodes = [];
      var rr = 50;
      var colsX = [240, 550, 860];
      for (i = 0; i < 6; i++) {
        var lv = chapterTab * 6 + i + 1;
        var cx = colsX[i % 3], cy = (i < 3) ? 306 : 462;
        var locked = lv > progress.unlocked;
        var boss = i === 5;
        var earned = progress.stars[lv] | 0;
        ctx.save();
        if (locked) ctx.globalAlpha = 0.32;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.29);
        var cg = ctx.createLinearGradient(0, cy - rr, 0, cy + rr);
        cg.addColorStop(0, th.tileTop); cg.addColorStop(1, th.tileBot);
        ctx.fillStyle = cg; ctx.fill();
        ctx.strokeStyle = boss ? 'rgba(255,46,99,.85)' : (earned > 0 ? th.line : 'rgba(124,58,237,.4)');
        ctx.lineWidth = boss ? 2.5 : 1.8;
        if (!locked) { ctx.shadowColor = boss ? C.danger : th.line; ctx.shadowBlur = 12; }
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.29); ctx.stroke();
        ctx.shadowBlur = 0;
        if (locked) {
          ctx.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = C.text2; ctx.fillText('🔒', cx, cy);
        } else {
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(lv), cx, cy - 5);
          if (boss) {
            ctx.fillStyle = C.danger; ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
            ctx.fillText('BOSS', cx, cy + 26);
          }
        }
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
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
      // 底部:收藏馆 + 重置
      mapHits.gallery = { x: W / 2 - 240, y: H - 62, w: 220, h: 42 };
      roundRect(mapHits.gallery.x, mapHits.gallery.y, 220, 42, 12);
      ctx.fillStyle = 'rgba(181,55,242,.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(181,55,242,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('🏛 武器收藏馆', W / 2 - 130, H - 35);
      mapHits.reset = { x: W / 2 + 20, y: H - 62, w: 220, h: 42 };
      roundRect(mapHits.reset.x, mapHits.reset.y, 220, 42, 12);
      ctx.fillStyle = resetArm > 0 ? 'rgba(255,46,99,.18)' : 'rgba(255,255,255,.03)';
      ctx.fill();
      ctx.strokeStyle = resetArm > 0 ? C.danger : 'rgba(124,58,237,.3)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = resetArm > 0 ? C.danger : C.text3; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(resetArm > 0 ? '再点一次确认重置!' : '重置全部进度', W / 2 + 130, H - 35);
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('过关三选一解锁武器 · BOSS 关掉落章节终极符文 · 进度自动保存', W / 2, H - 84);
    }

    function drawGallery() {
      drawBg(chapterTab);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🏛 武器收藏馆', W / 2, 62);
      ctx.fillStyle = C.text3; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('已收集 ' + (Object.keys(progress.weapons).length) + ' / ' + (RUNE_KEYS.length - 1 + TOWER_KEYS.length + RELIC_KEYS.length - 1) + ' 件', W / 2, 88);
      // 返回
      mapHits.back = { x: 28, y: 34, w: 92, h: 38 };
      roundRect(28, 34, 92, 38, 10);
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,.4)'; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = '15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('‹ 返回', 74, 58);
      // 三区
      var sections = [
        { title: '符文武器(棋盘施法)', keys: RUNE_KEYS, meta: RUNES },
        { title: '防御塔(金币建造)', keys: TOWER_KEYS, meta: TOWERS },
        { title: '强化遗物(被动)', keys: RELIC_KEYS, meta: RELICS }
      ];
      var y0 = 118;
      galleryHits = [];
      for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        ctx.fillStyle = CHAPTERS[chapterTab].line; ctx.font = 'bold 17px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(sec.title, 60, y0 + 14);
        ctx.textAlign = 'center';
        var cw = 148, ch2 = 84, gap = 10;
        var rowN = Math.ceil(sec.keys.length / 6);
        for (var i = 0; i < sec.keys.length; i++) {
          var k = sec.keys[i];
          if (k === 'gold') continue;
          var lv = wlv(k);
          var col = i % 6, row = Math.floor(i / 6);
          var x = 60 + col * (cw + gap), y = y0 + 26 + row * (ch2 + gap);
          var isBossRune = sec.meta === RUNES && RUNES[k].bossRune !== undefined;
          roundRect(x, y, cw, ch2, 10);
          ctx.fillStyle = lv > 0 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.015)';
          ctx.fill();
          var mc = lv > 0 ? (sec.meta[k].color || CHAPTERS[chapterTab].line) : 'rgba(124,58,237,.2)';
          ctx.strokeStyle = mc; ctx.globalAlpha = lv > 0 ? 0.8 : 0.35;
          ctx.lineWidth = 1.4;
          roundRect(x, y, cw, ch2, 10); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.font = '26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = lv > 0 ? 1 : 0.3;
          ctx.fillText(sec.meta[k].icon, x + cw / 2, y + 30);
          ctx.globalAlpha = 1;
          ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.fillStyle = lv > 0 ? C.text : C.text3;
          ctx.fillText(sec.meta[k].name, x + cw / 2, y + 56);
          ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          if (lv > 0) {
            ctx.fillStyle = C.gold;
            var lvTxt = isBossRune ? '★ 终极' : '';
            ctx.fillText(lvTxt || ('Lv' + lv + (lv >= 3 ? ' MAX' : '')), x + cw / 2, y + 74);
          } else {
            ctx.fillStyle = C.text3;
            ctx.fillText(isBossRune ? 'BOSS 掉落' : '🔒 未解锁', x + cw / 2, y + 74);
          }
          ctx.textBaseline = 'alphabetic';
        }
        y0 += 26 + Math.ceil((sec.keys.length - (s === 0 ? 1 : 0)) / 6) * (ch2 + gap) + 14;
      }
    }

    function drawIntro() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(6,8,16,.68)'; ctx.fillRect(0, 0, W, H);
      var th = theme();
      var a = Math.min(1, introT / 0.25);
      ctx.globalAlpha = a;
      ctx.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(th.icon, W / 2, 200);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关' + (cur.boss ? ' · BOSS' : ''), W / 2, 288);
      ctx.fillStyle = th.line; ctx.font = 'bold 20px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(th.name, W / 2, 324);
      // 机制标签
      var tags = [];
      if (cur.rocks) tags.push('🪨 石块 ×' + cur.rocks);
      if (cur.lockRatio) tags.push('🔒 锁链符文');
      if (cur.frozen) tags.push('❄ 冰封行');
      if (cur.magic) tags.push('👿 魔弹');
      tags.push('🌊 ' + cur.waves.length + ' 波');
      var twd = 128, gap = 12;
      var tx0 = W / 2 - (twd * tags.length + gap * (tags.length - 1)) / 2;
      for (var i = 0; i < tags.length; i++) {
        var x = tx0 + i * (twd + gap);
        roundRect(x, 356, twd, 32, 16);
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(124,58,237,.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.text; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(tags[i], x + twd / 2, 373);
      }
      ctx.fillStyle = C.text2; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(th.intro, W / 2, 424);
      ctx.fillStyle = C.text3;
      ctx.fillText('点击任意处开始', W / 2, 470);
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }

    /* ================= 渲染层(二):对局场景 ================= */
    function drawPathRoad() {
      var pts = path.pts;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = theme().road; ctx.lineWidth = 30; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 22; ctx.stroke();
      // 流向虚线
      ctx.save();
      ctx.strokeStyle = theme().line; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.setLineDash([10, 16]);
      ctx.lineDashOffset = -tAnim * 46;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }
    function drawPortal() {
      var p = path.pts[0];
      ctx.save();
      ctx.translate(p.x, p.y);
      for (var i = 0; i < 3; i++) {
        ctx.rotate(tAnim * (1.2 + i * 0.5));
        ctx.beginPath();
        ctx.strokeStyle = theme().line;
        ctx.globalAlpha = 0.65 - i * 0.18;
        ctx.lineWidth = 3 - i * 0.7;
        ctx.ellipse(0, 0, 16 + i * 7, 8 + i * 4, 0, 0.4, 5.6);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    function drawBase() {
      var p = path.end;
      var pulse = 0.5 + 0.5 * Math.sin(tAnim * 3);
      // 底座
      ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, 6.29);
      var g = ctx.createLinearGradient(0, p.y - 22, 0, p.y + 22);
      g.addColorStop(0, '#3d3560'); g.addColorStop(1, '#191430');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = theme().line; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
      // 塔身
      ctx.beginPath();
      ctx.moveTo(p.x - 11, p.y + 8); ctx.lineTo(p.x - 6, p.y - 20);
      ctx.lineTo(p.x + 6, p.y - 20); ctx.lineTo(p.x + 11, p.y + 8);
      ctx.closePath();
      ctx.fillStyle = '#2a2347'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1; ctx.stroke();
      // 顶部水晶
      ctx.save();
      ctx.translate(p.x, p.y - 28);
      ctx.rotate(tAnim * 0.8);
      ctx.shadowColor = theme().line; ctx.shadowBlur = 12 + pulse * 10;
      ctx.fillStyle = theme().line;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(6, 0); ctx.lineTo(0, 10); ctx.lineTo(-6, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      // HP 环
      var ratio = base.hp / base.hpMax;
      ctx.beginPath(); ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + 6.28);
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 4; ctx.stroke();
      if (ratio > 0) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + 6.28 * ratio);
        var hc = ratio > 0.5 ? C.ok : (ratio > 0.25 ? C.warn : C.danger);
        if (ratio <= 0.25) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tAnim * 9); ctx.shadowColor = hc; ctx.shadowBlur = 8; }
        ctx.strokeStyle = hc; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
    function drawSlots() {
      for (var i = 0; i < path.slots.length; i++) {
        var s = path.slots[i];
        if (!s.tower) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(255,255,255,.22)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, 17, 0, 6.29); ctx.stroke();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('+', s.x, s.y);
          ctx.textBaseline = 'alphabetic';
        } else {
          drawTower(s, s.tower);
        }
      }
    }
    function drawTower(slot, t) {
      var def = TOWERS[t.id];
      var showRange = popup && popup.slot === slot;
      if (showRange) {
        ctx.beginPath(); ctx.arc(slot.x, slot.y, towerRange(t), 0, 6.29);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
        ctx.strokeStyle = def.color; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 6]);
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      // 底座
      ctx.beginPath(); ctx.arc(slot.x, slot.y, 15, 0, 6.29);
      var g = ctx.createLinearGradient(0, slot.y - 15, 0, slot.y + 15);
      g.addColorStop(0, '#3a3358'); g.addColorStop(1, '#171331');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 1.6; ctx.stroke();
      // 符文环(开火时亮起旋转)
      var glow = t.fireT > 0;
      ctx.save();
      ctx.translate(slot.x, slot.y);
      ctx.rotate(tAnim * (glow ? 6 : 1.2));
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = glow ? 0.95 : 0.4;
      ctx.lineWidth = glow ? 2.4 : 1.4;
      if (glow) { ctx.shadowColor = def.color; ctx.shadowBlur = 10; }
      for (var a = 0; a < 3; a++) {
        ctx.beginPath();
        ctx.arc(0, 0, 12, a * 2.1, a * 2.1 + 1.2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      // 图标 + 等级点
      ctx.font = '17px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, slot.x, slot.y + 1);
      for (var l = 0; l < t.lv; l++) {
        ctx.beginPath(); ctx.arc(slot.x - 5 + l * 5, slot.y + 21, 1.8, 0, 6.29);
        ctx.fillStyle = def.color; ctx.fill();
      }
      ctx.textBaseline = 'alphabetic';
    }
    function drawEnemies() {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        var def = e.def;
        var s = e.bornT > 0 ? (1 - e.bornT / 0.25) : 1;
        var wob = Math.sin(tAnim * 8 + e.id) * 1.5;
        ctx.save();
        ctx.translate(e.x, e.y + wob * 0.4);
        ctx.scale(s * (def.boss ? 1.7 : 1), s * (def.boss ? 1.7 : 1));
        // 状态底光
        if (e.frzT > 0) {
          ctx.beginPath(); ctx.arc(0, 2, 15, 0, 6.29);
          ctx.fillStyle = 'rgba(124,214,255,.3)'; ctx.fill();
        } else if (e.slowT > 0) {
          ctx.beginPath(); ctx.arc(0, 2, 14, 0, 6.29);
          ctx.fillStyle = 'rgba(90,140,255,.22)'; ctx.fill();
        }
        if (e.dotT > 0) {
          ctx.font = '9px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('☠️', 12, -12);
        }
        ctx.font = '20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (e.flash > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12; }
        ctx.globalAlpha = 0.92;
        ctx.fillText(def.icon, 0, 0);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.restore();
        // 血条
        var bw = def.boss ? 52 : 26;
        var ratio = Math.max(0, e.hp / e.hpMax);
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(e.x - bw / 2, e.y - (def.boss ? 26 : 17), bw, 3.5);
        ctx.fillStyle = ratio > 0.5 ? C.ok : (ratio > 0.25 ? C.warn : C.danger);
        ctx.fillRect(e.x - bw / 2, e.y - (def.boss ? 26 : 17), bw * ratio, 3.5);
        if (e.frzT > 0) {
          ctx.font = '10px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
          ctx.fillText('❄️', e.x + bw / 2 + 2, e.y - 14);
        }
      }
      ctx.textBaseline = 'alphabetic';
    }
    function drawProjs() {
      for (var i = 0; i < projs.length; i++) {
        var p = projs[i];
        if (p.kind === 'arrow') {
          var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.shadowColor = p.color; ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(p.x - dx / d * 9, p.y - dy / d * 9);
          ctx.lineTo(p.x + dx / d * 4, p.y + dy / d * 4);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (p.kind === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(tAnim * 9);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          ctx.fillRect(-3, -3, 6, 6);
          ctx.restore();
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 6.29);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color; ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
    function drawEffects() {
      for (var i = 0; i < effects.length; i++) {
        var ef = effects[i];
        var k = ef.t / ef.dur;
        ctx.save();
        if (ef.kind === 'ring') {
          ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.r * k, 0, 6.29);
          ctx.strokeStyle = ef.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
          ctx.shadowColor = ef.color; ctx.shadowBlur = 14; ctx.stroke();
        } else if (ef.kind === 'bolt') {
          ctx.globalAlpha = 1 - k * 0.6;
          ctx.strokeStyle = ef.color; ctx.lineWidth = 2.6;
          ctx.shadowColor = ef.color; ctx.shadowBlur = 16;
          ctx.beginPath();
          for (var j = 0; j < ef.pts.length - 1; j++) {
            var a = ef.pts[j], b = ef.pts[j + 1];
            ctx.moveTo(a.x, a.y);
            var midX = (a.x + b.x) / 2 + (Math.random() - 0.5) * 16;
            var midY = (a.y + b.y) / 2 + (Math.random() - 0.5) * 16;
            ctx.lineTo(midX, midY); ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
        } else if (ef.kind === 'nova') {
          var r1 = 30 + 200 * k;
          ctx.beginPath(); ctx.arc(ef.x, ef.y, r1, 0, 6.29);
          ctx.strokeStyle = ef.color; ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 8 * (1 - k) + 1;
          ctx.shadowColor = ef.color; ctx.shadowBlur = 18; ctx.stroke();
        } else if (ef.kind === 'holy') {
          ctx.fillStyle = ef.color; ctx.globalAlpha = Math.sin(k * Math.PI) * 0.22;
          ctx.fillRect(0, 54, W, 252);
        } else if (ef.kind === 'haze') {
          ctx.fillStyle = ef.color; ctx.globalAlpha = Math.sin(k * Math.PI) * 0.18;
          ctx.fillRect(0, 54, W, 252);
        } else if (ef.kind === 'quake') {
          ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.r * k, 0, 6.29);
          ctx.fillStyle = ef.color; ctx.globalAlpha = (1 - k) * 0.3; ctx.fill();
          ctx.strokeStyle = ef.color; ctx.globalAlpha = 1 - k; ctx.stroke();
        } else if (ef.kind === 'erupt') {
          for (var f = 0; f < 5; f++) {
            var fy = ef.y - f * 14 - k * 30;
            var fr = (10 - f * 1.4) * (1 - k * 0.5);
            ctx.beginPath(); ctx.arc(ef.x + Math.sin(f * 3 + ef.t * 12) * 6, fy, Math.max(1, fr), 0, 6.29);
            ctx.fillStyle = f < 2 ? '#ffd54a' : ef.color;
            ctx.globalAlpha = (1 - k) * (0.9 - f * 0.13);
            ctx.fill();
          }
        } else if (ef.kind === 'tp') {
          ctx.translate(ef.x, ef.y);
          ctx.rotate(ef.t * 10);
          ctx.strokeStyle = ef.color; ctx.lineWidth = 2.4;
          ctx.globalAlpha = 1 - k;
          for (var s2 = 0; s2 < 3; s2++) {
            ctx.beginPath();
            ctx.arc(0, 0, 6 + s2 * 7, s2 * 2, s2 * 2 + 2.4);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    function drawFlights() {
      for (var i = 0; i < flights.length; i++) {
        var f = flights[i];
        var k = Math.max(0, Math.min(1, f.t / f.dur));
        var x = f.sx + (f.tx - f.sx) * k;
        var y = f.sy + (f.ty - f.sy) * k - Math.sin(k * Math.PI) * 46;
        ctx.save();
        if (f.kind === 'coin') {
          ctx.translate(x, y); ctx.scale(Math.abs(Math.cos(tAnim * 8)), 1);
          ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.29);
          ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 8; ctx.fill();
        } else if (f.kind === 'meteor') {
          ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.29);
          ctx.fillStyle = f.color; ctx.shadowColor = '#ffb627'; ctx.shadowBlur = 24; ctx.fill();
          ctx.beginPath(); ctx.arc(x + 16, y - 24, 7, 0, 6.29);
          ctx.fillStyle = '#ffd54a'; ctx.fill();
          // 落点阴影
          ctx.beginPath(); ctx.ellipse(f.tx, f.ty, 20 * k, 7 * k, 0, 0, 6.29);
          ctx.strokeStyle = C.danger; ctx.globalAlpha = 0.7; ctx.stroke();
        } else if (f.kind === 'dark') {
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.29);
          ctx.fillStyle = '#8b5cf6'; ctx.shadowColor = '#8b5cf6'; ctx.shadowBlur = 14; ctx.fill();
        } else if (f.kind === 'spark') {
          ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
          starPath(x, y, 5 + Math.sin(tAnim * 20) * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.29);
          ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 16; ctx.fill();
        }
        ctx.restore();
      }
      ctx.shadowBlur = 0;
    }
    function drawFloats() {
      ctx.textAlign = 'center';
      for (var i = 0; i < floats.length; i++) {
        var f = floats[i];
        var a = Math.max(0, Math.min(1, f.t / 0.2, (f.dur - f.t) / 0.25 + 1));
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillStyle = f.color;
        ctx.font = (f.big ? 'bold 20px' : 'bold 14px') + ' Rajdhani';
        ctx.fillText(f.text, f.x, f.y);
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
      ctx.font = Math.floor(Math.min(w, h) * 0.48) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText('🪨', x, y + 1);
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }
    function drawRuneTile(t) {
      var th = theme();
      var s = 1;
      if (t.born !== undefined && t.born < 0.18) {
        if (t.born < 0) return;
        s = 0.55 + 0.45 * (t.born / 0.18);
      }
      var isSel = (t === sel);
      if (isSel) s = 1.07 + Math.sin(tAnim * 6.5) * 0.02;
      var R = RUNES[t.rune] || { icon: '🔮', color: th.line };
      var w = board.tw * s, h = board.th * s;
      var x = t.px - w / 2, y = t.py - h / 2 + (isSel ? 0 : Math.sin(tAnim * 2 + (t.r + t.c) * 0.7) * 1.2);
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, th.tileTop); g.addColorStop(1, th.tileBot);
      if (isSel) { ctx.shadowColor = R.color; ctx.shadowBlur = 18; }
      roundRect(x, y, w, h, 9);
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isSel ? R.color : 'rgba(255,255,255,.14)';
      ctx.globalAlpha = isSel ? 0.95 : 0.5;
      ctx.lineWidth = isSel ? 2.2 : 1.2;
      roundRect(x, y, w, h, 9); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 4.5); ctx.lineTo(x + w - 8, y + 4.5); ctx.stroke();
      // 符文图标
      ctx.font = Math.floor(board.iconPx * (isSel ? 1.05 : 1)) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = t.locked ? 0.45 : 1;
      ctx.fillText(R.icon, t.px, y + h / 2 + 1);
      ctx.globalAlpha = 1;
      if (t.locked) {
        ctx.font = Math.floor(Math.min(w, h) * 0.24) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('🔒', x + w - 11, y + 11);
        ctx.strokeStyle = 'rgba(167,139,250,.5)'; ctx.lineWidth = 1.4;
        roundRect(x + 2, y + 2, w - 4, h - 4, 7); ctx.stroke();
      }
      ctx.textBaseline = 'alphabetic';
    }
    function drawBoardZone() {
      // 面板底
      roundRect(board.x - 8, board.y - 6, board.w + 16, board.h + 12, 16);
      ctx.fillStyle = 'rgba(10,14,26,.5)'; ctx.fill();
      ctx.strokeStyle = theme().line; ctx.globalAlpha = 0.12; ctx.lineWidth = 1.5;
      roundRect(board.x - 8, board.y - 6, board.w + 16, board.h + 12, 16); ctx.stroke();
      ctx.globalAlpha = 1;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var o = grid[r][c];
        if (o && o.rock) drawRock(cellX(c + 1), cellY(r + 1));
      }
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        var t = grid[r][c];
        if (t && !t.rock) drawRuneTile(t);
      }
      // 冰封行
      if (frozenT > 0) {
        for (var i = 0; i < frozenRows.length; i++) {
          var fr = frozenRows[i];
          var y = board.oy + fr * board.bh;
          ctx.fillStyle = 'rgba(124,214,255,' + (0.14 + 0.06 * Math.sin(tAnim * 5)) * Math.min(1, frozenT) + ')';
          roundRect(board.ox - 4, y, cols * board.bw + 2, board.bh, 6);
          ctx.fill();
          ctx.strokeStyle = 'rgba(124,214,255,.5)'; ctx.lineWidth = 1;
          roundRect(board.ox - 4, y, cols * board.bw + 2, board.bh, 6); ctx.stroke();
          ctx.font = '13px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText('❄️', board.ox - 10, y + board.bh / 2);
          ctx.textBaseline = 'alphabetic';
        }
      }
      // 消散图标
      for (i = 0; i < dying.length; i++) {
        var dy2 = dying[i];
        if (dy2.k < 0) continue;
        var s2 = 1 - dy2.k;
        ctx.globalAlpha = Math.max(0, s2);
        ctx.font = Math.floor(board.iconPx * s2) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
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
        ctx.strokeStyle = ln.color || theme().line;
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = ln.color || theme().line; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(ln.pts[0].x, ln.pts[0].y);
        var total = 0, darr = [];
        for (var s3 = 1; s3 < ln.pts.length; s3++) {
          var segLen = Math.abs(ln.pts[s3].x - ln.pts[s3 - 1].x) + Math.abs(ln.pts[s3].y - ln.pts[s3 - 1].y);
          darr.push(segLen); total += segLen;
        }
        var remain = total * prog, drawn = false;
        for (s3 = 1; s3 < ln.pts.length; s3++) {
          var sl = darr[s3 - 1];
          if (remain >= sl) { ctx.lineTo(ln.pts[s3].x, ln.pts[s3].y); remain -= sl; }
          else {
            var kk = sl ? remain / sl : 1;
            ctx.lineTo(ln.pts[s3 - 1].x + (ln.pts[s3].x - ln.pts[s3 - 1].x) * kk,
                        ln.pts[s3 - 1].y + (ln.pts[s3].y - ln.pts[s3 - 1].y) * kk);
            drawn = true; break;
          }
        }
        if (!drawn && prog >= 1) {
          for (s3 = 1; s3 < ln.pts.length; s3++) ctx.lineTo(ln.pts[s3].x, ln.pts[s3].y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (shuffleFlashT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.14 * Math.max(0, shuffleFlashT / 0.45)) + ')';
        ctx.fillRect(board.x, board.y, board.w, board.h);
      }
      if (refillFlashT > 0) {
        ctx.fillStyle = 'rgba(181,55,242,' + (0.18 * Math.max(0, refillFlashT / 0.5)) + ')';
        ctx.fillRect(board.x, board.y, board.w, board.h);
      }
      if (badFlashT > 0) {
        ctx.strokeStyle = 'rgba(255,46,99,' + (badFlashT / 0.3 * 0.5) + ')';
        ctx.lineWidth = 3;
        roundRect(board.x + 2, board.y + 2, board.w - 4, board.h - 4, 14); ctx.stroke();
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

    /* ================= 渲染层(三):HUD / 面板 / 弹窗 / 结算 ================= */
    function drawHUD() {
      var th = theme();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = th.line; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关' + (cur.boss ? ' · BOSS' : ''), 28, 34);
      ctx.fillStyle = C.text2; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(th.icon + ' ' + th.name, 28, 52);
      // 基地 HP
      var hx = 150;
      ctx.font = '15px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('🏰', hx, 38);
      var bw2 = 150;
      roundRect(hx + 22, 24, bw2, 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      var ratio = base.hp / base.hpMax;
      if (ratio > 0) {
        roundRect(hx + 22, 24, Math.max(8, bw2 * ratio), 12, 6);
        ctx.fillStyle = ratio > 0.5 ? C.ok : (ratio > 0.25 ? C.warn : C.danger);
        if (ratio <= 0.25) { ctx.globalAlpha = 0.65 + 0.35 * Math.sin(tAnim * 9); }
        ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = C.text; ctx.font = 'bold 12px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(base.hp + '/' + base.hpMax, hx + 22 + bw2 + 8, 35);
      // 金币
      ctx.font = '17px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('💰', GOLD_POS.x - 40, 40);
      ctx.fillStyle = C.gold; ctx.font = 'bold 21px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(gold), GOLD_POS.x - 12, 40);
      // 波次
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('WAVE', W - 200, 26);
      ctx.fillStyle = C.text; ctx.font = 'bold 19px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(Math.min(waveIdx + 1, cur.waves.length) + ' / ' + cur.waves.length, W - 200, 46);
      // 分数
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('SCORE', W - 80, 26);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 21px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(Math.round(score)), W - 80, 46);
      // combo 弹字
      if (comboPop) {
        var k = comboPop.t / 0.9;
        var sc = 1 + (k < 0.25 ? (0.25 - k) * 1.6 : 0);
        ctx.save();
        ctx.translate(W / 2, 208 - k * 26);
        ctx.scale(sc, sc);
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.fillStyle = comboPop.n >= 4 ? C.danger : C.warn;
        ctx.font = 'bold 30px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
        ctx.fillText('COMBO ×' + comboPop.n, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
    function drawStrip() {
      var y = 306;
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      roundRect(14, y, W - 28, 26, 8); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      // 波次点
      var dotX = 30;
      for (var i = 0; i < cur.waves.length; i++) {
        ctx.beginPath(); ctx.arc(dotX + i * 16, y + 13, 4, 0, 6.29);
        if (i < waveIdx) { ctx.fillStyle = theme().line; ctx.fill(); }
        else if (i === waveIdx && waveActive) {
          ctx.fillStyle = C.warn; ctx.shadowColor = C.warn; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
        } else { ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill(); }
      }
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.text2; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      if (waveActive) {
        ctx.fillText('⚔ 交战中 · 剩余敌人 ' + (enemies.length + spawnList.length), dotX + cur.waves.length * 16 + 12, y + 18);
      } else {
        ctx.fillText('下一波 ' + Math.max(0, waveT).toFixed(1) + 's', dotX + cur.waves.length * 16 + 12, y + 18);
      }
      // 提前召唤 / 静音
      btnHits = [];
      if (!waveActive && waveIdx > 0 && waveIdx < cur.waves.length) {
        var bx = W / 2 + 60;
        roundRect(bx, y + 3, 190, 20, 10);
        ctx.fillStyle = 'rgba(255,213,74,.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,213,74,.4)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.gold; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡ 提前召唤 +' + Math.ceil(Math.max(0, waveT) * 2) + '💰', bx + 95, y + 14);
        ctx.textBaseline = 'alphabetic';
        btnHits.push({ x: bx, y: y + 3, w: 190, h: 20, id: 'call' });
      }
      var mb = { x: W - 92, y: y + 3, w: 64, h: 20 };
      roundRect(mb.x, mb.y, mb.w, mb.h, 10);
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
      ctx.fillStyle = C.text2; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + 11);
      ctx.textBaseline = 'alphabetic';
      btnHits.push({ x: mb.x, y: mb.y, w: mb.w, h: mb.h, id: 'mute' });
      ctx.textAlign = 'left';
    }
    function drawLeftPanel() {
      var x = 14, y = 340, w = 232, h = 310;
      roundRect(x, y, w, h, 12);
      ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,.2)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = theme().line; ctx.font = 'bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('📜 符文图鉴', x + 14, y + 24);
      var yy = y + 46;
      for (var i = 0; i < runePool.length; i++) {
        var R = RUNES[runePool[i]];
        var lv = Math.max(1, wlv(runePool[i]));
        ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(R.icon, x + 16, yy + 6);
        ctx.fillStyle = R.color; ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(R.name + (runePool[i] === 'gold' ? '' : ' Lv' + lv), x + 44, yy + 1);
        ctx.fillStyle = C.text3; ctx.font = '10px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(shortDesc(runePool[i]), x + 44, yy + 15);
        yy += 32;
      }
      // 连击窗口条
      var cw = Math.max(0, 1 - (tAnim - lastMatchAt) / TUNE.comboWin);
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('连击 ×' + combo + (cw > 0 ? ' (增伤中)' : ''), x + 14, y + h - 22);
      roundRect(x + 14, y + h - 16, w - 28, 5, 3);
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
      if (cw > 0) {
        roundRect(x + 14, y + h - 16, (w - 28) * cw, 5, 3);
        ctx.fillStyle = C.warn; ctx.fill();
      }
    }
    function shortDesc(id) {
      var R = RUNES[id], lv = Math.max(1, wlv(id));
      if (id === 'gold') return '金币 +' + (R.v[lv - 1] + relicV('midas'));
      if (R.kind === 'heal') return '基地 +' + R.v[lv - 1] + ' HP';
      if (R.kind === 'tp') return '最前怪传回起点';
      if (R.kind === 'nova') return '全场减速' + R.dur + 's';
      if (R.kind === 'chain') return '闪电链 ×' + R.jumps;
      if (R.kind === 'freeze') return '冻结全场 ' + R.dur[lv - 1] + 's';
      if (R.kind === 'dot') return '全场毒伤 ' + R.dmg[lv - 1];
      if (R.kind === 'erupt') return '路径三处喷发';
      if (R.kind === 'meteor') return '大范围轰炸';
      return '伤害 ' + R.dmg[lv - 1] + (R.splash ? ' 溅射' : '');
    }
    function drawRightPanel() {
      var x = 854, y = 340, w = 232, h = 310;
      roundRect(x, y, w, h, 12);
      ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,.2)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = theme().line; ctx.font = 'bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('🗼 建造', x + 14, y + 24);
      ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('点击战场 ○ 空塔位建造', x + 14, y + 42);
      var yy = y + 62;
      var built = 0;
      for (var i = 0; i < TOWER_KEYS.length; i++) {
        var k = TOWER_KEYS[i];
        var lv = wlv(k);
        if (k !== 'arrow' && lv === 0) continue;
        var def = TOWERS[k];
        var cnt = 0;
        for (var s = 0; s < path.slots.length; s++) if (path.slots[s].tower && path.slots[s].tower.id === k) cnt++;
        ctx.font = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.globalAlpha = cnt ? 1 : 0.55;
        ctx.fillText(def.icon, x + 16, yy + 5);
        ctx.fillStyle = def.color; ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(def.name + ' Lv' + lv, x + 40, yy);
        ctx.fillStyle = C.text3; ctx.font = '10px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('在场 ×' + cnt + ' · ' + def.cost + '💰', x + 40, yy + 14);
        ctx.globalAlpha = 1;
        yy += 34;
        if (cnt) built++;
      }
      // 遗物
      ctx.fillStyle = theme().line; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('📿 遗物', x + 14, yy + 8);
      yy += 26;
      var anyRelic = false;
      for (i = 0; i < RELIC_KEYS.length; i++) {
        var rl = wlv(RELIC_KEYS[i]);
        if (!rl) continue;
        anyRelic = true;
        ctx.font = '14px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(RELICS[RELIC_KEYS[i]].icon, x + 18, yy + 4);
        ctx.fillStyle = C.text2; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(RELICS[RELIC_KEYS[i]].name + ' ×' + rl, x + 40, yy + 2);
        yy += 22;
      }
      if (!anyRelic) {
        ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('过关三选一可获得', x + 18, yy + 2);
      }
    }
    function drawPopup() {
      if (!popup) return;
      var px = popup.x, py = popup.y;
      popupHits = [];
      ctx.textAlign = 'left';
      if (!popup.tower) {
        // 建造菜单
        var opts = [];
        for (var i = 0; i < TOWER_KEYS.length; i++) {
          var k = TOWER_KEYS[i];
          if (k !== 'arrow' && wlv(k) === 0) continue;
          opts.push(k);
        }
        var w = 210, hh = opts.length * 42 + 40;
        var x = Math.max(16, Math.min(W - w - 16, px - w / 2));
        var y = Math.max(60, py - hh - 24);
        roundRect(x, y, w, hh, 12);
        ctx.fillStyle = 'rgba(13,17,30,.96)'; ctx.fill();
        ctx.strokeStyle = 'rgba(124,58,237,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = C.text2; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('选择防御塔', x + 14, y + 20);
        for (i = 0; i < opts.length; i++) {
          var def = TOWERS[opts[i]];
          var ry = y + 30 + i * 42;
          var afford = gold >= def.cost;
          roundRect(x + 8, ry, w - 16, 38, 8);
          ctx.fillStyle = afford ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)'; ctx.fill();
          ctx.strokeStyle = afford ? def.color : 'rgba(255,255,255,.1)';
          ctx.globalAlpha = afford ? 0.7 : 0.3; ctx.lineWidth = 1.2;
          roundRect(x + 8, ry, w - 16, 38, 8); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.globalAlpha = afford ? 1 : 0.45;
          ctx.fillText(def.icon, x + 18, ry + 25);
          ctx.fillStyle = afford ? C.text : C.text3; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.fillText(def.name, x + 46, ry + 17);
          ctx.fillStyle = afford ? C.gold : C.text3; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.fillText(def.cost + '💰 · 伤' + def.dmg + ' · 程' + def.range, x + 46, ry + 32);
          ctx.globalAlpha = 1;
          popupHits.push({ x: x + 8, y: ry, w: w - 16, h: 38, id: 'build', tower: opts[i] });
        }
        popup.close = { x: x, y: y, w: w, h: hh };
      } else {
        // 升级/卖出菜单
        var t = popup.tower, def2 = TOWERS[t.id];
        var w2 = 210, h2 = 158;
        var x2 = Math.max(16, Math.min(W - w2 - 16, px - w2 / 2));
        var y2 = Math.max(60, py - h2 - 24);
        roundRect(x2, y2, w2, h2, 12);
        ctx.fillStyle = 'rgba(13,17,30,.96)'; ctx.fill();
        ctx.strokeStyle = def2.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
        roundRect(x2, y2, w2, h2, 12); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(def2.icon, x2 + 14, y2 + 26);
        ctx.fillStyle = C.text; ctx.font = 'bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(def2.name + ' Lv' + t.lv, x2 + 42, y2 + 24);
        ctx.fillStyle = C.text3; ctx.font = '11px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        var mult = TW_MULT[t.lv - 1].dmg;
        ctx.fillText('伤害 ' + Math.round(def2.dmg * mult) + ' · 射程 ' + Math.round(towerRange(t)), x2 + 14, y2 + 46);
        if (t.lv < 3) {
          var cost = def2.up[t.lv - 1];
          var afford2 = gold >= cost;
          roundRect(x2 + 10, y2 + 58, w2 - 20, 36, 8);
          ctx.fillStyle = afford2 ? 'rgba(46,230,166,.12)' : 'rgba(255,255,255,.03)'; ctx.fill();
          ctx.strokeStyle = afford2 ? C.ok : 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = afford2 ? C.ok : C.text3; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.fillText('⬆ 升级 Lv' + (t.lv + 1) + ' · ' + cost + '💰', x2 + 22, y2 + 81);
          popupHits.push({ x: x2 + 10, y: y2 + 58, w: w2 - 20, h: 36, id: 'up' });
        }
        roundRect(x2 + 10, y2 + 102, w2 - 20, 36, 8);
        ctx.fillStyle = 'rgba(255,213,74,.1)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,213,74,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = C.gold; ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('💰 卖出 +' + Math.floor(t.spent * 0.6), x2 + 22, y2 + 125);
        popupHits.push({ x: x2 + 10, y: y2 + 102, w: w2 - 20, h: 36, id: 'sell' });
        popup.close = { x: x2, y: y2, w: w2, h: h2 };
      }
    }
    function drawBanner() {
      if (!banner) return;
      var k = banner.t / banner.dur;
      var a = Math.min(1, k / 0.12, (1 - k) / 0.18 + 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.shadowColor = banner.color; ctx.shadowBlur = 22;
      ctx.fillStyle = banner.color;
      ctx.fillText(banner.text, W / 2, 196);
      ctx.shadowBlur = 0;
      if (banner.sub) {
        ctx.fillStyle = C.text; ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(banner.sub, W / 2, 224);
      }
      ctx.globalAlpha = 1;
    }
    function drawTutorial() {
      if (!tut || mode !== 'play') return;
      var texts = [
        '👋 第一步:点击两个 💰 黄金符文连成一对,积攒金币',
        '🗼 第二步:点击战场上的虚线 ○ 空塔位,建造你的第一座箭塔',
        '🔥 第三步:连接一对 🔥 火焰符文,向怪物施放火球术',
        '⚔ 最后一步:守住法师塔,消灭所有来犯怪物!'
      ];
      var y = 360;
      var w = 660, x = W / 2 - w / 2;
      roundRect(x, y - 26, w, 40, 20);
      ctx.fillStyle = 'rgba(13,17,30,.92)'; ctx.fill();
      ctx.strokeStyle = C.gold; ctx.globalAlpha = 0.4 + 0.3 * Math.sin(tAnim * 4); ctx.lineWidth = 1.6;
      roundRect(x, y - 26, w, 40, 20); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.text; ctx.font = 'bold 15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(texts[tut.step], W / 2, y);
      for (var i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(x + 24 + i * 16, y + 8, 3, 0, 6.29);
        ctx.fillStyle = i <= tut.step ? C.gold : 'rgba(255,255,255,.2)';
        ctx.fill();
      }
    }
    function drawToasts() {
      ctx.textAlign = 'center';
      for (var i = 0; i < toasts.length; i++) {
        var t = toasts[i];
        var a = Math.min(1, t.t / 0.3, (2.2 - t.t) / 0.25 + 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        var y = 96 + i * 32;
        ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        var w2 = ctx.measureText(t.text).width + 36;
        roundRect(W / 2 - w2 / 2, y - 15, w2, 28, 14);
        ctx.fillStyle = 'rgba(13,19,32,.92)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,224,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.fillText(t.text, W / 2, y + 4);
      }
      ctx.globalAlpha = 1;
    }
    function drawPortraitHint() {
      if (portraitHintT <= 0) return;
      var a = Math.min(1, portraitHintT / 0.5, (9 - portraitHintT) / 0.5 + 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = 'rgba(13,19,32,.9)';
      roundRect(W / 2 - 210, 560, 420, 40, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(0,224,255,.4)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('📱 建议横屏或全屏游玩体验更佳', W / 2, 585);
      ctx.globalAlpha = 1;
    }

    function drawPick() {
      drawBg(cur.ch);
      ctx.fillStyle = 'rgba(6,8,16,.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🎁 战利品三选一', W / 2, 88);
      ctx.fillStyle = C.text3; ctx.font = '14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关通关奖励 · 重复获得自动升级', W / 2, 114);
      if (clearInfo && clearInfo.bossGain) {
        var BR = RUNES[clearInfo.bossGain];
        roundRect(W / 2 - 260, 132, 520, 34, 17);
        ctx.fillStyle = 'rgba(255,46,99,.14)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,46,99,.5)'; ctx.stroke();
        ctx.fillStyle = C.danger; ctx.font = 'bold 15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('👑 BOSS 掉落:终极符文 ' + BR.icon + ' ' + BR.name + ' 已解锁!', W / 2, 154);
      }
      pickHits = [];
      var cw = 250, chh = 330, gap = 40;
      var x0 = W / 2 - (cw * 3 + gap * 2) / 2;
      for (var i = 0; i < pickCards.length; i++) {
        var card = pickCards[i];
        var meta = card.cat === 'rune' ? RUNES[card.id] : (card.cat === 'tower' ? TOWERS[card.id] : RELICS[card.id]);
        var lv = wlv(card.id);
        var x = x0 + i * (cw + gap), y = 190;
        var hover = Math.sin(tAnim * 3 + i) * 3;
        ctx.save();
        ctx.translate(0, hover * 0.3);
        roundRect(x, y, cw, chh, 16);
        ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fill();
        ctx.strokeStyle = meta.color || theme().line; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
        ctx.shadowColor = meta.color || theme().line; ctx.shadowBlur = 14;
        roundRect(x, y, cw, chh, 16); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        // 类别条
        var catName = card.cat === 'rune' ? '符文武器' : (card.cat === 'tower' ? '防御塔' : '强化遗物');
        ctx.fillStyle = meta.color || theme().line; ctx.font = 'bold 12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('— ' + catName + ' —', x + cw / 2, y + 30);
        ctx.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(meta.icon, x + cw / 2, y + 92);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(meta.name, x + cw / 2, y + 150);
        ctx.font = 'bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillStyle = lv === 0 ? C.ok : C.gold;
        ctx.fillText(lv === 0 ? '🆕 全新解锁!' : '⬆ Lv' + lv + ' → Lv' + (lv + 1), x + cw / 2, y + 174);
        ctx.fillStyle = C.text2; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        wrapText(meta.desc, x + cw / 2, y + 204, cw - 40, 18);
        if (card.cat === 'rune' && card.id !== 'gold') {
          ctx.fillStyle = C.text3; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.fillText(shortDesc(card.id), x + cw / 2, y + 288);
        }
        ctx.restore();
        pickHits.push({ x: x, y: y, w: cw, h: chh, card: card });
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('点击一张卡片领取', W / 2, H - 34);
    }
    function wrapText(text, cx, y, maxW, lh) {
      var words = String(text).split('');
      var line = '', lines = [];
      for (var i = 0; i < words.length; i++) {
        if (ctx.measureText(line + words[i]).width > maxW) { lines.push(line); line = words[i]; }
        else line += words[i];
      }
      if (line) lines.push(line);
      for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, y + i * lh);
    }
    function drawClear() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(6,8,16,.66)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 38px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(cur.boss ? 'BOSS 击破!' : '第 ' + cur.num + ' 关 完成', W / 2, 150);
      if (clearInfo.bossGain) {
        ctx.fillStyle = C.danger; ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText('👑 获得章节终极符文:' + RUNES[clearInfo.bossGain].icon + ' ' + RUNES[clearInfo.bossGain].name, W / 2, 182);
      }
      for (var i = 0; i < 3; i++) {
        var t0 = 0.18 + i * 0.22;
        var k = Math.max(0, Math.min(1, (clearT - t0) / 0.3));
        if (k <= 0) continue;
        var sc = 1 + (k < 1 ? Math.sin(k * Math.PI) * 0.5 : 0);
        var on = i < clearInfo.stars;
        ctx.save();
        ctx.translate(W / 2 + (i - 1) * 92, 236);
        ctx.scale(sc, sc);
        starPath(0, 0, 38);
        ctx.fillStyle = on ? C.gold : 'rgba(255,255,255,.08)';
        if (on) { ctx.shadowColor = C.gold; ctx.shadowBlur = 24; }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        if (on && k >= 1 && clearT - t0 < 0.4 && Math.random() < 0.2) spawnBurst(W / 2 + (i - 1) * 92, 236, 3, C.gold);
      }
      ctx.fillStyle = C.text2; ctx.font = '16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('基地保全加成 +' + clearInfo.bonus + '(剩余 HP ' + base.hp + '/' + base.hpMax + ')', W / 2, 316);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(Math.round(score)), W / 2, 366);
      ctx.fillStyle = C.text3; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('TOTAL SCORE', W / 2, 386);
      clearHits = [];
      var defs = [
        { id: 'next', label: cur.num >= 30 ? '🏁 通关结算' : '▶ 下一关', primary: true },
        { id: 'replay', label: '↻ 重玩本关', primary: false },
        { id: 'map', label: '▤ 选关', primary: false }
      ];
      var bw2 = 176, bh2 = 54, gap = 18;
      var x0 = W / 2 - (bw2 * 3 + gap * 2) / 2;
      for (i = 0; i < 3; i++) {
        var x = x0 + i * (bw2 + gap), y = 452;
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
      drawBg(4);
      if (Math.random() < 0.12) spawnBurst(120 + Math.random() * (W - 240), 80 + Math.random() * 240, 14, C.gold);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var g = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
      g.addColorStop(0, C.gold); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, C.gold);
      ctx.fillStyle = g; ctx.font = 'bold 52px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = C.gold; ctx.shadowBlur = 30;
      ctx.fillText('🏆 全通关!', W / 2, 220);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.text; ctx.font = '19px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('魔王已陨落 · 你守住了全部 30 关的法师塔', W / 2, 268);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(String(Math.round(score)), W / 2, 344);
      ctx.fillStyle = C.text3; ctx.font = '13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('FINAL SCORE · ★ ' + totalStars() + '/90', W / 2, 368);
      var bw2 = 220, bh2 = 58;
      var bx = W / 2 - bw2 / 2, by = 430;
      roundRect(bx, by, bw2, bh2, 12);
      ctx.fillStyle = C.purple; ctx.fill();
      ctx.shadowColor = C.purple; ctx.shadowBlur = 18;
      roundRect(bx, by, bw2, bh2, 12); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('查看结算', W / 2, by + bh2 / 2 + 7);
      mapHits.back = { x: bx, y: by, w: bw2, h: bh2 };
    }
    function drawFail() {
      drawPlayScene();
      ctx.fillStyle = 'rgba(30,4,12,.72)'; ctx.fillRect(0, 0, W, H);
      var a = Math.max(0, Math.min(1, (1.6 - failT) / 0.3));
      ctx.globalAlpha = a;
      ctx.font = '52px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💔', W / 2, 232);
      ctx.fillStyle = C.danger; ctx.font = 'bold 40px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('法师塔陷落', W / 2, 316);
      ctx.fillStyle = C.text2; ctx.font = '17px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('第 ' + cur.num + ' 关 · 得分 ' + Math.round(score) + ' · 可从地图重试', W / 2, 354);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }
    function drawPauseVeil() {
      ctx.fillStyle = 'rgba(6,9,18,.7)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.text; ctx.font = 'bold 34px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⏸ 已暂停', W / 2, H / 2 - 10);
      ctx.fillStyle = C.text2; ctx.font = '15px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('点击工具栏「继续」或按 P 继续', W / 2, H / 2 + 26);
    }
    function drawPlayScene() {
      drawBg(cur.ch);
      drawSceneFx(0);
      // 战场底板
      roundRect(14, 58, W - 28, 244, 14);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
      ctx.strokeStyle = theme().line; ctx.globalAlpha = 0.1; ctx.lineWidth = 1.5;
      roundRect(14, 58, W - 28, 244, 14); ctx.stroke();
      ctx.globalAlpha = 1;
      drawPathRoad();
      drawPortal();
      drawSlots();
      drawEnemies();
      drawProjs();
      drawEffects();
      drawFlights();
      drawBase();
      drawBoardZone();
      drawHUD();
      drawStrip();
      drawLeftPanel();
      drawRightPanel();
      drawPopup();
      drawFloats();
      drawBanner();
      drawTutorial();
      drawToasts();
      drawPortraitHint();
    }

    /* ================= 输入 ================= */
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
      if (k === 'm') { muted = !muted; }
    }
    function onTap(x, y) {
      au();
      if (!running || paused) return;
      if (mode === 'map') { tapMap(x, y); return; }
      if (mode === 'gallery') { tapGallery(x, y); return; }
      if (mode === 'intro') { introT = 0; return; }
      if (mode === 'play') { tapPlay(x, y); return; }
      if (mode === 'pick') {
        for (var i = 0; i < pickHits.length; i++) {
          if (inRect(x, y, pickHits[i])) {
            sfx.click();
            applyPick(pickHits[i].card);
            return;
          }
        }
        return;
      }
      if (mode === 'clear') {
        for (i = 0; i < clearHits.length; i++) {
          if (!inRect(x, y, clearHits[i])) continue;
          sfx.click();
          if (clearHits[i].id === 'next') startLevel(lvIdx + 1, true);
          else if (clearHits[i].id === 'replay') startLevel(lvIdx, false);
          else goMap();
          return;
        }
        return;
      }
      if (mode === 'allclear' && inRect(x, y, mapHits.back)) {
        sfx.click();
        if (!overReported) reportOver();
        return;
      }
    }
    function tapMap(x, y) {
      for (var i = 0; i < mapHits.tabs.length; i++) {
        if (inRect(x, y, mapHits.tabs[i])) { chapterTab = mapHits.tabs[i].ch; initSceneFx(chapterTab); sfx.click(); return; }
      }
      if (inRect(x, y, mapHits.gallery)) { mode = 'gallery'; sfx.click(); return; }
      if (inRect(x, y, mapHits.reset)) {
        if (resetArm > 0) {
          progress = { unlocked: 1, stars: {}, weapons: { fire: 1, arrow: 1 } };
          saveProgress();
          resetArm = 0;
          toast('进度已重置');
          sfx.rescue();
        } else {
          resetArm = 3;
          toast('再点一次「重置」确认(武器库存也会清空)');
          sfx.bad();
        }
        return;
      }
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
    function tapGallery(x, y) {
      if (inRect(x, y, mapHits.back)) { mode = 'map'; sfx.click(); return; }
    }
    function tapPlay(x, y) {
      // 条带按钮
      for (var i = 0; i < btnHits.length; i++) {
        if (!inRect(x, y, btnHits[i])) continue;
        if (btnHits[i].id === 'call') earlyCall();
        else if (btnHits[i].id === 'mute') { muted = !muted; sfx.click(); }
        return;
      }
      // 弹出菜单
      if (popup) {
        for (i = 0; i < popupHits.length; i++) {
          if (!inRect(x, y, popupHits[i])) continue;
          if (popupHits[i].id === 'build') {
            buildTower(popup.slot, popupHits[i].tower);
          } else if (popupHits[i].id === 'up') {
            upgradeTower(popup.tower);
          } else if (popupHits[i].id === 'sell') {
            sellTower(popup.tower);
          }
          popup = null;
          return;
        }
        if (popup.close && inRect(x, y, popup.close)) return;   // 菜单空白处
        popup = null;                                            // 点外面关闭,继续透传
      }
      // 塔位
      for (i = 0; i < path.slots.length; i++) {
        var s = path.slots[i];
        var dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy <= 24 * 24) {
          if (tut && tut.step === 1 && s.tower) { toast('这座塔已就位,选一个空位 ○'); return; }
          popup = { slot: s, tower: s.tower, x: s.x, y: s.y };
          sfx.select();
          return;
        }
      }
      // 棋盘
      var c = Math.floor((x - board.ox) / board.bw);
      var r = Math.floor((y - board.oy) / board.bh);
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      var t = grid[r][c];
      if (t && !t.rock) trySelect(t);
    }

    /* ================= 帧循环 ================= */
    function step(dt) {
      // 通用衰减
      if (resetArm > 0) resetArm -= dt;
      if (shuffleFlashT > 0) shuffleFlashT -= dt;
      if (badFlashT > 0) badFlashT -= dt;
      if (refillFlashT > 0) refillFlashT -= dt;
      if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
      if (portraitHintT > 0) portraitHintT -= dt;
      if (banner) { banner.t += dt; if (banner.t >= banner.dur) banner = null; }
      if (comboPop) { comboPop.t += dt; if (comboPop.t > 0.9) comboPop = null; }
      if (frozenT > 0) frozenT -= dt;
      // 帧内延时
      for (var i = pendingFns.length - 1; i >= 0; i--) {
        pendingFns[i].t -= dt;
        if (pendingFns[i].t <= 0) { var fn = pendingFns[i].fn; pendingFns.splice(i, 1); fn(); }
      }
      // 粒子/飘字/特效/飞行物
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (i = floats.length - 1; i >= 0; i--) {
        var f = floats[i];
        f.t += dt; f.y += f.vy * dt;
        if (f.t >= f.dur) floats.splice(i, 1);
      }
      for (i = effects.length - 1; i >= 0; i--) {
        effects[i].t += dt;
        if (effects[i].t >= effects[i].dur) effects.splice(i, 1);
      }
      for (i = flights.length - 1; i >= 0; i--) {
        var fl = flights[i];
        fl.t += dt;
        if (fl.t >= fl.dur) {
          flights.splice(i, 1);
          if (fl.cb) fl.cb(fl.tx, fl.ty);
        }
      }
      for (i = dying.length - 1; i >= 0; i--) {
        dying[i].k += dt / 0.3;
        if (dying[i].k >= 1) dying.splice(i, 1);
      }
      for (i = lines.length - 1; i >= 0; i--) {
        lines[i].t += dt;
        if (lines[i].t > 0.34) lines.splice(i, 1);
      }
      for (i = toasts.length - 1; i >= 0; i--) {
        toasts[i].t -= dt;
        if (toasts[i].t <= 0) toasts.splice(i, 1);
      }
      // 棋盘方块补间(出生/补给滑动)
      if (grid) {
        var arr = allTiles();
        for (i = 0; i < arr.length; i++) {
          var t2 = arr[i];
          if (t2.born !== undefined && t2.born < 0.2) t2.born += dt;
          var tx = cellX(t2.c + 1), ty = cellY(t2.r + 1);
          var k = Math.min(1, dt * 11);
          t2.px += (tx - t2.px) * k;
          t2.py += (ty - t2.py) * k;
        }
      }

      if (mode === 'intro') {
        introT -= dt;
        if (introT <= 0) mode = 'play';
        return;
      }
      if (mode === 'play') {
        updateWaves(dt);
        updateEnemies(dt);
        updateTowers(dt);
        updateProjs(dt);
        updateBossMagic(dt);
        if (checkDelay > 0) { checkDelay -= dt; if (checkDelay <= 0) autoRescue(); }
        if (pendingClearT > 0) { pendingClearT -= dt; if (pendingClearT <= 0) doLevelClear(); }
        // 教学关:引导目标符文死局保护
        tutChkT -= dt;
        if (tutChkT <= 0) {
          tutChkT = 1;
          if (tut && tut.step === 0 && !findTypedPair('gold')) rescueType('gold');
          else if (tut && tut.step === 2 && !findTypedPair('fire')) rescueType('fire');
        }
        return;
      }
      if (mode === 'clear' || mode === 'allclear') { clearT += dt; return; }
      if (mode === 'fail') {
        failT -= dt;
        if (failT <= 0 && !overReported) reportOver();
      }
    }

    var lastTs = 0;
    function loop(ts) {
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      tAnim += dt;
      drawSceneFx(dt);
      // 竖屏提示(一次性)
      if (!portraitShown && window.innerHeight > window.innerWidth * 1.25) {
        portraitShown = true;
        portraitHintT = 9;
      }
      if (running && !paused) step(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function draw() {
      try { drawFrame(); } catch (e) { if (window.console) console.error(e); }
    }
    function drawFrame() {
      ctx.save();
      if (shakeT > 0 && (mode === 'play' || mode === 'fail')) {
        ctx.translate((Math.random() - 0.5) * 2 * shakeMag, (Math.random() - 0.5) * 2 * shakeMag);
      }
      if (mode === 'map') { drawMap(); }
      else if (mode === 'gallery') { drawGallery(); }
      else if (mode === 'intro') { drawIntro(); }
      else if (mode === 'play') {
        drawPlayScene();
        if (paused) drawPauseVeil();
      }
      else if (mode === 'pick') { drawPick(); }
      else if (mode === 'clear') { drawClear(); drawToasts(); }
      else if (mode === 'allclear') { drawAllClear(); }
      else if (mode === 'fail') { drawFail(); }
      ctx.restore();
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
      overReported = false;
      pendingFns = [];
      goMap();
      initSceneFx(chapterTab);
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
    initSceneFx(0);
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
