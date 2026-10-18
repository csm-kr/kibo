/* 보리별 분식 셀프 주문 키오스크 */
(function () {
  'use strict';

  var M = window.BORI_MENU;
  var root = document.getElementById('kiosk');
  var $screen = document.getElementById('screen');
  var $modal = document.getElementById('modal-root');
  var $toast = document.getElementById('toast');
  var MAX_QTY = 9;

  var S = {
    screen: 'attract',
    dine: null,
    cat: 'tteok',
    cart: [],
    seq: 0,
    modal: null,
    points: null,
    payMethod: null
  };

  /* ---------- helpers ---------- */
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function plus(n) { return n > 0 ? '+' + won(n) : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function itemById(id) { for (var i = 0; i < M.items.length; i++) if (M.items[i].id === id) return M.items[i]; return null; }
  function opt(gid, oid) { var g = M.groups[gid]; for (var i = 0; i < g.options.length; i++) if (g.options[i].id === oid) return g.options[i]; return null; }
  function hm(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function onSale(it) {
    if (!it.timeLimited) return true;
    var n = M.clock.minutes;
    return n >= hm(it.timeLimited.from) && n < hm(it.timeLimited.to);
  }
  function salePrice(it) { return it.promo ? it.promo.price : it.price; }
  function discountPerUnit(it) { return it.promo ? it.price - it.promo.price : 0; }
  function dineText() { return S.dine === 'eatin' ? '매장 식사' : '포장 주문'; }

  function thumb(it, cls) {
    var img = it.id ? ' data-img="' + it.id + '"' : '';
    if (it.roll) return '<div class="thumb ' + (cls || '') + ' t-gimbap"' + img + '><div class="roll r-' + it.roll + '"><i></i><i></i><i></i><i></i></div></div>';
    return '<div class="thumb ' + (cls || '') + ' t-' + it.cat + '"' + img + '><span class="emo">' + it.icon + '</span></div>';
  }

  /* selections: single/multi -> [optionId,...], quantity -> {optionId: n} */
  function normSel(groups, sel) {
    var out = {};
    groups.forEach(function (gid) {
      var g = M.groups[gid], v = sel[gid];
      if (!v) return;
      if (g.type === 'quantity') {
        var q = {}, any = false;
        g.options.forEach(function (o) { if (v[o.id] > 0) { q[o.id] = v[o.id]; any = true; } });
        if (any) out[gid] = q;
      } else {
        var arr = g.options.filter(function (o) { return v.indexOf(o.id) >= 0; }).map(function (o) { return o.id; });
        if (arr.length) out[gid] = arr;
      }
    });
    return out;
  }

  function unitPrice(it, sel) {
    var p = salePrice(it);
    it.groups.forEach(function (gid) {
      var g = M.groups[gid], v = sel[gid];
      if (!v) return;
      if (g.type === 'quantity') g.options.forEach(function (o) { p += (v[o.id] || 0) * o.price; });
      else v.forEach(function (oid) { p += opt(gid, oid).price; });
    });
    return p;
  }

  function optSummary(it, sel) {
    if (it.steps) {
      return it.steps.map(function (st) {
        var main = sel[st.groups[0]] ? opt(st.groups[0], sel[st.groups[0]][0]).label : '';
        var sub = st.groups.slice(1).filter(function (g) { return sel[g]; }).map(function (g) { return opt(g, sel[g][0]).label; });
        return main + (sub.length ? '(' + sub.join(', ') + ')' : '');
      }).join(' · ');
    }
    var parts = [];
    it.groups.forEach(function (gid) {
      var g = M.groups[gid], v = sel[gid];
      if (!v) return;
      if (g.type === 'quantity') g.options.forEach(function (o) { if (v[o.id]) parts.push(o.label + ' ×' + v[o.id]); });
      else v.forEach(function (oid) { parts.push(opt(gid, oid).label); });
    });
    return parts.join(' / ');
  }

  function cartCount() { return S.cart.reduce(function (a, l) { return a + l.qty; }, 0); }
  function cartTotal() { return S.cart.reduce(function (a, l) { return a + l.unit * l.qty; }, 0); }
  function cartDiscount() { return S.cart.reduce(function (a, l) { return a + discountPerUnit(itemById(l.itemId)) * l.qty; }, 0); }

  var toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.className = 'show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.className = ''; }, 1800);
  }

  function addToCart(it, sel, qty) {
    var key = it.id + '|' + JSON.stringify(sel);
    var unit = unitPrice(it, sel);
    for (var i = 0; i < S.cart.length; i++) {
      if (S.cart[i].key === key) {
        var n = S.cart[i].qty + qty;
        if (n > MAX_QTY) { S.cart[i].qty = MAX_QTY; toast('한 메뉴는 최대 ' + MAX_QTY + '개까지 담을 수 있어요.'); }
        else { S.cart[i].qty = n; toast('장바구니에 담았어요.'); }
        return;
      }
    }
    S.seq += 1;
    S.cart.push({ lid: 'L' + S.seq, key: key, itemId: it.id, sel: sel, qty: qty, unit: unit });
    toast('장바구니에 담았어요.');
  }

  function resetAll() {
    S.screen = 'attract'; S.dine = null; S.cat = 'tteok'; S.cart = []; S.modal = null;
    S.points = null; S.payMethod = null;
  }

  /* ---------- screens ---------- */
  function vAttract() {
    var promoItem = M.items.filter(function (i) { return i.promo; })[0];
    return '' +
      '<div class="attract" data-act="start">' +
        '<div class="at-clock">' + M.clock.label + '</div>' +
        '<div class="at-logo"><div class="logo-star">★</div></div>' +
        '<div class="at-name">' + M.store.name + '</div>' +
        '<div class="at-tag">' + M.store.tagline + '</div>' +
        '<div class="at-plates"><span>🥘</span><span class="at-roll">' + thumb(itemById('g1')) + '</span><span>🍜</span><span>🍤</span></div>' +
        '<div class="at-promo"><b>오늘의 할인</b> ' + promoItem.name + ' <s>' + won(promoItem.price) + '</s> ' + won(promoItem.promo.price) + '</div>' +
        '<div class="at-touch">화면을 터치하여 주문을 시작하세요</div>' +
        '<div class="at-foot">현금 결제는 카운터에서 도와드려요</div>' +
      '</div>';
  }

  function vDine() {
    return '' +
      '<div class="dine">' +
        '<div class="dine-top"><button class="ghost" data-act="toAttract">‹ 처음으로</button><span class="dine-brand">' + M.store.name + '</span><span class="clock">' + M.clock.label + '</span></div>' +
        '<h1 class="dine-q">어디에서 드시겠어요?</h1>' +
        '<p class="dine-sub">매장 식사와 포장 가격은 같아요</p>' +
        '<div class="dine-opts">' +
          '<div class="dine-card eat" data-act="dine" data-v="eatin"><div class="dc-ico">🍽️</div><div class="dc-label">매장에서 먹어요</div><div class="dc-sub">드시고 가실 때</div></div>' +
          '<div class="dine-card take" data-act="dine" data-v="takeout"><div class="dc-ico">🛍️</div><div class="dc-label">포장해 갈게요</div><div class="dc-sub">가져가실 때</div></div>' +
        '</div>' +
      '</div>';
  }

  function vCard(it) {
    var cls = 'card' + (it.soldOut ? ' soldout' : '') + (!onSale(it) ? ' offsale' : '');
    var badges = '';
    if (it.promo) badges += '<span class="badge sale">할인</span>';
    if (it.best) badges += '<span class="badge best">BEST</span>';
    if (it.timeLimited) badges += '<span class="badge limited">' + it.timeLimited.label + ' ' + it.timeLimited.from + '~' + it.timeLimited.to + '</span>';
    var price = it.promo ? '<s>' + won(it.price) + '</s>' + won(it.promo.price) : won(it.price);
    return '<div class="' + cls + '" data-act="item" data-id="' + it.id + '">' +
      thumb(it) +
      (badges ? '<div class="badges">' + badges + '</div>' : '') +
      '<div class="nm">' + esc(it.name) + '</div><div class="pr">' + price + '</div>' +
      (it.soldOut ? '<div class="so"><span>품절</span></div>' : '') +
      (!onSale(it) ? '<div class="so"><span>판매 시간 아님</span></div>' : '') +
    '</div>';
  }

  function vCart() {
    var lines = S.cart.map(function (l) {
      var it = itemById(l.itemId), os = optSummary(it, l.sel);
      return '<div class="ln" data-lid="' + l.lid + '">' +
        '<div class="ln-info"><div class="ln-name">' + esc(it.name) + '</div>' + (os ? '<div class="ln-opt">' + esc(os) + '</div>' : '') + '</div>' +
        '<div class="stepper sm"><button class="st-btn" data-act="dec" data-lid="' + l.lid + '"' + (l.qty <= 1 ? ' disabled' : '') + '>−</button><span class="q">' + l.qty + '</span><button class="st-btn" data-act="inc" data-lid="' + l.lid + '">+</button></div>' +
        '<div class="ln-price">' + won(l.unit * l.qty) + '</div>' +
        '<span class="del" data-act="del" data-lid="' + l.lid + '" title="삭제">✕</span>' +
      '</div>';
    }).join('');
    return '' +
      '<section class="cart">' +
        '<div class="cart-head"><span class="ch-title">장바구니</span><span class="ch-count">' + cartCount() + '</span>' +
          (S.cart.length ? '<span class="clear" data-act="clear">전체 삭제</span>' : '') + '</div>' +
        '<div class="cart-list">' + (lines || '<div class="cart-empty">드시고 싶은 메뉴를 골라 주세요</div>') + '</div>' +
        '<div class="cart-foot"><div class="sum"><span>총 ' + cartCount() + '개</span><b>' + won(cartTotal()) + '</b></div>' +
          '<button class="cta" data-act="toReview">주문 확인하기</button></div>' +
      '</section>';
  }

  function vMenu() {
    var promoItem = M.items.filter(function (i) { return i.promo; })[0];
    var tabs = M.categories.map(function (c) {
      return '<button class="tab' + (c.id === S.cat ? ' on' : '') + '" data-act="cat" data-cat="' + c.id + '">' + c.label + '</button>';
    }).join('');
    var cards = M.items.filter(function (i) { return i.cat === S.cat; }).map(vCard).join('');
    return '' +
      '<div class="menu">' +
        '<header class="topbar">' +
          '<div class="brand-sm"><span class="logo-dot">★</span>' + M.store.name + '</div>' +
          '<div class="dine-chip">' + dineText() + '</div>' +
          '<div class="clock">' + M.clock.label + '</div>' +
          '<button class="home-btn" data-act="home">처음으로</button>' +
        '</header>' +
        '<div class="promo-banner" data-act="promo" data-id="' + promoItem.id + '">' +
          '<span class="pb-tag">오늘의 할인</span>' +
          '<span class="pb-text">' + promoItem.name + ' <s>' + won(promoItem.price) + '</s> → <b>' + won(promoItem.promo.price) + '</b></span>' +
          '<span class="pb-go">바로 주문 ›</span>' +
        '</div>' +
        '<nav class="tabs">' + tabs + '</nav>' +
        '<div class="grid">' + cards + '</div>' +
        vCart() +
      '</div>';
  }

  function vReview() {
    var rows = S.cart.map(function (l, i) {
      var it = itemById(l.itemId), os = optSummary(it, l.sel);
      return '<div class="rv-row"><div class="rv-no">' + (i + 1) + '</div>' +
        '<div class="rv-info"><div class="rv-name">' + esc(it.name) + '</div>' + (os ? '<div class="rv-opt">' + esc(os) + '</div>' : '') +
        '<div class="rv-unit">' + won(l.unit) + ' × ' + l.qty + '</div></div>' +
        '<div class="rv-price">' + won(l.unit * l.qty) + '</div></div>';
    }).join('');
    var disc = cartDiscount();
    return '' +
      '<div class="review">' +
        '<header class="sub-top"><button class="ghost" data-act="backMenu">‹ 메뉴 더 담기</button><span class="st-title">주문 내역 확인</span><span class="clock">' + M.clock.label + '</span></header>' +
        '<div class="rv-dine"><span>식사 방법</span><b>' + dineText() + '</b></div>' +
        '<div class="rv-list">' + rows + '</div>' +
        '<div class="rv-sum">' +
          '<div class="rs-row"><span>주문 금액</span><span>' + won(cartTotal() + disc) + '</span></div>' +
          '<div class="rs-row disc"><span>할인 금액</span><span>' + (disc ? '-' + won(disc) : '0원') + '</span></div>' +
          '<div class="rs-row total"><span>총 결제 금액</span><b class="rs-total">' + won(cartTotal()) + '</b></div>' +
        '</div>' +
        '<div class="rv-btns"><button class="btn-line" data-act="backMenu">이전으로</button><button class="cta" data-act="order">주문하기</button></div>' +
      '</div>';
  }

  function vPay() {
    var total = cartTotal();
    var pt = S.points ? '<div class="pay-pt">적립 예정 ' + won(Math.floor(total / 100)).replace('원', 'P') + ' · 010-****-' + S.points.slice(7) + '</div>' : '';
    var methods = [
      { id: 'card', ico: '💳', label: '신용/체크카드', sub: 'IC 카드를 꽂아 주세요' },
      { id: 'easy', ico: '📱', label: '간편결제', sub: 'QR · 바코드' },
      { id: 'gift', ico: '🎁', label: '모바일 상품권', sub: '바코드를 스캔해 주세요' }
    ];
    var mHtml = methods.map(function (m) {
      return '<div class="method' + (S.payMethod === m.id ? ' on' : '') + '" data-act="method" data-m="' + m.id + '"><div class="m-ico">' + m.ico + '</div><div class="m-label">' + m.label + '</div><div class="m-sub">' + m.sub + '</div></div>';
    }).join('');
    var notice = '';
    if (S.payMethod) {
      var msg = { card: '카드를 단말기 투입구에 꽂아 주세요.', easy: '결제 바코드를 아래 스캐너에 비춰 주세요.', gift: '상품권 바코드를 아래 스캐너에 비춰 주세요.' }[S.payMethod];
      notice = '<div class="pay-notice"><div class="pn-msg">' + msg + '</div><div class="pn-demo">본 키오스크는 시연용으로 실제 결제는 진행되지 않습니다.</div></div>';
    }
    return '' +
      '<div class="pay">' +
        '<header class="sub-top"><button class="ghost" data-act="backReview">‹ 이전으로</button><span class="st-title">결제 수단 선택</span><span class="clock">' + M.clock.label + '</span></header>' +
        '<div class="pay-box"><div class="pay-label">결제하실 금액</div><div class="pay-amount">' + won(total) + '</div>' +
          '<div class="pay-meta">' + dineText() + ' · 총 ' + cartCount() + '개</div>' + pt + '</div>' +
        '<div class="pay-q">결제 수단을 선택해 주세요</div>' +
        '<div class="methods">' + mHtml + '</div>' +
        notice +
        '<div class="pay-btns"><button class="btn-line" data-act="home">주문 취소</button></div>' +
      '</div>';
  }

  /* ---------- modals ---------- */
  function vChips(gid, sel, errGroup) {
    var g = M.groups[gid], v = sel[gid] || [];
    var hint = g.type === 'multi' && g.max ? '<span class="og-hint">최대 ' + g.max + '개</span>' : '';
    var head = '<div class="og-head"><span class="og-title">' + g.title + '</span>' +
      (g.required ? '<span class="req">필수</span>' : '<span class="optl">선택</span>') + hint + '</div>';
    var body;
    if (g.type === 'quantity') {
      var q = v || {};
      body = g.options.map(function (o) {
        var n = q[o.id] || 0;
        return '<div class="qrow"><div class="qr-l"><span class="ol">' + o.label + '</span><span class="od">' + plus(o.price) + '</span>' +
          (g.note ? '<div class="qr-note">' + g.note + '</div>' : '') + '</div>' +
          '<div class="stepper"><button class="st-btn" data-act="qdec" data-g="' + gid + '" data-o="' + o.id + '"' + (n <= 0 ? ' disabled' : '') + '>−</button>' +
          '<span class="q">' + n + '</span><button class="st-btn" data-act="qinc" data-g="' + gid + '" data-o="' + o.id + '">+</button></div></div>';
      }).join('');
    } else if (g.big) {
      body = '<div class="bigs">' + g.options.map(function (o) {
        var on = v.indexOf(o.id) >= 0;
        var pic = o.roll ? thumb({ roll: o.roll }, 'mid') : '<div class="thumb mid"><span class="emo">' + o.icon + '</span></div>';
        return '<div class="bigopt' + (on ? ' on' : '') + '" data-act="opt" data-g="' + gid + '" data-o="' + o.id + '">' + pic +
          '<div class="bo-l">' + o.label + '</div><div class="bo-p">' + (o.price ? plus(o.price) : '추가금 없음') + '</div></div>';
      }).join('') + '</div>';
    } else {
      body = '<div class="chips">' + g.options.map(function (o) {
        var on = v.indexOf(o.id) >= 0;
        var pep = o.pep ? '<span class="pep">' + new Array(o.pep + 1).join('🌶') + '</span>' : '';
        return '<div class="chip' + (on ? ' on' : '') + (g.type === 'multi' ? ' multi' : '') + '" data-act="opt" data-g="' + gid + '" data-o="' + o.id + '">' +
          '<span class="ol">' + o.label + '</span>' + (o.price ? '<span class="od">' + plus(o.price) + '</span>' : '') + pep + '</div>';
      }).join('') + '</div>';
    }
    return '<section class="og' + (errGroup === gid ? ' bad' : '') + '" data-g="' + gid + '">' + head + body + '</section>';
  }

  function vItemModal(m) {
    var it = itemById(m.id);
    var sel = normSel(it.groups, m.sel);
    var unit = unitPrice(it, sel);
    var price = it.promo ? '<s>' + won(it.price) + '</s> <b>' + won(it.promo.price) + '</b> <span class="badge sale">오늘의 할인</span>' : '<b>' + won(it.price) + '</b>';
    var groups = it.groups.map(function (gid) { return vChips(gid, m.sel, m.errGroup); }).join('');
    return '' +
      '<div class="dim"><div class="sheet">' +
        '<div class="sh-head">' + thumb(it, 'big') +
          '<div class="sh-info"><div class="sh-name">' + esc(it.name) + '</div><div class="sh-desc">' + esc(it.desc) + '</div><div class="sh-price">' + price + '</div></div>' +
          '<span class="x" data-act="close">✕</span></div>' +
        '<div class="sh-body">' + (groups || '<div class="no-opt">선택할 옵션이 없는 메뉴예요.</div>') + '</div>' +
        (m.err ? '<div class="err" role="alert">' + m.err + '</div>' : '') +
        '<div class="sh-foot">' +
          '<div class="qty-wrap"><span class="qw-l">수량</span><div class="stepper"><button class="st-btn" data-act="mdec"' + (m.qty <= 1 ? ' disabled' : '') + '>−</button><span class="q">' + m.qty + '</span><button class="st-btn" data-act="minc">+</button></div></div>' +
          '<button class="cta add" data-act="addItem">' + won(unit * m.qty) + ' 담기</button>' +
        '</div>' +
      '</div></div>';
  }

  function vSetModal(m) {
    var it = itemById(m.id);
    var step = it.steps[m.step];
    var sel = normSel(it.groups, m.sel);
    var unit = unitPrice(it, sel);
    var steps = it.steps.map(function (st, i) {
      return '<div class="stp' + (i === m.step ? ' on' : '') + (i < m.step ? ' done' : '') + '"><span class="stp-n">' + (i + 1) + '</span>' + st.label + '</div>';
    }).join('<span class="stp-arrow">›</span>');
    var groups = step.groups.map(function (gid) { return vChips(gid, m.sel, m.errGroup); }).join('');
    var last = m.step === it.steps.length - 1;
    var summary = '';
    if (last) {
      summary = '<div class="set-sum"><div class="ss-t">선택한 구성</div><div class="ss-v">' + esc(optSummary(it, sel)) + '</div></div>';
    }
    return '' +
      '<div class="dim"><div class="sheet set">' +
        '<div class="sh-head">' + thumb(it, 'big') +
          '<div class="sh-info"><div class="sh-name">' + esc(it.name) + '</div><div class="sh-desc">' + esc(it.desc) + '</div><div class="sh-price"><b>' + won(it.price) + '</b></div></div>' +
          '<span class="x" data-act="close">✕</span></div>' +
        '<div class="steps">' + steps + '</div>' +
        '<div class="step-q">' + (m.step + 1) + '/' + it.steps.length + ' ' + step.q + '</div>' +
        '<div class="sh-body">' + groups + summary + '</div>' +
        (m.err ? '<div class="err" role="alert">' + m.err + '</div>' : '') +
        '<div class="sh-foot">' +
          (m.step > 0 ? '<button class="btn-line" data-act="setPrev">이전</button>' : '<button class="btn-line" data-act="close">취소</button>') +
          (last ? '<button class="cta add" data-act="setAdd">세트 담기 ' + won(unit) + '</button>' : '<button class="cta" data-act="setNext">다음</button>') +
        '</div>' +
      '</div></div>';
  }

  function vConfirm(m) {
    return '<div class="dim"><div class="pop">' +
      '<div class="pop-title">' + m.title + '</div>' +
      (m.sub ? '<div class="pop-sub">' + m.sub + '</div>' : '') +
      '<div class="pop-btns"><button class="btn-line" data-act="cfNo">' + (m.no || '취소') + '</button><button class="cta" data-act="cfYes">' + m.yes + '</button></div>' +
    '</div></div>';
  }

  function vNotice(m) {
    return '<div class="dim"><div class="pop">' +
      '<div class="pop-ico warn">!</div>' +
      '<div class="pop-title">' + m.title + '</div>' +
      (m.sub ? '<div class="pop-sub">' + m.sub + '</div>' : '') +
      '<div class="pop-btns"><button class="cta" data-act="close">확인</button></div>' +
    '</div></div>';
  }

  function vPoints() {
    return '<div class="dim"><div class="pop">' +
      '<div class="pop-ico pt">P</div>' +
      '<div class="pop-title">포인트 적립하시겠어요?</div>' +
      '<div class="pop-sub">결제 금액의 1%를 보리별 포인트로 적립해 드려요.<br>적립은 결제 금액에 영향을 주지 않아요.</div>' +
      '<div class="pop-btns"><button class="btn-line" data-act="ptNo">적립 안 할게요</button><button class="cta" data-act="ptYes">적립할게요</button></div>' +
    '</div></div>';
  }

  function vPhone(m) {
    var p = (m.digits + '________').slice(0, 8);
    var shown = '010-' + p.slice(0, 4) + '-' + p.slice(4);
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '전체삭제', '0', '←'];
    return '<div class="dim"><div class="pop phone">' +
      '<div class="pop-title">휴대폰 번호를 입력해 주세요</div>' +
      '<div class="ph-disp">' + shown + '</div>' +
      (m.err ? '<div class="err" role="alert">' + m.err + '</div>' : '') +
      '<div class="pad">' + keys.map(function (k) {
        return '<div class="key' + (k.length > 1 ? ' fn' : '') + '" data-act="key" data-k="' + k + '">' + k + '</div>';
      }).join('') + '</div>' +
      '<div class="pop-btns"><button class="btn-line" data-act="phCancel">취소</button><button class="cta" data-act="phOk">확인</button></div>' +
    '</div></div>';
  }

  /* ---------- render ---------- */
  function render() {
    var v = { attract: vAttract, dine: vDine, menu: vMenu, review: vReview, pay: vPay }[S.screen]();
    $screen.innerHTML = v;
    var m = S.modal, mh = '';
    if (m) {
      if (m.type === 'item') mh = vItemModal(m);
      else if (m.type === 'set') mh = vSetModal(m);
      else if (m.type === 'confirm') mh = vConfirm(m);
      else if (m.type === 'notice') mh = vNotice(m);
      else if (m.type === 'points') mh = vPoints();
      else if (m.type === 'phone') mh = vPhone(m);
    }
    $modal.innerHTML = mh;
  }

  function openItem(id) {
    var it = itemById(id);
    if (it.soldOut) { toast('품절된 메뉴예요. 다른 메뉴를 골라 주세요.'); return; }
    if (!onSale(it)) { toast(it.timeLimited.label + ' 메뉴는 ' + it.timeLimited.from + '~' + it.timeLimited.to + '에만 주문할 수 있어요.'); return; }
    if (it.steps) S.modal = { type: 'set', id: id, step: 0, sel: {}, err: null, errGroup: null };
    else S.modal = { type: 'item', id: id, sel: {}, qty: 1, err: null, errGroup: null };
    render();
  }

  function firstMissing(groups, sel) {
    for (var i = 0; i < groups.length; i++) {
      var g = M.groups[groups[i]], v = sel[groups[i]];
      if (g.required && (!v || !v.length)) return groups[i];
    }
    return null;
  }

  function findLine(lid) { for (var i = 0; i < S.cart.length; i++) if (S.cart[i].lid === lid) return S.cart[i]; return null; }

  function handle(act, el) {
    var m = S.modal;
    $toast.className = '';
    switch (act) {
      case 'start': S.screen = 'dine'; break;
      case 'toAttract': resetAll(); break;
      case 'dine': S.dine = el.getAttribute('data-v'); S.screen = 'menu'; S.cat = 'tteok'; break;
      case 'cat': S.cat = el.getAttribute('data-cat'); break;
      case 'item': openItem(el.getAttribute('data-id')); return;
      case 'promo': {
        var pid = el.getAttribute('data-id');
        S.cat = itemById(pid).cat;
        openItem(pid); return;
      }
      case 'close': S.modal = null; break;

      case 'opt': {
        var gid = el.getAttribute('data-g'), oid = el.getAttribute('data-o'), g = M.groups[gid];
        var cur = m.sel[gid] || [];
        m.err = null; m.errGroup = null;
        if (g.type === 'single') m.sel[gid] = [oid];
        else if (cur.indexOf(oid) >= 0) m.sel[gid] = cur.filter(function (x) { return x !== oid; });
        else if (g.max && cur.length >= g.max) { m.err = g.maxMsg || ('최대 ' + g.max + '개까지 선택할 수 있어요.'); m.errGroup = gid; }
        else m.sel[gid] = cur.concat([oid]);
        break;
      }
      case 'qinc': case 'qdec': {
        var qg = el.getAttribute('data-g'), qo = el.getAttribute('data-o'), qgrp = M.groups[qg];
        var map = m.sel[qg] || {};
        var n = map[qo] || 0;
        m.err = null; m.errGroup = null;
        if (act === 'qinc') {
          var cap = opt(qg, qo).maxQty || qgrp.max;
          if (n >= cap) { m.err = qgrp.maxMsg; m.errGroup = qg; }
          else n += 1;
        } else if (n > 0) n -= 1;
        map[qo] = n; m.sel[qg] = map;
        break;
      }
      case 'minc':
        if (m.qty >= MAX_QTY) { m.err = '한 번에 최대 ' + MAX_QTY + '개까지 담을 수 있어요.'; m.errGroup = null; }
        else { m.qty += 1; m.err = null; }
        break;
      case 'mdec': if (m.qty > 1) m.qty -= 1; m.err = null; break;
      case 'addItem': {
        var it = itemById(m.id);
        var miss = firstMissing(it.groups, m.sel);
        if (miss) { m.err = '필수 옵션을 선택해 주세요. (' + M.groups[miss].title + ')'; m.errGroup = miss; break; }
        addToCart(it, normSel(it.groups, m.sel), m.qty);
        S.modal = null;
        break;
      }
      case 'setNext': {
        var sit = itemById(m.id);
        var smiss = firstMissing(sit.steps[m.step].groups, m.sel);
        if (smiss) { m.err = '필수 옵션을 선택해 주세요. (' + M.groups[smiss].title + ')'; m.errGroup = smiss; break; }
        m.step += 1; m.err = null; m.errGroup = null;
        break;
      }
      case 'setPrev': m.step -= 1; m.err = null; m.errGroup = null; break;
      case 'setAdd': {
        var st = itemById(m.id);
        var amiss = firstMissing(st.steps[m.step].groups, m.sel) || firstMissing(st.groups, m.sel);
        if (amiss) { m.err = '필수 옵션을 선택해 주세요. (' + M.groups[amiss].title + ')'; m.errGroup = amiss; break; }
        addToCart(st, normSel(st.groups, m.sel), 1);
        S.modal = null;
        break;
      }

      case 'inc': {
        var li = findLine(el.getAttribute('data-lid'));
        if (li.qty >= MAX_QTY) { toast('한 메뉴는 최대 ' + MAX_QTY + '개까지 담을 수 있어요.'); return; }
        li.qty += 1; break;
      }
      case 'dec': { var ld = findLine(el.getAttribute('data-lid')); if (ld.qty > 1) ld.qty -= 1; break; }
      case 'del': {
        var lx = findLine(el.getAttribute('data-lid'));
        S.modal = { type: 'confirm', title: '선택한 메뉴를 삭제할까요?', sub: esc(itemById(lx.itemId).name) + ' ' + lx.qty + '개', yes: '삭제', then: 'del', lid: lx.lid };
        break;
      }
      case 'clear':
        S.modal = { type: 'confirm', title: '장바구니를 모두 비울까요?', sub: '담은 메뉴 ' + cartCount() + '개가 모두 삭제돼요.', yes: '모두 삭제', then: 'clear' };
        break;
      case 'home':
        if (!S.cart.length) { resetAll(); break; }
        S.modal = { type: 'confirm', title: '주문을 취소하고 처음으로 갈까요?', sub: '담은 메뉴가 모두 사라져요.', yes: '처음으로', no: '계속 주문', then: 'home' };
        break;
      case 'cfNo': S.modal = null; break;
      case 'cfYes': {
        var then = m.then;
        S.modal = null;
        if (then === 'del') S.cart = S.cart.filter(function (l) { return l.lid !== m.lid; });
        else if (then === 'clear') S.cart = [];
        else if (then === 'home') resetAll();
        break;
      }

      case 'toReview':
        if (!S.cart.length) { S.modal = { type: 'notice', title: '장바구니가 비어 있어요', sub: '메뉴를 먼저 담아 주세요.' }; break; }
        S.screen = 'review'; break;
      case 'backMenu': S.screen = 'menu'; break;
      case 'order': S.points = null; S.modal = { type: 'points' }; break;
      case 'ptNo': S.modal = null; S.points = null; S.payMethod = null; S.screen = 'pay'; break;
      case 'ptYes': S.modal = { type: 'phone', digits: '', err: null }; break;
      case 'key': {
        var k = el.getAttribute('data-k');
        m.err = null;
        if (k === '←') m.digits = m.digits.slice(0, -1);
        else if (k === '전체삭제') m.digits = '';
        else if (m.digits.length < 8) m.digits += k;
        break;
      }
      case 'phCancel': S.modal = { type: 'points' }; break;
      case 'phOk':
        if (m.digits.length !== 8) { m.err = '휴대폰 번호 11자리를 정확히 입력해 주세요.'; break; }
        S.points = '010' + m.digits; S.modal = null; S.payMethod = null; S.screen = 'pay';
        break;
      case 'backReview': S.screen = 'review'; S.payMethod = null; break;
      case 'method': S.payMethod = el.getAttribute('data-m'); break;
      default: return;
    }
    render();
  }

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    handle(el.getAttribute('data-act'), el);
  });

  render();
})();
