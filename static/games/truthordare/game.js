/* ========================================================================
   真心话大冒险 — 遵循 window.IanGame 接口契约
   聚会互动:点击转盘选出"幸运儿"→ 真心话/大冒险二选一 → 随机题目。
   围坐传手机轮流玩,惩罚由玩家线下自行约定。
   ======================================================================== */
(function () {
  'use strict';

  var TRUTHS = [
    '最近一次说谎是什么时候?为了什么?',
    '讲一件从小到大最尴尬的事',
    '你暗恋过在场的人吗?',
    '手机相册里最不想被人看到的照片是什么?',
    '最近一次哭是因为什么?',
    '你做过最幼稚的一件事是什么?',
    '说出三个自己的怪癖',
    '你最后悔的一件事是什么?',
    '在场的人里你最羡慕谁?为什么?',
    '你偷偷做过什么没人知道的好事?',
    '你的初恋是几岁?什么样的人?',
    '你撒过最大的谎是什么?',
    '你最不喜欢的身上的哪个特点?',
    '如果明天是世界末日,今晚你想做什么?',
    '你做过最疯狂的梦是什么?',
    '你最害怕什么?',
    '你偷偷追过最久的一个人多久?',
    '小时候干过最淘气的事是什么?',
    '你的钱包里现在有多少钱?',
    '你最糗的一次社死经历?',
    '收到过最离谱的礼物是什么?',
    '你做过什么让爸妈至今不知道的事?',
    '如果可以隐身一天,你会去做什么?',
    '你最近一次熬夜到凌晨在干什么?',
    '说出一个你的小秘密',
    '你最想拥有的超能力是什么?为什么?',
    '你觉得自己什么时候最帅/最美?',
    '有没有一件事,你一直想做却不敢做?',
    '你最想对在场哪个人说声谢谢?为什么?',
    '如果给你一次重来的机会,你想改变什么?',
  ];
  var DARES = [
    '学一种动物叫,直到下一位选完牌',
    '唱一句你最近单曲循环的歌',
    '做 10 个俯卧撑或 20 个深蹲',
    '给右边的人按摩肩膀 30 秒',
    '模仿在场一个人的口头禅和动作,让大家猜是谁',
    '用屁股写自己的名字',
    '保持一个鬼脸直到下一轮开始',
    '给通讯录里第 5 个人发"我想你了"',
    '深情朗诵一句土味情话给左边的人',
    '倒着说出你名字的每个字并解释含义',
    '单脚站立 30 秒,期间不许笑',
    '用戏剧腔调朗读刚才的题目',
    '扮演新闻主播播报"今天的聚会现场"',
    '让你的上一位给你摆一个拍照姿势并保持',
    '头顶尖的东西走到房间对面再回来',
    '模仿一种乐器solo 15 秒',
    '对窗外大喊"我是最棒的!"',
    '讲一个冷笑话,冷场也算完成任务',
    '和左边的人击掌十次,每次力度递增',
    '闭眼转三圈然后走直线',
    '用表情演绎"尴尬"这个词',
    '给一位在场的人画一张简笔肖像(20 秒)',
    '表演一段机械舞或广场舞',
    '用最大的音量夸自己十秒钟',
    '打电话给朋友说"我的钱包掉了"然后说拨错了',
    '把"红鲤鱼与绿鲤鱼与驴"快速念五遍',
    '蒙眼猜出三个人摸你的手是谁的',
    '当雕像 30 秒,别人可以给你摆造型',
    '说三句押韵的话夸下一位',
    '用歌声回答下一个问题(由在场者提问)',
  ];

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CX = W / 2, CY = H * 0.44, R = Math.min(W, H * 0.9) * 0.30;

    var state, score, angle, spinV, chosen, cardKind, cardText, rafId, running, paused, particles, shakeT;

    var SEATS = ['1号', '2号', '3号', '4号', '5号', '6号', '7号', '8号'];
    var COLORS = ['#b537f2', '#00e0ff', '#ff2e63', '#ffb627', '#2ee6a6', '#7c3aed', '#ff7847', '#3da9fc'];

    function reset() {
      state = 'ready'; score = 0; angle = 0; spinV = 0; chosen = -1;
      cardKind = ''; cardText = ''; particles = []; shakeT = 0;
      emitScore(); emitState('playing');
    }
    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function onTap(x, y) {
      if (!running || paused) return;
      if (state === 'ready') {
        var d = Math.hypot(x - CX, y - CY);
        if (d < R * 1.12) {  // 点转盘开始
          state = 'spin';
          spinV = 0.28 + Math.random() * 0.2;
        }
      } else if (state === 'select') {
        // 两张牌:真心话(左) / 大冒险(右) —— 命中区与 drawCard 绘制区一致
        var pw = 220, ph = 150;
        var y0 = H - 210;
        if (y > y0 && y < y0 + ph) {
          if (x > CX - 240 && x < CX - 240 + pw) { cardKind = 'truth'; cardText = pick(TRUTHS); state = 'card'; }
          else if (x > CX + 20 && x < CX + 20 + pw) { cardKind = 'dare'; cardText = pick(DARES); state = 'card'; }
        }
      } else if (state === 'card') {
        // 完成按钮
        var bw = 180, bh = 52;
        var bx = CX - bw / 2, by = H - 110;
        if (x > bx && x < bx + bw && y > by && y < by + bh) {
          score += 1; emitScore();
          state = 'ready'; chosen = -1;
        }
      }
    }

    function step() {
      if (state === 'spin') {
        angle += spinV;
        spinV *= 0.975;
        if (spinV < 0.004) {
          spinV = 0;
          // 指针在正上方,选中扇区 = 根据角度计算
          var per = Math.PI * 2 / SEATS.length;
          var a = (Math.PI * 1.5 - angle) % (Math.PI * 2);
          if (a < 0) a += Math.PI * 2;
          chosen = Math.floor(a / per) % SEATS.length;
          state = 'select';
          spark(CX + Math.cos(angle) * R, CY + Math.sin(angle) * R, 16);
        }
      }
      particles.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; });
      particles = particles.filter(function (p) { return p.life > 0; });
      if (shakeT > 0) shakeT--;
    }

    function spark(x, y, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 7, sp = 2 + Math.random() * 5;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 30, color: COLORS[i % 8], r: 3 });
      }
    }

    function draw() {
      ctx.save();
      if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      // 背景
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a0a2a'); g.addColorStop(1, '#060912');
      ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);

      // 标题
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 34px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('真心话大冒险', CX, 62);
      ctx.fillStyle = '#8b97b3'; ctx.font = '15px Rajdhani';
      var hint = state === 'ready' ? '点击转盘,选出本轮的"幸运儿"' :
        state === 'spin' ? '转盘转动中…' :
        state === 'select' ? SEATS[chosen] + ',请选择:' :
        '完成任务后点击按钮进入下一轮';
      ctx.fillText(hint, CX, 92);

      // 转盘
      ctx.save();
      ctx.translate(CX, CY);
      ctx.shadowBlur = 24; ctx.shadowColor = 'rgba(181,55,242,.55)';
      var per = Math.PI * 2 / SEATS.length;
      for (var i = 0; i < SEATS.length; i++) {
        var a0 = angle + i * per, a1 = a0 + per;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
        ctx.fillStyle = (state !== 'ready' && chosen === i) ? '#ffd54a' : COLORS[i];
        ctx.fill();
        ctx.strokeStyle = 'rgba(6,9,18,.5)'; ctx.lineWidth = 2; ctx.stroke();
        // 扇区文字
        ctx.save();
        ctx.rotate(a0 + per / 2);
        ctx.fillStyle = '#060912'; ctx.font = 'bold 17px Rajdhani';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(SEATS[i], R - 16, 0);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      // 中心
      ctx.beginPath(); ctx.arc(0, 0, R * 0.18, 0, 7);
      ctx.fillStyle = '#0d1320'; ctx.fill();
      ctx.strokeStyle = '#00e0ff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#00e0ff'; ctx.font = 'bold 15px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state === 'ready' ? 'GO' : '·', 0, 1);
      ctx.restore();
      // 指针(正上方)
      ctx.beginPath();
      ctx.moveTo(CX, CY - R - 18); ctx.lineTo(CX - 13, CY - R - 42); ctx.lineTo(CX + 13, CY - R - 42);
      ctx.closePath(); ctx.fillStyle = '#ff2e63'; ctx.fill();

      // 选择牌 / 题目卡
      if (state === 'select' || state === 'card') {
        var t = Math.min(1, 1); // 出现动画可省
        if (state === 'select') {
          drawCard(CX - 240, H - 210, '真心话', '#00e0ff', '?');
          drawCard(CX + 20, H - 210, '大冒险', '#ff2e63', '!');
        } else {
          var isT = cardKind === 'truth';
          drawBigCard(CX, H * 0.60, isT ? '真心话' : '大冒险', isT ? '#00e0ff' : '#ff2e63', cardText);
          // 完成按钮
          var bw = 180, bh = 52, bx = CX - bw / 2, by = H - 92;
          roundRect(bx, by, bw, bh, 12); ctx.fillStyle = '#b537f2'; ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Rajdhani'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('完成,下一轮 →', CX, by + bh / 2 + 1);
        }
      }

      // 计分
      ctx.fillStyle = '#8b97b3'; ctx.font = '14px Rajdhani'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('已完成 ' + score + ' 轮', 24, H - 24);

      // 粒子
      particles.forEach(function (p) {
        ctx.globalAlpha = p.life / 30; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawCard(x, y, label, color, mark) {
      var w = 220, h = 150;
      ctx.save();
      ctx.shadowBlur = 18; ctx.shadowColor = color;
      roundRect(x, y, w, h, 16); ctx.fillStyle = '#0d1320'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; roundRect(x, y, w, h, 16); ctx.stroke();
      ctx.fillStyle = color; ctx.font = 'bold 52px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(mark, x + w / 2, y + 52);
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 24px Rajdhani';
      ctx.fillText(label, x + w / 2, y + 116);
      ctx.restore();
    }
    function drawBigCard(cx, cy, label, color, text) {
      var w = Math.min(W - 80, 560), h = 220;
      var x = cx - w / 2, y = cy - h / 2;
      ctx.save();
      ctx.shadowBlur = 22; ctx.shadowColor = color;
      roundRect(x, y, w, h, 18); ctx.fillStyle = '#0d1320'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color; ctx.lineWidth = 3; roundRect(x, y, w, h, 18); ctx.stroke();
      ctx.fillStyle = color; ctx.font = 'bold 24px Rajdhani'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('· ' + label + ' ·', cx, y + 40);
      // 题目自动换行
      ctx.fillStyle = '#eaf0fb'; ctx.font = '22px Rajdhani';
      wrapText(text, cx, y + 105, w - 60, 30);
      ctx.restore();
    }
    function wrapText(text, cx, startY, maxW, lineH) {
      var line = '', lines = [];
      for (var i = 0; i < text.length; i++) {
        var test = line + text[i];
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = text[i]; }
        else line = test;
      }
      lines.push(line);
      if (lines.length > 4) lines = lines.slice(0, 4), lines[3] += '…';
      lines.forEach(function (l, idx) { ctx.fillText(l, cx, startY + idx * lineH); });
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function loop() {
      if (running && !paused) step();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function onPointer(e) {
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (canvas.width / r.width);
      var y = (e.clientY - r.top) * (canvas.height / r.height);
      onTap(x, y);
    }
    canvas.addEventListener('pointerdown', onPointer);

    function togglePause() { if (!running) return; paused ? resume() : pause(); }
    function start() { reset(); running = true; paused = false; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { paused = false; emitState('playing'); }
    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('pointerdown', onPointer); }

    window.addEventListener('keydown', function (e) { if (e.key === 'p') togglePause(); });

    reset(); running = false; rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
