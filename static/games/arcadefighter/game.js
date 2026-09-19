/* ========================================================================
   街机格斗(简化版) — 遵循 window.IanGame 接口契约
   1v1 格斗:玩家(蓝)vs AI(红)。两局三胜。
   操作:A/D 移动 · W 跳 · J 拳(快/轻) · K 脚(慢/重) · L 必杀(耗气)
   ======================================================================== */
(function () {
  'use strict';

  var GRAV = 0.7, GROUND_Y_RATIO = 0.82;

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var GY = H * GROUND_Y_RATIO;

    var p1, p2, particles, score, round, p1Wins, p2Wins, over, running, paused, rafId, keys, roundEndT, hitstop, frame, lastStep, acc;

    function reset() {
      p1 = mkFighter(W*0.3, true, '#00e0ff', '雷电');
      p2 = mkFighter(W*0.7, false, '#ff2e63', '烈焰');
      particles = [];
      score = 0; round = 1; p1Wins = 0; p2Wins = 0; over = false; roundEndT = 0; hitstop = 0; frame = 0;
      lastStep = 0; acc = 0; keys = {};
      emitScore(); emitState('playing');
    }
    function mkFighter(x, isPlayer, color, name) {
      return { x:x, y:GY, vx:0, vy:0, facing: isPlayer?1:-1, hp:100, maxhp:100, energy:0,
        w:44, h:78, color:color, name:name, isPlayer:isPlayer,
        state:'idle', stateT:0, atk:null, atkT:0, atkHit:false, hurtT:0, stun:0, onGround:true };
    }
    function emitScore(){ hooks.onScore && hooks.onScore(score, round); }
    function emitState(s){ hooks.onState && hooks.onState(s); }

    // 攻击数据:[启动, 持续(命中帧窗口), 收招, 伤害, 范围X, 范围Y, 击退, 耗气]
    var ATKS = {
      punch: { st:4, act:5, rec:9, dmg:6, rx:46, ry:50, kb:3, cost:0, color:'#00e0ff', e:0 },
      kick:  { st:8, act:6, rec:16, dmg:11, rx:58, ry:64, kb:6, cost:0, color:'#ffb627', e:0 },
      special:{ st:10,act:14, rec:22, dmg:22, rx:90, ry:80, kb:14, cost:50, color:'#b537f2', e:1 },
    };

    function startAtk(f, kind) {
      var a = ATKS[kind];
      if (f.state !== 'idle' && f.state !== 'walk' && f.state !== 'jump') return;
      if (kind === 'special' && f.energy < a.cost) return;
      f.state='atk'; f.atk=kind; f.stateT=0; f.atkHit=false;
      if (kind==='special') { f.energy -= a.cost; }
      // 必杀前冲特效
      if (kind==='special') { for(var i=0;i<14;i++) spark(f.x, f.y-f.h/2, f.color, 1); }
    }

    function step(dt) {
      frame++;
      if (hitstop>0){ hitstop--; return; }
      // ---- 玩家输入 ----
      var f=p1;
      if (f.stun>0) f.stun--;
      else {
        if (f.state==='idle' || f.state==='walk') {
          f.vx = 0;
          if (keys['a']||keys['ArrowLeft']){ f.vx=-3.5; f.facing=-1; f.state='walk'; }
          else if (keys['d']||keys['ArrowRight']){ f.vx=3.5; f.facing=1; f.state='walk'; }
          else f.state='idle';
          if (keys['w']||keys['ArrowUp']){ if(f.onGround){ f.vy=-13; f.onGround=false; f.state='jump'; } }
          if (keys['j']) startAtk(f,'punch');
          else if (keys['k']) startAtk(f,'kick');
          else if (keys['l']) startAtk(f,'special');
        } else if (f.state==='jump') {
          if (keys['a']||keys['ArrowLeft']) f.vx=-3;
          else if (keys['d']||keys['ArrowRight']) f.vx=3;
        }
      }

      // ---- AI ----
      aiThink(p2, p1, dt);

      // ---- 物理 + 状态机 ----
      [p1, p2].forEach(updateFighter);

      // 攻击命中检测
      [p1, p2].forEach(function(att){
        if (att.state!=='atk' || att.atkHit) return;
        var a = ATKS[att.atk];
        if (att.stateT < a.st || att.stateT > a.st+a.act) return; // 不在命中窗口
        var def = (att===p1)?p2:p1;
        // 攻击盒
        var ax = att.x + att.facing * (att.w/2) + att.facing * a.rx/2;
        var ay = att.y - att.h/2;
        // 防御盒(对方身体)
        if (Math.abs(ax - def.x) < (a.rx + def.w)/2 && Math.abs(ay - (def.y - def.h/2)) < (a.ry + def.h)/2) {
          att.atkHit = true;
          def.hp = Math.max(0, def.hp - a.dmg);
          def.vx = att.facing * a.kb; def.vy = -4; def.onGround=false; def.state='hurt'; def.stateT=0; def.stun = a.rec;
          def.hurtT = 12;
          att.energy = Math.min(100, att.energy + a.e*10 + 8);
          hitstop = a.dmg>15?10:5;
          spark(def.x, def.y-def.h/2, a.color, a.dmg>15?20:10);
          showFloat(def.x, def.y-def.h-10, '-'+a.dmg, a.color);
          if (def.hp<=0) endRound(att);
        }
      });

      // 自动回气
      [p1,p2].forEach(function(f){ if(frame%30===0) f.energy=Math.min(100,f.energy+2); });

      // 粒子
      particles.forEach(function(p){ p.x+=p.vx;p.y+=p.vy;p.vy+=0.2;p.life--; });
      particles = particles.filter(function(p){return p.life>0;});

      // 回合结束计时
      if (roundEndT>0){ roundEndT--; if(roundEndT===0){ nextRound(); } }
    }

    function updateFighter(f) {
      if (f.hurtT>0) f.hurtT--;
      // 重力
      if (!f.onGround) f.vy += GRAV;
      f.x += f.vx; f.y += f.vy;
      if (f.y >= GY){ f.y=GY; f.vy=0; if(!f.onGround){ f.onGround=true; if(f.state==='jump'||f.state==='hurt'){ f.state='idle'; f.stateT=0; } } }
      // 摩擦
      if (f.onGround) f.vx *= 0.7;
      // 边界
      f.x = Math.max(f.w/2+10, Math.min(W-f.w/2-10, f.x));
      // 状态计时
      f.stateT++;
      if (f.state==='atk'){
        var a = ATKS[f.atk];
        if (f.stateT > a.st+a.act+a.rec){ f.state='idle'; f.stateT=0; f.atk=null; f.atkHit=false; }
      } else if (f.state==='hurt'){
        if (f.stateT > 15 && f.onGround){ f.state='idle'; f.stateT=0; }
      }
    }

    // 简易 AI:接近→攻击→偶尔后撤;血少时更激进;有气时放必杀
    var aiT = 0, aiDecision = 'idle';
    function aiThink(ai, tgt, dt){
      aiT++;
      var dist = Math.abs(ai.x - tgt.x);
      var facing = tgt.x > ai.x ? 1 : -1;
      ai.facing = facing;
      if (ai.stun>0 || ai.state==='atk' || ai.state==='hurt') return;
      // 周期决策
      if (aiT % 20 === 0){
        var r = Math.random();
        if (dist > 120) aiDecision = r<0.8?'approach':'wait';
        else if (dist > 70) aiDecision = r<0.5?'approach':(r<0.75?'attack':'retreat');
        else aiDecision = r<0.55?'attack':(r<0.8?'retreat':'approach');
        // 血少激进
        if (ai.hp < 35 && ai.energy>=50 && dist<120) aiDecision='special';
      }
      // 执行
      if (ai.state==='jump') return;
      if (aiDecision==='approach'){ ai.vx = facing*2.8; ai.state='walk'; }
      else if (aiDecision==='retreat'){ ai.vx = -facing*2.5; ai.state='walk'; }
      else if (aiDecision==='wait'){ ai.vx*=0.7; ai.state='idle'; }
      else if (aiDecision==='attack'){
        if (dist < 60){ startAtk(ai, Math.random()<0.6?'punch':'kick'); }
        else { ai.vx = facing*2.8; ai.state='walk'; }
      } else if (aiDecision==='special'){
        if (dist < 110){ startAtk(ai,'special'); }
        else { ai.vx=facing*3; ai.state='walk'; }
      }
    }

    function endRound(winner){
      if (roundEndT>0) return;
      if (winner===p1) p1Wins++; else p2Wins++;
      score += (winner===p1?200:50);
      roundEndT = 120; // 2秒后下一回合
      // 胜负判定
      if (p1Wins>=2 || p2Wins>=2){
        over = true;
        emitState('over');
        hooks.onGameOver && hooks.onGameOver(score + (p1Wins>=2?500:0), round);
      }
      emitScore();
    }
    function nextRound(){
      round++;
      p1.hp=p1.maxhp; p2.hp=p2.maxhp; p1.x=W*0.3; p2.x=W*0.7; p1.y=p2.y=GY; p1.vx=p2.vx=0; p1.vy=p2.vy=0;
      p1.state=p2.state='idle'; p1.stateT=p2.stateT=0; p1.atk=p2.atk=null; p1.energy=p2.energy=0;
    }

    function spark(x,y,col,n){ for(var i=0;i<n;i++){var a=Math.random()*7,sp=2+Math.random()*5;particles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,life:25,color:col,r:3});} }
    var floats=[];
    function showFloat(x,y,t,c){ floats.push({x:x,y:y,t:t,c:c,life:40}); }

    function draw() {
      // 背景
      var g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#1a0a2a'); g.addColorStop(0.6,'#0d0a1a'); g.addColorStop(1,'#060912');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      // 远景霓虹建筑
      ctx.fillStyle='rgba(124,58,237,.15)';
      for (var i=0;i<8;i++){ var bw=40+i*30; ctx.fillRect(i*110, H*0.5-i*10, bw, H); }
      // 地面
      var gg=ctx.createLinearGradient(0,GY,0,H);
      gg.addColorStop(0,'#2a1845'); gg.addColorStop(1,'#060912');
      ctx.fillStyle=gg; ctx.fillRect(0,GY,W,H-GY);
      ctx.strokeStyle='rgba(0,224,255,.5)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,GY); ctx.lineTo(W,GY); ctx.stroke();
      // 网格地面
      ctx.strokeStyle='rgba(0,224,255,.12)'; ctx.lineWidth=1;
      for (var i=0;i<W;i+=40){ ctx.beginPath(); ctx.moveTo(i,GY); ctx.lineTo(i+ (W/2-i)*0.4, H); ctx.stroke(); }

      // 角色(背向远处在前)
      [p2, p1].forEach(drawFighter);

      // 粒子
      particles.forEach(function(p){ctx.globalAlpha=p.life/25;ctx.shadowBlur=8;ctx.shadowColor=p.color;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();});
      ctx.globalAlpha=1; ctx.shadowBlur=0;

      // 浮动伤害数字
      floats.forEach(function(f){ f.y-=1; f.life--; ctx.globalAlpha=Math.min(1,f.life/20); ctx.fillStyle=f.c; ctx.font='bold 22px Orbitron'; ctx.textAlign='center'; ctx.fillText(f.t, f.x, f.y); });
      ctx.globalAlpha=1;
      floats = floats.filter(function(f){return f.life>0;});

      // HUD
      drawHUD();
    }

    function drawFighter(f){
      var flash = f.hurtT>0 && f.hurtT%4<2;
      ctx.save();
      ctx.translate(f.x, f.y); ctx.scale(f.facing, 1);
      // 影子
      ctx.fillStyle='rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 28, 7, 0, 0, 7); ctx.fill();
      // 身体(简化火柴人增强版)
      ctx.shadowBlur=14; ctx.shadowColor=f.color;
      ctx.strokeStyle=flash?'#fff':f.color; ctx.lineWidth=8; ctx.lineCap='round';
      var st = f.state, t = f.stateT;
      // 躯干
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,-50); ctx.stroke();
      // 头
      ctx.fillStyle=flash?'#fff':f.color; ctx.beginPath(); ctx.arc(0,-62,12,0,7); ctx.fill();
      ctx.fillStyle='#060912'; ctx.beginPath(); ctx.arc(4,-64,2.5,0,7); ctx.fill(); // 眼
      // 腿
      var legSwing = st==='walk'? Math.sin(t*0.4)*10 : 0;
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(-8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(8+legSwing*0.3, 0); ctx.stroke();
      // 手臂(根据状态)
      ctx.lineWidth=7;
      if (st==='atk'){
        var a=ATKS[f.atk], prog = t / (a.st+a.act+a.rec);
        var ext = (t>=a.st && t<=a.st+a.act) ? 1 : (t<a.st? t/a.st : 1-(t-a.st-a.act)/a.rec);
        var reach = a.rx * ext;
        // 手臂端点高度:踢腿压低,拳/必杀在躯干中段
        var armY = f.atk==='kick' ? -18 : -40;
        ctx.beginPath(); ctx.moveTo(0,-40); ctx.lineTo(reach, armY); ctx.stroke();
        // 拳/脚特效
        ctx.fillStyle=a.color; ctx.beginPath();
        if (f.atk==='kick'){ ctx.fillRect(reach-6, -50, 14, 40); }
        else if (f.atk==='special'){ ctx.shadowBlur=24; ctx.beginPath(); ctx.arc(reach+10,-40,18,0,7); ctx.fill(); ctx.shadowBlur=14; }
        else { ctx.arc(reach+4,-40,9,0,7); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(0,-40); ctx.lineTo(-14,-30); ctx.stroke(); // 后手
      } else {
        var armSwing = st==='walk'? Math.sin(t*0.4)*8 : 0;
        ctx.beginPath(); ctx.moveTo(0,-40); ctx.lineTo(-14,-28+armSwing); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,-40); ctx.lineTo(14,-28-armSwing); ctx.stroke();
      }
      ctx.restore(); ctx.shadowBlur=0;

      // 名字
      ctx.fillStyle=f.color; ctx.font='bold 12px Rajdhani'; ctx.textAlign='center';
      ctx.fillText(f.name, f.x, f.y+18);
    }

    function drawHUD() {
      // 血条 P1
      drawBar(20, 18, 320, 16, p1.hp/p1.maxhp, '#00e0ff', p1.name);
      drawEnergy(20, 38, 320, 6, p1.energy/100, '#ffb627');
      // P2(右)
      drawBar(W-340, 18, 320, 16, p2.hp/p2.maxhp, '#ff2e63', p2.name, true);
      drawEnergy(W-340, 38, 320, 6, p2.energy/100, '#ffb627');
      // 回合胜场
      ctx.textAlign='center'; ctx.font='bold 13px Rajdhani'; ctx.fillStyle='#8b97b3';
      ctx.fillText('第 '+round+' 局', W/2, 20);
      ctx.fillStyle='#00e0ff'; ctx.font='20px sans-serif';
      for (var i=0;i<2;i++) ctx.fillText(i<p1Wins?'★':'☆', W/2-20+i*20, 44);
      ctx.fillStyle='#ff2e63';
      for (var i=0;i<2;i++) ctx.fillText(i<p2Wins?'★':'☆', W/2+20-i*20, 44);
      // 提示
      if (roundEndT>0 && !over){
        ctx.fillStyle='rgba(6,9,18,.6)'; ctx.fillRect(0,H/2-40,W,80);
        ctx.fillStyle=p1.hp>p2.hp?'#00e0ff':'#ff2e63'; ctx.font='bold 36px Orbitron'; ctx.textAlign='center';
        ctx.fillText((p1.hp>p2.hp?p1.name:p2.name)+' 胜!', W/2, H/2+10);
      }
    }
    function drawBar(x,y,w,h,pct,color,name,right){
      ctx.fillStyle='#0d1320'; roundRect(x,y,w,h,4); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.2)'; roundRect(x,y,w,h,4); ctx.stroke();
      ctx.fillStyle=color; 
      if(right){ roundRect(x+w*(1-pct),y,w*pct,h,4); } else { roundRect(x,y,w*pct,h,4); }
      ctx.fill();
      ctx.fillStyle='#eaf0fb'; ctx.font='bold 11px Rajdhani'; ctx.textAlign=right?'right':'left';
      ctx.fillText(name+' '+Math.ceil(pct*100), right?x+w-6:x+6, y-4);
    }
    function drawEnergy(x,y,w,h,pct,color){
      ctx.fillStyle='#0d1320'; roundRect(x,y,w,h,3); ctx.fill();
      ctx.fillStyle=color; roundRect(x,y,w*pct,h,3); ctx.fill();
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    function loop(ts){
      // 固定逻辑步长 ~60fps,锁定战斗节奏不随显示器刷新率变化
      if (!lastStep) lastStep = ts;
      var dt = ts - lastStep; lastStep = ts;
      if (running && !over && !paused) {
        acc += dt;
        var STEP = 1000/60, max = 5;
        while (acc >= STEP && max-- > 0) { step(); acc -= STEP; }
      }
      draw(); rafId=requestAnimationFrame(loop);
    }
    function onKey(e){
      keys[e.key.toLowerCase()] = keys[e.key] = (e.type==='keydown');
      var block=['a','d','w','j','k','l',' ','ArrowLeft','ArrowRight','ArrowUp'];
      if(block.indexOf(e.key)>=0||block.indexOf(e.key.toLowerCase())>=0) e.preventDefault();
      if(e.key==='p') togglePause();
    }
    function togglePause(){ if(!running||over) return; paused?resume():pause(); }
    function start(){ reset(); running=true; paused=false; }
    function pause(){ paused=true; emitState('paused'); }
    function resume(){ if(over) return; paused=false; emitState('playing'); }
    function destroy(){ running=false; if(rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); }

    window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);
    reset(); running=false; rafId=requestAnimationFrame(loop);
    return { pause:pause, resume:resume, restart:start, destroy:destroy };
  }

  window.IanGame = { init: init };
})();
