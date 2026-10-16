/* ========================================================================
   扫雷 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  var DIFFS = { easy: { r: 9, c: 9, m: 10 }, med: { r: 12, c: 12, m: 24 }, hard: { r: 14, c: 14, m: 45 } };

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cfg = DIFFS.easy, cell, offX, offY, topBar = 46;
    var grid, revealed, flagged, mines, gameOver, won, started, score, time, startT, running, paused, rafId;

    function layout() {
      cell = Math.floor(Math.min((W - 20) / cfg.c, (H - topBar - 20) / cfg.r));
      offX = (W - cell * cfg.c) / 2; offY = topBar;
    }

    function reset(diff) {
      if (diff) cfg = DIFFS[diff] || cfg;
      layout();
      grid = []; revealed = []; flagged = [];
      for (var r = 0; r < cfg.r; r++) {
        grid.push(new Array(cfg.c).fill(0)); revealed.push(new Array(cfg.c).fill(0)); flagged.push(new Array(cfg.c).fill(0));
      }
      mines = cfg.m; gameOver = false; won = false; started = false; score = 0; time = 0; startT = Date.now();
      emitScore(); emitState('playing');
    }

    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function placeMines(safeR, safeC) {
      var placed = 0;
      while (placed < mines) {
        var r = (Math.random()*cfg.r)|0, c = (Math.random()*cfg.c)|0;
        if (grid[r][c] === -1) continue;
        if (Math.abs(r-safeR) <= 1 && Math.abs(c-safeC) <= 1) continue;
        grid[r][c] = -1; placed++;
      }
      for (var r = 0; r < cfg.r; r++) for (var c = 0; c < cfg.c; c++) {
        if (grid[r][c] === -1) continue;
        var n = 0;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var nr = r+dr, nc = c+dc; if (nr>=0&&nr<cfg.r&&nc>=0&&nc<cfg.c&&grid[nr][nc]===-1) n++;
        }
        grid[r][c] = n;
      }
    }

    function flood(r, c) {
      var stack = [[r,c]];
      while (stack.length) {
        var p = stack.pop(), pr = p[0], pc = p[1];
        if (pr<0||pr>=cfg.r||pc<0||pc>=cfg.c) continue;
        if (revealed[pr][pc] || flagged[pr][pc]) continue;
        revealed[pr][pc] = 1; score += 1;
        if (grid[pr][pc] === 0) {
          for (var dr=-1;dr<=1;dr++) for (var dc=-1;dc<=1;dc++) if (dr||dc) stack.push([pr+dr,pc+dc]);
        }
      }
    }

    function checkWin() {
      var safe = 0, total = cfg.r*cfg.c;
      for (var r=0;r<cfg.r;r++) for (var c=0;c<cfg.c;c++) if (grid[r][c]!==-1 && revealed[r][c]) safe++;
      if (safe === total - mines) {
        won = true; gameOver = true;
        var t = (Date.now()-startT)/1000;
        score = Math.max(0, Math.floor(cfg.m * 200 - t * 3));
        emitScore(); emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1);
      }
    }

    function onClick(e) {
      if (gameOver || paused) return;
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX-rect.left)*(W/rect.width), my = (e.clientY-rect.top)*(H/rect.height);
      var c = Math.floor((mx-offX)/cell), r = Math.floor((my-offY)/cell);
      if (r<0||r>=cfg.r||c<0||c>=cfg.c) return;
      if (e.button === 2 || e.ctrlKey) { // 插旗
        if (!revealed[r][c]) flagged[r][c] ^= 1;
        return;
      }
      if (flagged[r][c] || revealed[r][c]) return;
      if (!started) { placeMines(r, c); started = true; startT = Date.now(); }
      if (grid[r][c] === -1) {
        revealed[r][c] = 1; gameOver = true;
        // 揭开所有雷
        for (var rr=0;rr<cfg.r;rr++) for (var cc=0;cc<cfg.c;cc++) if (grid[rr][cc]===-1) revealed[rr][cc]=1;
        emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1);
        return;
      }
      flood(r, c); emitScore(); checkWin();
    }
    function onContext(e) { e.preventDefault(); }

    var NUM_COLORS = ['#8b97b3','#00e0ff','#2ee6a6','#ffb627','#ff7847','#ff2e63','#b537f2','#eaf0fb'];
    function draw() {
      ctx.fillStyle = '#060912'; ctx.fillRect(0,0,W,H);
      // 顶栏
      ctx.fillStyle = '#8b97b3'; ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
      var flagsUsed = 0; for (var r=0;r<cfg.r;r++) for (var c=0;c<cfg.c;c++) flagsUsed += flagged[r][c];
      ctx.fillText('💣 ' + Math.max(0, mines-flagsUsed), 14, 28);
      if (started && !gameOver) time = ((Date.now()-startT)/1000)|0;
      ctx.textAlign = 'right'; ctx.fillText('⏱ ' + time + 's', W-14, 28);
      ctx.textAlign = 'center'; ctx.fillStyle = '#00e0ff'; ctx.font = 'bold 18px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(score, W/2, 30);
      // 难度切换提示
      ctx.fillStyle = '#5a6580'; ctx.font = '12px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('[1]简单 [2]中等 [3]困难 · 右键插旗', 14, topBar - 6);

      for (var r=0;r<cfg.r;r++) for (var c=0;c<cfg.c;c++) {
        var x = offX + c*cell, y = offY + r*cell;
        if (!revealed[r][c]) {
          ctx.fillStyle = '#141b2e'; roundRect(x+1,y+1,cell-2,cell-2,4); ctx.fill();
          ctx.strokeStyle = 'rgba(124,58,237,.3)'; ctx.lineWidth=1; roundRect(x+1,y+1,cell-2,cell-2,4); ctx.stroke();
          if (flagged[r][c]) { ctx.fillStyle='#ff2e63'; ctx.font=(cell*0.6)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('🚩', x+cell/2, y+cell/2+1); }
        } else {
          ctx.fillStyle = grid[r][c]===-1 ? 'rgba(255,46,99,.25)' : '#0a0f1c';
          roundRect(x+1,y+1,cell-2,cell-2,4); ctx.fill();
          ctx.strokeStyle = grid[r][c]===-1 ? '#ff2e63' : 'rgba(0,224,255,.2)'; ctx.lineWidth=1; roundRect(x+1,y+1,cell-2,cell-2,4); ctx.stroke();
          var v = grid[r][c];
          if (v === -1) { ctx.fillStyle='#ff2e63'; ctx.font='bold '+(cell*0.6)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('💣', x+cell/2, y+cell/2+1); }
          else if (v > 0) { ctx.fillStyle = NUM_COLORS[v]; ctx.font='bold '+(cell*0.55)+'px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(v, x+cell/2, y+cell/2+1); }
        }
      }
      ctx.textBaseline = 'alphabetic';
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    function onKey(e) {
      if (e.key === '1') reset('easy');
      else if (e.key === '2') reset('med');
      else if (e.key === '3') reset('hard');
    }
    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    function start() { reset(); running = true; paused = false; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { paused = false; emitState('playing'); }
    function destroy() { running=false; if(rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('click',onClick); canvas.removeEventListener('contextmenu',onContext); window.removeEventListener('keydown',onKey); }

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    reset(); running = true; rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
