/* ========================================================================
   霓虹方块 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  // 7 种方块,每种 4 个旋转态(4x4 矩阵)
  var SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  var COLORS = { I:'#00e0ff', O:'#ffb627', T:'#b537f2', S:'#2ee6a6', Z:'#ff2e63', J:'#7c3aed', L:'#ff7847' };
  var KEYS = ['I','O','T','S','Z','J','L'];

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var COLS = 10, ROWS = 20, CELL;
    var SIDE = 150;
    CELL = Math.min((W - SIDE) / COLS, H / ROWS);
    var BOARD_W = CELL * COLS, offX = 10, offY = 10;

    var grid, cur, next, bag, score, level, lines, dropAcc, last, over, paused, running, rafId, keys={};

    function reset() {
      grid = []; for (var r=0;r<ROWS;r++) grid.push(new Array(COLS).fill(null));
      bag = []; score = 0; level = 1; lines = 0; dropAcc = 0; last = 0; over = false;
      next = spawn(); cur = spawn();
      emitScore(); emitState('playing');
    }
    function refillBag(){ var k=KEYS.slice(); for(var i=k.length-1;i>0;i--){var j=(Math.random()*(i+1))|0;var t=k[i];k[i]=k[j];k[j]=t;} bag.push.apply(bag,k); }
    function spawn() { if (!bag.length) refillBag(); var key = bag.shift(); return { key:key, shape: SHAPES[key].map(function(r){return r.slice();}), x: (COLS/2-2)|0, y: 0 }; }

    function emitScore(){ hooks.onScore && hooks.onScore(score, level); }
    function emitState(s){ hooks.onState && hooks.onState(s); }

    function collide(shape, x, y) {
      for (var r=0;r<shape.length;r++) for (var c=0;c<shape[r].length;c++){
        if(!shape[r][c]) continue;
        var nx=x+c, ny=y+r;
        if (nx<0||nx>=COLS||ny>=ROWS) return true;
        if (ny>=0 && grid[ny][nx]) return true;
      }
      return false;
    }
    function rotate(shape) {
      var n = shape.length, m = shape[0].length, res=[];
      for (var r=0;r<m;r++){res.push([]); for(var c=0;c<n;c++) res[r].push(shape[n-1-c][r]);}
      return res;
    }
    function merge() {
      for (var r=0;r<cur.shape.length;r++) for (var c=0;c<cur.shape[r].length;c++){
        if(cur.shape[r][c] && cur.y+r>=0) grid[cur.y+r][cur.x+c] = COLORS[cur.key];
      }
    }
    function clearLines() {
      var cleared = 0;
      for (var r = ROWS-1; r >= 0; r--) {
        if (grid[r].every(function(v){return v;})) { grid.splice(r,1); grid.unshift(new Array(COLS).fill(null)); cleared++; r++; }
      }
      if (cleared) {
        var pts = [0,100,300,500,800][cleared] * level;
        score += pts; lines += cleared;
        var nl = Math.floor(lines/10) + 1;
        if (nl !== level) { level = nl; }
        emitScore();
      }
    }
    function lockPiece() {
      merge(); clearLines();
      cur = next; next = spawn();
      if (collide(cur.shape, cur.x, cur.y)) { over = true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, level); }
    }
    function tryMove(dx, dy) {
      if (!collide(cur.shape, cur.x+dx, cur.y+dy)) { cur.x+=dx; cur.y+=dy; return true; }
      return false;
    }
    function tryRotate() {
      var s = rotate(cur.shape);
      // 墙踢
      var kicks = [0, -1, 1, -2, 2];
      for (var i=0;i<kicks.length;i++){ if(!collide(s, cur.x+kicks[i], cur.y)){ cur.shape=s; cur.x+=kicks[i]; return; } }
    }
    function softDrop(){ if(!tryMove(0,1)) lockPiece(); }
    function hardDrop(){ var d=0; while(tryMove(0,1)) d++; score += d*2; emitScore(); lockPiece(); }

    function step() {
      dropAcc += 1;
      var interval = Math.max(2, 48 - (level-1)*4); // 帧数
      if (dropAcc >= interval) { dropAcc = 0; if (!tryMove(0,1)) lockPiece(); }
    }

    function drawCell(x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, CELL-2, CELL-2);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(x, y, CELL-2, 5);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(x, y+CELL-7, CELL-2, 5);
    }

    function draw() {
      ctx.fillStyle = '#060912'; ctx.fillRect(0,0,W,H);
      // 棋盘框
      ctx.fillStyle = '#0a0f1c'; ctx.fillRect(offX, offY, BOARD_W, CELL*ROWS);
      ctx.strokeStyle = 'rgba(124,58,237,.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, BOARD_W, CELL*ROWS);
      // 已落方块
      for (var r=0;r<ROWS;r++) for (var c=0;c<COLS;c++){
        if (grid[r][c]) drawCell(offX+c*CELL+1, offY+r*CELL+1, grid[r][c]);
      }
      // 当前方块 + 幽灵
      var ghostY = cur.y;
      while(!collide(cur.shape, cur.x, ghostY+1)) ghostY++;
      for (var r=0;r<cur.shape.length;r++) for (var c=0;c<cur.shape[r].length;c++){
        if(cur.shape[r][c]){
          var x = offX+(cur.x+c)*CELL+1, y = offY+(ghostY+r)*CELL+1;
          if (ghostY+r>=0){ ctx.strokeStyle = COLORS[cur.key]; ctx.globalAlpha=.3; ctx.lineWidth=2; ctx.strokeRect(x,y,CELL-2,CELL-2); ctx.globalAlpha=1; }
          var py = offY+(cur.y+r)*CELL+1;
          if (cur.y+r>=0) drawCell(x, py, COLORS[cur.key]);
        }
      }
      // 侧栏
      var sx = offX + BOARD_W + 14;
      ctx.fillStyle = '#141b2e'; roundRect(sx, offY, SIDE-18, H-20, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,.3)'; roundRect(sx, offY, SIDE-18, H-20, 12); ctx.stroke();
      ctx.fillStyle = '#8b97b3'; ctx.font = 'bold 13px Rajdhani'; ctx.textAlign='left';
      ctx.fillText('下一个', sx+14, offY+26);
      // next 预览
      var ncs = 20;
      for (var r=0;r<next.shape.length;r++) for (var c=0;c<next.shape[r].length;c++){
        if(next.shape[r][c]) { ctx.fillStyle=COLORS[next.key]; ctx.fillRect(sx+14+c*ncs, offY+38+r*ncs, ncs-2, ncs-2); }
      }
      ctx.fillStyle='#00e0ff'; ctx.font='bold 13px Rajdhani'; ctx.fillText('分数', sx+14, offY+150);
      ctx.fillStyle='#eaf0fb'; ctx.font='bold 22px Orbitron'; ctx.fillText(score, sx+14, offY+176);
      ctx.fillStyle='#00e0ff'; ctx.font='bold 13px Rajdhani'; ctx.fillText('等级', sx+14, offY+206);
      ctx.fillStyle='#eaf0fb'; ctx.font='bold 22px Orbitron'; ctx.fillText(level, sx+14, offY+232);
      ctx.fillStyle='#00e0ff'; ctx.font='bold 13px Rajdhani'; ctx.fillText('消行', sx+14, offY+262);
      ctx.fillStyle='#eaf0fb'; ctx.font='bold 22px Orbitron'; ctx.fillText(lines, sx+14, offY+288);
      ctx.fillStyle='#5a6580'; ctx.font='12px Rajdhani';
      ctx.fillText('←→ 移动', sx+14, offY+330);
      ctx.fillText('↑ 旋转', sx+14, offY+348);
      ctx.fillText('↓ 加速', sx+14, offY+366);
      ctx.fillText('空格 直落', sx+14, offY+384);
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    var dasL=0, dasR=0, acc=0;
    function loop(ts){
      if(!last) last=ts; var dt=ts-last; last=ts;
      if (running && !over && !paused) {
        // 固定逻辑步长 ~60fps,锁定下落/移动节奏不随显示器刷新率变化
        acc += dt;
        var STEP = 1000/60, max = 5;
        while (acc >= STEP && max-- > 0) {
          // 连续移动(DAS)
          if (keys['ArrowLeft']) { if(dasL<=0){tryMove(-1,0); dasL=8;} dasL--; } else dasL=0;
          if (keys['ArrowRight']) { if(dasR<=0){tryMove(1,0); dasR=8;} dasR--; } else dasR=0;
          if (keys['ArrowDown']) softDrop();
          step();
          acc -= STEP;
        }
      }
      draw(); rafId=requestAnimationFrame(loop);
    }
    function onKey(e){
      keys[e.key] = (e.type==='keydown');
      if (e.type==='keydown'){
        if (e.key==='p'){ togglePause(); e.preventDefault(); return; }
        // 仅在游戏中允许操作方块,避免结束后/暂停时仍可旋转
        if (!running || over || paused) return;
        if (e.key==='ArrowUp'||e.key==='w'){ tryRotate(); e.preventDefault(); }
        else if (e.key===' '){ hardDrop(); e.preventDefault(); }
      }
    }
    function togglePause(){ if(!running||over) return; paused?resume():pause(); }
    function start(){ reset(); running=true; paused=false; last=0; if(!rafId) rafId=requestAnimationFrame(loop); }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ if(over) return; paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); }

    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    reset(); rafId=requestAnimationFrame(loop);

    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
