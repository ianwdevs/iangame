/* ========================================================================
   打砖块 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  var COLORS = ['#b537f2', '#7c3aed', '#00e0ff', '#2ee6a6', '#ffb627', '#ff2e63'];

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    var paddle, ball, bricks, score, level, lives, running, rafId, paused;
    var keys = {}, mouseX = null;

    function reset(keepLevel) {
      level = keepLevel ? level : 1;
      score = keepLevel ? score : 0;
      lives = 3;
      paddle = { w: 110, h: 14, x: W/2 - 55, y: H - 30, speed: 8 };
      ball = { r: 8, x: W/2, y: H - 50, vx: 4 * (Math.random() < .5 ? 1 : -1), vy: -4.5 };
      buildBricks();
      emitScore(); emitState('playing');
    }
    function buildBricks() {
      bricks = [];
      var rows = Math.min(5 + level, 8), cols = 10, bw = (W - 60) / cols, bh = 22;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        bricks.push({ x: 30 + c*bw, y: 50 + r*(bh+8), w: bw-4, h: bh, color: COLORS[r % COLORS.length], alive: true, hp: r < 1 ? 2 : 1 });
      }
    }

    function emitScore() { hooks.onScore && hooks.onScore(score, level); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function step() {
      // 挡板
      if (keys['ArrowLeft'] || keys['a']) paddle.x -= paddle.speed;
      if (keys['ArrowRight'] || keys['d']) paddle.x += paddle.speed;
      if (mouseX !== null) paddle.x = mouseX - paddle.w/2;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx *= -1; }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx *= -1; }
      if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; }
      // 落底
      if (ball.y > H + 20) {
        lives--; if (lives <= 0) { emitState('over'); hooks.onGameOver && hooks.onGameOver(score, level); paused = true; return; }
        ball.x = W/2; ball.y = H - 50; ball.vx = 4 * (Math.random()<.5?1:-1); ball.vy = -4.5;
      }
      // 挡板碰撞
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h &&
          ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
        ball.y = paddle.y - ball.r;
        var rel = (ball.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
        var sp = Math.hypot(ball.vx, ball.vy); sp = Math.min(sp + 0.15, 11);
        var ang = rel * 1.05; // ~60度
        ball.vx = sp * Math.sin(ang); ball.vy = -sp * Math.cos(ang);
      }
      // 砖块碰撞
      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i]; if (!b.alive) continue;
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
            ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
          // 判断从哪面进
          var ox = ball.x < b.x ? b.x : (ball.x > b.x + b.w ? b.x + b.w : ball.x);
          var oy = ball.y < b.y ? b.y : (ball.y > b.y + b.h ? b.y + b.h : ball.y);
          if (Math.abs(ball.x - ox) > Math.abs(ball.y - oy)) ball.vx *= -1; else ball.vy *= -1;
          b.hp--; if (b.hp <= 0) { b.alive = false; score += 10; }
          emitScore(); break;
        }
      }
      // 通关
      if (bricks.every(function (b) { return !b.alive; })) {
        level++; score += 100; reset(true);
      }
    }

    function draw() {
      ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, W, H);
      // 砖块
      bricks.forEach(function (b) {
        if (!b.alive) return;
        ctx.shadowBlur = 8; ctx.shadowColor = b.color;
        ctx.fillStyle = b.color; roundRect(b.x, b.y, b.w, b.h, 5); ctx.fill();
        if (b.hp > 1) { ctx.fillStyle = 'rgba(255,255,255,.25)'; roundRect(b.x, b.y, b.w, b.h/2, 5); ctx.fill(); }
      });
      ctx.shadowBlur = 0;
      // 挡板
      ctx.shadowBlur = 16; ctx.shadowColor = '#00e0ff';
      ctx.fillStyle = '#00e0ff'; roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7); ctx.fill();
      // 球
      ctx.shadowColor = '#b537f2'; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      // 生命
      ctx.fillStyle = '#ff2e63'; ctx.font = 'bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'left'; ctx.fillText('❤'.repeat(Math.max(0,lives)), 12, H - 10);
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    function loop() {
      if (running && !paused) step();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function onKey(e) {
      keys[e.key] = (e.type === 'keydown');
      if (e.key === ' ') { togglePause(); e.preventDefault(); }
    }
    function onMouse(e) {
      var rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * (W / rect.width);
    }
    function togglePause() { if (paused) resume(); else pause(); }

    function start() { reset(false); running = true; paused = false; last = 0; if (!rafId) rafId = requestAnimationFrame(loop); }
    function pause() { if (!running) return; paused = true; emitState('paused'); }
    function resume() { if (!running) return; paused = false; emitState('playing'); }
    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); canvas.removeEventListener('mousemove', onMouse); canvas.removeEventListener('touchmove', onTouch); }

    function onTouch(e) { var t = e.touches[0]; var rect = canvas.getBoundingClientRect(); mouseX = (t.clientX-rect.left)*(W/rect.width); e.preventDefault(); }

    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    canvas.addEventListener('mousemove', onMouse); canvas.addEventListener('touchmove', onTouch, { passive: false });
    reset(false); running = false; rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
