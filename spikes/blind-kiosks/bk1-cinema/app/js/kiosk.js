// 별무리 시네마 스낵바 self-order kiosk. Plain JS, no network, no timers.
(function () {
  'use strict';
  var D = window.KIOSK_DATA;
  var G = D.GROUPS;
  var root = document.getElementById('kiosk');

  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function item(id) { for (var i = 0; i < D.ITEMS.length; i++) if (D.ITEMS[i].id === id) return D.ITEMS[i]; return null; }
  function opt(gid, oid) { var o = G[gid].options; for (var i = 0; i < o.length; i++) if (o[i].id === oid) return o[i]; return null; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  var PICKUP = { before: '상영관 입장 전 수령', now: '지금 바로 수령' };

  var ICONS = {
    combo: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4 12h12l-2 16H6z" fill="#f5c542"/><circle cx="7" cy="10" r="3" fill="#fff6d8"/><circle cx="11" cy="8.5" r="3" fill="#fff6d8"/><circle cx="14" cy="10.5" r="2.6" fill="#fff6d8"/><path d="M19 12h9l-1.5 16h-6z" fill="#e8455a"/><path d="M25 12l2-8" stroke="#fff" stroke-width="1.6"/></svg>',
    popcorn: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M7 13h18l-2.5 16h-13z" fill="#e8455a"/><path d="M12 13l1 16M20 13l-1 16" stroke="#fff" stroke-width="2"/><circle cx="10" cy="11" r="4" fill="#fff6d8"/><circle cx="16" cy="8" r="4.5" fill="#fff6d8"/><circle cx="22" cy="11" r="4" fill="#fff6d8"/></svg>',
    drink: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M8 10h16l-2 19H10z" fill="#3fa7f5"/><rect x="7" y="8" width="18" height="3" rx="1.5" fill="#cfe9ff"/><path d="M17 9l3-7h4" stroke="#fff" stroke-width="2" fill="none"/></svg>',
    snack: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 4l12 22H4z" fill="#f5b942"/><circle cx="14" cy="18" r="1.6" fill="#c9771a"/><circle cx="19" cy="21" r="1.6" fill="#c9771a"/></svg>',
    hot: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="3" y="12" width="26" height="10" rx="5" fill="#f2c28b"/><rect x="5" y="14" width="22" height="6" rx="3" fill="#c0392b"/><path d="M7 17c2-2 4 2 6 0s4 2 6 0 4 2 6 0" stroke="#f5d142" stroke-width="1.5" fill="none"/></svg>',
    dessert: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M10 15h12l-6 15z" fill="#d9a066"/><circle cx="16" cy="11" r="7" fill="#f7c6d9"/></svg>'
  };

  var S = {
    screen: 'attract', pickup: null, cat: 'combo', page: 0,
    cart: [], overlay: null, toast: null, payMethod: null
  };

  // ---------- pricing ----------
  function selDelta(gid, sel) {
    var g = G[gid], v = sel[gid], d = 0;
    if (!v) return 0;
    if (g.type === 'quantity') {
      for (var k in v) d += opt(gid, k).delta * v[k];
    } else {
      for (var i = 0; i < v.length; i++) d += opt(gid, v[i]).delta;
    }
    return d;
  }
  function groupsOf(it, sel) {
    if (it.combo) {
      var gs = ['comboPopcornSize', 'comboFlavor'];
      if (sel.comboFlavor && sel.comboFlavor[0] === 'half') gs.push('halfFlavors');
      gs.push(it.combo.drinks === 1 ? 'comboDrink1' : 'comboDrinks2');
      return gs;
    }
    return it.groups || [];
  }
  function unitPrice(it, sel) {
    var p = it.price, gs = groupsOf(it, sel);
    for (var i = 0; i < gs.length; i++) p += selDelta(gs[i], sel);
    return p;
  }
  function ordered(gid, ids) {
    return G[gid].options.filter(function (o) { return ids.indexOf(o.id) >= 0; });
  }
  function summary(it, sel) {
    var parts = [], gs = groupsOf(it, sel);
    for (var i = 0; i < gs.length; i++) {
      var gid = gs[i], v = sel[gid], g = G[gid];
      if (!v) continue;
      if (gid === 'halfFlavors' && it.combo) continue;
      if (g.type === 'quantity') {
        var q = [];
        g.options.forEach(function (o) { if (v[o.id]) q.push(o.label + '×' + v[o.id]); });
        parts.push(q.join(', '));
      } else if (gid === 'comboFlavor' && v[0] === 'half') {
        parts.push('반반(' + ordered('halfFlavors', sel.halfFlavors || []).map(function (o) { return o.label; }).join('+') + ')');
      } else if (gid === 'halfFlavors') {
        parts.push('반반(' + ordered(gid, v).map(function (o) { return o.label; }).join('+') + ')');
      } else if (v.length) {
        parts.push(ordered(gid, v).map(function (o) { return o.short || o.label; }).join(', '));
      }
    }
    return parts.join(' · ');
  }
  function cartTotal() { return S.cart.reduce(function (s, l) { return s + l.unit * l.qty; }, 0); }
  function cartCount() { return S.cart.reduce(function (s, l) { return s + l.qty; }, 0); }

  function lineKey(id, sel) {
    var keys = Object.keys(sel).sort();
    return id + '|' + keys.map(function (k) {
      var v = sel[k];
      if (Array.isArray(v)) return k + ':' + v.slice().sort().join(',');
      return k + ':' + Object.keys(v).sort().filter(function (o) { return v[o] > 0; }).map(function (o) { return o + v[o]; }).join(',');
    }).join(';');
  }
  function addLine(line) {
    var key = lineKey(line.id, line.sel);
    for (var i = 0; i < S.cart.length; i++) {
      if (S.cart[i].key === key) {
        S.cart[i].qty = Math.min(D.MAX_QTY, S.cart[i].qty + line.qty);
        return;
      }
    }
    line.key = key;
    S.cart.push(line);
  }
  function toast(msg, kind) { S.toast = { msg: msg, kind: kind || 'info' }; }

  // ---------- screens ----------
  function attractHTML() {
    return '<div class="screen attract" data-act="start">' +
      '<div class="att-marquee"><span class="star"></span><span class="star"></span><span class="star"></span></div>' +
      '<div class="att-logo"><span class="logo-star"></span></div>' +
      '<div class="att-brand">별무리 시네마</div><div class="att-sub">SNACK BAR</div>' +
      '<div class="att-pics">🍿 🥤 🌭 🧀</div>' +
      '<div class="att-promo">콤보 주문 고객 한정 · 나쵸 특가 3,000원</div>' +
      '<div class="att-touch">화면을 터치하여 주문을 시작하세요</div>' +
      '</div>';
  }

  function topbar() {
    return '<header class="topbar"><div class="brand"><span class="logo-star sm"></span>별무리 시네마</div>' +
      (S.pickup ? '<div class="pk-badge">' + PICKUP[S.pickup] + '</div>' : '') +
      '<button class="btn-home" data-act="home">처음으로</button></header>';
  }

  function pickupHTML() {
    return '<div class="screen pickup">' + topbar() +
      '<h2 class="q-title">수령 방법을 선택해 주세요</h2>' +
      '<div class="pick-opts">' +
      '<div class="pick" data-act="pickup" data-v="before"><div class="pk-ico">🎟️</div><div class="pk-name">상영관 입장 전 수령</div><div class="pk-desc">상영 시작 전 픽업대에서 호출 번호로 받아가세요</div></div>' +
      '<button class="pick" data-act="pickup" data-v="now"><div class="pk-ico">⚡</div><div class="pk-name">지금 바로 수령</div><div class="pk-desc">주문 즉시 준비해 드려요</div></button>' +
      '</div></div>';
  }

  function menuHTML() {
    var catItems = D.ITEMS.filter(function (it) { return it.cat === S.cat; });
    var pages = Math.max(1, Math.ceil(catItems.length / D.PAGE_SIZE));
    var shown = catItems.slice(S.page * D.PAGE_SIZE, (S.page + 1) * D.PAGE_SIZE);
    var h = '<div class="screen menu">' + topbar();
    h += '<nav class="cat-tabs" role="tablist">';
    D.CATS.forEach(function (c) {
      var on = c.id === S.cat;
      h += '<button class="cat' + (on ? ' active' : '') + '" role="tab" aria-selected="' + on + '" aria-label="' + c.label + '" data-act="cat" data-id="' + c.id + '">' + ICONS[c.id] + '</button>';
    });
    h += '</nav><div class="grid">';
    shown.forEach(function (it) {
      h += '<div class="mcard' + (it.soldOut ? ' soldout' : '') + (it.combo ? ' combo' : '') + '" data-act="item" data-id="' + it.id + '">' +
        '<div class="mc-pic">' + it.pic + '</div>' +
        '<div class="mc-name">' + it.name + '</div>' + (it.desc ? '<div class="mc-desc">' + it.desc + '</div>' : '') +
        '<div class="mc-price">' + won(it.price) + '</div>' +
        (it.soldOut ? '<div class="so-ov">품절</div>' : '') + '</div>';
    });
    for (var f = shown.length; f < D.PAGE_SIZE; f++) h += '<div class="mcard empty"></div>';
    h += '</div>';
    h += '<div class="pager"><div class="pg' + (S.page === 0 ? ' off' : '') + '" data-act="pg" data-d="-1">◀</div>' +
      '<div class="pg-ind">' + (S.page + 1) + ' / ' + pages + '</div>' +
      '<div class="pg' + (S.page >= pages - 1 ? ' off' : '') + '" data-act="pg" data-d="1">▶</div></div>';
    h += cartHTML() + '</div>';
    return h;
  }

  function cartHTML() {
    var h = '<section class="cart"><div class="cart-head"><span>장바구니 <b class="cnt">' + cartCount() + '</b></span>' +
      '<button class="btn-clear" data-act="clear">전체 삭제</button></div><div class="cart-list">';
    if (!S.cart.length) h += '<div class="cart-empty">메뉴를 선택해 주세요</div>';
    S.cart.forEach(function (l, i) {
      var it = l.upsell ? null : item(l.id);
      var name = l.upsell ? D.UPSELL.name + ' <span class="tag">' + D.UPSELL.tag + '</span>' : it.name;
      var sm = l.upsell ? D.UPSELL.note : summary(it, l.sel);
      h += '<div class="cl"><div class="cl-info"><div class="cl-name">' + name + '</div>' + (sm ? '<div class="cl-opt">' + sm + '</div>' : '') + '</div>' +
        '<div class="cl-qty"><button data-act="dec" data-i="' + i + '" aria-label="수량 빼기">−</button><span class="q">' + l.qty + '</span>' +
        '<button data-act="inc" data-i="' + i + '" aria-label="수량 더하기">+</button></div>' +
        '<div class="cl-price">' + won(l.unit * l.qty) + '</div><div class="cl-del" data-act="del" data-i="' + i + '">✕</div></div>';
    });
    h += '</div><div class="cart-foot"><div class="total">총 결제금액<b id="cart-total">' + won(cartTotal()) + '</b></div>' +
      '<button class="btn-primary" data-act="checkout">주문하기</button></div></section>';
    return h;
  }

  function linesTable() {
    var h = '<div class="rv-list">';
    S.cart.forEach(function (l) {
      var it = l.upsell ? null : item(l.id);
      var name = l.upsell ? D.UPSELL.name + ' (' + D.UPSELL.tag + ')' : it.name;
      var sm = l.upsell ? D.UPSELL.note : summary(it, l.sel);
      h += '<div class="rv-line"><div class="rv-name">' + name + (sm ? '<div class="rv-opt">' + sm + '</div>' : '') + '</div>' +
        '<div class="rv-qty">' + l.qty + '개</div><div class="rv-price">' + won(l.unit * l.qty) + '</div></div>';
    });
    return h + '</div>';
  }

  function reviewHTML() {
    return '<div class="screen review">' + topbar() +
      '<h2 class="q-title">주문 내역을 확인해 주세요</h2>' + linesTable() +
      '<div class="rv-pickup">수령 방법 <b>' + PICKUP[S.pickup] + '</b></div>' +
      '<div class="rv-total">총 결제금액 <b id="review-total">' + won(cartTotal()) + '</b></div>' +
      '<div class="foot2"><button class="btn-sec" data-act="back-menu">이전</button><button class="btn-primary" data-act="to-pay">결제하기</button></div></div>';
  }

  function payHTML() {
    var methods = [['card', '💳', '신용/체크카드'], ['qr', '📱', '간편결제'], ['voucher', '🎫', '모바일 관람권·쿠폰']];
    var h = '<div class="screen pay">' + topbar() + '<h2 class="q-title">결제 수단을 선택해 주세요</h2>' +
      '<div class="pay-amt">결제 금액 <strong id="pay-total">' + won(cartTotal()) + '</strong></div><div class="pay-opts">';
    methods.forEach(function (m) {
      h += '<div class="pay-m' + (S.payMethod === m[0] ? ' sel' : '') + '" data-act="paym" data-v="' + m[0] + '"><div class="pm-ico">' + m[1] + '</div>' + m[2] + '</div>';
    });
    h += '</div>';
    if (S.payMethod) h += '<div class="pay-wait">' + (S.payMethod === 'card' ? '카드를 아래 투입구에 꽂아 주세요' : S.payMethod === 'qr' ? '바코드를 스캐너에 보여 주세요' : '쿠폰 바코드를 스캐너에 보여 주세요') + '</div>';
    h += '<div class="foot2"><button class="btn-sec" data-act="back-review">이전</button></div></div>';
    return h;
  }

  // ---------- overlays ----------
  function optsHTML(gid, sel, ctx) {
    var g = G[gid], v = sel[gid] || (g.type === 'quantity' ? {} : []);
    var req = g.required ? '<em class="req">필수</em>' : '<em class="opt-tag">선택</em>';
    var title = g.title;
    if (gid === 'halfFlavors') title += ' <span class="cnt-hint">' + v.length + '/2</span>';
    var h = '<div class="og"><div class="og-title">' + title + req + '</div><div class="og-opts' + (g.type === 'quantity' ? ' qty' : '') + '">';
    g.options.forEach(function (o) {
      var d = o.delta ? '<span class="od">+' + won(o.delta) + '</span>' : '';
      if (g.type === 'quantity') {
        var q = v[o.id] || 0;
        h += '<div class="qopt"><span class="qo-name">' + o.label + d + '</span><span class="qo-ctl">' +
          '<button data-act="' + ctx + '-q" data-g="' + gid + '" data-o="' + o.id + '" data-d="-1" aria-label="' + o.label + ' 빼기">−</button>' +
          '<span class="q">' + q + '</span>' +
          '<button data-act="' + ctx + '-q" data-g="' + gid + '" data-o="' + o.id + '" data-d="1" aria-label="' + o.label + ' 더하기">+</button></span></div>';
      } else {
        var on = v.indexOf(o.id) >= 0;
        h += '<div class="opt' + (on ? ' sel' : '') + (g.type === 'multi' ? ' chk' : '') + '" data-act="' + ctx + '-o" data-g="' + gid + '" data-o="' + o.id + '">' + o.label + d + '</div>';
      }
    });
    return h + '</div></div>';
  }

  function itemModalHTML(o) {
    var it = item(o.id), total = unitPrice(it, o.sel) * o.qty;
    var h = '<div class="ov"><div class="modal" role="dialog" aria-label="' + it.name + '">' +
      '<div class="m-head"><div class="m-pic">' + it.pic + '</div><div class="m-info"><div class="m-name">' + it.name + '</div><div class="m-base">' + won(it.price) + '</div></div>' +
      '<div class="m-x" data-act="close">✕</div></div><div class="modal-body">';
    it.groups.forEach(function (gid) { h += optsHTML(gid, o.sel, 'io'); });
    h += '<div class="og"><div class="og-title">수량</div><div class="stepper"><button data-act="mq" data-d="-1" aria-label="수량 빼기">−</button><span class="q">' + o.qty + '</span><button data-act="mq" data-d="1" aria-label="수량 더하기">+</button></div></div>';
    h += '</div>' + (o.error ? '<div class="err" role="alert">' + o.error + '</div>' : '') +
      '<div class="modal-foot"><button class="btn-sec" data-act="close">취소</button>' +
      '<button class="btn-primary" data-act="io-add">' + won(total) + ' 담기</button></div></div></div>';
    return h;
  }

  var WIZ_STEPS = ['콤보 선택', '팝콘 사이즈', '팝콘 맛', '음료', '확인'];
  function wizHTML(w) {
    var it = item(w.id);
    var h = '<div class="ov"><div class="modal wiz" role="dialog" aria-label="콤보 만들기">' +
      '<div class="m-head"><div class="m-name">콤보 만들기</div><div class="m-x" data-act="close">✕</div></div><ol class="wiz-steps">';
    WIZ_STEPS.forEach(function (s, i) {
      h += '<li class="ws' + (i === w.step ? ' cur' : i < w.step ? ' done' : '') + '">' + '<span class="ws-n">' + (i + 1) + '</span>' + s + '</li>';
    });
    h += '</ol><div class="modal-body">';
    if (w.step === 0) {
      h += '<div class="combo-list">';
      D.ITEMS.filter(function (x) { return x.combo; }).forEach(function (c) {
        h += '<div class="combo-card' + (c.id === w.id ? ' sel' : '') + (c.soldOut ? ' soldout' : '') + '" data-act="wz-combo" data-id="' + c.id + '">' +
          '<div class="cc-pic">' + c.pic + '</div><div class="cc-name">' + c.name + '</div><div class="cc-desc">' + c.desc + '</div>' +
          '<div class="cc-price">' + won(c.price) + '</div>' + (c.soldOut ? '<div class="so-ov">품절</div>' : '') + '</div>';
      });
      h += '</div>';
    } else if (w.step === 1) {
      h += optsHTML('comboPopcornSize', w.sel, 'wz');
    } else if (w.step === 2) {
      h += optsHTML('comboFlavor', w.sel, 'wz');
      if (w.sel.comboFlavor && w.sel.comboFlavor[0] === 'half') h += optsHTML('halfFlavors', w.sel, 'wz');
    } else if (w.step === 3) {
      h += optsHTML(it.combo.drinks === 1 ? 'comboDrink1' : 'comboDrinks2', w.sel, 'wz');
    } else {
      h += '<div class="wz-sum"><div class="ws-pic">' + it.pic + '</div><div class="ws-name">' + it.name + '</div>' +
        '<div class="ws-opt">' + summary(it, w.sel) + '</div>' +
        (it.id === 'combo-special' ? '<div class="ws-opt">+ 클래식 핫도그</div>' : '') + '</div>';
    }
    h += '</div>' + (w.error ? '<div class="err" role="alert">' + w.error + '</div>' : '') +
      '<div class="wiz-price">현재 금액 <b>' + won(unitPrice(it, w.sel)) + '</b></div>' +
      '<div class="modal-foot"><button class="btn-sec" data-act="wz-prev">' + (w.step === 0 ? '취소' : '이전') + '</button>' +
      '<button class="btn-primary" data-act="wz-next">' + (w.step === 4 ? '장바구니 담기' : '다음') + '</button></div></div></div>';
    return h;
  }

  function upsellHTML() {
    var u = D.UPSELL;
    return '<div class="ov"><div class="modal upsell" role="dialog" aria-label="추가 메뉴 제안">' +
      '<div class="up-pic">' + u.pic + '</div><div class="up-title">바삭한 나쵸도 함께 드릴까요?</div>' +
      '<div class="up-sub">콤보 고객 특가 <b>' + won(u.price) + '</b> <s>' + won(u.regular) + '</s></div>' +
      '<div class="modal-foot"><button class="btn-sec" data-act="up-no">아니요</button>' +
      '<div class="btn-primary" data-act="up-yes">네, 추가할게요</div></div></div></div>';
  }

  function confirmHTML(o) {
    return '<div class="ov"><div class="modal confirm" role="alertdialog"><div class="cf-msg">' + o.msg + '</div>' +
      '<div class="modal-foot"><button class="btn-sec" data-act="cf-no">취소</button><button class="btn-primary" data-act="cf-yes">확인</button></div></div></div>';
  }

  function overlayHTML() {
    var o = S.overlay;
    if (!o) return '';
    if (o.type === 'item') return itemModalHTML(o);
    if (o.type === 'wiz') return wizHTML(o);
    if (o.type === 'upsell') return upsellHTML();
    if (o.type === 'confirm') return confirmHTML(o);
    return '';
  }

  function render() {
    var keep = {};
    ['.cart-list', '.modal-body', '.rv-list'].forEach(function (sel) { var e = root.querySelector(sel); if (e) keep[sel] = e.scrollTop; });
    var h = '';
    if (S.screen === 'attract') h = attractHTML();
    else if (S.screen === 'pickup') h = pickupHTML();
    else if (S.screen === 'menu') h = menuHTML();
    else if (S.screen === 'review') h = reviewHTML();
    else if (S.screen === 'pay') h = payHTML();
    h += overlayHTML();
    if (S.toast) h += '<div class="toast ' + S.toast.kind + '" role="alert">' + esc(S.toast.msg) + '</div>';
    root.innerHTML = h;
    Object.keys(keep).forEach(function (sel) { var e = root.querySelector(sel); if (e) e.scrollTop = keep[sel]; });
  }

  // ---------- actions ----------
  function defaults(it) {
    var sel = {};
    (it.groups || []).forEach(function (gid) {
      var g = G[gid];
      sel[gid] = g.def ? [g.def] : [];
    });
    return sel;
  }
  function selCount(gid, sel) {
    var v = sel[gid];
    if (!v) return 0;
    if (Array.isArray(v)) return v.length;
    return Object.keys(v).reduce(function (s, k) { return s + v[k]; }, 0);
  }
  function toggleOpt(sel, gid, oid) {
    var g = G[gid], v = sel[gid] || [];
    if (g.type === 'single') { sel[gid] = [oid]; return ''; }
    var i = v.indexOf(oid);
    if (i >= 0) { v.splice(i, 1); sel[gid] = v; return ''; }
    if (g.max && v.length >= g.max) {
      return gid === 'halfFlavors' ? '반반은 맛을 2가지까지만 고를 수 있어요.' : '최대 ' + g.max + '개까지 선택할 수 있습니다.';
    }
    v.push(oid); sel[gid] = v;
    return '';
  }
  var REQ_MSG = {
    popcornSize: '사이즈를 선택해 주세요.',
    drinkSize: '사이즈를 선택해 주세요.',
    comboPopcornSize: '팝콘 사이즈를 선택해 주세요.',
    coffeeTemp: '온도(HOT/ICE)를 선택해 주세요.',
    comboFlavor: '팝콘 맛을 선택해 주세요.',
    comboDrink1: '음료를 선택해 주세요.',
    slushFlavor: '맛을 선택해 주세요.'
  };
  function validateGroup(gid, sel) {
    var g = G[gid], n = selCount(gid, sel);
    if (gid === 'halfFlavors' && n !== 2) return '반반 팝콘은 맛을 정확히 2가지 선택해 주세요. (현재 ' + n + '가지)';
    if (gid === 'comboDrinks2' && n !== 2) return '음료를 2잔 선택해 주세요. (현재 ' + n + '잔)';
    if (g.required && n < (g.min || 1)) return REQ_MSG[gid] || '옵션을 선택해 주세요.';
    return '';
  }

  var A = {
    start: function () { S.screen = 'pickup'; },
    pickup: function (d) { S.pickup = d.v; S.screen = 'menu'; S.cat = 'combo'; S.page = 0; },
    home: function () {
      if (S.screen === 'attract') return;
      S.overlay = { type: 'confirm', msg: '주문 내역이 모두 삭제됩니다.<br>처음 화면으로 돌아갈까요?', yes: 'reset' };
    },
    cat: function (d) { S.cat = d.id; S.page = 0; },
    pg: function (d) {
      var n = D.ITEMS.filter(function (it) { return it.cat === S.cat; }).length;
      var pages = Math.max(1, Math.ceil(n / D.PAGE_SIZE));
      var p = S.page + Number(d.d);
      if (p >= 0 && p < pages) S.page = p;
    },
    item: function (d) {
      var it = item(d.id);
      if (it.soldOut) { toast('품절된 메뉴입니다.', 'error'); return; }
      if (it.combo) { S.overlay = { type: 'wiz', id: it.id, step: 0, sel: {}, error: '' }; return; }
      if (!it.groups.length) {
        addLine({ id: it.id, sel: {}, qty: 1, unit: it.price });
        toast(it.name + ' 1개를 담았습니다.');
        return;
      }
      S.overlay = { type: 'item', id: it.id, sel: defaults(it), qty: 1, error: '' };
    },
    close: function () { S.overlay = null; },
    'io-o': function (d) { var o = S.overlay; o.error = toggleOpt(o.sel, d.g, d.o); },
    mq: function (d) {
      var o = S.overlay, q = o.qty + Number(d.d);
      if (q < 1) return;
      if (q > D.MAX_QTY) { o.error = '최대 ' + D.MAX_QTY + '개까지 주문할 수 있습니다.'; return; }
      o.qty = q; o.error = '';
    },
    'io-add': function () {
      var o = S.overlay, it = item(o.id);
      for (var i = 0; i < it.groups.length; i++) {
        var e = validateGroup(it.groups[i], o.sel);
        if (e) { o.error = e; return; }
      }
      var sel = {};
      it.groups.forEach(function (gid) { if (o.sel[gid] && o.sel[gid].length) sel[gid] = o.sel[gid].slice(); });
      addLine({ id: it.id, sel: sel, qty: o.qty, unit: unitPrice(it, sel) });
      S.overlay = null;
    },
    'wz-combo': function (d) {
      var w = S.overlay, c = item(d.id);
      if (c.soldOut) { w.error = '품절된 콤보입니다. 다른 콤보를 선택해 주세요.'; return; }
      if (c.id !== w.id) { delete w.sel.comboDrink1; delete w.sel.comboDrinks2; }
      w.id = c.id; w.error = '';
    },
    'wz-o': function (d) {
      var w = S.overlay;
      w.error = toggleOpt(w.sel, d.g, d.o);
      if (d.g === 'comboFlavor' && w.sel.comboFlavor[0] !== 'half') delete w.sel.halfFlavors;
    },
    'wz-q': function (d) {
      var w = S.overlay, g = G[d.g], v = w.sel[d.g] || {};
      var cur = v[d.o] || 0, nq = cur + Number(d.d);
      if (nq < 0) return;
      if (Number(d.d) > 0 && selCount(d.g, w.sel) >= g.max) { w.error = '음료는 ' + g.max + '잔까지 선택할 수 있습니다.'; return; }
      v[d.o] = nq;
      if (!nq) delete v[d.o];
      w.sel[d.g] = v; w.error = '';
    },
    'wz-prev': function () {
      var w = S.overlay;
      w.error = '';
      if (w.step === 0) { S.overlay = null; return; }
      w.step--;
    },
    'wz-next': function () {
      var w = S.overlay, it = item(w.id), e = '';
      if (w.step === 1) e = validateGroup('comboPopcornSize', w.sel);
      if (w.step === 2) {
        e = validateGroup('comboFlavor', w.sel);
        if (!e && w.sel.comboFlavor[0] === 'half') e = validateGroup('halfFlavors', w.sel);
      }
      if (w.step === 3) e = validateGroup(it.combo.drinks === 1 ? 'comboDrink1' : 'comboDrinks2', w.sel);
      if (e) { w.error = e; return; }
      w.error = '';
      if (w.step < 4) { w.step++; return; }
      var sel = {};
      groupsOf(it, w.sel).forEach(function (gid) {
        var v = w.sel[gid];
        sel[gid] = Array.isArray(v) ? v.slice() : JSON.parse(JSON.stringify(v));
      });
      addLine({ id: it.id, sel: sel, qty: 1, unit: unitPrice(it, sel) });
      S.overlay = { type: 'upsell' };
    },
    'up-yes': function () {
      addLine({ id: D.UPSELL.id, sel: {}, qty: 1, unit: D.UPSELL.price, upsell: true });
      S.overlay = null;
      toast('나쵸(콤보 특가)를 담았습니다.');
    },
    'up-no': function () { S.overlay = null; },
    inc: function (d) {
      var l = S.cart[Number(d.i)];
      if (l.qty >= D.MAX_QTY) { toast('최대 ' + D.MAX_QTY + '개까지 주문할 수 있습니다.', 'error'); return; }
      l.qty++;
    },
    dec: function (d) { var l = S.cart[Number(d.i)]; if (l.qty > 1) l.qty--; },
    del: function (d) { S.cart.splice(Number(d.i), 1); },
    clear: function () {
      if (!S.cart.length) return;
      S.overlay = { type: 'confirm', msg: '장바구니를 모두 비우시겠습니까?', yes: 'clear' };
    },
    'cf-yes': function () {
      var y = S.overlay.yes;
      S.overlay = null;
      if (y === 'clear') S.cart = [];
      if (y === 'reset') { S.cart = []; S.pickup = null; S.payMethod = null; S.screen = 'attract'; }
    },
    'cf-no': function () { S.overlay = null; },
    checkout: function () {
      if (!S.cart.length) { toast('메뉴를 먼저 담아 주세요.', 'error'); return; }
      S.screen = 'review';
    },
    'back-menu': function () { S.screen = 'menu'; },
    'to-pay': function () { S.screen = 'pay'; S.payMethod = null; },
    'back-review': function () { S.screen = 'review'; S.payMethod = null; },
    paym: function (d) { S.payMethod = d.v; }
  };

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    // Clicks on the dimmed backdrop do nothing; only real controls act.
    S.toast = null;
    var fn = A[el.dataset.act];
    if (fn) fn(el.dataset, el);
    render();
  });

  render();
})();
