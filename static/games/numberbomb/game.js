/* ========================================================================
   数字炸弹 — 遵循 window.IanGame 接口契约
   1~100 中藏着一颗"炸弹",轮流报数收缩安全范围,猜中炸弹的人中招。
   围坐传手机轮流输入,惩罚由玩家线下自行约定。
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    var bomb, lo, hi, input, state, safeRounds, score, rafId, running, paused, boomT, tick;
    // 数字键盘布局
    var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
    var kb = { x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0, gap: 12 };

    function reset() {
      bomb = 1 + Math.floor(Math.random() * 100);
      lo = 1; hi = 100; input = ''; state = 'playing';
      safeRounds = 0; score = 0; boomT = 0; tick = 0;
      layoutKb();
      emitScore(); emitState('playing');
    }
    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function layoutKb() {
      kb.w = Math.min(420, W - 80);
      kb.cw = (kb.w - kb.gap * 2) / 3;
      kb.ch = 64;
      kb.h = kb.ch * 4 + kb.gap * 3;
      kb.x = W / 2 - kb.w / 2;
      kb.y = H - kb.h - 26;
    }

    function submit() {
      if (!input) return;
      var n = parseInt(input, 10);
      input = '';
      if (n < lo || n > hi || isNaN(n)) return;   // 越界忽略
      if (n === bomb) {
        state = 'boom'; boomT = 90;
        hooks.onGameOver && hooks.onGameOver(score, 1);
        emitState('over');
        return;
      }
      if (n < bomb) lo = n + 1; else hi = n - 1;
      safeRounds += 1; score += 1; emitScore();
    }

    function onTap(x, y) {
      if (!running || paused) return;
      if (state === 'boom') {
        // 再来一局按钮
        var bw = 200, bh = 56, bx = W / 2 - bw / 2, by = H / 2 + 90;
        if (x > bx && x < bx + bw && y > by && y < by + bh) { start(); }
        return;
      }
      // 键盘命中
      if (x < kb.x || x > kb.x + kb.w || y < kb.y || y > kb.y + kb.h) return;
      var col = Math.floor((x - kb.x) / (kb.cw + kb.gap));
      var row = Math.floor((y - kb.y) / (kb.ch + kb.gap));
      if (col > 2 || row > 3) return;
      var cx0 = kb.x + col * (kb.cw + kb.gap), cy0 = kb.y + row * (kb.ch + kb.gap);
      if (x > cx0 + kb.cw || y > cy0 + kb.ch) return;
      var k = KEYS[row * 3 + col];
      if (k === '⌫') { input = input.slice(0, -1); }
      else if (k === '✓') { submit(); }
      else if (input.length < 3) { input += k; }
    }

    function step() {
      tick++;
      if (boomT > 0) boomT--;
    }

    function draw() {
      ctx.save();
      // 背景
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1204'); g.addColorStop(1, '#060912');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      if (state === 'boom') {
        drawBoom();
        ctx.restore();
        return;
      }

      // 标题
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 34px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('数字炸弹', W / 2, 58);
      ctx.fillStyle = '#8b97b3'; ctx.font = '15px Rajdhani';
      ctx.fillText('轮流报数收缩范围,踩中炸弹的人中招 · 安全 ' + safeRounds + ' 轮', W / 2, 88);

      // 范围显示
      var ry = 158;
      ctx.strokeStyle = 'rgba(255,182,39,.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - 250, ry); ctx.lineTo(W / 2 + 250, ry); ctx.stroke();
      ctx.fillStyle = '#ffb627'; ctx.font = 'bold 15px Orbitron';
      ctx.textAlign = 'left'; ctx.fillText(String(lo), W / 2 - 246, ry - 12);
      ctx.textAlign = 'right'; ctx.fillText(String(hi), W / 2 + 246, ry - 12);
      ctx.textAlign = 'center';
      // 安全区间条
      var span = Math.max(1, hi - lo + 1);
      var barW = 460;
      var bx = W / 2 - barW / 2;
      roundRect(bx, ry + 10, barW, 14, 7); ctx.fillStyle = '#111a2e'; ctx.fill();
      var safeW = Math.max(10, barW * span / 100);
      roundRect(bx + (barW - safeW) * ((lo - 1) / (100 - span + 1 || 1)), ry + 10, safeW, 14, 7);
      ctx.fillStyle = '#2ee6a6'; ctx.fill();

      // 当前输入
      var iy = 268;
      ctx.fillStyle = '#0d1320'; roundRect(W / 2 - 130, iy - 46, 260, 74, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(0,224,255,.5)'; ctx.lineWidth = 2; roundRect(W / 2 - 130, iy - 46, 260, 74, 12); ctx.stroke();
      ctx.fillStyle = input ? '#00e0ff' : '#39445c';
      ctx.font = 'bold 44px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(input || '···', W / 2, iy - 9);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#8b97b3'; ctx.font = '13px Rajdhani';
      ctx.fillText(input ? ('报 ' + input + ' · 点 ✓ 确认') : '轮到下一位,输入一个 ' + lo + '~' + hi + ' 的数', W / 2, iy + 46);

      // 数字键盘
      for (var i = 0; i < KEYS.length; i++) {
        var col = i % 3, row = Math.floor(i / 3);
        var x = kb.x + col * (kb.cw + kb.gap), y = kb.y + row * (kb.ch + kb.gap);
        var isOk = KEYS[i] === '✓', isDel = KEYS[i] === '⌫';
        roundRect(x, y, kb.cw, kb.ch, 12);
        ctx.fillStyle = isOk ? '#b537f2' : (isDel ? '#1c2640' : '#111a2e');
        ctx.fill();
        ctx.strokeStyle = isOk ? 'rgba(181,55,242,.6)' : 'rgba(124,58,237,.35)';
        ctx.lineWidth = 1.5; roundRect(x, y, kb.cw, kb.ch, 12); ctx.stroke();
        ctx.fillStyle = isOk ? '#fff' : '#eaf0fb';
        ctx.font = (isOk || isDel ? 'bold 26px' : 'bold 30px') + ' Orbitron';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(KEYS[i], x + kb.cw / 2, y + kb.ch / 2 + 1);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    function drawBoom() {
      var t = boomT;
      ctx.save();
      if (t > 60) {  // 闪光
        var k = (t - 60) / 30;
        ctx.fillStyle = 'rgba(255,213,74,' + (k * 0.9) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.translate(W / 2, H / 2 - 40);
      if (t > 40) ctx.scale(1 + (t - 40) / 60, 1 + (t - 40) / 60);
      // 爆炸
      ctx.shadowBlur = 60; ctx.shadowColor = '#ff2e63';
      ctx.fillStyle = '#ff2e63'; ctx.font = 'bold 120px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💥', 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 40px Orbitron';
      ctx.fillText('BOOM!', 0, 110);
      ctx.fillStyle = '#8b97b3'; ctx.font = '17px Rajdhani';
      ctx.fillText('炸弹是 ' + bomb + ' · 本局安全 ' + safeRounds + ' 轮', 0, 150);
      // 再来一局
      var bw = 200, bh = 56;
      roundRect(-bw / 2, 190 - (H / 2 - 40) + (H / 2 - 40), bw, bh, 12);
      ctx.restore();
      ctx.save();
      var bx = W / 2 - 100, by = H / 2 + 90;
      roundRect(bx, by, 200, 56, 12); ctx.fillStyle = '#b537f2'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Rajdhani'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('再来一局', W / 2, by + 29);
      ctx.restore();
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
