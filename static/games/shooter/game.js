/* ========================================================================
   飞机大战 — 遵循 window.IanGame 接口契约(滚动射击,自动开火,敌机,道具)
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;

    var player, bullets, enemies, particles, powerups, stars;
    var score, level, lives, fireCool, enemyCool, power, powerTimer, frame, running, over, paused, rafId;
    var keys={}, mouseX=null, mouseY=null;

    function reset() {
      player = { x: W/2, y: H-70, w: 40, h: 40, cool: 0, invuln: 0 };
      bullets=[]; enemies=[]; particles=[]; powerups=[]; stars=[];
      for (var i=0;i<60;i++) stars.push({x:Math.random()*W, y:Math.random()*H, sp:0.5+Math.random()*2.5, r:Math.random()*1.5+0.5});
      score=0; level=1; lives=3; fireCool=0; enemyCool=60; power=1; powerTimer=0; frame=0;
      emitScore(); emitState('playing');
    }
    function emitScore(){ hooks.onScore && hooks.onScore(score, level); }
    function emitState(s){ hooks.onState && hooks.onState(s); }

    function spawnEnemy() {
      var type = Math.random();
      var e;
      if (type < 0.15 && level >= 2) { // 大型
        e = { x: 30+Math.random()*(W-60), y: -40, w: 44, h: 38, hp: 3+level, v: 1+level*0.15, kind:'big', cool: 40, score: 50 };
      } else if (type < 0.4) { // 蛇形
        e = { x: 30+Math.random()*(W-60), y: -30, w: 30, h: 28, hp: 1+Math.floor(level/2), v: 1.6+level*0.2, kind:'wave', base:e?e.x:0, score: 30, t:0 };
      } else {
        e = { x: 30+Math.random()*(W-60), y: -30, w: 28, h: 26, hp: 1+Math.floor(level/2), v: 2+level*0.25, kind:'straight', score: 20 };
      }
      e.base = e.x; e.t = 0;
      enemies.push(e);
    }
    function spawnPowerup(x, y) {
      powerups.push({ x:x, y:y, w:22, h:22, v:1.5, kind: Math.random()<0.5?'power':'life' });
    }

    function explode(x, y, color, n) {
      for (var i=0;i<n;i++){
        var a = Math.random()*Math.PI*2, sp = 1+Math.random()*4;
        particles.push({ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:30, color:color, r:2+Math.random()*2 });
      }
    }

    function step() {
      frame++;
      // 星空
      stars.forEach(function(s){ s.y += s.sp; if (s.y > H) { s.y = 0; s.x = Math.random()*W; } });
      // 玩家移动
      var sp = 5.5;
      if (keys['ArrowLeft']||keys['a']) player.x -= sp;
      if (keys['ArrowRight']||keys['d']) player.x += sp;
      if (keys['ArrowUp']||keys['w']) player.y -= sp;
      if (keys['ArrowDown']||keys['s']) player.y += sp;
      if (mouseX!==null) { player.x += (mouseX-player.x)*0.25; player.y += (mouseY-player.y)*0.25; }
      player.x = Math.max(player.w/2, Math.min(W-player.w/2, player.x));
      player.y = Math.max(player.h/2, Math.min(H-player.h/2, player.y));
      if (player.invuln>0) player.invuln--;
      // 开火
      fireCool--;
      if (fireCool <= 0) {
        var rate = power>=3?5:power===2?7:11;
        if (power>=3) { bullets.push({x:player.x-12,y:player.y-12,v:-10}); bullets.push({x:player.x+12,y:player.y-12,v:-10}); bullets.push({x:player.x,y:player.y-20,v:-11}); }
        else if (power===2) { bullets.push({x:player.x-10,y:player.y-12,v:-10}); bullets.push({x:player.x+10,y:player.y-12,v:-10}); }
        else { bullets.push({x:player.x,y:player.y-18,v:-10}); }
        fireCool = rate;
      }
      if (powerTimer>0){ powerTimer--; if(powerTimer===0) power=1; }
      // 子弹
      bullets.forEach(function(b){ b.y += b.v; });
      bullets = bullets.filter(function(b){ return b.y > -10; });
      // 敌机生成
      enemyCool--;
      if (enemyCool <= 0) { spawnEnemy(); enemyCool = Math.max(20, 60 - level*5); }
      // 敌机移动
      enemies.forEach(function(e){
        e.t = (e.t||0)+1;
        if (e.kind==='wave') e.x = e.base + Math.sin(e.t*0.05)*40;
        e.y += e.v;
        // 大型敌机射击
        if (e.kind==='big') { e.cool--; if(e.cool<=0){ e.cool=60; bullets.push({x:e.x,y:e.y+e.h,v:4,en:true}); } }
      });
      // 子弹-敌机碰撞(玩家子弹)
      bullets.forEach(function(b){
        if (b.en) return;
        enemies.forEach(function(e){
          if (e.hp<=0) return;
          if (Math.abs(b.x-e.x)<e.w/2 && Math.abs(b.y-e.y)<e.h/2) {
            b.y = -999; e.hp--; if (e.hp<=0) { score += e.score; explode(e.x,e.y,'#ff2e63',14); if(Math.random()<0.18) spawnPowerup(e.x,e.y); emitScore(); }
          }
        });
        // 敌子弹 vs 玩家
      });
      // 敌子弹 vs 玩家
      bullets.forEach(function(b){
        if(!b.en) return;
        if (player.invuln<=0 && Math.abs(b.x-player.x)<player.w/2 && Math.abs(b.y-player.y)<player.h/2) {
          b.y=9999; hitPlayer();
        }
      });
      enemies = enemies.filter(function(e){ return e.hp>0 && e.y < H+40; });
      bullets = bullets.filter(function(b){ return b.y>-1000 && b.y<H+10; });
      // 敌机撞玩家
      if (player.invuln<=0) {
        for (var i=0;i<enemies.length;i++){
          var e = enemies[i];
          if (Math.abs(e.x-player.x)<(e.w+player.w)/2-6 && Math.abs(e.y-player.y)<(e.h+player.h)/2-6) {
            e.hp=0; explode(e.x,e.y,'#ffb627',16); hitPlayer(); break;
          }
        }
      }
      // 道具
      powerups.forEach(function(p){ p.y += p.v; });
      powerups.forEach(function(p){
        if (Math.abs(p.x-player.x)<player.w/2 && Math.abs(p.y-player.y)<player.h/2) {
          p.y = 9999;
          if (p.kind==='life' && lives<5) { lives++; IanToastSafe('生命 +1'); }
          else { power = Math.min(3, power+1); powerTimer = 600; IanToastSafe('火力提升!'); }
        }
      });
      powerups = powerups.filter(function(p){ return p.y<H+20 && p.y<9000; });
      // 粒子
      particles.forEach(function(p){ p.x+=p.vx; p.y+=p.vy; p.vx*=0.96; p.vy*=0.96; p.life--; });
      particles = particles.filter(function(p){ return p.life>0; });
      // 升级
      var nl = Math.floor(score/300)+1;
      if (nl !== level) { level = nl; emitScore(); }
    }

    function hitPlayer() {
      lives--; explode(player.x, player.y, '#00e0ff', 20); player.invuln = 90; power = Math.max(1, power-1);
      if (lives <= 0) { over = true; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, level); }
    }
    function IanToastSafe(m){ if (window.IanToast) window.IanToast(m, 'ok'); }

    function draw() {
      // 背景
      var g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#060912'); g.addColorStop(1,'#0a0f2a');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      // 星空
      stars.forEach(function(s){ ctx.globalAlpha = s.r/2; ctx.fillStyle='#eaf0fb'; ctx.fillRect(s.x, s.y, s.r, s.r*2); });
      ctx.globalAlpha=1;
      // 道具
      powerups.forEach(function(p){
        ctx.shadowBlur=12; ctx.shadowColor = p.kind==='life'?'#2ee6a6':'#ffb627';
        ctx.fillStyle = p.kind==='life'?'#2ee6a6':'#ffb627';
        ctx.font='20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(p.kind==='life'?'❤':'⚡', p.x, p.y);
        ctx.shadowBlur=0;
      });
      // 玩家子弹
      ctx.shadowBlur=8; ctx.shadowColor='#00e0ff'; ctx.fillStyle='#00e0ff';
      bullets.forEach(function(b){ if(b.en) return; ctx.fillRect(b.x-2, b.y-8, 4, 12); });
      // 敌子弹
      ctx.shadowColor='#ff2e63'; ctx.fillStyle='#ff2e63';
      bullets.forEach(function(b){ if(!b.en) return; ctx.beginPath(); ctx.arc(b.x,b.y,5,0,7); ctx.fill(); });
      ctx.shadowBlur=0;
      // 敌机
      enemies.forEach(function(e){
        ctx.shadowBlur=8; ctx.shadowColor = e.kind==='big'?'#ff2e63':'#ff7847';
        ctx.font=(e.h+8)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(e.kind==='big'?'👾':'🛸', e.x, e.y);
        ctx.shadowBlur=0;
      });
      // 玩家
      if (!(player.invuln>0 && frame%6<3)) {
        ctx.save(); ctx.translate(player.x, player.y);
        // 引擎尾焰
        ctx.fillStyle='#ffb627'; ctx.globalAlpha=0.8;
        ctx.beginPath(); ctx.moveTo(-6, player.h/2); ctx.lineTo(0, player.h/2+10+Math.random()*6); ctx.lineTo(6, player.h/2); ctx.fill();
        ctx.globalAlpha=1;
        ctx.shadowBlur=14; ctx.shadowColor='#00e0ff';
        ctx.fillStyle='#00e0ff'; ctx.font='36px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('🚀', 0, 0);
        ctx.restore();
        ctx.shadowBlur=0;
      }
      // 粒子
      particles.forEach(function(p){ ctx.globalAlpha=p.life/30; ctx.fillStyle=p.color; ctx.fillRect(p.x-p.r/2, p.y-p.r/2, p.r, p.r); });
      ctx.globalAlpha=1;
      // HUD
      ctx.fillStyle='#8b97b3'; ctx.font='bold 14px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='left';
      ctx.fillText('关卡 ' + level, 12, 22);
      ctx.fillStyle='#ff2e63'; ctx.fillText('❤'.repeat(Math.max(0,lives)), 12, 42);
      ctx.fillStyle='#ffb627'; ctx.textAlign='right'; ctx.fillText('⚡火力 '+power+(powerTimer>0?' ('+Math.ceil(powerTimer/60)+'s)':''), W-12, 22);
      ctx.textBaseline='alphabetic';
    }

    function loop(){ if(running&&!over&&!paused) step(); draw(); rafId=requestAnimationFrame(loop); }
    function onKey(e){ keys[e.key]=(e.type==='keydown'); if(e.key===' '){togglePause();e.preventDefault();} }
    function onMouse(e){ var r=canvas.getBoundingClientRect(); mouseX=(e.clientX-r.left)*(W/r.width); mouseY=(e.clientY-r.top)*(H/r.height); }
    function onTouch(e){ var t=e.touches[0]; var r=canvas.getBoundingClientRect(); mouseX=(t.clientX-r.left)*(W/r.width); mouseY=(t.clientY-r.top)*(H/r.height); e.preventDefault(); }
    function togglePause(){ if(!running||over) return; paused?resume():pause(); }

    function start(){ reset(); running=true; paused=false; }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ if(over) return; paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); canvas.removeEventListener('mousemove',onMouse); canvas.removeEventListener('touchmove',onTouch); }

    window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);
    canvas.addEventListener('mousemove',onMouse); canvas.addEventListener('touchmove',onTouch,{passive:false});
    reset(); running=false; rafId=requestAnimationFrame(loop);

    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
