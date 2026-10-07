/* =====================================================================
   标准麻将 — 国标休闲简化规则
   136 张(万条筒 + 东南西北中發白), 可吃(仅上家)碰杠胡
   混一色/清一色/对对胡/七对/役牌刻/断幺九/门清/自摸等
   首家胡牌即结算
   引擎由 mahjong/core.js 提供(异步加载)
   ===================================================================== */
(function () {
  'use strict';

  var CFG = {
    sichuan: false,
    title: '标准麻将',
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
