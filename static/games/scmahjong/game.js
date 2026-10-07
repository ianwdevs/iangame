/* =====================================================================
   四川麻将 — 血战到底
   108 张(万条筒), 定缺 + 换三张, 不能吃, 碰/杠/胡, 一炮多响
   根/龙七对/杠上开花/海底捞月/抢杠胡, 胡者离局血战到底
   引擎由 mahjong/core.js 提供(异步加载)
   ===================================================================== */
(function () {
  'use strict';

  var CFG = {
    sichuan: true,
    title: '四川麻将 · 血战到底',
  };

  function loadCore(cb) {
    if (window.MahjongCore) return cb();
    var s = document.createElement('script');
    s.src = '/static/games/mahjong/core.js?v=' + Date.now();
    s.onload = cb;
    s.onerror = function () { throw new Error('mahjong core load failed'); };
    document.head.appendChild(s);
  }

  window.IanGame = {
    init: function (canvas, hooks) {
      var inner = null;
      var api = {
        pause: function () {}, resume: function () {},
        restart: function () { if (inner) inner.restart(); },
        destroy: function () { if (inner) inner.destroy(); },
      };
      loadCore(function () {
        inner = window.MahjongCore.create(canvas, hooks, CFG);
        api.pause = function () { inner.pause(); };
        api.resume = function () { inner.resume(); };
      });
      return api;
    },
  };
})();
