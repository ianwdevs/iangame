/* ========================================================================
   坦克大战 — 遵循 window.IanGame 接口契约
   玩家坦克守基地,消灭敌方坦克,砖墙可摧毁,钢墙不可破。
   ======================================================================== */
(function () {
  'use strict';

  var COLS = 15, ROWS = 13, CELL; // 网格
  var T = { EMPTY:0, BRICK:1, STEEL:2, BASE:3 };

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    CELL = Math.floor(Math.min(W/COLS, H/ROWS));
    var offX = (W - CELL*COLS)/2, offY = (H - CELL*ROWS)/2;

    var map, player, enemies, bullets, particles, score, level, lives, baseAlive;
    var keys, running, over, paused, spawnCool, enemiesLeft, frame, rafId, lastStep, acc;

    function reset() {
      buildMap();
      // 玩家出生在底部偏左开阔区(避开基地与砖墙,留出活动空间)
      player = mkTank(2*CELL+offX, (ROWS-2)*CELL+offY, 0, '#00e0ff', false);
      enemies = []; bullets = []; particles = [];
      score = 0; level = level||1; lives = 3; baseAlive = true;
      over = false; paused = false; running = false;
      spawnCool = 0; enemiesLeft = 4 + level*2; frame = 0;
      lastStep = 0; acc = 0; keys = {};
      emitScore(); emitState('playing');
    }
    function buildMap() {
      map = [];
      for (var r=0;r<ROWS;r++){ map.push(new Array(COLS).fill(0)); }
      // 边界钢墙
      for (var c=0;c<COLS;c++){ map[0][c]=T.STEEL; map[ROWS-1][c]=T.STEEL; }
      for (var r=0;r<ROWS;r++){ map[r][0]=T.STEEL; map[r][COLS-1]=T.STEEL; }
      // 随机砖墙(避开出生区:顶部3行给敌机出生、底部3行给玩家/基地)
      for (var i=0;i<28;i++){
        var r = 3+(Math.random()*(ROWS-7))|0, c = 2+(Math.random()*(COLS-4))|0;
        // 不覆盖基地及其相邻保护位
        if (r >= ROWS-3 && Math.abs(c-(COLS/2|0)) <= 1) continue;
        map[r][c] = T.BRICK;
      }
      // 基地(底部中央),四周用砖墙保护(留出生通道)
      var bc = (COLS/2|0);
      map[ROWS-2][bc] = T.BASE;
      map[ROWS-3][bc-1]=map[ROWS-3][bc]=map[ROWS-3][bc+1]=T.BRICK;
    }
    function mkTank(px, py, dir, color, isEnemy, kind) {
      var k = kind || 'normal';
      var big = k === 'big';
      return { x:px, y:py, dir:dir, color:color, en:isEnemy, kind:k, w:CELL*0.86, h:CELL*0.86,
               cool:0, hp: isEnemy ? (big?3:1) : 3, reload: isEnemy ? (60+Math.random()*60) : 24,
               score: isEnemy ? (big?50:30) : 0 };
    }

    function emitScore(){ hooks.onScore && hooks.onScore(score, level); }
    function emitState(s){ hooks.onState && hooks.onState(s); }

    function cellAt(px, py){ var c=Math.floor((px-offX)/CELL), r=Math.floor((py-offY)/CELL); if(r<0||r>=ROWS||c<0||c>=COLS) return T.STEEL; return map[r][c]; }
    function setCell(px, py, v){ var c=Math.floor((px-offX)/CELL), r=Math.floor((py-offY)/CELL); if(r>=0&&r<ROWS&&c>=0&&c<COLS) map[r][c]=v; }
    function blocked(px, py, w, h, self) {
      // 采样坦克四角与中心,检测与墙/其他坦克碰撞
      var pts = [[px,py],[px+w,py],[px,py+h],[px+w,py+h],[px+w/2,py+h/2]];
      for (var i=0;i<pts.length;i++){ var v=cellAt(pts[i][0], pts[i][1]); if (v!==T.EMPTY) return true; }
      var others = enemies.slice();
      if (self !== player && player) others.push(player);
      for (var j=0;j<others.length;j++){ if(others[j]===self||!others[j]) continue;
        var o=others[j];
        if (px<o.x+o.w && px+w>o.x && py<o.y+o.h && py+h>o.y) return true;
      }
      return false;
    }

    function moveTank(t, dx, dy) {
      var nx = t.x+dx, ny = t.y+dy;
      // 坦克对齐网格便于穿越
      if (dx !== 0) { // 横向移动,纵坐标吸附
        ny = Math.round((ny - offY) / CELL) * CELL + offY + (CELL - t.h)/2;
      } else if (dy !== 0) {
        nx = Math.round((nx - offX) / CELL) * CELL + offX + (CELL - t.w)/2;
      }
      if (!blocked(nx, ny, t.w, t.h, t)) { t.x = nx; t.y = ny; return true; }
      return false;
    }

    function fire(t) {
      if (t.cool > 0) return;
      var cx = t.x + t.w/2, cy = t.y + t.h/2;
      var bx=cx, by=cy, vx=0, vy=0, sp=6;
      if (t.dir===0){vy=-sp;by=t.y-4;} else if(t.dir===1){vx=sp;bx=t.x+t.w+4;} else if(t.dir===2){vy=sp;by=t.y+t.h+4;} else {vx=-sp;bx=t.x-4;}
      bullets.push({ x:bx, y:by, vx:vx, vy:vy, en:t.en, life:120 });
      t.cool = t.reload;
    }

    function step() {
      frame++;
      // 玩家输入
      var moved=false;
      if (keys['ArrowLeft']||keys['a']){player.dir=3;if(moveTank(player,-2,0))moved=true;}
      else if(keys['ArrowRight']||keys['d']){player.dir=1;if(moveTank(player,2,0))moved=true;}
      else if(keys['ArrowUp']||keys['w']){player.dir=0;if(moveTank(player,0,-2))moved=true;}
      else if(keys['ArrowDown']||keys['s']){player.dir=2;if(moveTank(player,0,2))moved=true;}
      if (keys[' ']) fire(player);
      if (player.cool>0) player.cool--;

      // 敌机 AI
      enemies.forEach(function(e){
        e.cool = Math.max(0, e.cool-1);
        // 偶尔变向
        if (Math.random()<0.03 || !tryDir(e, e.dir)) {
          var dirs=[0,1,2,3].sort(function(){return Math.random()-0.5;});
          for (var i=0;i<dirs.length;i++){ if(tryDir(e,dirs[i])) break; }
        }
        if (Math.random()<0.025) fire(e);
      });
      function tryDir(e, d){ e.dir=d; var dx=d===1?2:d===3?-2:0, dy=d===2?2:d===0?-2:0; return moveTank(e, dx, dy); }

      // 子弹
      bullets.forEach(function(b){
        b.x+=b.vx; b.y+=b.vy; b.life--;
        // 撞墙
        var v = cellAt(b.x, b.y);
        if (v===T.BRICK){ setCell(b.x,b.y,T.EMPTY); spark(b.x,b.y,'#b537f2'); b.life=0; }
        else if (v===T.STEEL){ spark(b.x,b.y,'#eaf0fb'); b.life=0; }
        else if (v===T.BASE){ if(b.en){ baseAlive=false; spark(b.x,b.y,'#ff2e63'); } b.life=0; }
        // 撞坦克
        if (b.life>0) {
          if (b.en) { // 敌弹打玩家
            if (rectHit(b, player)) { b.life=0; player.hp--; spark(player.x+player.w/2, player.y+player.h/2,'#00e0ff'); if(player.hp<=0) loseLife(); }
          } else { // 玩家弹打敌
            for (var i=0;i<enemies.length;i++){ var e=enemies[i]; if(rectHit(b,e)){ b.life=0; e.hp--; spark(e.x+e.w/2,e.y+e.h/2,'#ff2e63'); if(e.hp<=0){ score+=e.score; enemies.splice(i,1); enemiesLeft--; emitScore(); } break; } }
          }
        }
      });
      bullets = bullets.filter(function(b){return b.life>0;});

      // 粒子
      particles.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.life--;});
      particles = particles.filter(function(p){return p.life>0;});

      // 敌机出生(顶部三个出生点)
      if (enemies.length < 3 && enemiesLeft > enemies.length) {
        spawnCool--;
        if (spawnCool<=0) {
          var sx = [offX+CELL, offX+((COLS/2|0))*CELL, offX+(COLS-2)*CELL][(Math.random()*3)|0];
          var big = (level>=2 && Math.random()<0.18);
          var e = mkTank(sx, offY+CELL, 2, big?'#ff7847':'#ff2e63', true, big?'big':'normal');
          e.reload = 70+Math.random()*50;
          enemies.push(e); spawnCool = 120;
        }
      }
      // 胜负
      if (enemiesLeft<=0 && enemies.length===0) { level++; score+=200; reset(); }
      if (!baseAlive) { over=true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, level); }
    }
    function rectHit(b, t){ return b.x>t.x && b.x<t.x+t.w && b.y>t.y && b.y<t.y+t.h; }
    function loseLife(){ lives--; spark(player.x+player.w/2,player.y+player.h/2,'#00e0ff'); if(lives<=0){over=true;emitState('over');hooks.onGameOver&&hooks.onGameOver(score,level);} else { player.hp=3; player.x=2*CELL+offX; player.y=(ROWS-2)*CELL+offY; player.dir=0; } }
    function spark(x,y,col){ for(var i=0;i<8;i++){var a=Math.random()*7,sp=1+Math.random()*3;particles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:20,color:col,r:3});} }

    function draw() {
      ctx.fillStyle='#060912'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#0a0f1c'; ctx.fillRect(offX, offY, CELL*COLS, CELL*ROWS);
      // 地图
      for (var r=0;r<ROWS;r++) for (var c=0;c<COLS;c++){
        var v = map[r][c], x=offX+c*CELL, y=offY+r*CELL;
        if (v===T.BRICK){ ctx.fillStyle='#c2602a'; ctx.fillRect(x+1,y+1,CELL-2,CELL-2); ctx.fillStyle='#7a3a14'; for(var bi=0;bi<CELL;bi+=6){ctx.fillRect(x+bi,y+1,3,CELL-2);ctx.fillRect(x+1,y+bi,CELL-2,3);} }
        else if (v===T.STEEL){ ctx.fillStyle='#8b97b3'; ctx.fillRect(x+1,y+1,CELL-2,CELL-2); ctx.fillStyle='#5a6580'; ctx.fillRect(x+1,y+1,CELL-2,4); }
        else if (v===T.BASE){ ctx.fillStyle=baseAlive?'#2ee6a6':'#ff2e63'; ctx.font=(CELL*0.7)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(baseAlive?'🏠':'💥', x+CELL/2, y+CELL/2); }
      }
      ctx.textBaseline='alphabetic';
      // 坦克
      drawTank(player);
      enemies.forEach(drawTank);
      // 子弹
      ctx.shadowBlur=8; ctx.shadowColor='#ffb627'; ctx.fillStyle='#ffb627';
      bullets.forEach(function(b){ ctx.fillRect(b.x-3, b.y-3, 6, 6); });
      ctx.shadowBlur=0;
      // 粒子
      particles.forEach(function(p){ctx.globalAlpha=p.life/20;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.r,p.r);});
      ctx.globalAlpha=1;
      // HUD
      ctx.fillStyle='#8b97b3'; ctx.font='bold 13px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='left';
      ctx.fillText('关卡 '+level+' · 敌人剩余 '+Math.max(0,enemiesLeft), offX, offY-6);
      ctx.fillStyle='#ff2e63'; ctx.textAlign='right'; ctx.fillText('❤'+lives+' · 装甲'+player.hp, offX+CELL*COLS, offY-6);
    }
    function drawTank(t){
      ctx.save(); ctx.translate(t.x+t.w/2, t.y+t.h/2); ctx.rotate(t.dir*Math.PI/2);
      ctx.shadowBlur=10; ctx.shadowColor=t.color;
      ctx.fillStyle=t.color; ctx.fillRect(-t.w/2,-t.h/2,t.w,t.h);
      ctx.fillStyle='rgba(0,0,0,.3)'; ctx.fillRect(-t.w/2,-t.h/2,t.w,t.h/3);
      // 履带
      ctx.fillStyle=t.en?'#7a1430':'#005566'; ctx.fillRect(-t.w/2,-t.h/2-3,t.w,4); ctx.fillRect(-t.w/2,t.h/2-1,t.w,4);
      // 炮塔 + 炮管(dir0 朝上)
      ctx.fillStyle=t.en?'#ff7847':'#7cf6ff'; ctx.beginPath(); ctx.arc(0,0,t.w*0.22,0,7); ctx.fill();
      ctx.fillRect(-3,-t.h/2-4,6,t.h/2+4);
      ctx.restore(); ctx.shadowBlur=0;
      // hp
      if(!t.en && t.hp<3){ ctx.fillStyle='#2ee6a6'; ctx.fillRect(t.x, t.y-5, t.w*t.hp/3, 3); }
    }

    function loop(ts){
      // 固定逻辑步长 ~60fps,不受显示器刷新率影响
      if (!lastStep) lastStep = ts;
      var dt = ts - lastStep; lastStep = ts;
      if (running && !over && !paused) {
        acc = (acc||0) + dt;
        var STEP = 1000/60, max = 5;
        while (acc >= STEP && max-- > 0) { step(); acc -= STEP; }
      }
      draw(); rafId = requestAnimationFrame(loop);
    }
    function onKey(e){ keys[e.key]=(e.type==='keydown'); if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0) e.preventDefault(); if(e.key==='p'){togglePause();} }
    function togglePause(){ if(!running||over) return; paused?resume():pause(); }
    function start(){ reset(); running=true; paused=false; }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ if(over) return; paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); }

    window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);
    level = 1;
    reset(); running=false; rafId=requestAnimationFrame(loop);
    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
