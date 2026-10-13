/* Dalbit Pass rest-area food court kiosk. Static, deterministic, no network. */
(function () {
  'use strict';
  var D = window.KIOSK_DATA;
  var ITEMS = {};
  D.items.forEach(function (it) { ITEMS[it.id] = it; });
  var COUNTERS = {};
  D.counters.forEach(function (c) { COUNTERS[c.id] = c; });
  var MAX_QTY = 9;

  function freshState() { return { mode: null, tab: 'rec', cart: [], bag: false, payMethod: null }; }
  var state = freshState();

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function plus(n) { return n > 0 ? '+' + won(n) : ''; }
  function optOf(g, o) { return D.groups[g].options.find(function (x) { return x.id === o; }); }

  /* ---------- overlay (sheets, alerts, confirms) ---------- */
  var overlay = $('#overlay');
  var overlayHandler = null;
  function openOverlay(html, handler) {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
    overlayHandler = handler;
  }
  function closeOverlay() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    overlayHandler = null;
  }
  overlay.addEventListener('click', function (e) { if (overlayHandler) overlayHandler(e, 'click'); });
  overlay.addEventListener('change', function (e) { if (overlayHandler) overlayHandler(e, 'change'); });

  function alertBox(title, msg) {
    openOverlay(
      '<div class="modal alert" role="alertdialog" aria-label="' + title + '">' +
        '<div class="m-icon">!</div><div class="m-title">' + title + '</div>' +
        '<div class="m-msg">' + msg + '</div>' +
        '<div class="m-actions"><button type="button" class="btn primary" data-act="ok">확인</button></div>' +
      '</div>',
      function (e, type) {
        if (type === 'click' && e.target.closest('[data-act]')) closeOverlay();
      });
  }

  function confirmBox(title, msg, noLabel, yesLabel, onYes) {
    openOverlay(
      '<div class="modal confirm" role="dialog" aria-label="' + title + '">' +
        '<div class="m-title">' + title + '</div>' +
        '<div class="m-msg">' + msg + '</div>' +
        '<div class="m-actions"><button type="button" class="btn ghost" data-act="no">' + noLabel + '</button>' +
        '<button type="button" class="btn primary" data-act="yes">' + yesLabel + '</button></div>' +
      '</div>',
      function (e, type) {
        if (type !== 'click') return;
        var a = e.target.closest('[data-act]');
        if (!a) return;
        closeOverlay();
        if (a.dataset.act === 'yes') onYes();
      });
  }

  /* ---------- screens ---------- */
  function show(id) {
    closeOverlay();
    $all('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
  }

  function reset() { state = freshState(); show('screen-attract'); }
  function goHome() {
    if (state.cart.length) {
      confirmBox('처음으로', '처음 화면으로 돌아가면<br>담은 메뉴가 모두 삭제됩니다.', '취소', '처음으로', reset);
    } else {
      reset();
    }
  }
  $all('[data-home]').forEach(function (b) { b.addEventListener('click', goHome); });

  $('#screen-attract').addEventListener('click', function () { show('screen-mode'); });
  $all('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.mode = b.dataset.mode;
      state.tab = 'rec';
      renderMenu();
      renderCart();
      show('screen-menu');
    });
  });

  /* ---------- menu ---------- */
  function tileHtml(it, inRec) {
    var cls = 'tile' + (it.soldOut ? ' is-soldout' : '') + (it.takeoutOnly && state.mode !== 'takeout' ? ' is-locked' : '');
    return '<div class="' + cls + '" data-item="' + it.id + '">' +
      '<div class="pic">' + it.emoji + '</div>' +
      (inRec ? '<span class="from">' + COUNTERS[it.counter].label + '</span>' : '') +
      '<span class="t-name">' + (it.rec && !inRec ? '<span class="ribbon">BEST</span>' : '') + it.name + '</span>' +
      '<span class="t-price">' + won(it.price) + (it.kind === 'set' ? '~' : '') + '</span>' +
      (it.takeoutOnly ? '<span class="tag">포장전용</span>' : '') +
      (it.soldOut ? '<div class="so-mask"><span>품절</span></div>' : '') +
      '</div>';
  }

  function renderMenu() {
    $('#mode-badge').textContent = state.mode === 'takeout' ? '포장' : '매장';
    $('#tabs').innerHTML = D.counters.map(function (c) {
      return '<div class="tab' + (c.id === state.tab ? ' on' : '') + '" data-tab="' + c.id + '">' + c.label + '</div>';
    }).join('');
    $('#counter-caption').textContent = COUNTERS[state.tab].caption;
    var list = state.tab === 'rec'
      ? D.recommended.map(function (id) { return ITEMS[id]; })
      : D.items.filter(function (it) { return it.counter === state.tab; });
    $('#grid').innerHTML = list.map(function (it) { return tileHtml(it, state.tab === 'rec'); }).join('');
    $('#grid').scrollTop = 0;
  }

  $('#tabs').addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (!t) return;
    state.tab = t.dataset.tab;
    renderMenu();
  });
  $('#grid').addEventListener('click', function (e) {
    var t = e.target.closest('[data-item]');
    if (t) openItem(ITEMS[t.dataset.item]);
  });

  function openItem(it) {
    if (it.soldOut) {
      alertBox('품절 안내', '죄송합니다.<br><b>' + it.name + '</b>은(는) 오늘 준비된 수량이 모두 판매되었습니다.');
      return;
    }
    if (it.takeoutOnly && state.mode !== 'takeout') {
      alertBox('포장 전용 메뉴', '<b>' + it.name + '</b>은(는) 포장 주문에서만 선택할 수 있습니다.<br>매장 식사 주문에는 담을 수 없습니다.');
      return;
    }
    if (it.kind === 'set') openSet(it); else openSheet(it);
  }

  /* ---------- shared option helpers ---------- */
  function defaultsFor(groupIds) {
    var sel = {};
    groupIds.forEach(function (g) { var d = D.groups[g].def; sel[g] = d ? [d] : []; });
    return sel;
  }
  function unitPrice(it, sel) {
    var p = it.price;
    Object.keys(sel).forEach(function (g) { sel[g].forEach(function (o) { p += optOf(g, o).price; }); });
    return p;
  }
  function toggleOpt(st, gid, oid, rerender) {
    var g = D.groups[gid], cur = st.sel[gid] || [];
    delete st.err[gid];
    if (g.type === 'single') {
      cur = [oid];
    } else if (cur.indexOf(oid) >= 0) {
      cur = cur.filter(function (x) { return x !== oid; });
    } else if (cur.length >= g.max) {
      st.err[gid] = g.maxMsg || ('최대 ' + g.max + '개까지 선택할 수 있습니다.');
      rerender();
      return;
    } else {
      cur = g.options.map(function (x) { return x.id; }).filter(function (x) { return x === oid || cur.indexOf(x) >= 0; });
    }
    st.sel[gid] = cur;
    rerender();
  }
  function stepperHtml(q) {
    return '<div class="stepper">' +
      '<button type="button" class="st-btn" data-act="minus"' + (q <= 1 ? ' disabled' : '') + ' aria-label="수량 빼기">−</button>' +
      '<span class="st-num">' + q + '</span>' +
      '<button type="button" class="st-btn" data-act="plus"' + (q >= MAX_QTY ? ' disabled' : '') + ' aria-label="수량 더하기">+</button>' +
      '</div>';
  }
  function addToCart(it, sel, qty) {
    var opts = {};
    it.groups && it.groups.forEach(function (g) { if ((sel[g] || []).length) opts[g] = sel[g].slice(); });
    var key = it.id + '|' + JSON.stringify(opts);
    var line = state.cart.find(function (l) { return l.key === key; });
    if (line && line.qty + qty > MAX_QTY) {
      alertBox('수량 초과', '같은 메뉴는 최대 ' + MAX_QTY + '개까지 담을 수 있습니다.<br>장바구니에 이미 ' + line.qty + '개가 있습니다.');
      return;
    }
    if (line) line.qty += qty;
    else state.cart.push({ key: key, itemId: it.id, opts: opts, qty: qty, unit: unitPrice(it, opts) });
    closeOverlay();
    renderCart();
  }

  /* ---------- item detail sheet ---------- */
  var sh = null;
  function openSheet(it) {
    sh = { it: it, sel: defaultsFor(it.groups || []), qty: 1, err: {} };
    renderSheet();
  }

  function groupHtml(gid, sel, err) {
    var g = D.groups[gid], cur = sel[gid] || [], body;
    var tag = g.required ? '<em class="req">필수</em>' : '<em class="optl">선택</em>';
    if (g.ui === 'check') {
      body = g.options.map(function (o) {
        return '<label class="chk"><input type="checkbox" data-group="' + gid + '" data-opt="' + o.id + '"' +
          (cur.indexOf(o.id) >= 0 ? ' checked' : '') + '> ' + o.label + ' <span class="d">(' + plus(o.price) + ')</span></label>';
      }).join('');
    } else if (g.ui === 'button') {
      body = '<div class="segs">' + g.options.map(function (o) {
        return '<button type="button" class="seg' + (cur.indexOf(o.id) >= 0 ? ' on' : '') + '" data-group="' + gid + '" data-opt="' + o.id + '">' +
          o.label + (o.price ? '<span class="d">' + plus(o.price) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    } else {
      body = '<div class="chips">' + g.options.map(function (o) {
        return '<div class="chip' + (cur.indexOf(o.id) >= 0 ? ' on' : '') + '" data-group="' + gid + '" data-opt="' + o.id + '">' +
          o.label + (o.price ? '<span class="d">' + plus(o.price) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="grp' + (err[gid] ? ' has-err' : '') + '"><div class="grp-title">' + g.title + tag + '</div>' + body +
      (err[gid] ? '<div class="err" role="alert">' + err[gid] + '</div>' : '') + '</div>';
  }

  function renderSheet() {
    var it = sh.it, unit = unitPrice(it, sh.sel);
    openOverlay(
      '<div class="sheet" role="dialog" aria-label="' + it.name + '">' +
        '<div class="sh-head"><div class="pic big">' + it.emoji + '</div><div class="sh-info">' +
          '<div class="sh-name">' + it.name + '</div><div class="sh-desc">' + it.desc + '</div>' +
          '<div class="sh-price">' + won(it.price) + '</div></div></div>' +
        '<div class="sh-groups">' + (it.groups || []).map(function (g) { return groupHtml(g, sh.sel, sh.err); }).join('') + '</div>' +
        '<div class="qty-row"><span class="qty-label">수량</span>' + stepperHtml(sh.qty) + '</div>' +
        '<div class="sh-sum">주문금액<strong>' + won(unit * sh.qty) + '</strong></div>' +
        '<div class="sh-actions"><button type="button" class="btn ghost" data-act="cancel">취소</button>' +
        '<button type="button" class="btn primary" data-act="add">장바구니 담기</button></div>' +
      '</div>',
      sheetHandler);
  }

  function sheetHandler(e, type) {
    if (type === 'change') {
      var inp = e.target.closest('input[data-opt]');
      if (inp) toggleOpt(sh, inp.dataset.group, inp.dataset.opt, renderSheet);
      return;
    }
    if (e.target.closest('label.chk')) return; // checkbox handled on change
    var o = e.target.closest('[data-opt]');
    if (o) { toggleOpt(sh, o.dataset.group, o.dataset.opt, renderSheet); return; }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'cancel': closeOverlay(); break;
      case 'minus': if (sh.qty > 1) sh.qty--; renderSheet(); break;
      case 'plus': if (sh.qty < MAX_QTY) sh.qty++; renderSheet(); break;
      case 'add': {
        var missing = (sh.it.groups || []).filter(function (g) { return D.groups[g].required && !(sh.sel[g] || []).length; });
        if (missing.length) {
          missing.forEach(function (g) { sh.err[g] = D.groups[g].reqMsg; });
          renderSheet();
        } else {
          addToCart(sh.it, sh.sel, sh.qty);
        }
        break;
      }
    }
  }

  /* ---------- set meal 2-step modal ---------- */
  var ss = null;
  function openSet(it) {
    ss = { it: it, step: 0, sel: defaultsFor(it.groups), qty: 1, err: {} };
    renderSet();
  }

  function renderSet() {
    var it = ss.it, gid = it.groups[ss.step], g = D.groups[gid], cur = ss.sel[gid] || [];
    var last = ss.step === it.groups.length - 1;
    var steps = it.groups.map(function (x, i) {
      return '<div class="stp' + (i === ss.step ? ' on' : '') + (i < ss.step ? ' done' : '') + '"><b>' + (i + 1) + '</b>' + D.groups[x].title + '</div>';
    }).join('');
    var cards = g.options.map(function (o) {
      return '<div class="card' + (cur.indexOf(o.id) >= 0 ? ' on' : '') + '" data-group="' + gid + '" data-opt="' + o.id + '">' +
        '<div class="pic">' + (o.emoji || '') + '</div><div class="c-name">' + o.label + '</div>' +
        '<div class="c-price">' + (o.price ? plus(o.price) : '추가금 없음') + '</div></div>';
    }).join('');
    var picked = it.groups.map(function (x) {
      return (ss.sel[x] || []).map(function (o) { return optOf(x, o).label; }).join(', ') || '-';
    }).join(' + ');
    openOverlay(
      '<div class="sheet set" role="dialog" aria-label="' + it.name + '">' +
        '<div class="set-head"><div class="sh-name">' + it.name + '</div><div class="sh-price">기본 ' + won(it.price) + '</div></div>' +
        '<div class="steps">' + steps + '</div>' +
        '<div class="step-title">' + (ss.step + 1) + '/' + it.groups.length + ' · ' + g.title + '</div>' +
        '<div class="cards">' + cards + '</div>' +
        (ss.err[gid] ? '<div class="err" role="alert">' + ss.err[gid] + '</div>' : '') +
        (last ? '<div class="set-summary">선택 내역 : ' + picked + '</div>' +
          '<div class="qty-row"><span class="qty-label">수량</span>' + stepperHtml(ss.qty) + '</div>' : '') +
        '<div class="sh-sum">세트금액<strong>' + won(unitPrice(it, ss.sel) * ss.qty) + '</strong></div>' +
        '<div class="sh-actions">' +
          (ss.step === 0 ? '<button type="button" class="btn ghost" data-act="cancel">취소</button>'
                         : '<button type="button" class="btn ghost" data-act="prev">이전</button>') +
          (last ? '<button type="button" class="btn primary" data-act="add">장바구니 담기</button>'
                : '<button type="button" class="btn primary" data-act="next">다음</button>') +
        '</div>' +
      '</div>',
      setHandler);
  }

  function setHandler(e, type) {
    if (type !== 'click') return;
    var o = e.target.closest('[data-opt]');
    if (o) { toggleOpt(ss, o.dataset.group, o.dataset.opt, renderSet); return; }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    var gid = ss.it.groups[ss.step];
    var ok = (ss.sel[gid] || []).length > 0;
    switch (a.dataset.act) {
      case 'cancel': closeOverlay(); break;
      case 'prev': ss.step--; renderSet(); break;
      case 'next':
        if (!ok) ss.err[gid] = D.groups[gid].reqMsg; else ss.step++;
        renderSet();
        break;
      case 'minus': if (ss.qty > 1) ss.qty--; renderSet(); break;
      case 'plus': if (ss.qty < MAX_QTY) ss.qty++; renderSet(); break;
      case 'add':
        if (!ok) { ss.err[gid] = D.groups[gid].reqMsg; renderSet(); }
        else addToCart(ss.it, ss.sel, ss.qty);
        break;
    }
  }

  /* ---------- cart ---------- */
  function optSummary(line) {
    return Object.keys(line.opts).map(function (g) {
      return line.opts[g].map(function (o) { return optOf(g, o).label; }).join(', ');
    }).join(' / ');
  }
  function totals() {
    var count = 0, sub = 0;
    state.cart.forEach(function (l) { count += l.qty; sub += l.unit * l.qty; });
    var bag = state.mode === 'takeout' && state.bag ? D.bag.price : 0;
    return { count: count, sub: sub, bag: bag, total: sub + bag };
  }
  function renderCart() {
    var t = totals();
    $('#cart-lines').innerHTML = state.cart.length ? state.cart.map(function (l, i) {
      var it = ITEMS[l.itemId], s = optSummary(l);
      return '<div class="line"><div class="l-name">' + it.name + (s ? '<small>' + s + '</small>' : '') + '</div>' +
        '<div class="l-qty">' + l.qty + '개</div><div class="l-price">' + won(l.unit * l.qty) + '</div>' +
        '<button type="button" class="l-del" data-del="' + i + '" aria-label="' + it.name + ' 삭제">✕</button></div>';
    }).join('') : '<div class="cart-empty">담은 메뉴가 없습니다</div>';
    $('#cart-count').textContent = t.count;
    $('#cart-total').textContent = won(t.sub);
  }
  $('#cart-lines').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]');
    if (!d) return;
    state.cart.splice(Number(d.dataset.del), 1);
    renderCart();
  });
  $('#cart-clear').addEventListener('click', function () {
    if (!state.cart.length) return;
    confirmBox('전체 삭제', '장바구니에 담은 메뉴를<br>모두 삭제할까요?', '취소', '삭제', function () { state.cart = []; renderCart(); });
  });
  $('#btn-order').addEventListener('click', function () {
    if (!state.cart.length) {
      alertBox('알림', '선택하신 메뉴가 없습니다.<br>메뉴를 먼저 담아 주세요.');
      return;
    }
    renderReview();
    show('screen-review');
  });

  /* ---------- order review ---------- */
  function renderReview() {
    var t = totals();
    $('#rv-mode').textContent = state.mode === 'takeout' ? '포장' : '매장 식사';
    var html = '';
    D.counters.forEach(function (c) {
      if (c.id === 'rec') return;
      var lines = state.cart.filter(function (l) { return ITEMS[l.itemId].counter === c.id; });
      if (!lines.length) return;
      html += '<div class="rv-group"><div class="rv-counter">' + c.no + '번 ' + c.label + ' 코너에서 받아 가세요</div>' +
        lines.map(function (l) {
          var s = optSummary(l);
          return '<div class="rv-line"><div class="rv-name">' + ITEMS[l.itemId].name + (s ? '<span class="rv-opt">' + s + '</span>' : '') + '</div>' +
            '<div class="rv-qty">x' + l.qty + '</div><div class="rv-price">' + won(l.unit * l.qty) + '</div></div>';
        }).join('') + '</div>';
    });
    $('#rv-lines').innerHTML = html;
    $('#rv-bag').innerHTML = state.mode === 'takeout'
      ? '<div class="bag-toggle' + (state.bag ? ' on' : '') + '" data-bag><span class="box">' + (state.bag ? '✓' : '') + '</span>' +
        '<span class="bag-q">봉투가 필요하신가요?</span><b>봉투 ' + plus(D.bag.price) + '</b></div>'
      : '';
    $('#rv-sub').textContent = won(t.sub);
    $('#rv-bag-row').classList.toggle('hidden', !t.bag);
    $('#rv-bag-amt').textContent = won(t.bag);
    $('#rv-total').textContent = won(t.total);
  }
  $('#rv-bag').addEventListener('click', function (e) {
    if (!e.target.closest('[data-bag]')) return;
    state.bag = !state.bag;
    renderReview();
  });
  $('#rv-back').addEventListener('click', function () { renderCart(); show('screen-menu'); });
  $('#btn-pay').addEventListener('click', function () {
    var t = totals();
    confirmBox('주문 확인',
      '<div class="cf-row"><span>식사 방법</span><b>' + (state.mode === 'takeout' ? '포장' : '매장 식사') + '</b></div>' +
      '<div class="cf-row"><span>주문 수량</span><b>' + t.count + '개</b></div>' +
      (t.bag ? '<div class="cf-row"><span>봉투</span><b>1장</b></div>' : '') +
      '<div class="cf-row total"><span>총 결제금액</span><b>' + won(t.total) + '</b></div>' +
      '<p class="cf-note">주문 후에는 취소·변경이 어렵습니다.<br>이대로 주문하시겠습니까?</p>',
      '취소', '확인',
      function () { renderPay(); show('screen-pay'); });
  });

  /* ---------- payment method ---------- */
  var GUIDE = {
    card: '카드를 IC 투입구에 끝까지 넣어 주세요.<br>결제가 끝날 때까지 카드를 빼지 마세요.',
    qr: '휴대폰의 QR·바코드를 아래 스캐너에 비춰 주세요.',
    transit: '교통카드를 단말기 위에 올려 주세요.'
  };
  function renderPay() {
    state.payMethod = null;
    $('#pay-total').textContent = won(totals().total);
    $('#pay-guide').classList.add('hidden');
    $all('.pm').forEach(function (p) { p.classList.remove('on'); });
  }
  $('#pay-methods').addEventListener('click', function (e) {
    var p = e.target.closest('[data-pm]');
    if (!p) return;
    state.payMethod = p.dataset.pm;
    $all('.pm').forEach(function (x) { x.classList.toggle('on', x === p); });
    var g = $('#pay-guide');
    g.innerHTML = GUIDE[p.dataset.pm];
    g.classList.remove('hidden');
  });
  $('#pay-back').addEventListener('click', function () { renderReview(); show('screen-review'); });
})();
