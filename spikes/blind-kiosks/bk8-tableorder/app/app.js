(function () {
  'use strict';

  var D = window.KIOSK_DATA;
  var TABLE = D.tableNo;
  var S = { lang: 'ko', screen: 'attract', cat: 'meat', cart: [], orders: [], ageOk: false };

  var layer = document.getElementById('layer');
  var toastEl = document.getElementById('toast');
  var stack = [];
  var toastTimer = null;

  /* ---------- helpers ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.append(c.nodeType ? c : String(c));
  }
  function T(key) {
    var v = D.text[S.lang][key];
    if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v;
  }
  function L(obj) { return obj[S.lang] || obj.ko; }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function item(id) { return D.items.filter(function (i) { return i.id === id; })[0]; }
  function opt(gid, oid) { return D.groups[gid].options.filter(function (o) { return o.id === oid; })[0]; }

  function unitPrice(it, opts) {
    var p = it.price;
    it.groups.forEach(function (gid) {
      (opts[gid] || []).forEach(function (oid) { p += opt(gid, oid).price; });
    });
    return p;
  }
  function optText(it, opts) {
    var parts = [];
    it.groups.forEach(function (gid) {
      (opts[gid] || []).forEach(function (oid) { parts.push(L(opt(gid, oid).name)); });
    });
    return parts.join(' / ');
  }
  function cartTotal() { return S.cart.reduce(function (a, l) { return a + unitPrice(item(l.id), l.opts) * l.qty; }, 0); }
  function tableTotal() { return S.orders.reduce(function (a, o) { return a + o.amount; }, 0); }
  function cartMeat() { return S.cart.reduce(function (a, l) { return a + (item(l.id).meat ? l.qty : 0); }, 0); }
  function meatSent() {
    return S.orders.some(function (o) { return o.lines.some(function (l) { return item(l.id).meat; }); });
  }
  function qtyLabel(it, q) { return it.meat ? T('portions', q) : String(q); }

  /* ---------- overlays ---------- */
  function push(box) {
    var ov = h('div', { class: 'overlay' }, box);
    layer.append(ov);
    stack.push(ov);
  }
  function closeTop() { var ov = stack.pop(); if (ov) ov.remove(); }
  function closeAll() { while (stack.length) closeTop(); }

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 2200);
  }

  function dialog(o) {
    var box = h('div', { class: 'modal m-dlg', role: 'dialog' },
      o.icon ? h('div', { class: 'dlg-ic ' + (o.iconClass || '') }, o.icon) : null,
      o.title ? h('h3', null, o.title) : null,
      o.msg.map(function (m, i) { return h('p', { class: i === 0 ? 'lead' : 'sub' }, m); }),
      h('div', { class: 'dlg-btns' }, o.buttons.map(function (b) {
        return h('button', { type: 'button', class: 'btn ' + (b.primary ? 'primary' : 'ghost'), onclick: b.onClick }, b.label);
      }))
    );
    push(box);
  }
  function notice(msg) {
    dialog({ icon: '!', iconClass: 'warn', title: T('noticeTitle'), msg: [msg],
      buttons: [{ label: T('ok'), primary: true, onClick: closeTop }] });
  }

  /* ---------- screens ---------- */
  function go(screen) {
    S.screen = screen;
    ['attract', 'menu', 'sent'].forEach(function (id) {
      document.getElementById(id).classList.toggle('hidden', id !== screen);
    });
    if (screen === 'attract') renderAttract();
    if (screen === 'menu') renderMenu();
    if (screen === 'sent') renderSent();
  }

  function langButton(stop) {
    return h('button', { type: 'button', class: 'hbtn lang', onclick: function (e) { if (stop) e.stopPropagation(); openLang(); } },
      h('span', { class: 'ic' }, '🌐'), T('langName'));
  }
  function callButton(stop) {
    return h('button', { type: 'button', class: 'hbtn call', onclick: function (e) { if (stop) e.stopPropagation(); openStaff(); } },
      h('span', { class: 'ic' }, '🔔'), T('staffCall'));
  }

  function renderAttract() {
    var el = document.getElementById('attract');
    el.innerHTML = '';
    el.onclick = function () { go('menu'); };
    append(el, [
      h('div', { class: 'at-top' },
        h('div', { class: 'tbl-chip' }, T('table', TABLE)),
        h('div', { class: 'at-actions' }, callButton(true), langButton(true))),
      h('div', { class: 'at-hero' },
        h('div', { class: 'logo big' }, h('span', { class: 'flame' }), h('span', { class: 'moon' })),
        h('div', { class: 'at-brand' }, T('brand')),
        h('div', { class: 'at-sub' }, T('brandSub')),
        h('div', { class: 'at-plates' }, ['🥓', '🍜', '🍲', '🍶', '🍧'].map(function (e) { return h('div', { class: 'plate' }, e); }))),
      h('div', { class: 'at-touch' }, T('touchStart')),
      h('div', { class: 'at-start' }, T('startBtn'), h('span', { class: 'arr' }, '›')),
      h('div', { class: 'at-note' }, T('payNote'))
    ]);
  }

  function renderMenu() {
    var el = document.getElementById('menu');
    el.innerHTML = '';
    var cat = D.categories.filter(function (c) { return c.id === S.cat; })[0];
    var list = D.items.filter(function (i) { return i.cat === S.cat; });
    append(el, [
      h('header', { class: 'hd' },
        h('div', { class: 'hd-brand' },
          h('div', { class: 'logo' }, h('span', { class: 'flame' }), h('span', { class: 'moon' })),
          h('div', { class: 'hd-name' }, T('brand'), h('small', null, T('brandSub')))),
        h('div', { class: 'hd-table' }, T('table', TABLE)),
        h('div', { class: 'hd-sp' }),
        h('button', { type: 'button', class: 'hbtn hist', onclick: openHistory },
          h('span', { class: 'ic' }, '🧾'), T('history'), h('b', { class: 'hd-total' }, won(tableTotal()))),
        callButton(false),
        langButton(false)),
      h('div', { class: 'body' },
        h('nav', { class: 'cats' }, D.categories.map(function (c) {
          var n = D.items.filter(function (i) { return i.cat === c.id; }).length;
          return h('div', { class: 'cat' + (c.id === S.cat ? ' on' : ''), onclick: function () { S.cat = c.id; renderMenu(); } },
            L(c.name), h('span', { class: 'cat-n' }, n));
        })),
        h('main', { class: 'grid-wrap' },
          h('div', { class: 'grid-title' }, L(cat.name)),
          h('div', { class: 'grid' }, list.map(card))),
        h('aside', { class: 'cart', id: 'cart' }))
    ]);
    renderCart();
  }

  function card(it) {
    return h('div', { class: 'card' + (it.soldOut ? ' so' : ''), onclick: function () { tapItem(it); } },
      h('div', { class: 'thumb t-' + it.cat },
        h('span', { class: 'emo' }, it.icon),
        it.best ? h('i', { class: 'best' }, 'BEST') : null,
        it.alcohol ? h('i', { class: 'age19' }, '19') : null,
        it.soldOut ? h('div', { class: 'so-cover' }, T('soldOut')) : null),
      h('div', { class: 'nm' }, L(it.name), it.meat ? h('small', null, it.weight) : null),
      h('div', { class: 'pr' }, won(it.price), it.meat ? h('span', null, '/' + T('perPortion')) : null));
  }

  function renderCart() {
    var el = document.getElementById('cart');
    if (!el) return;
    el.innerHTML = '';
    var count = S.cart.reduce(function (a, l) { return a + l.qty; }, 0);
    append(el, [
      h('div', { class: 'c-head' },
        h('div', { class: 'c-ttl' }, T('cartTitle'), h('span', { class: 'cnt' }, count)),
        S.cart.length ? h('div', { class: 'c-clear', onclick: confirmClear }, T('clearAll')) : null),
      h('div', { class: 'c-lines' }, S.cart.length ? S.cart.map(lineRow)
        : h('div', { class: 'c-empty' }, h('div', { class: 'tray' }), T('cartEmpty'))),
      h('div', { class: 'c-foot' },
        h('div', { class: 'c-sum' }, h('span', null, T('cartTotal')), h('strong', null, won(cartTotal()))),
        h('button', { type: 'button', class: 'btn order', onclick: tryOrder }, T('orderBtn')),
        h('p', { class: 'c-note' }, T('payNote')))
    ]);
  }

  function lineRow(l) {
    var it = item(l.id);
    var ot = optText(it, l.opts);
    return h('div', { class: 'c-line' },
      h('div', { class: 'cl-top' },
        h('div', { class: 'cl-nm' }, L(it.name)),
        h('div', { class: 'cl-x', onclick: function () { S.cart.splice(S.cart.indexOf(l), 1); renderCart(); } }, '✕')),
      ot ? h('div', { class: 'cl-opt' }, ot) : null,
      h('div', { class: 'cl-bot' },
        h('div', { class: 'stepper sm' },
          h('button', { type: 'button', class: 'st-btn', disabled: l.qty <= 1, onclick: function () { if (l.qty > 1) { l.qty--; renderCart(); } } }, '−'),
          h('span', { class: 'st-v' }, qtyLabel(it, l.qty)),
          h('button', { type: 'button', class: 'st-btn', onclick: function () { if (l.qty < 99) { l.qty++; renderCart(); } } }, '+')),
        h('div', { class: 'cl-pr' }, won(unitPrice(it, l.opts) * l.qty))));
  }

  function renderSent() {
    var el = document.getElementById('sent');
    el.innerHTML = '';
    var o = S.orders[S.orders.length - 1];
    append(el, h('div', { class: 'sent-card' },
      h('div', { class: 'ok-ic' }, h('span')),
      h('h1', null, T('sentTitle')),
      h('div', { class: 's-no' }, T('table', TABLE) + ' · ' + T('orderNo', o.no)),
      h('div', { class: 's-amt' },
        h('div', { class: 's-row' }, h('span', null, T('thisOrder')), h('b', null, won(o.amount))),
        h('div', { class: 's-row big' }, h('span', null, T('tableTotal')), h('b', null, won(tableTotal())))),
      h('p', { class: 's-note' }, T('sentNote')),
      h('div', { class: 's-pay' }, T('payNote')),
      h('div', { class: 's-btns' },
        h('button', { type: 'button', class: 'btn ghost', onclick: openHistory }, T('viewHistory')),
        h('button', { type: 'button', class: 'btn primary', onclick: function () { go('menu'); } }, T('moreOrder')))));
  }

  /* ---------- ordering ---------- */
  function tapItem(it) {
    if (it.soldOut) { toast(T('soldOutMsg'), 'err'); return; }
    if (it.meat || it.groups.length) { openItem(it); return; }
    if (it.alcohol && !S.ageOk) { openAge(it); return; }
    addLine(it, {}, 1);
    toast(T('added', L(it.name)));
  }

  function addLine(it, sel, qty) {
    var opts = {};
    it.groups.forEach(function (gid) {
      var chosen = sel[gid] || [];
      opts[gid] = D.groups[gid].options.map(function (o) { return o.id; })
        .filter(function (id) { return chosen.indexOf(id) >= 0; });
    });
    var key = it.id + '|' + it.groups.map(function (g) { return g + ':' + opts[g].join(','); }).join('|');
    var ex = S.cart.filter(function (l) { return l.key === key; })[0];
    if (ex) ex.qty = Math.min(99, ex.qty + qty);
    else S.cart.push({ key: key, id: it.id, opts: opts, qty: qty });
    renderCart();
  }

  function openAge(it) {
    dialog({
      icon: '19', iconClass: 'age', title: T('ageTitle'), msg: [T('ageQ'), T('ageNote')],
      buttons: [
        { label: T('no'), onClick: function () { closeTop(); notice(T('ageDenied')); } },
        { label: T('yes'), primary: true, onClick: function () {
          S.ageOk = true; closeTop(); addLine(it, {}, 1); toast(T('added', L(it.name)));
        } }
      ]
    });
  }

  function openItem(it) {
    var st = { sel: {}, qty: 1, err: '' };
    it.groups.forEach(function (g) { st.sel[g] = []; });
    var box = h('div', { class: 'modal m-item' });

    function pick(gid, oid) {
      var g = D.groups[gid], cur = st.sel[gid], i = cur.indexOf(oid);
      st.err = '';
      if (g.type === 'single') st.sel[gid] = [oid];
      else if (i >= 0) cur.splice(i, 1);
      else if (cur.length >= g.max) st.err = T('errMax', g.max);
      else cur.push(oid);
      draw();
    }

    function group(gid) {
      var g = D.groups[gid];
      return h('div', { class: 'grp' },
        h('div', { class: 'grp-t' }, L(g.title),
          h('span', { class: 'tag ' + (g.required ? 'req' : 'optl') }, g.required ? T('required') : T('optional')),
          g.max > 1 ? h('span', { class: 'tag lim' }, T('maxN', g.max)) : null),
        h('div', { class: 'opts' }, g.options.map(function (o) {
          var on = st.sel[gid].indexOf(o.id) >= 0;
          return h('div', { class: 'opt ' + (g.type === 'multi' ? 'chk' : 'rad') + (on ? ' on' : ''), onclick: function () { pick(gid, o.id); } },
            h('i', { class: 'mk' }),
            h('span', { class: 'o-l' }, L(o.name)),
            o.price ? h('span', { class: 'o-p' }, '+' + won(o.price)) : null);
        })));
    }

    function submit() {
      for (var i = 0; i < it.groups.length; i++) {
        var g = D.groups[it.groups[i]];
        if (g.required && st.sel[it.groups[i]].length < g.min) { st.err = T('errRequired', L(g.title)); draw(); return; }
      }
      if (it.meat && !meatSent() && cartMeat() + st.qty < 2) { st.err = T('errMeatMin'); draw(); return; }
      addLine(it, st.sel, st.qty);
      closeTop();
      toast(T('added', L(it.name)));
    }

    function draw() {
      box.innerHTML = '';
      var unit = unitPrice(it, st.sel);
      append(box, [
        h('div', { class: 'mi-head' },
          h('div', { class: 'thumb t-' + it.cat }, h('span', { class: 'emo' }, it.icon)),
          h('div', { class: 'mi-ttl' },
            h('h2', null, L(it.name)),
            it.meat ? h('p', null, T('perPortion') + ' ' + it.weight) : null,
            h('div', { class: 'mi-pr' }, won(it.price), it.meat ? h('span', null, '/' + T('perPortion')) : null)),
          h('div', { class: 'x', onclick: closeTop }, '✕')),
        h('div', { class: 'mi-body' },
          it.groups.map(group),
          h('div', { class: 'qty-row' },
            h('span', { class: 'q-l' }, it.meat ? T('portionLabel') : T('qty')),
            h('div', { class: 'stepper' },
              h('button', { type: 'button', class: 'st-btn', disabled: st.qty <= 1, onclick: function () { if (st.qty > 1) st.qty--; st.err = ''; draw(); } }, '−'),
              h('span', { class: 'st-v' }, qtyLabel(it, st.qty)),
              h('button', { type: 'button', class: 'st-btn', onclick: function () { if (st.qty < 99) st.qty++; st.err = ''; draw(); } }, '+'))),
          it.meat ? h('p', { class: 'hint' }, T('meatHint')) : null),
        h('div', { class: 'err', role: 'alert' }, st.err),
        h('div', { class: 'mi-foot' },
          h('button', { type: 'button', class: 'btn ghost', onclick: closeTop }, T('cancel')),
          h('button', { type: 'button', class: 'btn primary', onclick: submit }, T('addToOrder'), h('b', null, won(unit * st.qty))))
      ]);
    }
    draw();
    push(box);
  }

  function confirmClear() {
    dialog({ icon: '🗑', title: T('clearAll'), msg: [T('clearQ')], buttons: [
      { label: T('cancel'), onClick: closeTop },
      { label: T('del'), primary: true, onClick: function () { S.cart = []; closeTop(); renderCart(); } }
    ] });
  }

  function tryOrder() {
    if (!S.cart.length) { toast(T('errEmpty'), 'err'); return; }
    var m = cartMeat();
    if (m > 0 && m < 2 && !meatSent()) { notice(T('errMeatMin')); return; }
    openReview();
  }

  function openReview() {
    var box = h('div', { class: 'modal m-review' },
      h('div', { class: 'mr-head' }, h('h2', null, T('reviewTitle')), h('span', { class: 'tbl' }, T('table', TABLE))),
      h('div', { class: 'mr-list' }, S.cart.map(function (l) {
        var it = item(l.id), ot = optText(it, l.opts);
        return h('div', { class: 'mr-row' },
          h('div', { class: 'mr-nm' }, L(it.name), ot ? h('small', null, ot) : null),
          h('div', { class: 'mr-q' }, it.meat ? T('portions', l.qty) : '×' + l.qty),
          h('div', { class: 'mr-p' }, won(unitPrice(it, l.opts) * l.qty)));
      })),
      h('div', { class: 'mr-sum' }, h('span', null, T('cartTotal')), h('strong', null, won(cartTotal()))),
      h('p', { class: 'mr-ask' }, T('reviewQ')),
      h('p', { class: 'mr-note' }, T('payNote')),
      h('div', { class: 'mi-foot' },
        h('button', { type: 'button', class: 'btn ghost', onclick: closeTop }, T('back')),
        h('button', { type: 'button', class: 'btn primary', onclick: send }, T('orderBtn'))));
    push(box);
  }

  function send() {
    var lines = S.cart.map(function (l) {
      return { id: l.id, opts: l.opts, qty: l.qty, unit: unitPrice(item(l.id), l.opts) };
    });
    var amount = lines.reduce(function (a, l) { return a + l.unit * l.qty; }, 0);
    S.orders.push({ no: S.orders.length + 1, lines: lines, amount: amount });
    S.cart = [];
    closeAll();
    go('sent');
  }

  function openHistory() {
    var box = h('div', { class: 'modal m-hist' },
      h('div', { class: 'mr-head' }, h('h2', null, T('history')), h('span', { class: 'tbl' }, T('table', TABLE)),
        h('div', { class: 'x', onclick: closeTop }, '✕')),
      h('div', { class: 'mh-list' }, S.orders.length ? S.orders.map(function (o) {
        return h('div', { class: 'mh-ord' },
          h('div', { class: 'mh-oh' }, h('b', null, T('orderNo', o.no)), h('span', { class: 'badge' }, T('sentBadge')), h('strong', null, won(o.amount))),
          o.lines.map(function (l) {
            var it = item(l.id), ot = optText(it, l.opts);
            return h('div', { class: 'mr-row' },
              h('div', { class: 'mr-nm' }, L(it.name), ot ? h('small', null, ot) : null),
              h('div', { class: 'mr-q' }, it.meat ? T('portions', l.qty) : '×' + l.qty),
              h('div', { class: 'mr-p' }, won(l.unit * l.qty)));
          }));
      }) : h('div', { class: 'c-empty' }, T('histEmpty'))),
      h('div', { class: 'mr-sum big' }, h('span', null, T('tableTotal')), h('strong', null, won(tableTotal()))),
      h('p', { class: 'mr-note' }, T('payNote')),
      h('div', { class: 'mi-foot one' }, h('button', { type: 'button', class: 'btn primary', onclick: closeTop }, T('close'))));
    push(box);
  }

  function openStaff() {
    var sel = [], err = '';
    var box = h('div', { class: 'modal m-staff' });
    function draw() {
      box.innerHTML = '';
      append(box, [
        h('div', { class: 'mr-head' }, h('h2', null, T('staffTitle')), h('span', { class: 'tbl' }, T('table', TABLE)),
          h('div', { class: 'x', onclick: closeTop }, '✕')),
        h('p', { class: 'sf-desc' }, T('staffDesc')),
        h('div', { class: 'chips' }, D.staffCall.map(function (s) {
          var on = sel.indexOf(s.id) >= 0;
          return h('div', { class: 'chip' + (on ? ' on' : ''), onclick: function () {
            err = '';
            if (on) sel.splice(sel.indexOf(s.id), 1); else sel.push(s.id);
            draw();
          } }, h('span', { class: 'ci' }, s.icon), L(s.name));
        })),
        h('div', { class: 'err', role: 'alert' }, err),
        h('div', { class: 'mi-foot' },
          h('button', { type: 'button', class: 'btn ghost', onclick: closeTop }, T('cancel')),
          h('button', { type: 'button', class: 'btn primary', onclick: function () {
            if (!sel.length) { err = T('staffErr'); draw(); return; }
            var names = D.staffCall.filter(function (s) { return sel.indexOf(s.id) >= 0; })
              .map(function (s) { return L(s.name); }).join(', ');
            closeTop();
            toast(T('staffDone', names), 'ok');
          } }, T('staffSend')))
      ]);
    }
    draw();
    push(box);
  }

  function openLang() {
    var langs = ['ko', 'en', 'ja', 'zh'];
    var box = h('div', { class: 'modal m-lang' },
      h('div', { class: 'mr-head' }, h('h2', null, T('langTitle')), h('div', { class: 'x', onclick: closeTop }, '✕')),
      h('div', { class: 'lang-list' }, langs.map(function (code) {
        return h('div', { class: 'lang-opt' + (code === S.lang ? ' on' : ''), onclick: function () {
          S.lang = code;
          document.documentElement.lang = code;
          closeTop();
          go(S.screen);
        } }, D.text[code].langName);
      })));
    push(box);
  }

  go('attract');
})();
