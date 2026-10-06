/* ========================================================================
   狼人杀房间页 — 免登录(token) · 1.5s 轮询 · 按 phase 渲染
   ======================================================================== */
(function () {
  'use strict';
  var T = window.IAN_T || {};
  var main = document.getElementById('wwMain');
  var CODE = window.WW_CODE;
  var IDENT = null;          // {playerId, token, name}
  var S = null;              // 最新 state
  var sel = { vote: 0, night: 0, witchAct: '' };  // 选择中间态(渲染间保留)
  var flipped = false;       // 角色卡已翻
  var lastPhase = '';

  // ---------- util ----------
  function t(k) { return T[k] || k; }
  function fmt(k, kv) {
    return (T[k] || k).replace(/\{(\w+)\}/g, function (_, m) { return kv && kv[m] !== undefined ? kv[m] : ''; });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clearSel() { sel.vote = 0; sel.night = 0; sel.witchAct = ''; }
  function pidName(pid) {
    if (!pid) return '';
    if (S && S.all_roles) {
      for (var i = 0; i < S.all_roles.length; i++)
        if (S.all_roles[i].id === pid) return esc(S.all_roles[i].name);
    }
    if (S) for (var j = 0; j < S.players.length; j++)
      if (S.players[j].id === pid) return esc(S.players[j].name);
    return '?';
  }
  function esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML;
  }
  var ROLE_ICON = { wolf: '🐺', villager: '👨‍🌾', seer: '🔮', witch: '🧪', hunter: '🏹', guard: '🛡' };
  function roleName(r) { return t('ww_role_' + r); }
  function roleClass(r) { return r === 'wolf' ? 'wolf' : 'village'; }

  // ---------- 身份存取 ----------
  function loadIdent() {
    try { IDENT = JSON.parse(localStorage.getItem('ian:ww:' + CODE) || 'null'); } catch (e) { IDENT = null; }
  }
  function saveIdent(r) {
    IDENT = { playerId: r.playerId, token: r.token, name: IDENT ? IDENT.name : '' };
    localStorage.setItem('ian:ww:' + CODE, JSON.stringify(IDENT));
  }
  function dropIdent() { localStorage.removeItem('ian:ww:' + CODE); IDENT = null; }

  // ---------- API ----------
  function jpost(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: '' }; });
  }
  function poll() {
    if (!IDENT) return Promise.resolve();
    var q = 'room=' + CODE + '&playerId=' + IDENT.playerId + '&token=' + encodeURIComponent(IDENT.token);
    return fetch('/api/ww/state?' + q, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) { S = d; gotAt = Date.now(); render(); }
        else if (d && d.error) { roomClosed(d.error); }
      })
      .catch(function () {});
  }
  function act(action, target, extra) {
    if (!IDENT) return;
    jpost('/api/ww/action', {
      room: CODE, playerId: IDENT.playerId, token: IDENT.token,
      action: action, target: target || 0, extra: extra || {},
    }).then(function (d) {
      if (d && d.ok) { S = d; render(); }
      else if (d && d.error) { window.IanToast(d.error, 'err'); poll(); }
    });
  }
  function roomClosed(errMsg) {
    clearInterval(timer);
    // 同步清理"继续上次房间"索引,死房不再出现在大厅恢复列表
    try {
      var rs = JSON.parse(localStorage.getItem('ian:ww:rooms') || '[]');
      localStorage.setItem('ian:ww:rooms', JSON.stringify(rs.filter(function (r) { return r.code !== CODE; })));
    } catch (e) {}
    main.innerHTML = '';
    var w = el('div', 'ww-join-wrap panel');
    w.innerHTML = '<h4>' + esc(errMsg || t('ww_room_closed')) + '</h4>' +
      '<a class="btn btn-primary btn-block" href="/werewolf" style="margin-top:12px">' + t('ww_back_lobby') + '</a>';
    main.appendChild(w);
    dropIdent();
  }

  // ---------- 轮询循环 ----------
  var timer = null;
  function startPoll() {
    clearInterval(timer);
    poll();
    timer = setInterval(poll, 1500);
  }

  // ---------- 加入表单 ----------
  function renderJoin() {
    clearInterval(timer);
    main.innerHTML = '';
    var w = el('div', 'ww-join-wrap panel');
    var savedName = (IDENT && IDENT.name) || localStorage.getItem('ian:ww:name') || '';
    w.innerHTML =
      '<h4>🐺 ' + t('ww_title') + ' · ' + CODE + '</h4>' +
      '<div class="field"><label>' + t('ww_nickname') + '</label>' +
      '<input type="text" id="jn" maxlength="12" value="' + esc(savedName) + '"></div>' +
      '<button class="btn btn-primary btn-block" id="jb">' + t('ww_join') + '</button>' +
      '<div class="form-msg" id="jm"></div>';
    main.appendChild(w);
    document.getElementById('jb').addEventListener('click', function () {
      var n = document.getElementById('jn').value.trim();
      var jm = document.getElementById('jm');
      if (!n) { jm.className = 'form-msg err'; jm.textContent = t('ww_need_name'); return; }
      localStorage.setItem('ian:ww:name', n);
      var oldToken = IDENT ? IDENT.token : '';
      jpost('/api/ww/join', { room: CODE, name: n, token: oldToken }).then(function (d) {
        if (d && d.ok) { IDENT = { playerId: d.playerId, token: d.token, name: n };
          localStorage.setItem('ian:ww:' + CODE, JSON.stringify(IDENT)); startPoll(); }
        else if (d && d.error) { jm.className = 'form-msg err'; jm.textContent = d.error; }
      });
    });
  }

  // ---------- 渲染主入口 ----------
  function render() {
    if (!S) return;
    if (S.room.phase !== lastPhase) {
      clearSel();
      if (lastPhase && S.room.phase.indexOf('night') === 0 && S.room.phase !== 'night')
        window.IanToast('🌙 ' + t('ww_evt_night'), '');
      lastPhase = S.room.phase;
    }
    var aliveCnt = 0;
    S.players.forEach(function (p) { if (p.alive && !p.is_judge) aliveCnt++; });
    main.innerHTML = '';
    main.appendChild(banner(aliveCnt));
    var ph = S.room.phase;
    if (ph === 'waiting') renderWaiting();
    else if (ph === 'dealing') renderDealing();
    else if (ph === 'police_run') renderPoliceRun();
    else if (ph === 'police_vote' || ph === 'police_pk') renderPoliceVote();
    else if (ph.indexOf('night_') === 0) renderNight();
    else if (ph === 'dawn') renderDawn();
    else if (ph === 'day_talk') renderDayTalk();
    else if (ph === 'vote_cast' || ph === 'vote_pk') renderVote();
    else if (ph === 'exile') renderExile();
    else if (ph === 'game_over') renderOver();
    renderNeeds();
    main.appendChild(timeline());
  }

  // ---------- 横幅 ----------
  function banner(aliveCnt) {
    var r = S.room;
    var b = el('div', 'ww-banner' + (r.phase.indexOf('night') === 0 ? ' night' : ''));
    var phName = t('ww_phase_' + r.phase);
    var dn = r.day_no > 0
      ? (r.phase.indexOf('night') === 0 ? fmt('ww_night', { n: r.day_no }) : fmt('ww_day', { n: r.day_no }))
      : '';
    var right = '';
    if (r.talk_end) right = '<span class="ww-timer" id="wwTimer"></span><span class="muted tiny">⏱ ' + t('ww_set_timer') + '</span>';
    var prog = '';
    if (S.night_progress) prog = ' · ' + fmt('ww_act_progress', S.night_progress);
    var hasBot = S.players.some(function (x) { return x.is_bot; });
    if (hasBot && r.phase.indexOf('night') === 0 && S.me.is_host) prog += ' · 🤖 ' + t('ww_bot_hint');
    if (S.me.is_host && r.phase !== 'waiting' && r.phase !== 'game_over') {
      var acts = hostActs();
      if (acts.length) {
        right += '<div class="ww-acts">' + acts + '</div>';
      }
    }
    b.innerHTML =
      '<div><div class="ph">' + (r.phase.indexOf('night') === 0 ? '🌙 ' : r.phase === 'dawn' ? '🌅 ' : '☀️ ') + esc(phName) +
      (dn ? ' <span class="muted" style="font-size:14px">· ' + dn + '</span>' : '') + '</div>' +
      '<div class="sub">' + esc(String(r.phase === 'waiting' ? r.count : aliveCnt)) + '/' + esc(String(r.phase === 'waiting' ? r.max : r.count)) + ' ' + esc(t('ww_players')) + prog +
      (pendingHint() || '') + '</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + right + '</div>';
    if (r.talk_end) startTimerTick();
    return b;
  }
  function pendingHint() {
    var pend = S && S.me && S.me.is_host && S.room.phase !== 'waiting' && !hostActs().length &&
      (S.room.phase === 'dawn' || S.room.phase === 'exile');
    if (pend) return ' · ' + t('ww_wait_pending');
    return '';
  }
  function hostActs() {
    var ph = S.room.phase, a = [];
    function btn(label, actName, extra) {
      return '<button class="btn btn-primary btn-sm" data-act="' + actName + '" data-extra=\'' + (extra ? JSON.stringify(extra) : '') + '\'>' + label + '</button>';
    }
    if (ph === 'dealing') {
      a.push(btn('👮 ' + t('ww_run_police'), 'run_police'));
      a.push(btn('🌙 ' + t('ww_skip_police'), 'skip_police'));
    } else if (ph === 'police_run') {
      a.push(btn(t('ww_next') + ' →', 'next_phase'));
    } else if (ph === 'police_vote' || ph === 'police_pk') {
      a.push(btn('🗳 ' + t('ww_next') + ' →', 'next_phase'));
    } else if (ph.indexOf('night_') === 0) {
      a.push(btn(t('ww_next') + ' →', 'next_phase'));
    } else if (ph === 'dawn' || ph === 'exile') {
      a.push(btn(t('ww_next') + ' →', 'next_phase'));
    } else if (ph === 'day_talk') {
      a.push(btn('🗳 ' + t('ww_next') + ' →', 'next_phase'));
      a.push(btn('⏱ 60s', 'set_timer', { secs: 60 }));
      a.push(btn('⏱ 120s', 'set_timer', { secs: 120 }));
      a.push(btn('⏱ 180s', 'set_timer', { secs: 180 }));
      if (S.room.talk_end) a.push(btn('⏹ ' + t('ww_timer_stop'), 'set_timer', { secs: 0 }));
    } else if (ph === 'vote_cast' || ph === 'vote_pk') {
      a.push(btn('📊 ' + t('ww_next') + ' →', 'next_phase'));
    } else if (ph === 'game_over') {
      a.push(btn('🔄 ' + t('ww_restart'), 'restart'));
    }
    return a.join('');
  }
  // 主持人按钮事件(事件委托)
  main && main.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    var extra = {};
    try { extra = JSON.parse(b.dataset.extra || '{}'); } catch (err) {}
    act(b.dataset.act, 0, extra);
  });

  // 讨论计时(本地每秒)
  var tickTimer = null;
  function startTimerTick() {
    clearInterval(tickTimer);
    function upd() {
      var elx = document.getElementById('wwTimer');
      if (!elx || !S || !S.room.talk_end) { clearInterval(tickTimer); return; }
      var left = Math.max(0, Math.round(S.room.talk_end - S.now - (Date.now() - gotAt) / 1000));
      elx.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
    }
    tickTimer = setInterval(upd, 500); upd();
  }
  var gotAt = 0;

  // ---------- 座位网格 ----------
  function seatGrid(opt) {
    opt = opt || {};
    var g = el('div', 'ww-grid');
    var byId = {};
    (S.all_roles || []).forEach(function (r) { byId[r.id] = r; });
    S.players.forEach(function (p) {
      var d = el('div', 'ww-seat' + (p.alive ? '' : ' dead'));
      var tags = '';
      if (p.is_judge) {
        tags += '<span class="tag-mini host">' + t('ww_judge') + '</span>';
        if (!p.online) tags += '<span class="tag-mini off">' + esc(t('ww_offline')) + '</span>';
        d.innerHTML = '<div class="avatar" style="width:36px;height:36px;font-size:15px;background:linear-gradient(135deg,#ffd54a,#ff7847)">' + esc(p.name.charAt(0).toUpperCase()) + '</div>' +
          '<div class="nm">' + (p.id === S.me.id ? '<b>' + esc(p.name) + '</b>' : esc(p.name)) + '</div>' +
          '<div class="tags">' + tags + '</div>';
        if (p.id === S.me.id) d.style.borderColor = '#ffd54a';
        g.appendChild(d);
        return;
      }
      if (p.is_host) tags += '<span class="tag-mini host">👑 ' + esc(t('ww_host_tag')) + '</span>';
      if (p.is_bot) tags += '<span class="tag-mini">🤖</span>';
      if (p.is_police) tags += '<span class="tag-mini police">👮</span>';
      if (!p.online) tags += '<span class="tag-mini off">' + esc(t('ww_offline')) + '</span>';
      if (opt.showRole && byId[p.id]) {
        tags += '<span class="rl ' + roleClass(byId[p.id].role) + '">' + ROLE_ICON[byId[p.id].role] + ' ' + esc(roleName(byId[p.id].role)) + '</span>';
      }
      if (opt.runTag && p.run) tags += '<span class="tag-mini police">🚩 ' + esc(t('ww_police_run_done')) + '</span>';
      var ops = '';
      if (opt.hostOps && S.me.is_host && p.id !== S.me.id) {
        ops = '<div class="ops">' +
          '<button class="btn btn-ghost btn-sm" data-op="kick" data-pid="' + p.id + '" style="padding:2px 8px;font-size:11px">✖</button>' +
          '<button class="btn btn-ghost btn-sm" data-op="host" data-pid="' + p.id + '" style="padding:2px 8px;font-size:11px">👑</button>' +
          '</div>';
      }
      if (opt.showRole && byId[p.id] && !byId[p.id].alive) d.classList.add('dead');
      d.innerHTML = '<span style="font-size:11px" class="muted">#' + p.seat + '</span>' +
        '<div class="avatar" style="width:36px;height:36px;font-size:15px">' + esc(p.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="nm">' + (p.id === S.me.id ? '<b>' + esc(p.name) + '</b>' : esc(p.name)) + '</div>' +
        '<div class="tags">' + tags + '</div>' + ops;
      if (p.id === S.me.id) d.style.borderColor = 'var(--neon-cyan)';
      g.appendChild(d);
    });
    // 座位操作(踢/转让)
    g.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-op]');
      if (!b) return;
      var pid = +b.dataset.pid;
      if (b.dataset.op === 'kick') {
        if (confirm(t('ww_kick') + ' ' + pidName(pid) + '?')) act('kick', pid);
      } else if (b.dataset.op === 'host') {
        if (confirm(t('ww_transfer_host') + ' → ' + pidName(pid) + '?')) act('transfer_host', pid);
      }
    });
    return g;
  }

  // ---------- 选人网格 ----------
  function pickGrid(cands, selKey, confirmLabel, onConfirm, opt) {
    opt = opt || {};
    var wrap = el('div', '');
    var g = el('div', 'ww-pick');
    cands.forEach(function (p) {
      var b = el('button', 'pk' + (sel[selKey] === p.id ? ' sel' : ''), esc(p.name) +
        (p.is_police ? ' 👮' : '') + '<small>#' + p.seat + (opt.showRole ? ' ' + roleName(p.role) : '') + '</small>');
      b.addEventListener('click', function () { sel[selKey] = p.id; render(); });
      g.appendChild(b);
    });
    wrap.appendChild(g);
    var bar = el('div', 'flex gap-8');
    bar.style.marginTop = '10px';
    if (opt.abstain) {
      var ab = el('button', 'btn btn-ghost btn-sm', t('ww_vote_abstain'));
      ab.addEventListener('click', function () { sel[selKey] = 0; render(); });
      bar.appendChild(ab);
    }
    var cb = el('button', 'btn btn-primary', '✓ ' + confirmLabel);
    cb.addEventListener('click', function () { onConfirm(sel[selKey]); });
    bar.appendChild(cb);
    wrap.appendChild(bar);
    return wrap;
  }

  // ---------- waiting ----------
  function renderWaiting() {
    var r = S.room;
    var p1 = el('div', 'panel');
    p1.style.marginBottom = '16px';
    p1.innerHTML = '<h4>👥 ' + t('ww_players') + ' <span class="muted tiny">' + r.count + '/' + r.max + '</span></h4>' +
      '<p class="muted tiny">' + fmt('ww_waiting_hint', { n: r.min }) + '</p>';
    p1.appendChild(seatGrid({ hostOps: true }));
    if (S.me.is_host) p1.appendChild(configPanel());
    var bar = el('div', 'flex gap-8');
    bar.style.marginTop = '12px';
    if (S.me.is_host) {
      var bb = el('button', 'btn btn-ghost', t('ww_add_bot'));
      bb.disabled = r.count >= r.max;
      bb.addEventListener('click', function () { act('add_bot'); });
      bar.appendChild(bb);
      var sb = el('button', 'btn btn-primary', '🚀 ' + t('ww_start'));
      sb.disabled = r.count < r.min;
      sb.addEventListener('click', function () { act('start'); });
      bar.appendChild(sb);
      var lb = el('button', 'btn btn-ghost', '🚪 ' + t('ww_disband'));
      lb.addEventListener('click', function () { if (confirm(t('ww_disband') + '?')) { act('leave'); location.href = '/werewolf'; } });
      bar.appendChild(lb);
    } else {
      var lb2 = el('button', 'btn btn-ghost', '🚪 ' + t('ww_leave'));
      lb2.addEventListener('click', function () { act('leave'); location.href = '/werewolf'; });
      bar.appendChild(lb2);
    }
    p1.appendChild(bar);
    main.appendChild(p1);
  }

  // 角色配置(host)
  function configPanel() {
    var c = S.room.config || {};
    var p = el('div', '');
    p.style.marginTop = '14px';
    p.style.borderTop = '1px solid var(--border)';
    p.style.paddingTop = '12px';
    var isCustom = !!S.room.config_custom;
    p.innerHTML = '<h4>⚙️ ' + t('ww_role_config') +
      ' <span class="muted tiny">' + (isCustom ? '🔒 ' + t('ww_config_custom') : t('ww_config_preset')) + '</span></h4>';
    if (isCustom) {
      var rb = el('button', 'btn btn-ghost btn-sm', '↩ ' + t('ww_reset_preset'));
      rb.style.margin = '6px 0';
      rb.addEventListener('click', function () { act('adjust_config', 0, { reset: true }); });
      p.appendChild(rb);
    }
    var grid = el('div', 'flex gap-8');
    grid.style.flexWrap = 'wrap';
    var conf = { wolf: c.wolf || 2, seer: c.seer || 0, witch: c.witch || 0, hunter: c.hunter || 0, guard: c.guard || 0 };
    ['wolf', 'seer', 'witch', 'hunter', 'guard'].forEach(function (k) {
      var isNum = k === 'wolf';
      var d = el('div', 'chip');
      d.innerHTML = ROLE_ICON[k] + ' ' + roleName(k) + (isNum ? ' ×<b>' + conf[k] + '</b>' : '');
      d.addEventListener('click', function () {
        if (isNum) conf[k] = conf[k] >= 4 ? 1 : conf[k] + 1;
        else conf[k] = conf[k] ? 0 : 1;
        act('adjust_config', 0, { config: conf });
      });
      if ((isNum && conf[k]) || conf[k]) d.classList.add('active');
      grid.appendChild(d);
    });
    p.appendChild(grid);
    var v = el('p', 'muted tiny', '👨‍🌾 ' + roleName('villager') + ' × ' + (c.villager || 0));
    p.appendChild(v);
    return p;
  }

  // ---------- 角色卡(3D 翻转) ----------
  function roleCard(role, small) {
    var d = el('div', 'ww-card');
    if (small) { d.style.maxWidth = '200px'; }
    d.innerHTML =
      '<div class="ww-card-inner">' +
      '<div class="ww-card-face ww-card-back"><div class="pat">🐺</div>' +
      '<div class="muted tiny">' + t('ww_tap_flip') + '</div></div>' +
      '<div class="ww-card-face ww-card-front ' + roleClass(role) + '">' +
      '<div class="ico">' + ROLE_ICON[role] + '</div>' +
      '<div class="rname">' + esc(roleName(role)) + '</div>' +
      '<div class="camp" style="color:' + (role === 'wolf' ? '#ff2e63' : '#2ee6a6') + ';border-color:currentColor">' +
      esc(t(role === 'wolf' ? 'ww_camp_wolf' : 'ww_camp_village')) + '</div>' +
      '<div class="desc">' + esc(t('ww_role_desc_' + role)) + '</div>' +
      '</div></div>';
    if (flipped) d.classList.add('flipped');
    d.addEventListener('click', function () { flipped = true; d.classList.add('flipped'); });
    return d;
  }

  // ---------- dealing ----------
  function renderDealing() {
    // 法官:无身份牌,只主持
    if (S.me.is_judge) {
      var jh = el('div', 'ww-banner');
      jh.innerHTML = '<div class="ph">' + t('ww_judge') + '</div><div class="sub">' + t('ww_judge_hint') + '</div>';
      main.appendChild(jh);
    } else if (S.me.role) {
      var h = el('h4', '', '🃏 ' + t('ww_your_role'));
      h.style.textAlign = 'center';
      main.appendChild(h);
      main.appendChild(roleCard(S.me.role));
    }
    // 主持人:全场身份
    if (S.all_roles && S.me.is_host) {
      var p = el('div', 'panel');
      p.style.marginTop = '8px';
      p.innerHTML = '<h4>👁 ' + t('ww_all_roles') + '</h4>';
      p.appendChild(seatGrid({ showRole: true }));
      main.appendChild(p);
    }
  }

  // ---------- 警长竞选 ----------
  function renderPoliceRun() {
    var p = el('div', 'panel');
    var runCnt = 0;
    S.players.forEach(function (x) { if (x.run) runCnt++; });
    p.innerHTML = '<h4>👮 ' + t('ww_phase_police_run') + ' <span class="muted tiny">' + runCnt + '</span></h4>';
    p.appendChild(seatGrid({ runTag: true }));
    if (S.me.alive && !S.players.find(function (x) { return x.id === S.me.id && x.run; })) {
      var b = el('button', 'btn btn-primary btn-block', '🚩 ' + t('ww_police_run_btn'));
      b.style.marginTop = '12px';
      b.addEventListener('click', function () { act('police_run'); });
      p.appendChild(b);
    } else if (S.me.alive) {
      var d = el('p', 'muted tiny', '🚩 ' + t('ww_police_run_done'));
      d.style.textAlign = 'center';
      p.appendChild(d);
    }
    main.appendChild(p);
  }
  function renderPoliceVote() {
    var cands = (S.votes.cands || []).map(Number);
    var p = el('div', 'panel');
    p.innerHTML = '<h4>🗳 ' + t('ww_phase_' + S.room.phase) +
      ' <span class="muted tiny">' + S.votes.progress + '/' + S.votes.total + '</span></h4>';
    var voters = S.players.filter(function (x) { return x.alive && !x.is_judge && cands.indexOf(x.id) < 0; });
    var meIn = S.me.alive && !S.me.is_judge && cands.indexOf(S.me.id) < 0;
    // 投票目标 = 本轮候选人(而非投票人列表)
    var candPlayers = S.players.filter(function (x) { return x.alive && cands.indexOf(x.id) >= 0; });
    if (meIn) {
      p.appendChild(el('p', 'muted tiny', '✓ ' + t('ww_voted') + (S.votes.my ? ' · ' + pidName(S.votes.my) : ' · ' + t('ww_vote_abstain'))));
      p.appendChild(el('p', 'muted tiny', t('ww_can_change')));
      p.appendChild(pickGrid(candPlayers, 'vote', t('ww_confirm'), function (v) { act('police_vote', v); }, { abstain: true }));
    } else {
      p.appendChild(el('p', 'muted tiny', '⏳ ' + t('ww_voted')));
      // PK 候选可退选
      if (S.room.phase === 'police_pk') {
        var q = el('button', 'btn btn-ghost btn-sm', '🚪 ' + fmt('ww_evt_police_quit', { actor: S.me.name }));
        q.addEventListener('click', function () { act('police_quit'); });
        p.appendChild(q);
      }
    }
    main.appendChild(p);
  }

  // ---------- 夜晚 ----------
  function renderNight() {
    var ph = S.room.phase;
    var p = el('div', 'panel');
    p.innerHTML = '<h4>🌙 ' + t('ww_phase_' + ph) + '</h4>';
    var others = S.players.filter(function (x) { return x.alive && !x.is_judge && x.id !== S.me.id; });

    if (S.me.night_done && S.me.can === ph) {
      var done = el('div', 'ww-banner');
      done.style.padding = '8px 14px';
      done.innerHTML = '<div class="sub">✓ ' + t('ww_voted') + ' · ' + t('ww_can_change') + '</div>';
      p.appendChild(done);
    }
    if (S.me.can === ph) {
      if (ph === 'night_guard') {
        var lg = lastGuardBlocked();
        p.appendChild(el('p', 'muted tiny', t('ww_guard_pick')));
        var list = others.filter(function (x) { return x.id !== lg; });
        if (lg) p.appendChild(el('p', 'muted tiny', '⛔ ' + pidName(lg)));
        p.appendChild(pickGrid(list, 'night', t('ww_confirm'), function (v) { act('night_act', v); }));
        p.appendChild(skipBtn(t('ww_guard_skip')));
      } else if (ph === 'night_wolf') {
        p.appendChild(el('p', 'muted tiny', t('ww_wolf_pick')));
        p.appendChild(pickGrid(others, 'night', t('ww_confirm'), function (v) { act('night_act', v); }));
        p.appendChild(skipBtn(t('ww_wolf_skip')));
      } else if (ph === 'night_witch') {
        var kill = S.me.night_kill;
        var pot = S.me.potions || {};
        if (kill) p.appendChild(el('p', '', '🔪 ' + fmt('ww_witch_kill_is', { name: pidName(kill) })));
        else p.appendChild(el('p', 'muted tiny', '☁️ ' + t('ww_night_no_death')));
        var bar = el('div', 'flex gap-8');
        bar.style.marginTop = '10px';
        if (kill && pot.heal && kill !== S.me.id) {
          var hb = el('button', 'btn btn-primary', '💊 ' + fmt('ww_witch_heal', { name: pidName(kill) }));
          hb.addEventListener('click', function () { act('night_act', 0, { act: 'heal' }); });
          bar.appendChild(hb);
        } else if (!pot.heal) {
          bar.appendChild(el('span', 'chip', '💊 ' + t('ww_witch_no_heal')));
        }
        if (pot.poison) {
          sel.witchAct = sel.witchAct || '';
          var pb = el('button', 'btn btn-danger', '☠️ ' + t('ww_witch_poison'));
          pb.addEventListener('click', function () { sel.witchAct = sel.witchAct === 'poison' ? '' : 'poison'; render(); });
          bar.appendChild(pb);
        } else {
          bar.appendChild(el('span', 'chip', '☠️ ' + t('ww_witch_no_poison')));
        }
        var sb = el('button', 'btn btn-ghost', t('ww_witch_skip'));
        sb.addEventListener('click', function () { act('night_act', 0, { act: 'skip' }); });
        bar.appendChild(sb);
        p.appendChild(bar);
        if (sel.witchAct === 'poison') {
          p.appendChild(el('p', 'muted tiny', '☠️ ' + t('ww_witch_poison')));
          p.appendChild(pickGrid(others, 'night', t('ww_confirm'), function (v) { act('night_act', v, { act: 'poison' }); }));
        }
      } else if (ph === 'night_seer') {
        p.appendChild(el('p', 'muted tiny', t('ww_seer_pick')));
        p.appendChild(pickGrid(others, 'night', t('ww_confirm'), function (v) { act('night_act', v); }));
        // 查验记录
        var res = S.me.seer_results || [];
        if (res.length) {
          p.appendChild(el('p', 'muted tiny', '📜 ' + t('ww_seer_history')));
          res.forEach(function (r2) {
            p.appendChild(el('div', 'muted tiny',
              '· ' + pidName(r2[0]) + ' → ' + (r2[1]
                ? '<b style="color:#ff2e63">🐺 ' + fmt('ww_seer_result_wolf', { name: '' }).trim() + '</b>'
                : '<b style="color:#2ee6a6">😇 ' + fmt('ww_seer_result_good', { name: '' }).trim() + '</b>')));
          });
        }
      }
    } else if (S.me.is_judge) {
      p.appendChild(el('p', 'muted', '⚖️ ' + t('ww_judge_hint')));
    } else if (S.me.alive) {
      p.appendChild(el('p', 'muted', '😴 ' + t('ww_evt_night')));
      if (S.me.role) p.appendChild(roleCard(S.me.role, true));
    } else {
      p.appendChild(el('p', 'muted', '👻 ' + t('ww_voted')));
    }
    // 主持人在夜晚也可见全场身份
    if (S.me.is_host && S.all_roles && S.me.can !== ph) {
      p.appendChild(seatGrid({ showRole: true }));
    }
    main.appendChild(p);
  }
  function skipBtn(label) {
    var b = el('button', 'btn btn-ghost btn-sm', label);
    b.style.marginTop = '10px';
    b.addEventListener('click', function () { act('night_act', 0); });
    return b;
  }
  // 死亡技能放弃按钮(猎人不开枪/撕警徽):提交对应 action + target=0
  function passBtn(label, action) {
    var b = el('button', 'btn btn-ghost btn-sm', label);
    b.style.marginTop = '10px';
    b.addEventListener('click', function () { act(action, 0); });
    return b;
  }
  function lastGuardBlocked() {
    // 服务端不暴露 last_guard(防信息泄露),前端仅禁用"必选"——由后端校验兜底
    return 0;
  }

  // ---------- dawn / 白天 ----------
  function renderDawn() {
    var p = el('div', 'panel');
    var evs = S.events.filter(function (e) { return e.type === 'dawn'; });
    var last = evs[evs.length - 1];
    var deaths = (last && last.data && last.data.deaths) || [];
    p.innerHTML = '<h4>🌅 ' + t('ww_phase_dawn') + '</h4>';
    if (!deaths.length) {
      p.appendChild(el('p', '', '🕊 ' + t('ww_night_no_death')));
    } else {
      p.appendChild(el('p', '', '⚰️ ' + t('ww_deaths') + ': ' + deaths.map(pidName).join(' · ')));
    }
    p.appendChild(seatGrid({}));
    main.appendChild(p);
  }
  function renderDayTalk() {
    var p = el('div', 'panel');
    p.innerHTML = '<h4>💬 ' + t('ww_phase_day_talk') + '</h4>';
    p.appendChild(el('p', 'muted tiny', S.me.is_host ? t('ww_set_timer') : '💬'));
    p.appendChild(explodeBtn());
    p.appendChild(seatGrid({ showRole: S.me.is_host && !!S.all_roles }));
    main.appendChild(p);
  }
  // 狼人自爆按钮(白天阶段)
  function explodeBtn() {
    var w = el('div', '');
    if (!S.me.can_explode) return w;
    var b = el('button', 'btn btn-danger btn-block', t('ww_explode_btn'));
    b.style.marginTop = '10px';
    b.addEventListener('click', function () {
      if (confirm(t('ww_explode_confirm'))) act('wolf_explode');
    });
    w.appendChild(b);
    return w;
  }

  // ---------- 放逐投票 ----------
  function renderVote() {
    var cands = (S.votes.cands || []).map(Number);
    var p = el('div', 'panel');
    p.innerHTML = '<h4>🗳 ' + t('ww_phase_' + S.room.phase) +
      ' <span class="muted tiny">' + S.votes.progress + '/' + S.votes.total + '</span></h4>';
    var targets = S.players.filter(function (x) {
      return x.alive && (!cands.length || cands.indexOf(x.id) >= 0);
    });
    if (S.me.alive && (!cands.length || cands.indexOf(S.me.id) < 0)) {
      p.appendChild(el('p', 'muted tiny', t('ww_vote_target') + (S.votes.my ? ' · ✓ ' + pidName(S.votes.my) : '')));
      p.appendChild(pickGrid(targets.filter(function (x) { return x.id !== S.me.id; }), 'vote',
        t('ww_confirm'), function (v) { act('day_vote', v); }, { abstain: true }));
      p.appendChild(el('p', 'muted tiny', t('ww_can_change')));
    } else {
      p.appendChild(el('p', 'muted', '⏳ ' + t('ww_voted')));
    }
    p.appendChild(explodeBtn());
    p.appendChild(seatGrid({}));
    main.appendChild(p);
  }
  function renderExile() {
    var p = el('div', 'panel');
    var evs = S.events.filter(function (e) { return e.type === 'exile'; });
    var last = evs[evs.length - 1];
    p.innerHTML = '<h4>⚖️ ' + t('ww_phase_exile') + '</h4>';
    if (last) p.appendChild(el('p', '', '⚰️ ' + fmt('ww_evt_exile', { target: pidName(last.target) })));
    // 票型
    var vr = S.events.filter(function (e) { return e.type === 'vote_result'; }).pop();
    if (vr) p.appendChild(voteBars(vr));
    p.appendChild(seatGrid({}));
    main.appendChild(p);
  }
  function voteBars(vr) {
    var w = el('div', '');
    w.style.marginTop = '10px';
    var counts = vr.data.counts || {};
    var detail = vr.data.detail || {};
    var max = 1;
    Object.keys(counts).forEach(function (k) { max = Math.max(max, counts[k]); });
    w.appendChild(el('div', 'muted tiny', '📊 ' + t('ww_vote_counts')));
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      var row = el('div', 'ww-votes-bar');
      row.innerHTML = '<span style="min-width:64px" class="tiny">' + pidName(+k) + '</span>' +
        '<div class="bar" style="width:' + Math.round(counts[k] / max * 140) + 'px"></div>' +
        '<b class="tiny">' + counts[k] + '</b>';
      w.appendChild(row);
    });
    return w;
  }

  // ---------- 死亡技能(猎人/警徽) ----------
  function renderNeeds() {
    if (!S.me.needs) return;
    var p = el('div', 'panel');
    p.style.borderColor = 'rgba(255,46,99,.5)';
    var others = S.players.filter(function (x) { return x.alive && !x.is_judge; });
    if (S.me.needs === 'hunter_shoot') {
      p.innerHTML = '<h4>🏹 ' + t('ww_hunter_pick') + '</h4>';
      p.appendChild(pickGrid(others, 'night', '🏹', function (v) { act('hunter_shoot', v); }));
      p.appendChild(passBtn(t('ww_hunter_pass'), 'hunter_shoot'));
    } else if (S.me.needs === 'badge_pass') {
      p.innerHTML = '<h4>👮 ' + t('ww_badge_pick') + '</h4>';
      p.appendChild(pickGrid(others, 'night', '👑', function (v) { act('badge_pass', v); }));
      p.appendChild(passBtn(t('ww_badge_tear'), 'badge_pass'));
    }
    main.appendChild(p);
  }

  // ---------- game_over ----------
  function renderOver() {
    var w = S.room.winner;
    var p = el('div', 'panel');
    p.style.textAlign = 'center';
    p.innerHTML = '<h2 style="font-family:var(--ff-title);font-size:28px;' +
      'color:' + (w === 'wolf' ? '#ff2e63' : '#2ee6a6') + '">' +
      (w === 'wolf' ? '🐺 ' + t('ww_winner_wolf') : '😇 ' + t('ww_winner_village')) + '</h2>';
    main.appendChild(p);
    var p2 = el('div', 'panel');
    p2.innerHTML = '<h4>🃏 ' + t('ww_all_roles') + '</h4>';
    p2.appendChild(seatGrid({ showRole: true }));
    main.appendChild(p2);
    if (S.me.is_host) {
      var b = el('button', 'btn btn-primary btn-block', '🔄 ' + t('ww_restart'));
      b.addEventListener('click', function () { act('restart'); });
      main.appendChild(b);
    }
  }

  // ---------- 事件时间线 ----------
  var EVT_KEY = {
    deal: 'ww_evt_deal', night: 'ww_evt_night', dawn: 'ww_evt_dawn', day: 'ww_evt_day',
    death: 'ww_evt_death', exile: 'ww_evt_exile', shoot: 'ww_evt_shoot', shoot_pass: 'ww_evt_shoot_pass',
    police: 'ww_evt_police', police_none: 'ww_evt_police_none', police_start: 'ww_evt_police_start',
    police_run: 'ww_evt_police_run', police_quit: 'ww_evt_police_quit',
    badge: 'ww_evt_badge', badge_tear: 'ww_evt_badge_tear',
    join: 'ww_evt_join', leave: 'ww_evt_leave', kick: 'ww_evt_kick', host: 'ww_evt_host',
    close: 'ww_evt_close', win: 'ww_evt_win', vote_start: 'ww_evt_vote_start', vote_none: 'ww_evt_vote_none',
    kill: 'ww_evt_kill', heal: 'ww_evt_heal', poison: 'ww_evt_poison', guard: 'ww_evt_guard',
    police_skip: 'ww_evt_police_skip',
    explode: 'ww_evt_explode',
  };
  function evtText(e) {
    if (e.type === 'check') {
      return fmt(e.data && e.data.is_wolf ? 'ww_evt_check_wolf' : 'ww_evt_check_good',
        { actor: pidName(e.actor), target: pidName(e.target) });
    }
    var k = EVT_KEY[e.type];
    if (!k) return e.type;
    return fmt(k, { actor: pidName(e.actor), target: pidName(e.target) });
  }
  function timeline() {
    var p = el('div', 'panel');
    p.style.marginTop = '16px';
    var opened = S.room.phase === 'game_over';
    p.innerHTML = '<h4>📜 ' + (opened ? t('ww_review') + ' <span class="muted tiny">(' + t('ww_review_secret') + ')</span>' : t('ww_review')) + '</h4>';
    var tl = el('div', 'ww-timeline');
    var lastDay = -1;
    var shown = S.events.filter(function (e) { return e.type !== 'police_result' && e.type !== 'vote_result'; });
    if (!shown.length) {
      tl.appendChild(el('div', 'muted tiny', '—'));
    }
    shown.forEach(function (e) {
      if (e.day !== lastDay && e.day > 0) {
        tl.appendChild(el('div', 'ww-tl-day', (e.phase.indexOf('night') === 0 ? '🌙 ' : '☀️ ') +
          fmt(e.phase.indexOf('night') === 0 ? 'ww_night' : 'ww_day', { n: e.day })));
        lastDay = e.day;
      }
      var item = el('div', 'ww-tl-item' + (e.secret ? ' secret' : ''), (e.secret ? '🔒 ' : '') + evtText(e));
      tl.appendChild(item);
    });
    p.appendChild(tl);
    return p;
  }

  // ---------- 复制房间号 ----------
  var copyBtn = document.getElementById('wwCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var txt = CODE;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { window.IanToast(t('ww_copied'), 'ok'); });
      else window.IanToast(txt, 'ok');
    });
  }

  // ---------- 启动 ----------
  loadIdent();
  if (!window.WW_EXISTS && !IDENT) { roomClosed(t('ww_room_closed')); }
  else if (IDENT) { startPoll(); }
  else { renderJoin(); }
})();
