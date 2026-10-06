/* ========================================================================
   2048 — 遵循 window.IanGame 接口契约(滑动合并)
   ======================================================================== */
(function () {
  'use strict';

  var TILE_COLORS = {
    2: '#1c2640', 4: '#243156', 8: '#7c3aed', 16: '#b537f2', 32: '#d946ef',
    64: '#ff2e63', 128: '#ff7847', 256: '#ffb627', 512: '#ffd54a',
    1024: '#00e0ff', 2048: '#2ee6a6', 4096: '#eaf0fb'
  };

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var N = 4, PAD = 14;
    var board, score, won, over, running, rafId;

    function reset() {
      board = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
      score = 0; won = false; over = false;
      addRandom(); addRandom();
      emitScore(); emitState('playing');
    }

    function addRandom() {
      var empty = [];
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!board[r][c]) empty.push([r, c]);
      if (!empty.length) return false;
      var p = empty[(Math.random() * empty.length) | 0];
      board[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
      return true;
    }

    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    // 向左压缩一行
    function slide(row) {
      var f = row.filter(function (v) { return v; });
      for (var i = 0; i < f.length - 1; i++) {
        if (f[i] === f[i + 1]) { f[i] *= 2; score += f[i]; if (f[i] === 2048) won = true; f.splice(i + 1, 1); }
      }
      while (f.length < N) f.push(0);
      return f;
    }
    function rotate(b) {
      var n = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) n[c][N-1-r] = b[r][c];
      return n;
    }
    function move(dir) {
      if (over) return;
      var before = JSON.stringify(board);
      var b = board;
      var rot = { left: 0, up: 1, right: 2, down: 3 }[dir];
      for (var i = 0; i < rot; i++) b = rotate(b);
      b = b.map(slide);
      for (var j = 0; j < (4 - rot) % 4; j++) b = rotate(b);
      board = b;
      if (JSON.stringify(board) !== before) {
        addRandom(); emitScore();
        if (!canMove()) { over = true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1); }
      }
    }
    function canMove() {
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        if (!board[r][c]) return true;
        if (c < N-1 && board[r][c] === board[r][c+1]) return true;
        if (r < N-1 && board[r][c] === board[r+1][c]) return true;
      }
      return false;
    }

    function draw() {
      ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, W, H);
      // 以短边为基准算格子并整体居中:画布 1100x660 非正方形,按宽布局会溢出底部
      var size = (Math.min(W, H) - PAD * (N + 1)) / N;
      var ox = (W - (size * N + PAD * (N + 1))) / 2;
      var oy = (H - (size * N + PAD * (N + 1))) / 2;
      // 背板格
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var x = ox + PAD + c * (size + PAD), y = oy + PAD + r * (size + PAD);
        roundRect(x, y, size, size, 10); ctx.fillStyle = '#111a2e'; ctx.fill();
      }
      // 数字格
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var v = board[r][c]; if (!v) continue;
        var x = ox + PAD + c * (size + PAD), y = oy + PAD + r * (size + PAD);
        ctx.shadowBlur = v >= 128 ? 16 : 6; ctx.shadowColor = TILE_COLORS[v] || '#fff';
        roundRect(x, y, size, size, 10); ctx.fillStyle = TILE_COLORS[v] || '#eaf0fb'; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = v <= 4 ? '#8b97b3' : '#060912';
        ctx.font = 'bold ' + Math.round(v < 100 ? size*.42 : v < 1000 ? size*.32 : size*.26) + 'px Orbitron, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v, x + size/2, y + size/2 + 2);
      }
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    }

    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    function onKey(e) {
      var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a:'left', d:'right', w:'up', s:'down' };
      var d = map[e.key];
      if (d) { move(d); e.preventDefault(); }
      else if (e.key === ' ') { togglePause(); e.preventDefault(); }
    }
    var paused = false;
    function togglePause() { if (over) return; paused ? resume() : pause(); }
    function start() { reset(); running = true; if (!rafId) rafId = requestAnimationFrame(loop); }
    function pause() { paused = true; emitState('paused'); if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    function resume() { if (over) return; paused = false; emitState('playing'); if (!rafId) rafId = requestAnimationFrame(loop); }
    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown', onKey); }

    // 触摸滑动
    var ts = null;
    canvas.addEventListener('touchstart', function (e) { var t = e.touches[0]; ts = { x: t.clientX, y: t.clientY }; }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!ts) return; var t = e.changedTouches[0];
      var dx = t.clientX - ts.x, dy = t.clientY - ts.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
      ts = null;
    });

    window.addEventListener('keydown', onKey);
    reset(); rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
