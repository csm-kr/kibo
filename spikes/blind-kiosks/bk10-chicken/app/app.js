/* 달빛닭장 셀프 주문 키오스크 (fictional shop) */
(function () {
  'use strict';

  function won(n) {
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s + '원';
  }
  function delta(n) {
    if (n > 0) return '+' + won(n);
    if (n < 0) return won(n);
    return '';
  }

  var CATS = [
    { id: 'chicken', label: '치킨' },
    { id: 'banban', label: '반반' },
    { id: 'side', label: '사이드' },
    { id: 'sauce', label: '소스' },
    { id: 'drink', label: '음료/주류' },
    { id: 'set', label: '세트' }
  ];

  var GROUPS = {
    size: {
      title: '사이즈 선택', type: 'single', required: true, def: ['whole'],
      opts: [
        { id: 'whole', label: '한 마리', d: 0 },
        { id: 'half', label: '반 마리', d: -7000 }
      ]
    },
    bone: {
      title: '뼈/순살 선택', type: 'single', required: true, def: [],
      opts: [
        { id: 'bone', label: '뼈', d: 0 },
        { id: 'boneless', label: '순살', d: 2000 }
      ]
    },
    sauce: {
      title: '소스 추가', type: 'multi', required: false, min: 0, max: 3, firstFree: true,
      note: '첫 번째 소스 무료 · 두 번째부터 1개당 +500원 (최대 3개)',
      opts: [
        { id: 'yangnyeom', label: '양념소스', d: 500 },
        { id: 'honeymustard', label: '허니머스타드', d: 500 },
        { id: 'garlicmayo', label: '갈릭마요', d: 500 },
        { id: 'hotdip', label: '매운디핑소스', d: 500 }
      ]
    },
    flavor2: {
      title: '반반 맛 선택', type: 'multi', required: true, min: 2, max: 2,
      note: '서로 다른 맛 2가지를 선택해 주세요',
      opts: [
        { id: 'fried', label: '후라이드', d: 0 },
        { id: 'yangnyeom', label: '양념', d: 0 },
        { id: 'soygarlic', label: '간장마늘', d: 1000 },
        { id: 'fire', label: '매운불꽃', d: 1000 },
        { id: 'honeybutter', label: '허니버터', d: 1000 },
        { id: 'cheese', label: '치즈시즈닝', d: 2000 },
        { id: 'scallion', label: '파닭', d: 1000, soldOut: true }
      ]
    },
    setFlavor: {
      title: '치킨 맛 선택', type: 'single', required: true, def: [],
      opts: [
        { id: 'fried', label: '후라이드', d: 0 },
        { id: 'yangnyeom', label: '양념', d: 0 },
        { id: 'soygarlic', label: '간장마늘', d: 1000 }
      ]
    },
    spicy: {
      title: '맵기 선택', type: 'single', required: true, def: ['medium'],
      opts: [
        { id: 'mild', label: '순한맛', d: 0 },
        { id: 'medium', label: '보통맛', d: 0 },
        { id: 'hot', label: '매운맛', d: 0 }
      ]
    }
  };

  var UPSIZE_PRICE = 1000;

  var ITEMS = [
    { id: 'c1', cat: 'chicken', name: '바삭 후라이드', price: 18000, emoji: '🍗', bg: '#f6d38b', desc: '겉은 바삭, 속은 촉촉한 기본 후라이드', groups: ['size', 'bone', 'sauce'], badge: 'BEST' },
    { id: 'c2', cat: 'chicken', name: '달빛 양념치킨', price: 19000, emoji: '🍗', bg: '#e9805f', desc: '달콤 매콤한 수제 양념', groups: ['size', 'bone', 'sauce'], badge: 'BEST' },
    { id: 'c3', cat: 'chicken', name: '간장마늘치킨', price: 20000, emoji: '🧄', bg: '#c99a5b', desc: '진간장에 통마늘을 듬뿍', groups: ['size', 'bone', 'sauce'] },
    { id: 'c4', cat: 'chicken', name: '매운불꽃치킨', price: 20000, emoji: '🌶️', bg: '#e0563f', desc: '청양고추로 낸 화끈한 매운맛', groups: ['size', 'bone', 'sauce'] },
    { id: 'c5', cat: 'chicken', name: '허니버터치킨', price: 20000, emoji: '🍯', bg: '#f3c64e', desc: '달콤한 꿀과 고소한 버터', groups: ['size', 'bone', 'sauce'], badge: 'NEW' },
    { id: 'c6', cat: 'chicken', name: '치즈시즈닝치킨', price: 21000, emoji: '🧀', bg: '#f7e07a', desc: '치즈 가루를 듬뿍 뿌린 후라이드', groups: ['size', 'bone', 'sauce'] },
    { id: 'c7', cat: 'chicken', name: '파닭치킨', price: 21000, emoji: '🥬', bg: '#a7d48a', desc: '생파채와 겨자 소스', groups: ['size', 'bone', 'sauce'], soldOut: true },

    { id: 'b1', cat: 'banban', name: '반반치킨', price: 19000, emoji: '🍗', bg: '#f0b46a', desc: '좋아하는 맛 두 가지를 반씩 (한 마리)', groups: ['flavor2', 'bone', 'sauce'], badge: 'BEST' },
    { id: 'b2', cat: 'banban', name: '반반치즈볼', price: 22000, emoji: '🧆', bg: '#f4cf7a', desc: '반반치킨 + 치즈볼 5개', groups: ['flavor2', 'bone', 'sauce'] },
    { id: 'b3', cat: 'banban', name: '반반똥집', price: 23000, emoji: '🍢', bg: '#d99a62', desc: '반반치킨 + 똥집튀김', groups: ['flavor2', 'bone', 'sauce'] },

    { id: 's1', cat: 'side', name: '감자튀김', price: 3500, emoji: '🍟', bg: '#f6d38b', desc: '' },
    { id: 's2', cat: 'side', name: '치즈볼', price: 4000, emoji: '🧆', bg: '#f7e07a', desc: '쫀득한 치즈볼 5개' },
    { id: 's3', cat: 'side', name: '똥집튀김', price: 7000, emoji: '🍢', bg: '#d99a62', desc: '' },
    { id: 's4', cat: 'side', name: '콘샐러드', price: 2000, emoji: '🌽', bg: '#f9e79f', desc: '' },
    { id: 's5', cat: 'side', name: '떡볶이', price: 5500, emoji: '🍜', bg: '#ef7d63', desc: '쌀떡 떡볶이 (1인분)', groups: ['spicy'] },
    { id: 's6', cat: 'side', name: '치킨무 추가', price: 500, emoji: '🥡', bg: '#eef1e6', desc: '' },

    { id: 'd1', cat: 'sauce', name: '양념소스', price: 500, emoji: '🥫', bg: '#e9805f', desc: '' },
    { id: 'd2', cat: 'sauce', name: '허니머스타드', price: 500, emoji: '🥫', bg: '#f3c64e', desc: '' },
    { id: 'd3', cat: 'sauce', name: '갈릭마요', price: 500, emoji: '🥫', bg: '#efe6cf', desc: '' },
    { id: 'd4', cat: 'sauce', name: '매운디핑소스', price: 500, emoji: '🥫', bg: '#e0563f', desc: '' },
    { id: 'd5', cat: 'sauce', name: '치즈디핑소스', price: 800, emoji: '🥫', bg: '#f7e07a', desc: '' },

    { id: 'r1', cat: 'drink', name: '콜라 500ml', price: 2000, emoji: '🥤', bg: '#c9473d', desc: '' },
    { id: 'r2', cat: 'drink', name: '제로콜라 500ml', price: 2000, emoji: '🥤', bg: '#3a3a3a', desc: '' },
    { id: 'r3', cat: 'drink', name: '사이다 500ml', price: 2000, emoji: '🥤', bg: '#7cc47f', desc: '' },
    { id: 'r4', cat: 'drink', name: '콜라 1.25L', price: 3000, emoji: '🍾', bg: '#c9473d', desc: '' },
    { id: 'r5', cat: 'drink', name: '생맥주 500cc', price: 4500, emoji: '🍺', bg: '#f2c14e', desc: '만 19세 이상', adult: true },
    { id: 'r6', cat: 'drink', name: '달빛 하이볼', price: 6000, emoji: '🥃', bg: '#e8b04a', desc: '만 19세 이상', adult: true },

    { id: 't1', cat: 'set', name: '혼닭세트', price: 14500, emoji: '🍱', bg: '#f0b46a', desc: '치킨 반 마리 + 감자튀김 + 콜라 500ml', groups: ['setFlavor', 'bone'] },
    { id: 't2', cat: 'set', name: '치킨 한상세트', price: 23000, emoji: '🍱', bg: '#e9805f', desc: '치킨 한 마리 + 감자튀김 + 콜라 500ml', groups: ['setFlavor', 'bone'], upsell: true, badge: 'BEST' },
    { id: 't3', cat: 'set', name: '반반 한상세트', price: 25000, emoji: '🍱', bg: '#d99a62', desc: '반반치킨 + 치즈볼 5개 + 콜라 500ml', groups: ['flavor2', 'bone'], upsell: true }
  ];

  var PICKUP_SLOTS = ['20분 후', '30분 후', '40분 후', '1시간 후'];

  function itemById(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }
  function optOf(g, id) {
    var os = GROUPS[g].opts;
    for (var i = 0; i < os.length; i++) if (os[i].id === id) return os[i];
    return null;
  }

  /* ---------- pricing ---------- */
  function optionsDelta(item, sel) {
    var t = 0;
    (item.groups || []).forEach(function (g) {
      var G = GROUPS[g];
      (sel[g] || []).forEach(function (id, i) {
        if (G.firstFree && i === 0) return;
        t += optOf(g, id).d;
      });
    });
    return t;
  }
  function unitPrice(line) {
    var item = itemById(line.itemId);
    return item.price + optionsDelta(item, line.sel) + (line.upsize ? UPSIZE_PRICE : 0);
  }
  function cartTotal() {
    return S.cart.reduce(function (s, l) { return s + unitPrice(l) * l.qty; }, 0);
  }
  function cartCount() {
    return S.cart.reduce(function (s, l) { return s + l.qty; }, 0);
  }

  /* ---------- state ---------- */
  var S;
  function reset() {
    S = {
      screen: 'attract', dine: null, pickup: null, pickTmp: null, pickErr: false,
      cat: 'chicken', cart: [], seq: 1, modal: null, payMethod: null
    };
  }
  reset();

  function lineKey(itemId, sel, upsize) {
    var parts = [itemId];
    Object.keys(sel).sort().forEach(function (g) {
      parts.push(g + '=' + sel[g].slice().sort().join(','));
    });
    parts.push(upsize ? 'U' : '-');
    return parts.join('|');
  }

  function addToCart(itemId, sel, upsize, qty) {
    var key = lineKey(itemId, sel, upsize);
    for (var i = 0; i < S.cart.length; i++) {
      if (S.cart[i].key === key) { S.cart[i].qty += qty; return S.cart[i]; }
    }
    var copy = {};
    Object.keys(sel).forEach(function (g) { copy[g] = sel[g].slice(); });
    var line = { id: S.seq++, key: key, itemId: itemId, sel: copy, upsize: !!upsize, qty: qty };
    S.cart.push(line);
    return line;
  }

  function optionSummary(line) {
    var item = itemById(line.itemId);
    var out = [];
    (item.groups || []).forEach(function (g) {
      var G = GROUPS[g];
      var ids = line.sel[g] || [];
      if (!ids.length) return;
      var labels = ids.map(function (id, i) {
        var o = optOf(g, id);
        if (G.firstFree) return o.label + (i === 0 ? '(무료)' : '(' + delta(o.d) + ')');
        return o.label + (o.d ? '(' + delta(o.d) + ')' : '');
      });
      if (g === 'sauce') out.push('소스: ' + labels.join(', '));
      else if (g === 'flavor2') out.push(labels.join(' + '));
      else out.push(labels.join(', '));
    });
    if (line.upsize) out.push('콜라 1.25L 변경(+' + won(UPSIZE_PRICE) + ')');
    return out.join(' / ');
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind === 'err' ? ' err' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 1800);
  }

  /* ---------- render ---------- */
  var root = document.getElementById('kiosk');
  var lastScreen = null;

  function render() {
    if (S.screen !== lastScreen) {
      document.getElementById('toast').className = 'toast';
      lastScreen = S.screen;
    }
    var gridEl = root.querySelector('.grid');
    var listEl = root.querySelector('.cart-list');
    var mbody = root.querySelector('.m-body');
    var keep = {
      grid: gridEl ? gridEl.scrollTop : 0,
      list: listEl ? listEl.scrollTop : 0,
      mbody: mbody ? mbody.scrollTop : 0
    };
    var html = '';
    if (S.screen === 'attract') html = vAttract();
    else if (S.screen === 'dine') html = vDine();
    else if (S.screen === 'pickup') html = vPickup();
    else if (S.screen === 'menu') html = vMenu();
    else if (S.screen === 'review') html = vReview();
    else if (S.screen === 'payment') html = vPayment();
    html += vModal();
    root.innerHTML = html;
    if (S._keepGrid !== false) {
      var g2 = root.querySelector('.grid'); if (g2) g2.scrollTop = keep.grid;
    }
    var l2 = root.querySelector('.cart-list'); if (l2) l2.scrollTop = S._scrollCartEnd ? l2.scrollHeight : keep.list;
    var m2 = root.querySelector('.m-body'); if (m2 && S._keepModalScroll) m2.scrollTop = keep.mbody;
    S._keepGrid = true; S._scrollCartEnd = false; S._keepModalScroll = false;
  }

  function vAttract() {
    return '<div class="scr attract" data-act="start">' +
      '<div class="moon"></div>' +
      '<div class="att-brand"><span class="b1">달빛닭장</span><span class="b2">MOONLIGHT COOP CHICKEN</span></div>' +
      '<div class="att-hero"><div class="hero-dish">🍗</div></div>' +
      '<div class="att-copy">오늘 밤은 바삭하게<br><b>한 마리 18,000원부터</b></div>' +
      '<div class="att-touch">주문하시려면 화면을 터치해 주세요<small>Touch the screen to order</small></div>' +
      '</div>';
  }

  function vDine() {
    return '<div class="scr dine">' +
      '<div class="top-bar"><span class="tb-brand">달빛닭장</span><button class="tb-home" data-act="home">처음으로</button></div>' +
      '<div class="dine-q">어디에서 드시겠어요?<small>식사 방법을 선택해 주세요</small></div>' +
      '<div class="dine-opts">' +
      '<button class="dine-btn" data-act="dine" data-v="eatin"><span class="d-ico">🍽️</span><span class="d-lb">매장 식사</span><span class="d-en">EAT IN</span></button>' +
      '<div class="dine-btn alt" data-act="dine" data-v="pickup"><span class="d-ico">🛍️</span><span class="d-lb">포장 주문</span><span class="d-en">TAKE OUT</span></div>' +
      '</div>' +
      '<div class="dine-note">포장 주문은 다음 화면에서 픽업 시간을 선택합니다.</div>' +
      '</div>';
  }

  function vPickup() {
    var slots = PICKUP_SLOTS.map(function (s) {
      return '<div class="slot' + (S.pickTmp === s ? ' on' : '') + '" data-act="slot" data-v="' + s + '">' + s + '</div>';
    }).join('');
    return '<div class="scr pickup">' +
      '<div class="top-bar"><span class="tb-brand">달빛닭장</span><button class="tb-home" data-act="home">처음으로</button></div>' +
      '<div class="dine-q">픽업 시간을 선택해 주세요<small>선택하신 시간에 맞춰 포장해 드립니다</small></div>' +
      '<div class="slots">' + slots + '</div>' +
      (S.pickErr ? '<div class="err-msg">픽업 시간을 선택해 주세요.</div>' : '<div class="err-msg ghost">&nbsp;</div>') +
      '<div class="pick-actions"><button class="btn ghost" data-act="pickBack">이전</button><button class="btn primary" data-act="pickOk">확인</button></div>' +
      '</div>';
  }

  function dineBadge() {
    if (S.dine === 'eatin') return '<span class="dine-badge">매장 식사</span>';
    return '<span class="dine-badge pk">포장 주문 · ' + S.pickup + ' 픽업</span>';
  }

  function vMenu() {
    var tabs = CATS.map(function (c) {
      return '<div class="tab' + (S.cat === c.id ? ' on' : '') + '" data-act="cat" data-v="' + c.id + '">' + c.label + '</div>';
    }).join('');
    var cards = ITEMS.filter(function (it) { return it.cat === S.cat; }).map(function (it) {
      return '<div class="card' + (it.soldOut ? ' so' : '') + '" data-act="item" data-id="' + it.id + '">' +
        (it.badge ? '<span class="badge ' + it.badge.toLowerCase() + '">' + it.badge + '</span>' : '') +
        (it.adult ? '<span class="badge adult">19</span>' : '') +
        '<div class="thumb" style="background:' + it.bg + '"><span>' + it.emoji + '</span></div>' +
        '<div class="nm">' + it.name + '<span class="pr">' + won(it.price) + '</span></div>' +
        (it.soldOut ? '<div class="so-ov"><span>품절</span></div>' : '') +
        '</div>';
    }).join('');
    var lines = S.cart.map(function (l) {
      var it = itemById(l.itemId);
      var sum = optionSummary(l);
      return '<div class="cl" data-line="' + l.id + '">' +
        '<div class="cl-info"><div class="cl-nm">' + it.name + '</div>' + (sum ? '<div class="cl-op">' + sum + '</div>' : '') + '</div>' +
        '<div class="stepper"><button class="st-btn" data-act="qdec" data-id="' + l.id + '"' + (l.qty <= 1 ? ' disabled' : '') + '>−</button><span class="st-n">' + l.qty + '</span><button class="st-btn" data-act="qinc" data-id="' + l.id + '">+</button></div>' +
        '<div class="cl-pr">' + won(unitPrice(l) * l.qty) + '</div>' +
        '<div class="cl-del" data-act="del" data-id="' + l.id + '" title="삭제">✕</div>' +
        '</div>';
    }).join('');
    if (!lines) lines = '<div class="cart-empty">담긴 메뉴가 없습니다.<br>메뉴를 선택해 주세요.</div>';
    return '<div class="scr menu">' +
      '<div class="m-head"><div class="mh-brand"><span class="mh-moon"></span>달빛닭장</div>' + dineBadge() +
      '<button class="tb-home" data-act="home">처음으로</button></div>' +
      '<div class="tabs">' + tabs + '</div>' +
      '<div class="grid">' + cards + '</div>' +
      '<div class="cart">' +
      '<div class="cart-h"><span class="ch-t">장바구니</span><span class="ch-c">' + cartCount() + '</span>' +
      '<div class="ch-clear" data-act="clear">전체삭제</div></div>' +
      '<div class="cart-list">' + lines + '</div>' +
      '<div class="cart-f"><div class="cf-sum">총 <b>' + cartCount() + '</b>개 <span class="cf-amt">' + won(cartTotal()) + '</span></div>' +
      '<button class="btn order" data-act="order">주문하기</button></div>' +
      '</div>' +
      '</div>';
  }

  function vReview() {
    var rows = S.cart.map(function (l) {
      var it = itemById(l.itemId);
      var sum = optionSummary(l);
      return '<div class="rv-row"><div class="rv-l"><div class="rv-nm">' + it.name + ' <span class="rv-q">x ' + l.qty + '</span></div>' +
        (sum ? '<div class="rv-op">' + sum + '</div>' : '') + '</div>' +
        '<div class="rv-pr">' + won(unitPrice(l) * l.qty) + '</div></div>';
    }).join('');
    var dineTxt = S.dine === 'eatin' ? '매장 식사' : '포장 주문 (픽업: ' + S.pickup + ')';
    return '<div class="scr review">' +
      '<div class="top-bar"><span class="tb-brand">주문 내역 확인</span><button class="tb-home" data-act="home">처음으로</button></div>' +
      '<div class="rv-title">주문하실 메뉴를 확인해 주세요</div>' +
      '<div class="rv-dine">식사 방법 <b>' + dineTxt + '</b></div>' +
      '<div class="rv-list">' + rows + '</div>' +
      '<div class="rv-total"><span>총 결제 금액</span><strong class="rv-amt">' + won(cartTotal()) + '</strong></div>' +
      '<div class="rv-actions"><button class="btn ghost" data-act="toMenu">이전으로</button><button class="btn primary big" data-act="toPay">결제하기</button></div>' +
      '</div>';
  }

  function vPayment() {
    var t = cartTotal();
    var digits = won(t).replace('원', '');
    return '<div class="scr payment">' +
      '<div class="top-bar"><span class="tb-brand">결제</span><button class="tb-home" data-act="home">처음으로</button></div>' +
      '<div class="pay-q">결제 수단을 선택해 주세요</div>' +
      '<div class="pay-amt">결제하실 금액 <strong>' + digits + '</strong><span>원</span></div>' +
      '<div class="pay-methods">' +
      '<div class="pm" data-act="pm" data-v="card"><span class="pm-ico">💳</span><span class="pm-lb">신용·체크카드</span></div>' +
      '<div class="pm" data-act="pm" data-v="easy"><span class="pm-ico">📱</span><span class="pm-lb">간편결제<small>QR · 바코드</small></span></div>' +
      '<div class="pm" data-act="pm" data-v="coupon"><span class="pm-ico">🎟️</span><span class="pm-lb">모바일 상품권</span></div>' +
      '</div>' +
      '<div class="pay-note">현금 결제는 카운터에서 도와드립니다.</div>' +
      '<div class="rv-actions"><button class="btn ghost" data-act="toReview">이전으로</button></div>' +
      '</div>';
  }

  /* ---------- modals ---------- */
  function vModal() {
    var m = S.modal;
    if (!m) return '';
    if (m.type === 'opt') return vOptModal(m);
    if (m.type === 'age') {
      return dlg('<div class="dl-ico">🔞</div><div class="dl-t">성인 확인</div>' +
        '<div class="dl-b">주류는 만 19세 이상 고객만 주문할 수 있습니다.<br>메뉴 수령 시 직원이 신분증을 확인합니다.<br><b>만 19세 이상이십니까?</b></div>',
        '<button class="btn ghost" data-act="ageNo">아니요</button><button class="btn primary" data-act="ageYes">네, 19세 이상입니다</button>');
    }
    if (m.type === 'ageBlocked') {
      return dlg('<div class="dl-ico">⚠️</div><div class="dl-t">주문할 수 없습니다</div>' +
        '<div class="dl-b err">만 19세 미만 고객은 주류를 주문할 수 없습니다.</div>',
        '<button class="btn primary" data-act="close">확인</button>');
    }
    if (m.type === 'upsell') {
      return dlg('<div class="dl-ico">🥤</div><div class="dl-t">콜라 1.25L로 변경하시겠어요? +1,000원</div>' +
        '<div class="dl-b">세트에 포함된 콜라 500ml를 콜라 1.25L로 바꿔 드려요.</div>',
        '<button class="btn ghost" data-act="upNo">아니요</button><button class="btn primary" data-act="upYes">변경할게요</button>');
    }
    if (m.type === 'del') {
      var l = findLine(m.lineId);
      return dlg('<div class="dl-t">메뉴 삭제</div><div class="dl-b"><b>' + itemById(l.itemId).name + '</b><br>선택한 메뉴를 장바구니에서 삭제하시겠습니까?</div>',
        '<button class="btn ghost" data-act="close">취소</button><button class="btn danger" data-act="delYes">삭제</button>');
    }
    if (m.type === 'clear') {
      return dlg('<div class="dl-t">전체 삭제</div><div class="dl-b">장바구니에 담긴 메뉴를 모두 삭제하시겠습니까?</div>',
        '<button class="btn ghost" data-act="close">취소</button><button class="btn danger" data-act="clearYes">전체삭제</button>');
    }
    if (m.type === 'home') {
      return dlg('<div class="dl-t">처음으로</div><div class="dl-b">주문을 취소하고 처음 화면으로 돌아가시겠습니까?<br>담긴 메뉴는 모두 삭제됩니다.</div>',
        '<button class="btn ghost" data-act="close">아니요</button><button class="btn danger" data-act="homeYes">처음으로</button>');
    }
    if (m.type === 'pay') {
      var lbl = { card: '신용·체크카드', easy: '간편결제', coupon: '모바일 상품권' }[m.method];
      var guide = {
        card: '카드를 IC 단말기에 끝까지 꽂아 주세요.',
        easy: 'QR · 바코드를 아래 리더기에 비춰 주세요.',
        coupon: '상품권 바코드를 아래 리더기에 비춰 주세요.'
      }[m.method];
      return dlg('<div class="dl-ico">' + (m.method === 'card' ? '💳' : '📷') + '</div><div class="dl-t">' + lbl + ' 결제</div>' +
        '<div class="dl-b">' + guide + '<br><span class="pay-wait">결제 금액 ' + won(cartTotal()) + '</span><br><small>결제 단말기 응답을 기다리는 중입니다...</small></div>',
        '<button class="btn ghost" data-act="close">결제 취소</button>');
    }
    return '';
  }

  function dlg(body, actions) {
    return '<div class="ov"><div class="dlg">' + body + '<div class="dl-a">' + actions + '</div></div></div>';
  }

  function optPriceText(g, o, sel) {
    var G = GROUPS[g];
    if (G.firstFree) {
      var ids = sel[g] || [];
      var idx = ids.indexOf(o.id);
      if (idx === 0) return '무료';
      if (idx > 0) return delta(o.d);
      return ids.length === 0 ? '무료' : delta(o.d);
    }
    return delta(o.d);
  }

  function modalUnit(m) {
    return m.item.price + optionsDelta(m.item, m.sel);
  }

  function vOptModal(m) {
    var it = m.item;
    var groups = it.groups.map(function (g) {
      var G = GROUPS[g];
      var ids = m.sel[g] || [];
      var opts = G.opts.map(function (o) {
        var on = ids.indexOf(o.id) >= 0;
        var cls = 'opt ' + (G.type === 'multi' ? 'chk' : 'rad') + (on ? ' on' : '') + (o.soldOut ? ' so' : '');
        return '<div class="' + cls + '" data-act="opt" data-g="' + g + '" data-o="' + o.id + '">' +
          '<span class="mk"></span><span class="ol">' + o.label + '</span>' +
          '<span class="op">' + (o.soldOut ? '품절' : optPriceText(g, o, m.sel)) + '</span></div>';
      }).join('');
      var tag = G.required ? '<span class="req">필수</span>' : '<span class="optl">선택</span>';
      var cnt = G.type === 'multi' ? '<span class="g-cnt">' + ids.length + '/' + G.max + '</span>' : '';
      return '<div class="grp' + (m.err[g] ? ' bad' : '') + '" data-g="' + g + '">' +
        '<div class="grp-h"><span class="gt">' + G.title + '</span>' + tag + cnt + '</div>' +
        (G.note ? '<div class="g-note">' + G.note + '</div>' : '') +
        '<div class="opts ' + (G.opts.length > 4 ? 'many' : '') + '">' + opts + '</div>' +
        (m.err[g] ? '<div class="g-err">' + m.err[g] + '</div>' : '') +
        '</div>';
    }).join('');
    var total = modalUnit(m) * m.qty;
    return '<div class="ov"><div class="sheet">' +
      '<div class="m-top"><div class="m-thumb" style="background:' + it.bg + '">' + it.emoji + '</div>' +
      '<div class="m-ti"><div class="m-nm">' + it.name + '</div><div class="m-pr">' + won(it.price) + '</div>' +
      (it.desc ? '<div class="m-ds">' + it.desc + '</div>' : '') + '</div></div>' +
      '<div class="m-body">' + groups +
      '<div class="grp qty-g"><div class="grp-h"><span class="gt">수량</span></div>' +
      '<div class="stepper big"><button class="st-btn" data-act="mdec"' + (m.qty <= 1 ? ' disabled' : '') + '>−</button><span class="st-n">' + m.qty + '</span><button class="st-btn" data-act="minc">+</button></div></div>' +
      '</div>' +
      (m.msg ? '<div class="m-msg">' + m.msg + '</div>' : '') +
      '<div class="m-foot"><div class="mf-sum">합계 <b>' + won(total) + '</b></div>' +
      '<div class="mf-a"><button class="btn ghost" data-act="close">취소</button><button class="btn primary" data-act="addCart">장바구니 담기</button></div></div>' +
      '</div></div>';
  }

  function findLine(id) {
    for (var i = 0; i < S.cart.length; i++) if (S.cart[i].id === id) return S.cart[i];
    return null;
  }

  /* ---------- actions ---------- */
  function openItem(it) {
    if (it.soldOut) { toast('죄송합니다. 품절된 메뉴입니다.', 'err'); return; }
    if (it.adult) { S.modal = { type: 'age', item: it }; render(); return; }
    if (it.groups && it.groups.length) {
      var sel = {};
      it.groups.forEach(function (g) { sel[g] = (GROUPS[g].def || []).slice(); });
      S.modal = { type: 'opt', item: it, sel: sel, qty: 1, err: {}, msg: '' };
      render();
      return;
    }
    addToCart(it.id, {}, false, 1);
    S._scrollCartEnd = true;
    render();
    toast('장바구니에 담았습니다.');
  }

  function toggleOpt(m, g, oid) {
    var G = GROUPS[g];
    var o = optOf(g, oid);
    var ids = m.sel[g] || (m.sel[g] = []);
    m.msg = '';
    if (o.soldOut) { m.err[g] = '품절된 맛입니다. 다른 맛을 선택해 주세요.'; return; }
    if (G.type === 'single') {
      m.sel[g] = [oid];
      delete m.err[g];
      return;
    }
    var i = ids.indexOf(oid);
    if (i >= 0) { ids.splice(i, 1); delete m.err[g]; return; }
    if (ids.length >= G.max) {
      m.err[g] = g === 'flavor2' ? '맛은 2가지까지만 선택할 수 있습니다.' : '소스는 최대 ' + G.max + '개까지 선택할 수 있습니다.';
      return;
    }
    ids.push(oid);
    delete m.err[g];
  }

  function validate(m) {
    var ok = true;
    m.err = {};
    m.item.groups.forEach(function (g) {
      var G = GROUPS[g];
      var n = (m.sel[g] || []).length;
      if (G.type === 'single' && G.required && n !== 1) {
        m.err[g] = '필수 선택 항목입니다.'; ok = false;
      }
      if (G.type === 'multi' && G.required && n < G.min) {
        m.err[g] = g === 'flavor2' ? '반반 맛을 2가지 선택해 주세요. (현재 ' + n + '가지)' : '최소 ' + G.min + '개를 선택해 주세요.';
        ok = false;
      }
    });
    m.msg = ok ? '' : '필수 옵션을 모두 선택해 주세요.';
    return ok;
  }

  var ACT = {
    start: function () { S.screen = 'dine'; },
    home: function () {
      if (S.screen === 'dine' || S.screen === 'pickup' || !S.cart.length) { reset(); S.screen = 'attract'; return; }
      S.modal = { type: 'home' };
    },
    homeYes: function () { reset(); },
    dine: function (el) {
      var v = el.getAttribute('data-v');
      S.dine = v;
      if (v === 'pickup') { S.screen = 'pickup'; S.pickTmp = null; S.pickErr = false; }
      else { S.screen = 'menu'; S.cat = 'chicken'; S._keepGrid = false; }
    },
    slot: function (el) { S.pickTmp = el.getAttribute('data-v'); S.pickErr = false; },
    pickBack: function () { S.screen = 'dine'; S.dine = null; },
    pickOk: function () {
      if (!S.pickTmp) { S.pickErr = true; return; }
      S.pickup = S.pickTmp; S.screen = 'menu'; S.cat = 'chicken'; S._keepGrid = false;
    },
    cat: function (el) { S.cat = el.getAttribute('data-v'); S._keepGrid = false; },
    item: function (el) { openItem(itemById(el.getAttribute('data-id'))); return 'rendered'; },
    opt: function (el) {
      toggleOpt(S.modal, el.getAttribute('data-g'), el.getAttribute('data-o'));
      S._keepModalScroll = true;
    },
    mdec: function () { if (S.modal.qty > 1) S.modal.qty--; S._keepModalScroll = true; },
    minc: function () { S.modal.qty++; S._keepModalScroll = true; },
    addCart: function () {
      var m = S.modal;
      if (!validate(m)) { S._keepModalScroll = true; return; }
      var line = addToCart(m.item.id, m.sel, false, m.qty);
      S._scrollCartEnd = true;
      if (m.item.upsell) {
        S.modal = { type: 'upsell', lineId: line.id, itemId: m.item.id, sel: m.sel, qty: m.qty };
      } else {
        S.modal = null;
        render();
        toast('장바구니에 담았습니다.');
        return 'rendered';
      }
    },
    upYes: function () {
      var m = S.modal;
      var l = findLine(m.lineId);
      if (l) {
        l.qty -= m.qty;
        if (l.qty <= 0) S.cart.splice(S.cart.indexOf(l), 1);
      }
      addToCart(m.itemId, m.sel, true, m.qty);
      S.modal = null;
      S._scrollCartEnd = true;
      render();
      toast('콜라 1.25L로 변경되었습니다.');
      return 'rendered';
    },
    upNo: function () { S.modal = null; },
    ageYes: function () {
      var it = S.modal.item;
      S.modal = null;
      addToCart(it.id, {}, false, 1);
      S._scrollCartEnd = true;
      render();
      toast('장바구니에 담았습니다.');
      return 'rendered';
    },
    ageNo: function () { S.modal = { type: 'ageBlocked' }; },
    close: function () { S.modal = null; },
    qinc: function (el) { var l = findLine(+el.getAttribute('data-id')); l.qty++; },
    qdec: function (el) { var l = findLine(+el.getAttribute('data-id')); if (l.qty > 1) l.qty--; },
    del: function (el) { S.modal = { type: 'del', lineId: +el.getAttribute('data-id') }; },
    delYes: function () {
      var l = findLine(S.modal.lineId);
      if (l) S.cart.splice(S.cart.indexOf(l), 1);
      S.modal = null;
    },
    clear: function () {
      if (!S.cart.length) return;
      S.modal = { type: 'clear' };
    },
    clearYes: function () { S.cart = []; S.modal = null; },
    order: function () {
      if (!S.cart.length) { toast('메뉴를 먼저 선택해 주세요.', 'err'); return 'rendered'; }
      S.screen = 'review';
    },
    toMenu: function () { S.screen = 'menu'; },
    toPay: function () { S.screen = 'payment'; },
    toReview: function () { S.screen = 'review'; },
    pm: function (el) { S.modal = { type: 'pay', method: el.getAttribute('data-v') }; }
  };

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var a = el.getAttribute('data-act');
    if (!ACT[a]) return;
    var r = ACT[a](el);
    if (r !== 'rendered') render();
  });

  render();
})();
