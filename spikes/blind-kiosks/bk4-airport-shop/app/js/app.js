/* SKY PANTRY kiosk — screens, cart and popups. No network, no randomness. */
(function () {
  'use strict';
  var D = window.KIOSK_DATA, TX = window.KIOSK_TEXT, MAX_QTY = 10;
  var S = { lang: 'ko', screen: 'attract', cat: D.categories[0].id, cart: [], drawer: false, modal: null };
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function t(k, v) {
    var s = TX[S.lang][k];
    for (var x in (v || {})) s = s.split('{' + x + '}').join(v[x]);
    return s;
  }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function nm(o) { return o[S.lang]; }
  function item(id) { for (var i = 0; i < D.items.length; i++) if (D.items[i].id === id) return D.items[i]; return null; }
  function mins(h) { var p = h.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function onSale(it) {
    if (!it.time) return true;
    var n = mins(D.fakeClock);
    return n >= mins(it.time.from) && n < mins(it.time.to);
  }

  /* ---------- cart ---------- */
  function unitPrice(itemId, opts) {
    var it = item(itemId), p = it.price;
    it.groups.forEach(function (gid) {
      var g = D.groups[gid], v = opts[gid];
      if (g.type === 'quantity') p += g.options[0].delta * (v || 0);
      else g.options.forEach(function (o) { if (o.id === v) p += o.delta; });
    });
    return p;
  }
  function keyOf(itemId, opts) {
    return itemId + '|' + Object.keys(opts).sort().map(function (k) { return k + '=' + opts[k]; }).join(',');
  }
  function lineByKey(key) { return S.cart.filter(function (l) { return l.key === key; })[0]; }
  function cartTotal() { return S.cart.reduce(function (s, l) { return s + unitPrice(l.itemId, l.opts) * l.qty; }, 0); }
  function cartCount() { return S.cart.reduce(function (s, l) { return s + l.qty * (item(l.itemId).promo ? 2 : 1); }, 0); }
  function simpleQty(id) { var l = lineByKey(keyOf(id, {})); return l ? l.qty : 0; }

  function addToCart(itemId, opts, qty) {
    var key = keyOf(itemId, opts), l = lineByKey(key), cur = l ? l.qty : 0;
    if (cur + qty > MAX_QTY) { showMsg('error', t('maxErr')); return false; }
    if (l) l.qty += qty; else S.cart.push({ key: key, itemId: itemId, opts: opts, qty: qty });
    return true;
  }
  function changeQty(key, d) {
    var l = lineByKey(key);
    if (!l) return;
    if (d > 0 && l.qty + d > MAX_QTY) { showMsg('error', t('maxErr')); return; }
    l.qty += d;
    if (l.qty <= 0) S.cart = S.cart.filter(function (x) { return x !== l; });
  }
  function optSummary(it, opts) {
    var parts = [];
    it.groups.forEach(function (gid) {
      var g = D.groups[gid], v = opts[gid];
      if (g.type === 'quantity') { if (v > 0) parts.push(nm(g.options[0]) + ' x' + v); }
      else g.options.forEach(function (o) { if (o.id === v) parts.push(nm(o)); });
    });
    return parts.join(' · ');
  }

  /* ---------- actions ---------- */
  function showMsg(kind, msg, then) { S.modal = { type: kind, msg: msg, then: then || null }; }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }
  function tapSimple(id) {
    var it = item(id);
    if (it.soldOut) return toast(t('soldOutMsg'));
    if (!onSale(it)) return showMsg('error', t('notNow', it.time));
    if (it.age19 && simpleQty(id) === 0) { S.modal = { type: 'age', itemId: id }; return; }
    addToCart(id, {}, 1);
  }
  function openSheet(id) {
    var it = item(id);
    if (it.soldOut) return toast(t('soldOutMsg'));
    if (!onSale(it)) return showMsg('error', t('notNow', it.time));
    var sel = {};
    it.groups.forEach(function (gid) { var g = D.groups[gid]; sel[gid] = g.type === 'quantity' ? 0 : g.def; });
    S.modal = { type: 'sheet', itemId: id, sel: sel, qty: 1, err: null };
  }
  function sheetAdd() {
    var m = S.modal, it = item(m.itemId);
    var miss = it.groups.filter(function (gid) { return D.groups[gid].required && !m.sel[gid]; })[0];
    if (miss) { m.err = t('needOption', { g: nm(D.groups[miss]) }); return; }
    var opts = {};
    for (var k in m.sel) opts[k] = m.sel[k];
    if (addToCart(m.itemId, opts, m.qty)) { S.modal = null; toast(t('added')); }
  }
  function goHome() {
    S.cart = []; S.drawer = false; S.modal = null; S.screen = 'attract'; S.lang = 'ko'; S.cat = D.categories[0].id;
  }

  var ACT = {
    lang: function (el) { S.lang = el.getAttribute('data-l'); },
    start: function () { S.screen = 'menu'; },
    cat: function (el) { S.cat = el.getAttribute('data-id'); $('grid').scrollTop = 0; },
    tile: function (el) { var it = item(el.getAttribute('data-id')); if (it.groups.length) openSheet(it.id); else tapSimple(it.id); },
    plus: function (el) { tapSimple(el.getAttribute('data-id')); },
    minus: function (el) { changeQty(keyOf(el.getAttribute('data-id'), {}), -1); },
    noop: function () {},
    opt: function (el) { S.modal.sel[el.getAttribute('data-g')] = el.getAttribute('data-o'); S.modal.err = null; },
    oq: function (el) {
      var g = el.getAttribute('data-g'), n = S.modal.sel[g] + Number(el.getAttribute('data-d'));
      S.modal.sel[g] = Math.max(0, Math.min(D.groups[g].max, n));
    },
    sqty: function (el) { S.modal.qty = Math.max(1, Math.min(MAX_QTY, S.modal.qty + Number(el.getAttribute('data-d')))); },
    sadd: sheetAdd,
    mclose: function () { S.modal = null; },
    ageyes: function () { var id = S.modal.itemId; S.modal = null; addToCart(id, {}, 1); },
    ageno: function () { showMsg('error', t('ageDeny')); },
    fab: function () { S.drawer = true; },
    dclose: function () { S.drawer = false; },
    lplus: function (el) { changeQty(el.getAttribute('data-key'), 1); },
    lminus: function (el) { changeQty(el.getAttribute('data-key'), -1); },
    ldel: function (el) { var k = el.getAttribute('data-key'); S.cart = S.cart.filter(function (l) { return l.key !== k; }); },
    clear: function () { showMsg('confirm', t('clearQ'), 'clear'); },
    cyes: function () {
      var then = S.modal.then;
      S.modal = null;
      if (then === 'clear') S.cart = [];
      if (then === 'home') goHome();
    },
    order: function () {
      if (!S.cart.length) return showMsg('error', t('emptyErr'));
      S.drawer = false; S.screen = 'review';
    },
    home: function () { if (S.cart.length) showMsg('confirm', t('homeQ'), 'home'); else goHome(); },
    rback: function () { S.screen = 'menu'; },
    rpay: function () { S.screen = 'pay'; },
    pback: function () { S.screen = 'review'; },
    method: function () { showMsg('info', t('demo')); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !ACT[el.getAttribute('data-act')]) return;
    ACT[el.getAttribute('data-act')](el);
    render();
  });

  /* ---------- views ---------- */
  function stepper(actMinus, actPlus, attrMinus, attrPlus, q) {
    return '<div class="stepper"><button class="st-btn" data-act="' + actMinus + '" ' + attrMinus + '>−</button>' +
      '<span class="st-q">' + q + '</span><button class="st-btn" data-act="' + actPlus + '" ' + attrPlus + '>+</button></div>';
  }
  function tileHTML(it) {
    var badges = '';
    if (it.promo) badges += '<span class="bdg bdg-promo">1+1</span>';
    if (it.age19) badges += '<span class="bdg bdg-age">19</span>';
    if (it.time) badges += '<span class="bdg bdg-time">⏰ ' + t('timeBadge', it.time) + '</span>';
    var ctrl;
    if (it.soldOut) ctrl = '<div class="soldout-mark">' + t('soldOut') + '</div>';
    else if (it.groups.length) ctrl = '<button class="btn-opt" data-act="tile" data-id="' + it.id + '">' + t('choose') + ' ›</button>';
    else {
      var q = simpleQty(it.id);
      ctrl = q ? stepper('minus', 'plus', 'data-id="' + it.id + '"', 'data-id="' + it.id + '"', q)
        : '<button class="btn-add" data-act="plus" data-id="' + it.id + '">+ ' + t('add') + '</button>';
    }
    return '<div class="tile' + (it.soldOut ? ' is-soldout' : '') + '" data-act="tile" data-id="' + it.id + '">' +
      '<div class="badges">' + badges + '</div><div class="pic">' + it.pic + '</div>' +
      '<div class="t-name">' + nm(it) + '<span class="t-price">' + won(it.price) + '</span></div>' +
      '<div class="ctrl" data-act="noop">' + ctrl + '</div></div>';
  }
  function linesHTML(editable) {
    return S.cart.map(function (l) {
      var it = item(l.itemId), sum = optSummary(it, l.opts), k = 'data-key="' + l.key + '"';
      var row = '<div class="line"><div class="l-name">' + nm(it) + (sum ? '<small>' + sum + '</small>' : '') + '</div>' +
        (editable ? '<div class="l-ctrl">' + stepper('lminus', 'lplus', k, k, l.qty) + '<div class="l-del" data-act="ldel" ' + k + '>✕</div></div>'
          : '<div class="l-qty">x' + l.qty + '</div>') +
        '<div class="l-price">' + won(unitPrice(l.itemId, l.opts) * l.qty) + '</div></div>';
      if (it.promo) {
        row += '<div class="line line-free"><div class="l-name">' + nm(it) + ' ' + t('free') + '</div>' +
          '<div class="l-qty">x' + l.qty + '</div><div class="l-price">' + won(0) + '</div></div>';
      }
      return row;
    }).join('');
  }

  function renderAttract() {
    $('scr-attract').innerHTML =
      '<div class="att-logo"><div class="logo-mark">✈</div><div class="logo-text">' + nm(D.brand) + '</div>' +
      '<div class="logo-sub">' + t('tagline') + '</div></div>' +
      '<div class="att-touch" data-act="start"><div class="touch-ring"></div><p>' + t('touch') + '</p></div>' +
      '<div class="att-lang"><span>' + t('langLabel') + '</span>' +
      '<button class="lang' + (S.lang === 'ko' ? ' on' : '') + '" data-act="lang" data-l="ko">한국어</button>' +
      '<button class="lang' + (S.lang === 'en' ? ' on' : '') + '" data-act="lang" data-l="en">English</button></div>' +
      '<div class="att-note">' + t('takeaway') + '</div>';
  }
  function renderMenu() {
    $('m-head').innerHTML = '<div class="brand">✈ ' + nm(D.brand) + '</div>' +
      '<div class="clock">' + t('now') + ' <b>' + D.fakeClock + '</b></div>' +
      '<button class="btn-home" data-act="home">' + t('home') + '</button>';
    $('cats').innerHTML = D.categories.map(function (c) {
      return '<div class="cat' + (c.id === S.cat ? ' on' : '') + '" data-act="cat" data-id="' + c.id + '">' + nm(c) + '</div>';
    }).join('');
    $('grid').innerHTML = D.items.filter(function (it) { return it.cat === S.cat; }).map(tileHTML).join('');
    var n = cartCount();
    $('fab').innerHTML = '🛒 ' + t('cart') + (n ? '<span class="badge">' + n + '</span>' : '');
  }
  function renderDrawer() {
    $('drawer').classList.toggle('open', S.drawer);
    $('scrim').classList.toggle('open', S.drawer);
    $('drawer').innerHTML =
      '<div class="dr-head"><h2>' + t('cart') + '</h2><button class="dr-close" data-act="dclose">' + t('close') + ' ✕</button></div>' +
      '<div class="dr-body">' + (S.cart.length ? linesHTML(true) : '<p class="empty">' + t('cartEmpty') + '</p>') + '</div>' +
      '<div class="dr-foot">' + (S.cart.length ? '<div class="link-clear" data-act="clear">' + t('clearAll') + '</div>' : '') +
      '<div class="dr-total">' + t('total') + '<strong id="drawerTotal">' + won(cartTotal()) + '</strong></div>' +
      '<button class="btn-primary" data-act="order">' + t('order') + '</button></div>';
  }
  function renderReview() {
    $('scr-review').innerHTML =
      '<div class="pg-head"><h1>' + t('reviewTitle') + '</h1><p>' + t('reviewSub') + '</p></div>' +
      '<div class="pg-lines">' + linesHTML(false) + '</div>' +
      '<div class="pg-sum"><span>' + t('count', { n: cartCount() }) + '</span>' +
      '<div class="sum">' + t('grandTotal') + '<strong id="reviewTotal">' + won(cartTotal()) + '</strong></div></div>' +
      '<div class="pg-actions"><button class="btn-ghost" data-act="rback">' + t('back') + '</button>' +
      '<button class="btn-primary" data-act="rpay">' + t('pay') + '</button></div>';
  }
  function renderPay() {
    $('scr-pay').innerHTML =
      '<div class="pg-head"><h1>' + t('payTitle') + '</h1><p>' + t('paySub') + '</p></div>' +
      '<div class="pay-amount">' + t('amount') + '<strong id="payAmount">' + won(cartTotal()) + '</strong></div>' +
      '<div class="methods">' +
      '<div class="method" data-act="method"><span class="m-ic">💳</span>' + t('card') + '</div>' +
      '<div class="method" data-act="method"><span class="m-ic">▦</span>' + t('qr') + '</div>' +
      '<div class="method" data-act="method"><span class="m-ic">🎫</span>' + t('prepaid') + '</div></div>' +
      '<div class="pg-actions"><button class="btn-ghost" data-act="pback">' + t('back') + '</button></div>';
  }
  function sheetHTML(m) {
    var it = item(m.itemId), h = '';
    it.groups.forEach(function (gid) {
      var g = D.groups[gid], v = m.sel[gid];
      h += '<section class="grp"><div class="grp-title">' + nm(g) + '<em class="' + (g.required ? 'req' : 'opt-l') + '">' +
        (g.required ? t('required') : t('optional')) + '</em>' + (g.type === 'quantity' ? '<i>' + t('upTo', { n: g.max }) + '</i>' : '') + '</div>';
      if (g.type === 'quantity') {
        var o = g.options[0];
        h += '<div class="opt-q"><span>' + nm(o) + ' +' + won(o.delta) + '</span>' + stepper('oq', 'oq', 'data-g="' + gid + '" data-d="-1"', 'data-g="' + gid + '" data-d="1"', v) + '</div>';
      } else {
        h += '<div class="opts">' + g.options.map(function (o) {
          return '<div class="opt' + (o.id === v ? ' sel' : '') + '" data-act="opt" data-g="' + gid + '" data-o="' + o.id + '">' +
            nm(o) + (o.delta ? '<span>+' + won(o.delta) + '</span>' : '') + '</div>';
        }).join('') + '</div>';
      }
      h += '</section>';
    });
    return '<div class="sheet"><div class="sh-head"><div class="pic">' + it.pic + '</div>' +
      '<div class="sh-title">' + nm(it) + '<span>' + won(it.price) + '</span></div></div>' +
      '<div class="sh-body">' + h +
      '<div class="sh-qty"><span>' + t('qty') + '</span>' +
      stepper('sqty', 'sqty', 'data-d="-1"', 'data-d="1"', m.qty) + '</div>' +
      (m.err ? '<div class="sh-err" role="alert">' + m.err + '</div>' : '') + '</div>' +
      '<div class="sh-actions"><button class="btn-ghost" data-act="mclose">' + t('cancel') + '</button>' +
      '<button class="btn-primary" data-act="sadd">' + t('addPrice', { price: won(unitPrice(m.itemId, m.sel) * m.qty) }) + '</button></div></div>';
  }
  function renderModal() {
    var m = S.modal, el = $('modal');
    el.className = m ? 'open' : '';
    if (!m) { el.innerHTML = ''; return; }
    var box;
    if (m.type === 'sheet') box = sheetHTML(m);
    else if (m.type === 'age') {
      box = '<div class="dialog"><div class="dlg-ic age">19</div><h3>' + t('ageTitle') + '</h3>' +
        '<p class="dlg-q">' + t('ageQ') + '</p><p class="dlg-note">' + t('ageNote') + '</p>' +
        '<div class="dlg-actions"><button class="btn-ghost" data-act="ageno">' + t('no') + '</button>' +
        '<button class="btn-primary" data-act="ageyes">' + t('yes') + '</button></div></div>';
    } else if (m.type === 'confirm') {
      box = '<div class="dialog"><div class="dlg-ic">?</div><p class="dlg-q">' + m.msg + '</p>' +
        '<div class="dlg-actions"><button class="btn-ghost" data-act="mclose">' + t('no') + '</button>' +
        '<button class="btn-primary" data-act="cyes">' + t('yes') + '</button></div></div>';
    } else {
      box = '<div class="dialog' + (m.type === 'error' ? ' is-error' : '') + '"><div class="dlg-ic">' + (m.type === 'error' ? '!' : 'i') + '</div>' +
        '<h3>' + t('error') + '</h3><p class="dlg-msg">' + m.msg + '</p>' +
        '<div class="dlg-actions"><button class="btn-primary" data-act="mclose">' + t('ok') + '</button></div></div>';
    }
    el.innerHTML = '<div class="overlay' + (m.type === 'sheet' ? ' bottom' : '') + '">' + box + '</div>';
  }

  function render() {
    document.documentElement.lang = S.lang;
    ['attract', 'menu', 'review', 'pay'].forEach(function (s) { $('scr-' + s).classList.toggle('on', S.screen === s); });
    if (S.screen === 'attract') renderAttract();
    if (S.screen === 'menu') renderMenu();
    if (S.screen === 'review') renderReview();
    if (S.screen === 'pay') renderPay();
    renderDrawer();
    renderModal();
  }

  $('scrim').setAttribute('data-act', 'dclose');
  render();
})();
