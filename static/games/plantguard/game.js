/* ========================================================================
   植物守卫战(简化版) — 遵循 window.IanGame 接口契约
   玩法:收集阳光 → 点击空地选植物放置 → 植物自动攻击/产出 → 僵尸从右推进
   植物:向日葵(产阳光) / 豌豆射手(射击) / 坚果(高血肉盾)
   僵尸:普通 / 路障(2血) / 铁桶(3血)
   ======================================================================== */
(function () {
  'use strict';

  var COLS = 9, ROWS = 5;

  // 植物定义
  var PLANTS = {
    sunflower: { name:'向日葵', cost:50, hp:4, cd:9, color:'#ffb627', icon:'🌻', product:'sun' },
    peashooter:{ name:'豌豆射手', cost:100, hp:4, cd:7.5, color:'#5fd35f', icon:'🌱', fire:1.4, dmg:1 },
    wallnut:   { name:'坚果', cost:50, hp:18, cd:20, color:'#c2602a', icon:'🥥' },
  };
  var ZOMBIES = {
    normal: { hp:3, sp:0.22, atk:0.5, color:'#8b9b6b', icon:'🧟', score:10 },
    cone:   { hp:6, sp:0.22, atk:0.5, color:'#c08a3a', icon:'🧟', hat:'⛑', score:20 },
    bucket: { hp:12,sp:0.20, atk:0.5, color:'#7a8a9a', icon:'🧟', hat:'🪣', score:40 },
  };
  var WAVES_PER_LEVEL = 5;  // 每关 5 波
  var LEVELS = 3;            // 共 3 关

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CELL, offX, offY, lawnH;
    layout();
    function layout(){
      CELL = Math.floor(Math.min((W-40)/COLS, (H-110)/ROWS));
      offX = (W - CELL*COLS)/2;
      lawnH = CELL*ROWS;
      offY = 80;
    }

    var sun, grid, plants, zombies, bullets, suns, particles, selected, wave, waveTimer, spawnTimer, zombiesToSpawn, score, level, over, won, running, paused, rafId, frame, lastStep, acc;
    var shopCD = {}; // 每植物冷却

    function reset() {
      layout();
      sun = 75; grid = []; plants=[]; zombies=[]; bullets=[]; suns=[]; particles=[];
      for (var r=0;r<ROWS;r++) grid.push(new Array(COLS).fill(null));
      selected = null; shopCD = {};
      level = 1; wave = 0; zombiesToSpawn = 0; spawnTimer = 0; waveTimer = 8;
      score = 0; over=false; won=false; frame=0; acc=0; lastStep=0;
      emitScore(); emitState('playing');
    }
    function emitScore(){ hooks.onScore && hooks.onScore(score, level); }
    function emitState(s){ hooks.onState && hooks.onState(s); }

    function cellCenter(r,c){ return { x: offX + c*CELL + CELL/2, y: offY + r*CELL + CELL/2 }; }
    function pickCell(px,py){ var c=Math.floor((px-offX)/CELL), r=Math.floor((py-offY)/CELL); if(r<0||r>=ROWS||c<0||c>=COLS) return null; return {r:r,c:c}; }

    // ---------- 阳光 ----------
    function spawnSky(){ suns.push({x: 40+Math.random()*(W-80), y:-20, vy:0.6, ty: offY+Math.random()*lawnH, got:false, t:0, r:18}); }
    function spawnFrom(plant){ suns.push({x:plant.x, y:plant.y, vy:0, vx:(Math.random()*2-1)*0.8, r:18, got:false, t:0, from:true}); }

    function step(dt) {
      frame++;
      // 天降阳光
      if (frame % 600 === 0 || frame === 200) spawnSky();
      // 阳光动画
      suns.forEach(function(s){
        s.t++;
        if (s.from) { s.x += s.vx; s.y += 1.2; s.vx *= 0.97; }
        else if (s.y < s.ty) { s.y += s.vy; }
      });
      suns = suns.filter(function(s){ return !s.got && s.t < 600; });

      // 商店冷却
      Object.keys(shopCD).forEach(function(k){ if(shopCD[k]>0) shopCD[k]-=dt; });

      // 植物
      plants.forEach(function(p){
        var def = PLANTS[p.kind];
        p.t += dt;
        if (p.kind==='sunflower') {
          if (p.t > def.cd) { p.t = 0; spawnFrom(p); }
        } else if (p.kind==='peashooter') {
          // 该行有僵尸才开火
          var hasZ = zombies.some(function(z){ return z.row===p.row && z.x > p.x; });
          if (hasZ && p.t > def.fire) { p.t = 0; bullets.push({ x:p.x+18, y:p.y-6, vx:5, row:p.row, dmg:def.dmg }); }
        }
      });

      // 豌豆
      bullets.forEach(function(b){ b.x += b.vx; });
      bullets.forEach(function(b){
        for (var i=0;i<zombies.length;i++){
          var z = zombies[i];
          if (z.row===b.row && Math.abs(z.x-b.x)<18 && z.hp>0) { z.hp -= b.dmg; z.hit=8; b.dead=true; spark(b.x,b.y,'#5fd35f',5); break; }
        }
      });
      bullets = bullets.filter(function(b){ return !b.dead && b.x < W+10; });

      // 僵尸
      zombies.forEach(function(z){
        var def = ZOMBIES[z.kind]; if (z.hit>0) z.hit-=dt*30;
        // 前方是否有植物挡路
        var eating = null;
        for (var i=0;i<plants.length;i++){
          var pl = plants[i];
          if (pl.row===z.row && Math.abs(pl.x - z.x) < CELL*0.5 && pl.x < z.x) { eating = pl; break; }
        }
        if (eating) {
          z.eatT = (z.eatT||0)+dt;
          if (z.eatT > 0.6) { z.eatT=0; eating.hp -= def.atk; if(eating.hp<=0) { removePlant(eating); } }
        } else {
          z.x -= def.sp * dt * 60;
        }
        // 到家
        if (z.x < offX - 10) { over=true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, level); }
      });
      zombies = zombies.filter(function(z){ if(z.hp<=0){ score += ZOMBIES[z.kind].score; spark(z.x,z.y,z.color,12); emitScore(); return false;} return true; });

      // 粒子
      particles.forEach(function(p){ p.x+=p.vx;p.y+=p.vy;p.life-=dt*30; });
      particles = particles.filter(function(p){return p.life>0;});

      // 波次:每关 5 波,清完进入下一关,共 3 关
      waveTimer -= dt;
      if (zombiesToSpawn > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawnZombie(); zombiesToSpawn--; spawnTimer = 1.5 + Math.random()*1.5; }
      } else if (waveTimer <= 0) {
        // 本关所有波次已清完 → 进入下一关
        if (wave >= WAVES_PER_LEVEL) {
          score += 500;
          if (level >= LEVELS) { // 全部通关
            over = true; won = true; emitState('over');
            hooks.onGameOver && hooks.onGameOver(score, level);
          } else {
            level++; wave = 0; startWave();
          }
        } else {
          startWave();
        }
      }
      // 没僵尸且没在出怪 → 提前开下一波
      if (zombiesToSpawn===0 && zombies.length===0 && waveTimer > 3) waveTimer = 3;
    }
    // 开启下一波(wave 先自增,再按 wave 配置出怪)
    function startWave(){
      wave++;
      zombiesToSpawn = 3 + wave + level;
      spawnTimer = 0.5; waveTimer = 25;
      toast('第 '+level+' 章 · 第 '+wave+'/'+WAVES_PER_LEVEL+' 波来袭!');
    }
    function spawnZombie(){
      var kinds = wave<2 ? ['normal'] : wave<4 ? ['normal','normal','cone'] : ['normal','cone','cone','bucket'];
      var kind = kinds[(Math.random()*kinds.length)|0];
      var row = (Math.random()*ROWS)|0;
      var z = { kind:kind, row:row, x: offX+CELL*COLS+20, hp:ZOMBIES[kind].hp, hit:0, eatT:0 };
      zombies.push(z);
    }
    function removePlant(p){
      var i = plants.indexOf(p); if(i>=0){ plants.splice(i,1); grid[p.row][p.col]=null; spark(p.x,p.y,'#5fd35f',8); }
    }
    function spark(x,y,col,n){ for(var i=0;i<n;i++){var a=Math.random()*7,sp=1+Math.random()*3;particles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:20,color:col});} }
    function toast(m){ if(window.IanToast) window.IanToast(m); }

    // ---------- 绘制 ----------
    function draw() {
      ctx.fillStyle='#060912'; ctx.fillRect(0,0,W,H);
      // 草坪(条纹)
      for (var r=0;r<ROWS;r++){
        ctx.fillStyle = r%2 ? '#143a1f' : '#1a4828';
        ctx.fillRect(offX, offY+r*CELL, CELL*COLS, CELL);
      }
      // 网格
      ctx.strokeStyle='rgba(0,0,0,.15)'; ctx.lineWidth=1;
      for (var c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(offX+c*CELL,offY);ctx.lineTo(offX+c*CELL,offY+lawnH);ctx.stroke();}
      for (var rr=0;rr<=ROWS;rr++){ctx.beginPath();ctx.moveTo(offX,offY+rr*CELL);ctx.lineTo(offX+CELL*COLS,offY+rr*CELL);ctx.stroke();}

      // 房屋(左侧)
      ctx.fillStyle='#2a3a5a'; ctx.fillRect(offX-30, offY, 30, lawnH);
      ctx.fillStyle='#7c3aed'; ctx.font='22px sans-serif'; ctx.textAlign='center';
      for (var hr=0;hr<ROWS;hr++) ctx.fillText('🏠', offX-15, offY+hr*CELL+CELL/2+8);

      // 植物
      plants.forEach(function(p){
        var def = PLANTS[p.kind];
        ctx.shadowBlur=8; ctx.shadowColor=def.color;
        ctx.font=(CELL*0.6)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(def.icon, p.x, p.y);
        ctx.shadowBlur=0;
        // 血条
        if (p.hp < def.hp){ var w=CELL*0.6; ctx.fillStyle='#330'; ctx.fillRect(p.x-w/2,p.y+CELL*0.35,w,4); ctx.fillStyle='#5fd35f'; ctx.fillRect(p.x-w/2,p.y+CELL*0.35,w*p.hp/def.hp,4); }
      });

      // 僵尸
      zombies.forEach(function(z){
        var def=ZOMBIES[z.kind];
        ctx.save();
        ctx.translate(z.x, offY+z.row*CELL+CELL/2);
        if(z.hit>0){ ctx.globalAlpha=0.7; }
        // 身体
        ctx.shadowBlur=8; ctx.shadowColor=def.color;
        ctx.fillStyle=def.color;
        ctx.font=(CELL*0.7)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('🧟', 0, 0);
        // 帽子
        if (def.hat){ ctx.font=(CELL*0.4)+'px sans-serif'; ctx.fillText(def.hat, 0, -CELL*0.28); }
        ctx.restore();
        ctx.shadowBlur=0;
        // 血条
        var w=CELL*0.6; ctx.fillStyle='#330'; ctx.fillRect(z.x-w/2, offY+z.row*CELL+4,w,4);
        ctx.fillStyle = z.hp > def.hp*0.5 ? '#ff2e63' : '#ffb627';
        ctx.fillRect(z.x-w/2, offY+z.row*CELL+4, w*z.hp/def.hp, 4);
      });
      ctx.textBaseline='alphabetic';

      // 豌豆
      ctx.shadowBlur=8; ctx.shadowColor='#5fd35f'; ctx.fillStyle='#7cff7c';
      bullets.forEach(function(b){ ctx.beginPath(); ctx.arc(b.x,b.y,6,0,7); ctx.fill(); });
      ctx.shadowBlur=0;
      // 粒子
      particles.forEach(function(p){ctx.globalAlpha=p.life/20;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}); ctx.globalAlpha=1;

      // 阳光
      suns.forEach(function(s){
        var pulse = 1+0.08*Math.sin(s.t*0.2);
        ctx.shadowBlur=16; ctx.shadowColor='#ffb627';
        ctx.fillStyle='#ffd54a'; ctx.beginPath(); ctx.arc(s.x,s.y,16*pulse,0,7); ctx.fill();
        ctx.fillStyle='#ffb627'; ctx.beginPath(); ctx.arc(s.x,s.y,9*pulse,0,7); ctx.fill();
        ctx.shadowBlur=0;
      });

      // 顶部 HUD:阳光 + 波次 + 商店
      drawHUD();

      // 放置预览
      if (selected && hoverCell){
        var def = PLANTS[selected];
        var valid = !grid[hoverCell.r][hoverCell.c] && sun>=def.cost && (shopCD[selected]||0)<=0;
        ctx.globalAlpha=0.5; ctx.fillStyle=valid?'#5fd35f':'#ff2e63';
        ctx.fillRect(offX+hoverCell.c*CELL, offY+hoverCell.r*CELL, CELL, CELL);
        ctx.globalAlpha=1;
      }
    }

    var hoverCell = null;
    function drawHUD() {
      // 阳光计数
      ctx.fillStyle='#0d1320'; roundRect(10,10,120,52,12); ctx.fill();
      ctx.strokeStyle='rgba(255,182,39,.5)'; roundRect(10,10,120,52,12); ctx.stroke();
      ctx.shadowBlur=10; ctx.shadowColor='#ffb627'; ctx.fillStyle='#ffd54a';
      ctx.beginPath(); ctx.arc(36,36,14,0,7); ctx.fill();
      ctx.fillStyle='#ffb627'; ctx.beginPath(); ctx.arc(36,36,8,0,7); ctx.fill();
      ctx.shadowBlur=0;
      ctx.fillStyle='#ffd54a'; ctx.font='bold 22px Orbitron'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(sun, 58, 38);
      // 商店
      var keys = ['sunflower','peashooter','wallnut'];
      var sx = 145;
      keys.forEach(function(k){
        var def = PLANTS[k]; var cd = shopCD[k]||0;
        var can = sun>=def.cost && cd<=0;
        var bw=78;
        ctx.fillStyle = selected===k ? 'rgba(0,224,255,.25)' : '#0d1320';
        roundRect(sx,10,bw,52,10); ctx.fill();
        ctx.strokeStyle = selected===k ? '#00e0ff' : can ? def.color : '#3a3a3a';
        ctx.lineWidth = selected===k?2:1; roundRect(sx,10,bw,52,10); ctx.stroke(); ctx.lineWidth=1;
        ctx.globalAlpha = can?1:0.4;
        ctx.font='26px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(def.icon, sx+bw/2, 28);
        ctx.fillStyle=can?'#ffd54a':'#8b97b3'; ctx.font='bold 13px Orbitron';
        ctx.fillText(def.cost, sx+bw/2, 50);
        ctx.globalAlpha=1;
        // 冷却遮罩
        if (cd>0){ var pct = cd/def.cd; ctx.fillStyle='rgba(6,9,18,.6)'; ctx.fillRect(sx, 10, bw, 52*pct); }
        sx += bw + 6;
      });
      // 波次信息
      ctx.fillStyle='#8b97b3'; ctx.font='bold 13px Rajdhani'; ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText('第 '+level+'/'+LEVELS+' 章 · 第 '+wave+'/'+WAVES_PER_LEVEL+' 波 · 剩余 '+(zombiesToSpawn+zombies.length), W-12, 22);
      ctx.fillStyle='#ff2e63'; ctx.fillText('僵尸来袭!', W-12, 44);
      ctx.textBaseline='alphabetic';
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    // ---------- 交互 ----------
    function onDown(e){
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX-rect.left)*(W/rect.width), my=(e.clientY-rect.top)*(H/rect.height);
      // 点阳光
      for (var i=suns.length-1;i>=0;i--){ var s=suns[i]; if(Math.hypot(mx-s.x,my-s.y)<22){ s.got=true; sun+=25; spark(s.x,s.y,'#ffb627',6); return; } }
      // 点商店
      var keys=['sunflower','peashooter','wallnut']; var sx=145, bw=78;
      for (var i=0;i<keys.length;i++){
        if (mx>=sx && mx<=sx+bw && my>=10 && my<=62){
          var k=keys[i], def=PLANTS[k];
          if((shopCD[k]||0)<=0){ selected = selected===k?null:k; }
          return;
        }
        sx += bw+6;
      }
      // 放植物
      if (selected){
        var cell = pickCell(mx,my); if(!cell) return;
        if (grid[cell.r][cell.c]) return;
        var def = PLANTS[selected];
        if (sun < def.cost || (shopCD[selected]||0)>0) return;
        var cen = cellCenter(cell.r,cell.c);
        plants.push({ kind:selected, row:cell.r, col:cell.c, x:cen.x, y:cen.y, hp:def.hp, t:0 });
        grid[cell.r][cell.c] = plants[plants.length-1];
        sun -= def.cost; shopCD[selected] = def.cd;
        selected = null;
      }
    }
    function onMove(e){
      var rect=canvas.getBoundingClientRect();
      var mx=(e.clientX-rect.left)*(W/rect.width), my=(e.clientY-rect.top)*(H/rect.height);
      hoverCell = pickCell(mx,my);
    }
    function onKey(e){ if(e.key==='Escape') selected=null; }

    // ---------- 主循环 ----------
    var last=0;
    function loop(ts){
      if(!last) last=ts; var dt=Math.min(0.05,(ts-last)/1000); last=ts;
      if(running&&!over&&!paused) step(dt);
      draw(); rafId=requestAnimationFrame(loop);
    }
    function start(){ reset(); running=true; paused=false; last=0; }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ if(over) return; paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('mousedown',onDown); canvas.removeEventListener('mousemove',onMove); canvas.removeEventListener('touchstart',onTouch); window.removeEventListener('keydown',onKey); }
    function onTouch(e){ var t=e.touches[0]; onDown({clientX:t.clientX,clientY:t.clientY}); e.preventDefault(); }

    canvas.addEventListener('mousedown',onDown);
    canvas.addEventListener('mousemove',onMove);
    canvas.addEventListener('touchstart',onTouch,{passive:false});
    window.addEventListener('keydown',onKey);
    reset(); running=false; rafId=requestAnimationFrame(loop);
    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
