/* ========================================================================
   五子棋(人机) — 遵循 window.IanGame 接口契约
   启发式评估:对每个空位评估己方进攻分 + 对方进攻分,取最大
   ======================================================================== */
(function () {
  'use strict';

  var SIZE = 15;

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var margin, cell, board, turn, over, winLine, score, running, paused, rafId, aiThinking;

    function layout() {
      margin = 26;
      cell = Math.min((W - margin*2)/(SIZE-1), (H - margin*2)/(SIZE-1));
    }
    function reset() {
      layout();
      board = []; for (var r=0;r<SIZE;r++) board.push(new Array(SIZE).fill(0));
      turn = 1; over = false; winLine = null; score = 0; aiThinking = false;
      emitScore(); emitState('playing');
    }
    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function inBoard(r,c){return r>=0&&r<SIZE&&c>=0&&c<SIZE;}

    // 检查从(r,c)出发某玩家是否有五连
    function checkWin(r, c, p) {
      var dirs = [[1,0],[0,1],[1,1],[1,-1]];
      for (var d=0; d<dirs.length; d++) {
        var dr=dirs[d][0], dc=dirs[d][1], cnt=1, line=[[r,c]];
        for (var s=1;s<5;s++){var nr=r+dr*s,nc=c+dc*s; if(inBoard(nr,nc)&&board[nr][nc]===p){cnt++;line.push([nr,nc]);}else break;}
        for (var s=1;s<5;s++){var nr=r-dr*s,nc=c-dc*s; if(inBoard(nr,nc)&&board[nr][nc]===p){cnt++;line.unshift([nr,nc]);}else break;}
        if (cnt>=5) return line;
      }
      return null;
    }

    // 评估某点对玩家p的价值:统计穿过该点的4个方向连子模式
    var SCORE_TABLE = [0, 1, 10, 100, 1000, 100000]; // 0..5连
    function evalPoint(r, c, p) {
      var dirs=[[1,0],[0,1],[1,1],[1,-1]], total=0;
      for (var d=0;d<dirs.length;d++){
        var dr=dirs[d][0],dc=dirs[d][1],cnt=1,block=0;
        var s=1; while(inBoard(r+dr*s,c+dc*s)&&board[r+dr*s][c+dc*s]===p){cnt++;s++;}
        if(!inBoard(r+dr*s,c+dc*s)||board[r+dr*s][c+dc*s]!==0) block++;
        s=1; while(inBoard(r-dr*s,c-dc*s)&&board[r-dr*s][c-dc*s]===p){cnt++;s++;}
        if(!inBoard(r-dr*s,c-dc*s)||board[r-dr*s][c-dc*s]!==0) block++;
        if (cnt>=5) total += 100000;
        else if (block<2) total += SCORE_TABLE[cnt] * (block===0?1:0.5);
      }
      return total;
    }

    function aiMove() {
      // 找候选点(已有棋子周围2格)
      var cand = [], hasStone=false;
      for (var r=0;r<SIZE;r++) for (var c=0;c<SIZE;c++){
        if (board[r][c]!==0){hasStone=true;continue;}
        var near=false;
        for (var dr=-2;dr<=2&&!near;dr++) for (var dc=-2;dc<=2&&!near;dc++){
          var nr=r+dr,nc=c+dc; if(inBoard(nr,nc)&&board[nr][nc]!==0) near=true;
        }
        if (near||!hasStone) cand.push([r,c]);
      }
      var best=-1, bestMoves=[];
      cand.forEach(function(p){
        var r=p[0],c=p[1];
        var atk = evalPoint(r,c,2);          // AI 进攻
        var def = evalPoint(r,c,1) * 0.95;   // 堵玩家(略低权重鼓励进攻)
        var v = atk + def;
        if (v>best){best=v;bestMoves=[[r,c]];}
        else if (v===best) bestMoves.push([r,c]);
      });
      var pick = bestMoves[(Math.random()*bestMoves.length)|0];
      place(pick[0], pick[1], 2);
    }

    function place(r, c, p) {
      if (board[r][c]!==0 || over) return;
      board[r][c] = p;
      var line = checkWin(r, c, p);
      if (line) {
        winLine = line; over = true;
        if (p === 1) score = 100; else score = 20; // 玩家胜100,AI胜20
        emitScore(); emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1);
        return;
      }
      // 平局
      var full=true; for (var rr=0;rr<SIZE&&full;rr++) for (var cc=0;cc<SIZE;cc++) if(board[rr][cc]===0){full=false;break;}
      if (full){over=true; score=50; emitScore(); emitState('over'); hooks.onGameOver&&hooks.onGameOver(score,1); return;}
      turn = 3 - turn;
      if (turn === 2 && !over) { aiThinking = true; setTimeout(function(){ aiMove(); aiThinking=false; }, 280); }
    }

    function onClick(e) {
      if (over || paused || turn !== 1 || aiThinking) return;
      var rect = canvas.getBoundingClientRect();
      var mx=(e.clientX-rect.left)*(W/rect.width), my=(e.clientY-rect.top)*(H/rect.height);
      var c = Math.round((mx-margin)/cell), r = Math.round((my-margin)/cell);
      if (!inBoard(r,c)) return;
      place(r, c, 1);
    }

    function draw() {
      // 棋盘背景
      var g = ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,'#0d1320'); g.addColorStop(1,'#141b2e');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      // 网格
      ctx.strokeStyle='rgba(0,224,255,.35)'; ctx.lineWidth=1;
      for (var i=0;i<SIZE;i++){
        ctx.beginPath(); ctx.moveTo(margin, margin+i*cell); ctx.lineTo(margin+(SIZE-1)*cell, margin+i*cell); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(margin+i*cell, margin); ctx.lineTo(margin+i*cell, margin+(SIZE-1)*cell); ctx.stroke();
      }
      // 天元星位
      var stars=[[3,3],[3,11],[7,7],[11,3],[11,11]];
      ctx.fillStyle='rgba(0,224,255,.5)';
      stars.forEach(function(s){ctx.beginPath();ctx.arc(margin+s[1]*cell,margin+s[0]*cell,3,0,7);ctx.fill();});
      // 棋子
      for (var r=0;r<SIZE;r++) for (var c=0;c<SIZE;c++){
        if(!board[r][c]) continue;
        var x=margin+c*cell, y=margin+r*cell;
        ctx.shadowBlur=10; ctx.shadowColor=board[r][c]===1?'#00e0ff':'#ff2e63';
        ctx.fillStyle = board[r][c]===1 ? '#eaf0fb' : '#ff2e63';
        ctx.beginPath(); ctx.arc(x,y,cell*0.42,0,7); ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle = board[r][c]===1 ? '#8b97b3' : '#060912';
        ctx.beginPath(); ctx.arc(x,y,cell*0.18,0,7); ctx.fill();
      }
      // 胜利连线
      if (winLine) {
        ctx.strokeStyle='#2ee6a6'; ctx.lineWidth=4; ctx.shadowBlur=16; ctx.shadowColor='#2ee6a6';
        ctx.beginPath();
        ctx.moveTo(margin+winLine[0][1]*cell, margin+winLine[0][0]*cell);
        ctx.lineTo(margin+winLine[winLine.length-1][1]*cell, margin+winLine[winLine.length-1][0]*cell);
        ctx.stroke(); ctx.shadowBlur=0;
      }
      // 状态
      ctx.fillStyle='#8b97b3'; ctx.font='bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center';
      var msg = over ? (winLine?'对局结束':'平局') : (turn===1?'你的回合 (白)':'AI 思考中…');
      ctx.fillText(msg, W/2, 16);
    }

    function loop(){ draw(); rafId=requestAnimationFrame(loop); }
    function start(){ reset(); running=true; paused=false; }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('click',onClick); }

    canvas.addEventListener('click', onClick);
    reset(); running=true; rafId=requestAnimationFrame(loop);
    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
