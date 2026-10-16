/* ========================================================================
   记忆翻牌 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  var ICONS = ['🎮','👾','🚀','⚡','🔥','💎','🌟','🎯','🎲','🃏','🍒','🔔'];

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var COLS = 4, ROWS = 4;
    var cards, flipped, matched, score, moves, time, startT, running, paused, rafId, lockUntil;

    function reset() {
      var pool = ICONS.slice(0, COLS*ROWS/2);
      var deck = pool.concat(pool);
      // 洗牌
      for (var i = deck.length - 1; i > 0; i--) { var j = (Math.random()*(i+1))|0; var t = deck[i]; deck[i]=deck[j]; deck[j]=t; }
      cards = deck.map(function (icon, idx) {
        return { r: (idx/COLS)|0, c: idx%COLS, icon: icon, flip: 0, target: 0, done: false };
      });
      flipped = []; matched = 0; score = 0; moves = 0; time = 0; startT = Date.now(); lockUntil = 0;
      emitScore(); emitState('playing');
    }
    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function cardRect(card) {
      var gap = 10, top = 50;
      var cw = (W - gap*(COLS+1)) / COLS, ch = (H - top - gap*(ROWS+1)) / ROWS;
      return { x: gap + card.c*(cw+gap), y: top + card.r*(ch+gap), w: cw, h: ch };
    }

    function onClick(e) {
      if (paused) return;
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (W/rect.width), my = (e.clientY - rect.top) * (H/rect.height);
      if (Date.now() < lockUntil) return;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i]; if (c.done || c.target === 1) continue;
        var r = cardRect(c);
        if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
          c.target = 1; flipped.push(c);
          if (flipped.length === 2) {
            moves++;
            var a = flipped[0], b = flipped[1];
            if (a.icon === b.icon) {
              a.done = b.done = true; matched += 2; score += 100;
              flipped = []; emitScore();
              if (matched === cards.length) {
                // 通关奖励:用时越短分越高
                var t = (Date.now() - startT)/1000;
                score += Math.max(0, Math.floor(2000 - t*5));
                emitScore(); emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1);
              }
            } else {
              score = Math.max(0, score - 10); emitScore();
              lockUntil = Date.now() + 700;
              var toFlip = [a, b]; flipped = [];
              setTimeout(function () { toFlip.forEach(function (cc) { cc.target = 0; }); }, 700);
            }
          }
          break;
        }
      }
    }

    function draw() {
      ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, W, H);
      // 顶栏
      ctx.fillStyle = '#8b97b3'; ctx.font = 'bold 16px Rajdhani,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('步数: ' + moves, 14, 28);
      ctx.textAlign = 'right';
      time = ((Date.now() - startT)/1000)|0;
      ctx.fillText('⏱ ' + time + 's', W - 14, 28);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00e0ff'; ctx.font = 'bold 16px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText('已配对 ' + matched + '/' + cards.length, W/2, 28);
      // 卡牌
      cards.forEach(function (c) {
        c.flip += (c.target - c.flip) * 0.25;
        var r = cardRect(c);
        var flipScale = Math.abs(Math.cos(c.flip * Math.PI));
        ctx.save();
        ctx.translate(r.x + r.w/2, r.y + r.h/2);
        ctx.scale(flipScale || 0.01, 1);
        var showFront = c.flip > 0.5;
        // 背面
        if (!showFront) {
          ctx.shadowBlur = 8; ctx.shadowColor = '#7c3aed';
          var g = ctx.createLinearGradient(-r.w/2, -r.h/2, r.w/2, r.h/2);
          g.addColorStop(0, '#1a1030'); g.addColorStop(1, '#2a1850');
          ctx.fillStyle = g; roundRect(-r.w/2, -r.h/2, r.w, r.h, 12); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#b537f2'; ctx.lineWidth = 2; roundRect(-r.w/2, -r.h/2, r.w, r.h, 12); ctx.stroke();
          ctx.fillStyle = '#b537f2'; ctx.font = 'bold 32px Orbitron,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, 2);
        } else {
          ctx.shadowBlur = c.done ? 16 : 10; ctx.shadowColor = c.done ? '#2ee6a6' : '#00e0ff';
          ctx.fillStyle = c.done ? 'rgba(46,230,166,.15)' : 'rgba(0,224,255,.12)';
          roundRect(-r.w/2, -r.h/2, r.w, r.h, 12); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = c.done ? '#2ee6a6' : '#00e0ff'; ctx.lineWidth = 2; roundRect(-r.w/2, -r.h/2, r.w, r.h, 12); ctx.stroke();
          ctx.font = '40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.icon, 0, 4);
        }
        ctx.restore();
      });
      ctx.textBaseline = 'alphabetic';
    }
    function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    function start() { reset(); running = true; paused = false; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { paused = false; emitState('playing'); }
    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('click', onClick); }

    canvas.addEventListener('click', onClick);
    reset(); running = true; rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
