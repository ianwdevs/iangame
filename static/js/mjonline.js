/* =====================================================================
   在线麻将房间页 — 轮询渲染(1.2s) + 操作上报
   与 werewolf.js 同架构: localStorage 身份, IanAPI 通信, 按阶段渲染
   ===================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('mjRoom');
  if (!root) return;
  var MODE = root.dataset.mode, CODE = root.dataset.code;
  var S = null;                    // 最新 state
  var me = null;                   // localStorage 身份
  var timer = 0, pollFast = false;
  var huan3Pick = [];              // 换三张已选
  var selTile = -1;                // 手牌选中
  var msgEl = document.getElementById('mjMsg');

  var NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HON = ['東', '南', '西', '北', '中', '發', '白'];
  var SNAME = ['万', '条', '筒'];
  var SCOLOR = ['#d33', '#2a8', '#26c', '#444'];

  function tName(id) {
    var s = (id / 10) | 0, r = id % 10;
    return s === 3 ? HON[r - 1] : NUM[r - 1] + SNAME[s];
  }
  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt !== undefined) d.textContent = txt;
    return d;
  }
  function tileEl(id, opts) {
    opts = opts || {};
    var s = (id / 10) | 0, r = id % 10;
    var d = el('div', 'mjt' + (opts.small ? ' mjt-sm' : '') + (opts.sel ? ' sel' : '') + (opts.dim ? ' dim' : ''));
    d.style.color = SCOLOR[s];
    if (s === 3) d.textContent = HON[r - 1];
    else d.innerHTML = '<i>' + NUM[r - 1] + '</i><b>' + SNAME[s] + '</b>';
    if (opts.click) d.addEventListener('click', function () { opts.click(id, d); });
    return d;
  }
  function backEl(n) {
    var d = el('div', 'mjt-back');
    d.appendChild(el('span', '', String(n)));
    return d;
  }
  function meldEl(m) {
    var wrap = el('div', 'mj-meld');
    var n = m.type === 'kong' ? 4 : 3;
    for (var k = 0; k < n; k++) {
      var tid = m.type === 'chow' ? m.tile + k : m.tile;
      wrap.appendChild(tileEl(tid, { small: true }));
    }
    return wrap;
  }
  function msg(t, isErr) {
    msgEl.className = 'form-msg ' + (isErr ? 'err' : 'ok');
    msgEl.textContent = t;
    setTimeout(function () { msgEl.textContent = ''; msgEl.className = 'form-msg'; }, 2600);
  }
  function act(action, extra) {
    if (!me) return;
    var body = { room: CODE, playerId: me.playerId, token: me.token, action: action };
    if (extra) body.extra = extra;
    window.IanAPI.post('/api/mj/action', body).then(function (r) {
      if (r && r.ok) { S = r; render(); }
      else msg((r && r.error) || '操作失败', true);
    });
  }

  /* ---------------- 轮询 ---------------- */
  function load() {
    if (!me) return;
    window.IanAPI.get('/api/mj/state?room=' + CODE + '&playerId=' + me.playerId + '&token=' + encodeURIComponent(me.token))
      .then(function (r) {
        if (r && r.ok === false) {
          if (r.error === '房间不存在') { location.href = '/mjonline/' + MODE; return; }
          msg(r.error || '', true);
          return;
        }
        S = r;
        render();
      });
  }
  function tick() {
    load();
    // 我需要行动时加速轮询(叫牌窗口/我的回合)
    var fast = S && S.phase !== 'over' && S.phase !== 'waiting';
    timer = setTimeout(tick, fast ? 1200 : 2500);
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!S) return;
    renderTop();
    renderOpps();
    renderTable();
    renderFeed();
    renderMe();
    renderActions();
  }

  function renderTop() {
    var meta = document.getElementById('mjMeta');
    var modeName = S.mode === 'sc' ? '四川·血战到底' : '标准';
    var ph = { waiting: '等待中', dingque: '定缺', huan3: '换三张', play: '对局中', call: '叫牌', over: '本局结束' }[S.phase] || S.phase;
    meta.textContent = modeName + ' · 第' + S.hand_no + '局 · ' + ph + ' · 牌墙 ' + S.wall;
    document.getElementById('mjCodeShow').textContent = S.room || CODE;
  }

  function renderOpps() {
    var box = document.getElementById('mjOpps');
    box.innerHTML = '';
    (S.players || []).forEach(function (p) {
      if (p.is_me) return;
      var card = el('div', 'mj-opp' + (S.turn === p.seat && S.phase !== 'over' ? ' active' : '') + (p.win ? ' won' : ''));
      var info = el('div', 'mj-opp-info');
      info.appendChild(el('span', 'mj-name', p.name + (p.is_bot ? ' 🤖' : '') + (p.online ? '' : ' ·离线')));
      if (p.que >= 0) info.appendChild(el('span', 'mj-que', '缺' + SNAME[p.que]));
      if (p.win) {
        var det = p.win_detail || { total: 0 };
        info.appendChild(el('span', 'mj-wintag', '胡' + det.total + '番'));
      } else if (p.out) info.appendChild(el('span', 'mj-wintag', '已胡过'));
      info.appendChild(el('span', 'mj-score', p.score + '分'));
      card.appendChild(info);
      // 手牌背面(张数) + 副露
      var row = el('div', 'mj-opp-row');
      row.appendChild(backEl(p.hand_count));
      var melds = el('div', 'mj-melds');
      (p.melds || []).forEach(function (m) { melds.appendChild(meldEl(m)); });
      row.appendChild(melds);
      card.appendChild(row);
      box.appendChild(card);
    });
  }

  function renderTable() {
    var box = document.getElementById('mjTable');
    box.innerHTML = '';
    (S.players || []).forEach(function (p) {
      var pool = el('div', 'mj-pool' + (p.is_me ? ' mine' : ''));
      (p.discards || []).forEach(function (tid, i) {
        var t = tileEl(tid, { small: true });
        if (S.last && S.last.seat === p.seat && i === p.discards.length - 1) t.classList.add('last');
        pool.appendChild(t);
      });
      if (p.is_me) pool.appendChild(el('div', 'mj-pool-tag', '我'));
      box.appendChild(pool);
    });
  }

  function renderFeed() {
    var box = document.getElementById('mjFeed');
    var lines = (S.events || []).filter(function (e) {
      return ['discard', 'pong', 'chow', 'gang', 'win', 'dingque', 'huan3done', 'handover', 'liuju', 'autodiscard', 'join', 'leave', 'bot', 'kick'].indexOf(e.type) >= 0;
    }).slice(-3);
    box.textContent = lines.map(function (e) { return e.t; }).join(' · ');
  }

  function renderMe() {
    document.getElementById('mjMeInfo').innerHTML = '';
    var info = document.getElementById('mjMeInfo');
    var meS = S.me;
    var tag = el('span', 'mj-name', '我');
    info.appendChild(tag);
    if (meS.que >= 0) info.appendChild(el('span', 'mj-que', '缺' + SNAME[meS.que]));
    if (meS.win) info.appendChild(el('span', 'mj-wintag', '胡' + ((meS.win_detail || {}).total || 0) + '番'));
    info.appendChild(el('span', 'mj-score', meS.score + '分'));
    if (S.phase !== 'waiting' && S.phase !== 'over' && S.deadline > 0) {
      var isMine = (S.phase === 'play' && S.my_options && (S.my_options.my_turn || S.my_options.self_win || S.my_options.gang_tiles)) ||
                   (S.phase === 'call' && S.my_options && S.my_options.call) || S.phase === 'dingque' || S.phase === 'huan3';
      if (isMine) info.appendChild(el('span', 'mj-timer' + (S.deadline <= 8 ? ' urgent' : ''), '⏱' + S.deadline + 's'));
    }
    var melds = document.getElementById('mjMyMelds');
    melds.innerHTML = '';
    (meS.melds || []).forEach(function (m) { melds.appendChild(meldEl(m)); });

    // 手牌
    var hand = document.getElementById('mjHand');
    hand.innerHTML = '';
    var canPlay = S.phase === 'play' && S.my_options && S.my_options.my_turn && !meS.out && !meS.win;
    var huan3Mode = S.phase === 'huan3' && S.my_options && S.my_options.huan3;
    (meS.hand || []).forEach(function (tid) {
      var dim = meS.que >= 0 && ((tid / 10) | 0) === meS.que;
      var h3 = huan3Mode && huan3Pick.indexOf(tid) >= 0;
      hand.appendChild(tileEl(tid, {
        dim: dim && !huan3Mode,
        sel: (canPlay && selTile === tid) || h3,
        click: function () {
          if (canPlay) {
            if (selTile === tid) { selTile = -1; act('discard', { tile: tid }); }
            else { selTile = tid; render(); }
          } else if (huan3Mode) {
            var ix = huan3Pick.indexOf(tid);
            if (ix >= 0) huan3Pick.splice(ix, 1);
            else if (huan3Pick.length < 3) huan3Pick.push(tid);
            else msg('最多选 3 张', true);
            render();
          }
        }
      }));
    });

    // 听牌提示: S.ting = {打出的牌: [听什么...]}
    var tingEl = document.getElementById('mjTing');
    tingEl.textContent = '';
    if (canPlay) {
      var tm = S.ting || {};
      var keys = Object.keys(tm);
      if (selTile >= 0 && tm[String(selTile)]) {
        tingEl.textContent = '打出「' + tName(selTile) + '」听: ' + tm[String(selTile)].map(tName).join(' / ');
      } else if (keys.length) {
        tingEl.textContent = '保听: ' + keys.slice(0, 6).map(function (k) { return tName(+k); }).join(' / ');
      }
    }
  }

  function btn(label, cls, fn) {
    var b = el('button', 'btn ' + (cls || 'btn-primary'));
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function renderActions() {
    var box = document.getElementById('mjActions');
    box.innerHTML = '';
    var o = S.my_options || {};
    var meS = S.me;

    if (S.phase === 'waiting') {
      if (meS.is_host) {
        box.appendChild(btn('🤖 加机器人', 'btn-ghost', function () { act('add_bot'); }));
        if (S.n_players >= 4) box.appendChild(btn('▶ 开始游戏', 'btn-primary', function () { act('start'); }));
      }
      box.appendChild(btn('🚪 ' + (meS.is_host ? '解散房间' : '离开'), 'btn-ghost', function () {
        if (confirm(meS.is_host ? '解散房间?所有玩家将被请出' : '离开房间?')) {
          act('leave');
          setTimeout(function () { location.href = '/mjonline/' + MODE; }, 400);
        }
      }));
      // 座位表
      var seats = el('div', 'mj-seats tiny muted');
      seats.textContent = '座位: ' + (S.players || []).map(function (p) {
        return p.name + (p.is_me ? '(我)' : '') + (p.is_bot ? '🤖' : '');
      }).join(' · ') + ' (' + S.n_players + '/4)';
      box.appendChild(seats);
      return;
    }

    if (o.dingque) {
      var hint = el('div', 'tiny muted');
      hint.textContent = '请选择定缺门(该花色必须全部打出)';
      box.appendChild(hint);
      [0, 1, 2].forEach(function (s) {
        var cnt = (S.me.hand || []).filter(function (x) { return ((x / 10) | 0) === s; }).length;
        box.appendChild(btn(SNAME[s] + ' × ' + cnt, s === 0 ? 'btn-primary' : 'btn-ghost', function () {
          act('dingque', { suit: s });
        }));
      });
      return;
    }
    if (S.phase === 'dingque') { box.appendChild(el('div', 'tiny muted', '等待其他玩家定缺…')); return; }

    if (o.huan3) {
      var hint2 = el('div', 'tiny muted');
      hint2.textContent = '换三张: 点手牌选 3 张同花色的牌换给对家 (已选 ' + huan3Pick.length + '/3)';
      box.appendChild(hint2);
      var okBtn = btn('🔄 换牌', 'btn-primary', function () {
        var suits = {};
        huan3Pick.forEach(function (x) { suits[(x / 10) | 0] = 1; });
        if (huan3Pick.length !== 3 || Object.keys(suits).length !== 1) { msg('需选 3 张同花色', true); return; }
        act('huan3', { tiles: huan3Pick });
      });
      box.appendChild(okBtn);
      return;
    }
    if (S.phase === 'huan3') { box.appendChild(el('div', 'tiny muted', '等待其他玩家换三张…')); return; }

    if (o.call) {
      if (o.call.win) box.appendChild(btn('🎉 胡!', 'btn-primary', function () { act('win'); }));
      if (o.call.kong) box.appendChild(btn('杠', 'btn-primary', function () { act('kong'); }));
      if (o.call.pong) box.appendChild(btn('碰', 'btn-primary', function () { act('pong'); }));
      if (o.call.chow) box.appendChild(btn('吃', 'btn-primary', function () { act('chow'); }));
      box.appendChild(btn('过', 'btn-ghost', function () { act('pass'); }));
      return;
    }
    if (o.call_wait) { box.appendChild(el('div', 'tiny muted', '已表态,等待其他玩家…')); return; }

    if (o.self_win) box.appendChild(btn('🎉 自摸!', 'btn-primary', function () { act('self_win'); }));
    if (o.gang_tiles && o.gang_tiles.length) {
      (o.gang_tiles).forEach(function (tid) {
        box.appendChild(btn('杠 ' + tName(tid), 'btn-ghost', function () {
          act('an_gang', { tile: tid });
        }));
      });
    }
    if (o.my_turn) {
      var t = el('div', 'tiny muted');
      t.textContent = '轮到你: 点牌一次选中,再点打出';
      box.appendChild(t);
    }

    if (S.phase === 'over') {
      var res = el('div', 'mj-result');
      var title = el('div', 'mj-result-title', (S.players || []).some(function (p) { return p.win; }) ? '本局结算' : '流局');
      res.appendChild(title);
      (S.players || []).forEach(function (p) {
        var row = el('div', 'mj-result-row' + (p.win ? ' won' : ''));
        var det = p.win_detail;
        var txt = p.name + ': ';
        if (p.win && det) {
          txt += det.list.map(function (f) { return f[0] + f[1]; }).join('+') + '=' + det.total + '番 +' + det.points + '分';
        } else {
          txt += p.win ? '胡' : (p.out ? '已胡过' : '未胡');
        }
        txt += ' · 累计' + p.score + '分';
        row.textContent = txt;
        res.appendChild(row);
      });
      box.appendChild(res);
      if (o.next_hand) box.appendChild(btn('▶ 下一局', 'btn-primary', function () { act('next_hand'); }));
      box.appendChild(btn('🚪 离开', 'btn-ghost', function () {
        act('leave');
        setTimeout(function () { location.href = '/mjonline/' + MODE; }, 400);
      }));
      return;
    }
  }

  /* ---------------- 启动 ---------------- */
  try { me = JSON.parse(localStorage.getItem('ian:mj:' + CODE) || 'null'); } catch (e) { me = null; }
  if (!me) {
    // 无身份: 回大厅(带房间号), 由大厅 join 后回来
    location.href = '/mjonline/' + MODE + '?join=' + CODE;
    return;
  }
  if (root.dataset.exists === '0') {
    // 可能是解散后的旧链接: 试着拉一次状态, 失败再回大厅
  }
  load();
  tick();
})();
