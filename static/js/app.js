/* ========================================================================
   iangame 站点 JS —— API 客户端 + Toast + 游戏加载器
   暴露: window.IanAPI, window.IanToast, window.IanGameLoader
   游戏不依赖本文件;本文件只服务站点壳与 play 页。
   ======================================================================== */
(function () {
  'use strict';

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var host = document.getElementById('toastHost');
    if (!host) { console.log('[toast]', msg); return; }
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 2600);
  }

  /* ---------- API 客户端 ---------- */
  async function jget(url) {
    var r = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
    return r.json();
  }
  async function jpost(url, body) {
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    return r.json().catch(function () { return { ok: false, error: (window.IAN_T && window.IAN_T.err_parse) || '响应解析失败' }; });
  }

  var IanAPI = {
    get:     jget,   // 通用 GET(返回 Promise<json>)
    post:    jpost,  // 通用 POST(同源 JSON,带 CSRF 所需的默认头)
    me:      function () { return jget('/api/me'); },
    games:   function () { return jget('/api/games'); },
    leaderboard: function (slug) { return jget('/api/leaderboard/' + encodeURIComponent(slug)); },
    submitScore: function (slug, score, level, token) { return jpost('/api/score', { slug: slug, score: score, level: level || 0, token: token || '' }); },
    login:   function (u, p) { return jpost('/api/login', { username: u, password: p }); },
    register:function (u, p) { return jpost('/api/register', { username: u, password: p }); },
    logout:  function () { return jpost('/api/logout'); },
    favList: function () { return jget('/api/favorite'); },
    toggleFav: function (slug) { return jpost('/api/favorite', { slug: slug }); },
    profile: function () { return jget('/api/profile'); },
  };

  /* ---------- 本地存档(游客也用) ---------- */
  var LocalStore = {
    best: function (slug) { return parseInt(localStorage.getItem('ian:best:' + slug) || '0', 10); },
    setBest: function (slug, v) {
      var cur = LocalStore.best(slug);
      if (v > cur) { localStorage.setItem('ian:best:' + slug, String(v)); return true; }
      return false;
    },
  };

  /* ---------- 游戏加载器(play 页核心) ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error(((window.IAN_T && window.IAN_T.err_load) || '加载失败') + ': ' + src)); };
      document.head.appendChild(s);
    });
  }

  var IanGameLoader = {
    /**
     * 挂载一款游戏。
     * @param {Object} opts { slug, canvas, hooks }
     * @returns controller(pause/resume/restart/destroy)
     */
    async mount(opts) {
      var slug = opts.slug, canvas = opts.canvas, hooks = opts.hooks || {};
      // 加时间戳查询串:每次进游戏都视为新 URL,绕过 CF/浏览器缓存,
      // 确保玩家拿到最新版游戏脚本(开发迭代时尤其重要)
      await loadScript('/static/games/' + slug + '/game.js?v=' + Date.now());
      if (!window.IanGame || typeof window.IanGame.init !== 'function') {
        throw new Error((window.IAN_T && window.IAN_T.err_no_iface) || '游戏未实现 window.IanGame.init 接口');
      }
      var ctrl = window.IanGame.init(canvas, hooks);
      // 用完即删全局,避免下一款游戏残留
      delete window.IanGame;
      return ctrl;
    }
  };

  window.IanToast = toast;
  window.IanAPI = IanAPI;
  window.IanLocal = LocalStore;
  window.IanGameLoader = IanGameLoader;
})();
