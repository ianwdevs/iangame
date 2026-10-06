/* ========================================================================
   幸运左轮 — 遵循 window.IanGame 接口契约
   六个弹巢藏一颗"子弹",轮流扣扳机,中弹者中招(六枪内必出)。
   围坐传手机轮流扣扳机,惩罚由玩家线下自行约定。
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CX = W / 2, CY = H * 0.40, R = Math.min(W, H) * 0.21;

    var bullet, pulls, state, score, rafId, running, paused, spinT, spinA, flashes;

    function reset() {
      bullet = Math.floor(Math.random() * 6);   // 子弹位置 0-5
      pulls = 0; state = 'play'; score = 0; spinT = 0; spinA = 0; flashes = [];
      emitScore(); emitState('playing');
    }
    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function onTap(x, y) {
      if (!running || paused) return;
      if (state === 'over') {
        var bw = 200, bh = 56, bx = CX - bw / 2, by = H - 120;
        if (x > bx && x < bx + bw && y > by && y < by + bh) { start(); }
        return;
      }
      if (state !== 'play' || spinT > 0) return;
      // 扳机按钮
      var bw2 = 300, bh2 = 74, bx2 = CX - bw2 / 2, by2 = H - 210;
      if (x > bx2 && x < bx2 + bw2 && y > by2 && y < by2 + bh2) {
        spinT = 34; spinA = 0;   // 转轮动画
      }
    }

    function step() {
      if (spinT > 0) {
        spinT--;
        spinA += 0.5 * (spinT / 34) + 0.05;
        if (spinT === 0) {
          pulls += 1;
          if (pulls - 1 === bullet) {
            state = 'over';
            for (var i = 0; i < 40; i++) flashes.push({
              x: CX + (Math.random() - 0.5) * 60, y: CY + (Math.random() - 0.5) * 60,
              vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10 - 3, life: 40,
              color: Math.random() < 0.5 ? '#ff2e63' : '#ffd54a', r: 2 + Math.random() * 4,
            });
            hooks.onGameOver && hooks.onGameOver(score, 1);
            emitState('over');
          } else {
            score += 1; emitScore();   // 空枪,存活+1
          }
        }
      }
      flashes.forEach(function (f) { f.x += f.vx; f.y += f.vy; f.vy += 0.2; f.life--; });
      flashes = flashes.filter(function (f) { return f.life > 0; });
    }

    function draw() {
      ctx.save();
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#150826'); g.addColorStop(1, '#060912');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // 标题与提示
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 34px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('幸运左轮', CX, 58);
      ctx.fillStyle = '#8b97b3'; ctx.font = '15px Rajdhani';
      var hint = state === 'over'
        ? '第 ' + pulls + ' 枪命中 · 空枪 ' + score + ' 次'
        : '六个弹巢一颗子弹 · 已扣 ' + pulls + '/6 · 轮流扣扳机';
      ctx.fillText(hint, CX, 88);

      // 弹巢(六格圆盘),扣过的格子标记
      ctx.save();
      ctx.translate(CX, CY);
      var rot = spinT > 0 ? spinA : 0;
      ctx.rotate(rot);
      ctx.shadowBlur = 26; ctx.shadowColor = 'rgba(181,55,242,.5)';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fillStyle = '#0d1320'; ctx.fill();
      ctx.shadowBlur = 0;
      var per = Math.PI * 2 / 6;
      for (var i = 0; i < 6; i++) {
        var a0 = -Math.PI / 2 + i * per;
        var cx = Math.cos(a0) * R * 0.62, cy = Math.sin(a0) * R * 0.62;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.21, 0, 7);
        var fired = i < pulls;   // 依次击发
        ctx.fillStyle = fired ? 'rgba(255,46,99,.28)' : '#1c2640';
        ctx.fill();
        ctx.strokeStyle = fired ? '#ff2e63' : 'rgba(124,58,237,.6)';
        ctx.lineWidth = 2; ctx.stroke();
        if (fired) {
          ctx.fillStyle = '#ff2e63'; ctx.font = 'bold ' + Math.round(R * 0.18) + 'px Orbitron';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✕', cx, cy + 1);
        }
      }
      // 中心
      ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, 7);
      ctx.fillStyle = '#111a2e'; ctx.fill();
      ctx.strokeStyle = '#00e0ff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      ctx.textBaseline = 'alphabetic';

      if (state === 'play') {
        // 扳机按钮
        var bw = 300, bh = 74, bx = CX - bw / 2, by = H - 210;
        var active = spinT === 0;
        roundRect(bx, by, bw, bh, 16);
        ctx.fillStyle = active ? '#b537f2' : '#39445c'; ctx.fill();
        ctx.shadowBlur = active ? 20 : 0; ctx.shadowColor = 'rgba(181,55,242,.6)';
        roundRect(bx, by, bw, bh, 16); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = active ? '#fff' : '#8b97b3';
        ctx.font = 'bold 26px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(spinT > 0 ? '咔…' : '🔫  扣扳机', CX, by + bh / 2 + 1);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#8b97b3'; ctx.font = '14px Rajdhani';
        ctx.fillText('传给下一位,点击扣扳机', CX, by + bh + 30);
      } else {
        // 结束面板
        ctx.fillStyle = '#ff2e63'; ctx.font = 'bold 44px Orbitron';
        ctx.fillText('💥 中弹!', CX, CY + R + 70);
        ctx.fillStyle = '#8b97b3'; ctx.font = '16px Rajdhani';
        ctx.fillText('第 ' + (bullet + 1) + ' 号弹巢 · 本轮空枪 ' + score + ' 次', CX, CY + R + 104);
        var bw3 = 200, bh3 = 56, bx3 = CX - bw3 / 2, by3 = H - 120;
        roundRect(bx3, by3, bw3, bh3, 12); ctx.fillStyle = '#b537f2'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Rajdhani'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('重新装弹,再来', CX, by3 + 29);
        ctx.textBaseline = 'alphabetic';
      }

      flashes.forEach(function (f) {
        ctx.globalAlpha = f.life / 40; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
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
