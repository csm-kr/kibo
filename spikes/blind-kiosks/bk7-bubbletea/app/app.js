/* 펄린당 self-order kiosk — front-end (static build) */
(function () {
  'use strict';
  var M = window.MENU;
  var root = document.getElementById('kiosk');

  function won(n) {
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s + '원';
  }

  var T = {
    ko: {
      tagline: '대만식 수제 버블티 · 연남점',
      touch: '화면을 터치하여 주문을 시작하세요',
      touchSub: 'TOUCH TO START',
      home: '처음으로',
      whereEat: '어디에서 드시나요?',
      whereSub: '주문 방식을 선택해 주세요',
      eatIn: '매장에서 먹고 갈게요', eatInSub: '매장 식사',
      takeOut: '포장해 갈게요', takeOutSub: '포장',
      cupNote: function (n) { return '포장 시 음료 1잔당 일회용컵 ' + won(n) + '이 추가됩니다'; },
      cupShort: function (n) { return '음료 1잔당 컵 ' + won(n); },
      cartTitle: '주문 내역',
      clearAll: '전체삭제',
      empty: '담긴 메뉴가 없습니다',
      subtotal: '주문 금액',
      cupFee: function (n) { return '포장컵 비용 (' + n + '잔)'; },
      total: '합계',
      order: '주문하기',
      soldOut: '품절',
      required: '필수', optional: '선택',
      toppingHint: function (n) { return '최대 ' + n + '개'; },
      shotHint: function (n) { return '최대 ' + n + '샷'; },
      qty: '수량',
      cancel: '취소',
      addBtn: function (p) { return won(p) + ' 담기'; },
      errRequired: function (g) { return '필수 옵션을 선택해 주세요: ' + g; },
      errToppingMax: function (n) { return '토핑은 최대 ' + n + '개까지 선택할 수 있어요.'; },
      iceOnly: 'ICE ONLY', hotOnly: 'HOT ONLY',
      set1Title: '스낵 세트로 변경하시겠어요?',
      set1Desc: function (d) { return '스낵을 함께 주문하면 ' + won(d) + ' 할인돼요'; },
      setNo: '음료만 주문할게요',
      setYes: '스낵 세트로 변경',
      setYesSub: function (d) { return '세트 할인 -' + won(d); },
      set2Title: '함께 드실 스낵을 골라주세요',
      set3Title: '세트 구성을 확인해 주세요',
      setDiscount: '세트 할인',
      setPrice: '세트 금액',
      prev: '이전', next: '다음', addSet: '장바구니 담기',
      errSnack: '스낵을 선택해 주세요.',
      setSnack: '세트 스낵',
      stampTitle: '펄린당 스탬프 적립',
      stampDesc: '음료 1잔당 스탬프 1개! 10개를 모으면 음료 1잔(M)을 드려요.',
      stampAsk: '휴대폰 번호로 스탬프를 적립하시겠어요?',
      stampSkip: '적립 안 함',
      stampPhone: '휴대폰 번호로 적립',
      stampEnter: '휴대폰 번호를 입력해 주세요',
      stampErr: '휴대폰 번호 8자리를 정확히 입력해 주세요.',
      stampDoneTitle: '적립 예정',
      stampDone: function (p) { return p + ' 번호로 결제 완료 후 스탬프가 적립됩니다.'; },
      kpBack: '정정', kpClear: '전체삭제',
      ok: '확인',
      delConfirm: function (n) { return '\'' + n + '\' 메뉴를 삭제하시겠습니까?'; },
      del: '삭제',
      clearConfirm: '장바구니의 모든 메뉴를 삭제하시겠습니까?',
      homeConfirm: '처음 화면으로 돌아가면 담은 메뉴가 모두 삭제됩니다.\n처음으로 돌아갈까요?',
      emptyCart: '장바구니가 비어 있습니다.\n메뉴를 먼저 담아주세요.',
      soldOutMsg: '품절된 메뉴입니다.\n다른 메뉴를 선택해 주세요.',
      reviewTitle: '주문 내역을 확인해 주세요',
      orderType: '주문 방식',
      setApplied: '세트 할인 적용 (주문 금액에 포함)',
      cupLine: function (n, f) { return '포장컵 비용 (' + n + '잔 × ' + won(f) + ')'; },
      grandTotal: '총 결제 금액',
      pay: '결제하기',
      addMore: '메뉴 추가',
      stampNote: function (p) { return '스탬프 적립 예정 번호 ' + p; },
      payHead: '결제',
      payTitle: '결제 수단을 선택해 주세요',
      payAmount: '결제하실 금액',
      payCard: '신용·체크카드', payCardSub: 'IC 카드 투입',
      payQr: '간편결제', payQrSub: 'QR · 바코드',
      payCoupon: '모바일 쿠폰', payCouponSub: '쿠폰 바코드 스캔',
      payGuideCard: '카드를 아래 투입구에 끝까지 꽂아주세요.\n결제가 끝날 때까지 카드를 빼지 마세요.',
      payGuideQr: '결제 앱의 QR · 바코드를 아래 스캐너에 비춰주세요.',
      payGuideCoupon: '모바일 쿠폰 바코드를 아래 스캐너에 비춰주세요.',
      waiting: '단말기 응답 대기 중',
      items: function (n) { return n + '개'; },
      sweetSum: function (s) { return '당도 ' + s; },
      shotSum: function (n) { return '샷 추가 ' + n; },
      itemsCount: function (n) { return '총 ' + n + '개'; }
    },
    en: {
      tagline: 'Handmade Taiwanese Bubble Tea · Yeonnam',
      touch: 'Touch the screen to start your order',
      touchSub: '화면을 터치하세요',
      home: 'Home',
      whereEat: 'Where will you enjoy your order?',
      whereSub: 'Please choose an order type',
      eatIn: 'For here', eatInSub: 'Eat in',
      takeOut: 'To go', takeOutSub: 'Take out',
      cupNote: function (n) { return 'Take-out adds a ' + won(n) + ' disposable cup fee per drink'; },
      cupShort: function (n) { return 'Cup ' + won(n) + ' per drink'; },
      cartTitle: 'My Order',
      clearAll: 'Clear all',
      empty: 'Your cart is empty',
      subtotal: 'Order amount',
      cupFee: function (n) { return 'Take-out cups (' + n + ')'; },
      total: 'Total',
      order: 'Checkout',
      soldOut: 'Sold out',
      required: 'Required', optional: 'Optional',
      toppingHint: function (n) { return 'Up to ' + n; },
      shotHint: function (n) { return 'Up to ' + n + ' shots'; },
      qty: 'Quantity',
      cancel: 'Cancel',
      addBtn: function (p) { return 'Add ' + won(p); },
      errRequired: function (g) { return 'Please choose a required option: ' + g; },
      errToppingMax: function (n) { return 'You can choose up to ' + n + ' toppings.'; },
      iceOnly: 'ICE ONLY', hotOnly: 'HOT ONLY',
      set1Title: 'Make it a snack set?',
      set1Desc: function (d) { return 'Add a snack and save ' + won(d); },
      setNo: 'Drink only',
      setYes: 'Make it a set',
      setYesSub: function (d) { return 'Set discount -' + won(d); },
      set2Title: 'Choose a snack for your set',
      set3Title: 'Check your set',
      setDiscount: 'Set discount',
      setPrice: 'Set price',
      prev: 'Back', next: 'Next', addSet: 'Add to cart',
      errSnack: 'Please choose a snack.',
      setSnack: 'Set snack',
      stampTitle: 'PEARLIN Stamps',
      stampDesc: '1 stamp per drink. Collect 10 for a free drink (M).',
      stampAsk: 'Collect stamps with your phone number?',
      stampSkip: 'No thanks',
      stampPhone: 'Use phone number',
      stampEnter: 'Enter your phone number',
      stampErr: 'Please enter all 8 digits of your phone number.',
      stampDoneTitle: 'Stamp reserved',
      stampDone: function (p) { return 'A stamp will be added to ' + p + ' after payment.'; },
      kpBack: 'Del', kpClear: 'Clear',
      ok: 'OK',
      delConfirm: function (n) { return 'Remove \'' + n + '\' from your order?'; },
      del: 'Remove',
      clearConfirm: 'Remove all items from your cart?',
      homeConfirm: 'Going back to the start screen clears your cart.\nGo back?',
      emptyCart: 'Your cart is empty.\nPlease add a menu item first.',
      soldOutMsg: 'This item is sold out.\nPlease choose another item.',
      reviewTitle: 'Please check your order',
      orderType: 'Order type',
      setApplied: 'Set discount applied (included above)',
      cupLine: function (n, f) { return 'Take-out cups (' + n + ' × ' + won(f) + ')'; },
      grandTotal: 'Total payment',
      pay: 'Pay',
      addMore: 'Add more',
      stampNote: function (p) { return 'Stamp will be saved to ' + p; },
      payHead: 'Payment',
      payTitle: 'Choose a payment method',
      payAmount: 'Amount to pay',
      payCard: 'Credit / Debit card', payCardSub: 'Insert IC card',
      payQr: 'Mobile pay', payQrSub: 'QR · Barcode',
      payCoupon: 'Mobile coupon', payCouponSub: 'Scan coupon barcode',
      payGuideCard: 'Insert your card fully into the slot below.\nDo not remove it until payment is finished.',
      payGuideQr: 'Hold the QR or barcode in your pay app to the scanner below.',
      payGuideCoupon: 'Hold the coupon barcode to the scanner below.',
      waiting: 'Waiting for the terminal',
      items: function (n) { return n + (n === 1 ? ' item' : ' items'); },
      sweetSum: function (s) { return 'Sweetness ' + s; },
      shotSum: function (n) { return '+' + n + ' shot' + (n > 1 ? 's' : ''); },
      itemsCount: function (n) { return n + (n === 1 ? ' item' : ' items'); }
    }
  };

  var S;
  function freshState() {
    return {
      lang: 'ko', screen: 'attract', orderType: null, cat: 'milk',
      cart: [], stampShown: false, stampPhone: null, modal: null, payMethod: null
    };
  }
  S = freshState();

  function t(k) {
    var v = T[S.lang][k];
    if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v;
  }
  function nm(o) { return S.lang === 'en' ? o.en : o.ko; }
  function item(id) { for (var i = 0; i < M.items.length; i++) if (M.items[i].id === id) return M.items[i]; return null; }
  function opt(gid, oid) { var g = M.groups[gid]; for (var i = 0; i < g.opts.length; i++) if (g.opts[i].id === oid) return g.opts[i]; return null; }
  function isDrink(it) { return it.cat !== 'snack'; }

  /* tiny element helper */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'onclick') el.addEventListener('click', v);
        else if (k === 'style') el.setAttribute('style', v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function lines(text) {
    var parts = String(text).split('\n');
    var out = [];
    parts.forEach(function (p, i) { if (i) out.push(h('br')); out.push(p); });
    return out;
  }

  /* ---------- pricing ---------- */
  function groupVisible(gid, sel) {
    var g = M.groups[gid];
    if (g.hideWhenHot && sel.temp === 'hot') return false;
    return true;
  }
  function drinkUnit(it, sel) {
    var p = it.price;
    it.g.forEach(function (gid) {
      if (!groupVisible(gid, sel)) return;
      var g = M.groups[gid];
      var v = sel[gid];
      if (v == null) return;
      if (g.type === 'single') { var o = opt(gid, v); if (o) p += o.p; }
      else if (g.type === 'multi') v.forEach(function (oid) { p += opt(gid, oid).p; });
      else if (g.type === 'quantity') p += g.opts[0].p * v;
    });
    return p;
  }
  function lineUnit(line) {
    var it = item(line.itemId);
    var p = drinkUnit(it, line.sel);
    if (line.setSnack) p += item(line.setSnack).price - M.setDiscount;
    return p;
  }
  function totals() {
    var sub = 0, cups = 0, disc = 0, count = 0;
    S.cart.forEach(function (l) {
      sub += lineUnit(l) * l.qty;
      count += l.qty;
      if (isDrink(item(l.itemId))) cups += l.qty;
      if (l.setSnack) disc += M.setDiscount * l.qty;
    });
    if (S.orderType !== 'take') cups = 0;
    var fee = cups * M.takeoutCupFee;
    return { sub: sub, cups: cups, fee: fee, disc: disc, total: sub + fee, count: count };
  }
  function summary(line) {
    var it = item(line.itemId), sel = line.sel, parts = [];
    it.g.forEach(function (gid) {
      if (!groupVisible(gid, sel)) return;
      var v = sel[gid];
      if (gid === 'sweet') { if (v) parts.push(t('sweetSum', nm(opt(gid, v)))); return; }
      if (gid === 'shot') { if (v) parts.push(t('shotSum', v)); return; }
      if (gid === 'topping') { (v || []).forEach(function (oid) { parts.push(nm(opt(gid, oid))); }); return; }
      if (v != null) parts.push(nm(opt(gid, v)));
      if (gid === 'size' || gid === 'sizeCoffee') {
        if (it.only === 'ice') parts.push('ICE');
        if (it.only === 'hot') parts.push('HOT');
      }
    });
    return parts.join(' / ');
  }

  /* ---------- actions ---------- */
  function go(screen) { S.screen = screen; S.modal = null; render(); }
  function reset() { S = freshState(); render(); }
  function openItem(it) {
    if (it.soldOut) { S.modal = { type: 'alert', msg: t('soldOutMsg') }; render(); return; }
    var sel = {};
    it.g.forEach(function (gid) {
      var g = M.groups[gid];
      if (g.type === 'multi') sel[gid] = [];
      else if (g.type === 'quantity') sel[gid] = 0;
      else sel[gid] = g.def;
    });
    S.modal = { type: 'options', itemId: it.id, sel: sel, qty: 1, err: null, errGroup: null };
    render();
  }
  function lineKey(l) { return l.itemId + '|' + JSON.stringify(l.sel) + '|' + (l.setSnack || ''); }
  function addLine(line) {
    var k = lineKey(line);
    for (var i = 0; i < S.cart.length; i++) {
      if (lineKey(S.cart[i]) === k) { S.cart[i].qty = Math.min(20, S.cart[i].qty + line.qty); afterAdd(); return; }
    }
    S.cart.push(line);
    afterAdd();
  }
  function afterAdd() {
    if (!S.stampShown) { S.stampShown = true; S.modal = { type: 'stamp', phase: 'ask', digits: '', err: null }; }
    else S.modal = null;
    render();
  }
  function cleanSel(it, sel) {
    var out = {};
    it.g.forEach(function (gid) {
      if (!groupVisible(gid, sel)) return;
      var v = sel[gid];
      out[gid] = Array.isArray(v) ? v.slice() : v;
    });
    return out;
  }
  function submitOptions() {
    var m = S.modal, it = item(m.itemId);
    for (var i = 0; i < it.g.length; i++) {
      var gid = it.g[i], g = M.groups[gid];
      if (!groupVisible(gid, m.sel)) continue;
      if (g.required && g.type === 'single' && m.sel[gid] == null) {
        m.err = t('errRequired', nm(g)); m.errGroup = gid; render(); return;
      }
    }
    var line = { itemId: it.id, sel: cleanSel(it, m.sel), qty: m.qty, setSnack: null };
    if (isDrink(it)) { S.modal = { type: 'set', step: 1, line: line, snack: null, err: null, back: m }; render(); }
    else addLine(line);
  }
  function confirmBox(msg, okLabel, onOk) { S.modal = { type: 'confirm', msg: msg, okLabel: okLabel, onOk: onOk }; render(); }

  /* ---------- screens ---------- */
  function logo(big) {
    return h('div', { class: 'logo' + (big ? ' big' : '') },
      h('div', { class: 'cup' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('div', { class: 'lt' }, h('b', null, M.brand.ko), h('span', null, M.brand.en)));
  }

  function screenAttract() {
    return h('div', { class: 'screen attract', onclick: function () { go('type'); } },
      h('div', { class: 'aw' },
        logo(true),
        h('p', { class: 'tagline' }, t('tagline')),
        h('div', { class: 'pearls' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i')),
        h('div', { class: 'pbanner' },
          h('div', { class: 'pb1' }, S.lang === 'en' ? 'WINTER SEASON' : '겨울 시즌 한정'),
          h('div', { class: 'pb2' }, S.lang === 'en' ? 'Roasted Sweet Potato Milk Tea' : '군고구마 밀크티 출시'),
          h('div', { class: 'pb3' }, S.lang === 'en' ? 'Add a snack to any drink and save 800원' : '모든 음료 스낵 세트 800원 할인'))),
      h('div', { class: 'touch' }, h('div', { class: 't1' }, t('touch')), h('div', { class: 't2' }, t('touchSub'))),
      h('div', { class: 'langbar', onclick: function (e) { e.stopPropagation(); } },
        h('span', { class: 'globe' }, '🌐'),
        h('button', { class: 'lang' + (S.lang === 'ko' ? ' on' : ''), onclick: function (e) { e.stopPropagation(); S.lang = 'ko'; render(); } }, '한국어'),
        h('button', { class: 'lang' + (S.lang === 'en' ? ' on' : ''), onclick: function (e) { e.stopPropagation(); S.lang = 'en'; render(); } }, 'English')));
  }

  function screenType() {
    function pick(v) { return function () { S.orderType = v; S.cat = 'milk'; go('menu'); }; }
    return h('div', { class: 'screen type' },
      h('div', { class: 'topbar' }, logo(false), h('button', { class: 'homebtn', onclick: function () { reset(); } }, '⌂ ' + t('home'))),
      h('div', { class: 'tq' }, h('h2', null, t('whereEat')), h('p', null, t('whereSub'))),
      h('div', { class: 'types' },
        h('div', { class: 'typecard eat', onclick: pick('eat') },
          h('div', { class: 'tic' }, '🪑'),
          h('div', { class: 'tt' }, t('eatIn')),
          h('div', { class: 'ts' }, t('eatInSub'))),
        h('div', { class: 'typecard take', onclick: pick('take') },
          h('div', { class: 'tic' }, '🛍️'),
          h('div', { class: 'tt' }, t('takeOut')),
          h('div', { class: 'ts' }, t('takeOutSub')),
          h('div', { class: 'tnote' }, t('cupNote', M.takeoutCupFee)))));
  }

  function screenMenu() {
    var cats = h('div', { class: 'tabs' }, M.cats.map(function (c) {
      return h('div', { class: 'tab' + (S.cat === c.id ? ' on' : ''), onclick: function () { S.cat = c.id; render(); } }, nm(c));
    }));
    var grid = h('div', { class: 'grid' }, M.items.filter(function (it) { return it.cat === S.cat; }).map(function (it) {
      return h('div', { class: 'card' + (it.soldOut ? ' so' : ''), onclick: function () { openItem(it); } },
        h('div', { class: 'thumb', style: 'background:' + it.tone },
          h('span', { class: 'emo' }, it.emoji),
          it.badge ? h('span', { class: 'badge b-' + it.badge.toLowerCase() }, it.badge) : null,
          it.only ? h('span', { class: 'only o-' + it.only }, it.only === 'ice' ? t('iceOnly') : t('hotOnly')) : null,
          it.soldOut ? h('div', { class: 'somask' }, t('soldOut')) : null),
        h('div', { class: 'cname' }, nm(it), h('span', { class: 'cprice' }, won(it.price))));
    }));
    var tt = totals();
    var list = h('div', { class: 'cartlist' });
    if (!S.cart.length) list.appendChild(h('div', { class: 'cempty' }, t('empty')));
    S.cart.forEach(function (l, idx) {
      var it = item(l.itemId);
      list.appendChild(h('div', { class: 'line' },
        h('div', { class: 'linfo' },
          h('div', { class: 'lname' }, nm(it), l.setSnack ? h('span', { class: 'setchip' }, 'SET') : null),
          h('div', { class: 'lopt' }, summary(l)),
          l.setSnack ? h('div', { class: 'lopt lset' }, t('setSnack') + ': ' + nm(item(l.setSnack)) + ' · ' + t('setDiscount') + ' -' + won(M.setDiscount)) : null),
        h('div', { class: 'lctrl' },
          h('div', { class: 'qbox' },
            h('div', { class: 'qb' + (l.qty <= 1 ? ' dis' : ''), onclick: function () { if (l.qty > 1) { l.qty--; render(); } } }, '−'),
            h('span', { class: 'qn' }, l.qty),
            h('div', { class: 'qb' + (l.qty >= 20 ? ' dis' : ''), onclick: function () { if (l.qty < 20) { l.qty++; render(); } } }, '+')),
          h('div', { class: 'lprice' }, won(lineUnit(l) * l.qty)),
          h('button', { class: 'ldel', 'aria-label': t('del'), onclick: function () {
            confirmBox(t('delConfirm', nm(it)), t('del'), function () { S.cart.splice(idx, 1); });
          } }, '✕'))));
    });
    var sum = h('div', { class: 'csum' },
      h('div', { class: 'crow' }, h('span', null, t('subtotal')), h('span', null, won(tt.sub))),
      S.orderType === 'take' ? h('div', { class: 'crow fee' }, h('span', null, t('cupFee', tt.cups)), h('span', null, '+' + won(tt.fee))) : null,
      h('div', { class: 'crow tot' }, h('span', null, t('total')), h('span', { class: 'tamt' }, won(tt.total))));
    return h('div', { class: 'screen menu' },
      h('div', { class: 'topbar' }, logo(false),
        h('div', { class: 'otbadge ' + S.orderType },
          S.orderType === 'take' ? t('takeOutSub') : t('eatInSub'),
          S.orderType === 'take' ? h('small', null, t('cupShort', M.takeoutCupFee)) : null),
        h('button', { class: 'homebtn', onclick: function () {
          if (S.cart.length) confirmBox(t('homeConfirm'), t('ok'), function () { S = freshState(); });
          else reset();
        } }, '⌂ ' + t('home'))),
      cats, grid,
      h('div', { class: 'cart' },
        h('div', { class: 'chead' }, h('b', null, t('cartTitle')), h('span', { class: 'ccount' }, t('itemsCount', tt.count)),
          h('div', { class: 'clear', onclick: function () { if (S.cart.length) confirmBox(t('clearConfirm'), t('del'), function () { S.cart = []; }); } }, t('clearAll'))),
        list,
        h('div', { class: 'cfoot' }, sum,
          h('button', { class: 'orderbtn', onclick: function () {
            if (!S.cart.length) { S.modal = { type: 'alert', msg: t('emptyCart') }; render(); return; }
            go('review');
          } }, t('order')))));
  }

  function screenReview() {
    var tt = totals();
    var list = h('div', { class: 'rlist' }, S.cart.map(function (l) {
      var it = item(l.itemId), unit = lineUnit(l);
      return h('div', { class: 'rline' },
        h('div', { class: 'rl1' },
          h('span', { class: 'rname' }, nm(it), l.setSnack ? h('em', { class: 'setchip' }, 'SET') : null),
          h('span', { class: 'rq' }, won(unit) + ' × ' + l.qty),
          h('span', { class: 'ramt' }, won(unit * l.qty))),
        h('div', { class: 'rl2' }, summary(l)),
        l.setSnack ? h('div', { class: 'rl2 rset' }, '└ ' + t('setSnack') + ' ' + nm(item(l.setSnack)) + ' (' + t('setDiscount') + ' -' + won(M.setDiscount) + ')') : null);
    }));
    function setType(v) { return function () { S.orderType = v; render(); }; }
    return h('div', { class: 'screen review' },
      h('div', { class: 'topbar' }, logo(false), h('button', { class: 'homebtn', onclick: function () { confirmBox(t('homeConfirm'), t('ok'), function () { S = freshState(); }); } }, '⌂ ' + t('home'))),
      h('h2', { class: 'rtitle' }, t('reviewTitle')),
      h('div', { class: 'rtype' }, h('span', null, t('orderType')),
        h('div', { class: 'seg' },
          h('button', { class: S.orderType === 'eat' ? 'on' : '', onclick: setType('eat') }, t('eatInSub')),
          h('button', { class: S.orderType === 'take' ? 'on' : '', onclick: setType('take') }, t('takeOutSub')))),
      S.orderType === 'take' ? h('div', { class: 'rnote' }, '※ ' + t('cupNote', M.takeoutCupFee)) : null,
      list,
      h('div', { class: 'rsum' },
        h('div', { class: 'rrow' }, h('span', null, t('subtotal')), h('span', null, won(tt.sub))),
        tt.disc ? h('div', { class: 'rrow small' }, h('span', null, t('setApplied')), h('span', null, '-' + won(tt.disc))) : null,
        S.orderType === 'take' ? h('div', { class: 'rrow' }, h('span', null, t('cupLine', tt.cups, M.takeoutCupFee)), h('span', null, '+' + won(tt.fee))) : null,
        h('div', { class: 'rrow grand' }, h('span', null, t('grandTotal')), h('span', { class: 'gamt' }, won(tt.total)))),
      S.stampPhone ? h('div', { class: 'stampnote' }, '★ ' + t('stampNote', maskPhone(S.stampPhone))) : null,
      h('div', { class: 'foot' },
        h('button', { class: 'ghost', onclick: function () { go('menu'); } }, '‹ ' + t('addMore')),
        h('button', { class: 'primary', onclick: function () { S.payMethod = null; go('pay'); } }, t('pay'))));
  }

  function screenPay() {
    var tt = totals();
    var methods = [
      { id: 'card', ic: '💳', n: t('payCard'), s: t('payCardSub'), g: t('payGuideCard') },
      { id: 'qr', ic: '📱', n: t('payQr'), s: t('payQrSub'), g: t('payGuideQr') },
      { id: 'coupon', ic: '🎟️', n: t('payCoupon'), s: t('payCouponSub'), g: t('payGuideCoupon') }
    ];
    var chosen = methods.filter(function (m) { return m.id === S.payMethod; })[0];
    return h('div', { class: 'screen pay' },
      h('div', { class: 'topbar' }, logo(false), h('div', { class: 'phead' }, t('payHead'))),
      h('div', { class: 'paybox' },
        h('div', { class: 'pl' }, t('payAmount')),
        h('div', { class: 'pamt' }, won(tt.total)),
        h('div', { class: 'pmeta' }, (S.orderType === 'take' ? t('takeOutSub') : t('eatInSub')) + ' · ' + t('itemsCount', tt.count))),
      h('h3', { class: 'ptitle' }, t('payTitle')),
      h('div', { class: 'methods' }, methods.map(function (m) {
        return h('div', { class: 'method' + (S.payMethod === m.id ? ' on' : ''), onclick: function () { S.payMethod = m.id; render(); } },
          h('div', { class: 'mic' }, m.ic), h('div', { class: 'mn' }, m.n), h('div', { class: 'ms' }, m.s));
      })),
      chosen ? h('div', { class: 'payguide' },
        h('div', { class: 'slot' }, h('i')),
        h('p', null, lines(chosen.g)),
        h('div', { class: 'wait' }, t('waiting'), h('span', { class: 'dots' }, '...'))) : null,
      h('div', { class: 'foot' },
        h('button', { class: 'ghost', onclick: function () { S.payMethod = null; go('review'); } }, '‹ ' + t('prev'))));
  }

  /* ---------- modals ---------- */
  function modalOptions() {
    var m = S.modal, it = item(m.itemId);
    var body = h('div', { class: 'obody' });
    it.g.forEach(function (gid) {
      if (!groupVisible(gid, m.sel)) return;
      var g = M.groups[gid];
      var hint = g.type === 'multi' ? t('toppingHint', g.max) : (g.type === 'quantity' ? t('shotHint', g.opts[0].max) : null);
      var box = h('div', { class: 'og' + (m.errGroup === gid ? ' err' : '') },
        h('div', { class: 'ogt' }, h('span', { class: 'ogn' }, nm(g)),
          h('span', { class: 'req' + (g.required ? ' r' : '') }, g.required ? t('required') : t('optional')),
          hint ? h('span', { class: 'hint' }, hint) : null));
      if (g.type === 'quantity') {
        var o = g.opts[0], n = m.sel[gid] || 0;
        box.appendChild(h('div', { class: 'qrow' },
          h('span', { class: 'ql' }, nm(o), h('span', { class: 'op' }, ' +' + won(o.p))),
          h('div', { class: 'qbox' },
            h('div', { class: 'qb' + (n <= 0 ? ' dis' : ''), onclick: function () { if (n > 0) { m.sel[gid] = n - 1; render(); } } }, '−'),
            h('span', { class: 'qn' }, n),
            h('div', { class: 'qb' + (n >= o.max ? ' dis' : ''), onclick: function () { if (n < o.max) { m.sel[gid] = n + 1; render(); } } }, '+'))));
      } else {
        var wrap = h('div', { class: 'chips' + (g.opts.length > 4 ? ' many' : '') });
        g.opts.forEach(function (o) {
          var on = g.type === 'multi' ? m.sel[gid].indexOf(o.id) >= 0 : m.sel[gid] === o.id;
          wrap.appendChild(h('button', {
            class: 'chip' + (on ? ' on' : '') + (o.soldOut ? ' so' : ''),
            disabled: o.soldOut ? true : null,
            onclick: function () {
              if (g.type === 'multi') {
                var arr = m.sel[gid], i = arr.indexOf(o.id);
                if (i >= 0) arr.splice(i, 1);
                else if (arr.length >= g.max) { m.err = t('errToppingMax', g.max); m.errGroup = gid; render(); return; }
                else arr.push(o.id);
              } else {
                m.sel[gid] = o.id;
                if (gid === 'temp' && o.id === 'hot') m.sel.ice = null;
              }
              m.err = null; m.errGroup = null;
              render();
            }
          },
          h('span', { class: 'ol' }, nm(o)),
          o.soldOut ? h('span', { class: 'op sot' }, t('soldOut')) : (o.p ? h('span', { class: 'op' }, '+' + won(o.p)) : null)));
        });
        box.appendChild(wrap);
      }
      body.appendChild(box);
    });
    body.appendChild(h('div', { class: 'og qty' },
      h('div', { class: 'qrow' }, h('span', { class: 'ql' }, t('qty')),
        h('div', { class: 'qbox' },
          h('div', { class: 'qb' + (m.qty <= 1 ? ' dis' : ''), onclick: function () { if (m.qty > 1) { m.qty--; render(); } } }, '−'),
          h('span', { class: 'qn' }, m.qty),
          h('div', { class: 'qb' + (m.qty >= 20 ? ' dis' : ''), onclick: function () { if (m.qty < 20) { m.qty++; render(); } } }, '+')))));
    var price = drinkUnit(it, m.sel) * m.qty;
    return h('div', { class: 'overlay' },
      h('div', { class: 'sheet opt' },
        h('div', { class: 'ohead' },
          h('div', { class: 'thumb', style: 'background:' + it.tone }, h('span', { class: 'emo' }, it.emoji)),
          h('div', { class: 'oinfo' },
            h('div', { class: 'otitle' }, nm(it)),
            h('div', { class: 'odesc' }, S.lang === 'en' ? it.den : it.dko),
            h('div', { class: 'oprice' }, won(it.price),
              it.only ? h('span', { class: 'only o-' + it.only }, it.only === 'ice' ? t('iceOnly') : t('hotOnly')) : null))),
        body,
        m.err ? h('div', { class: 'oerr', role: 'alert' }, '⚠ ' + m.err) : null,
        h('div', { class: 'ofoot' },
          h('button', { class: 'ghost', onclick: function () { S.modal = null; render(); } }, t('cancel')),
          h('button', { class: 'primary', onclick: submitOptions }, t('addBtn', price)))));
  }

  function modalSet() {
    var m = S.modal, it = item(m.line.itemId);
    var drink = drinkUnit(it, m.line.sel);
    var steps = h('div', { class: 'steps' }, [1, 2, 3].map(function (n) {
      return h('i', { class: n === m.step ? 'on' : (n < m.step ? 'done' : '') }, n);
    }), h('span', { class: 'stepn' }, m.step + ' / 3'));
    var content, foot;
    if (m.step === 1) {
      content = h('div', { class: 'sbody' },
        h('h3', null, t('set1Title')),
        h('p', { class: 'sdesc' }, t('set1Desc', M.setDiscount)),
        h('div', { class: 'setchoices' },
          h('div', { class: 'setc', onclick: function () { addLine(m.line); } },
            h('div', { class: 'sic' }, it.emoji), h('div', { class: 'sn' }, t('setNo')), h('div', { class: 'sp' }, won(drink * m.line.qty))),
          h('div', { class: 'setc hl', onclick: function () { m.step = 2; m.err = null; render(); } },
            h('div', { class: 'sic' }, it.emoji + '🍰'), h('div', { class: 'sn' }, t('setYes')), h('div', { class: 'sp' }, t('setYesSub', M.setDiscount)))));
      foot = h('div', { class: 'ofoot' }, h('button', { class: 'ghost', onclick: function () { S.modal = m.back; render(); } }, '‹ ' + t('prev')));
    } else if (m.step === 2) {
      content = h('div', { class: 'sbody' },
        h('h3', null, t('set2Title')),
        h('div', { class: 'snacks' }, M.setSnacks.map(function (sid) {
          var s = item(sid);
          return h('div', { class: 'snk' + (m.snack === sid ? ' on' : '') + (s.soldOut ? ' so' : ''), onclick: function () {
            if (s.soldOut) return;
            m.snack = sid; m.err = null; render();
          } },
            h('div', { class: 'thumb', style: 'background:' + s.tone }, h('span', { class: 'emo' }, s.emoji), s.soldOut ? h('div', { class: 'somask' }, t('soldOut')) : null),
            h('div', { class: 'skn' }, nm(s)),
            h('div', { class: 'skp' }, '+' + won(s.price)));
        })),
        m.err ? h('div', { class: 'oerr', role: 'alert' }, '⚠ ' + m.err) : null);
      foot = h('div', { class: 'ofoot' },
        h('button', { class: 'ghost', onclick: function () { m.step = 1; m.err = null; render(); } }, '‹ ' + t('prev')),
        h('button', { class: 'primary', onclick: function () {
          if (!m.snack) { m.err = t('errSnack'); render(); return; }
          m.step = 3; render();
        } }, t('next')));
    } else {
      var s = item(m.snack), q = m.line.qty;
      var setUnit = drink + s.price - M.setDiscount;
      content = h('div', { class: 'sbody' },
        h('h3', null, t('set3Title')),
        h('div', { class: 'sconf' },
          h('div', { class: 'srow' }, h('div', null, h('b', null, nm(it)), h('small', null, summary(m.line))), h('span', null, won(drink))),
          h('div', { class: 'srow' }, h('div', null, h('b', null, nm(s))), h('span', null, won(s.price))),
          h('div', { class: 'srow disc' }, h('div', null, t('setDiscount')), h('span', null, '-' + won(M.setDiscount))),
          h('div', { class: 'srow' }, h('div', null, t('qty')), h('span', null, t('items', q))),
          h('div', { class: 'srow stot' }, h('div', null, t('setPrice')), h('span', null, won(setUnit * q)))));
      foot = h('div', { class: 'ofoot' },
        h('button', { class: 'ghost', onclick: function () { m.step = 2; render(); } }, '‹ ' + t('prev')),
        h('button', { class: 'primary', onclick: function () {
          var line = { itemId: m.line.itemId, sel: m.line.sel, qty: m.line.qty, setSnack: m.snack };
          addLine(line);
        } }, t('addSet')));
    }
    return h('div', { class: 'overlay' }, h('div', { class: 'sheet setm' }, steps, content, foot));
  }

  function maskPhone(p) { return p.slice(0, 3) + '-****-' + p.slice(7); }
  function fmtDigits(d) {
    var a = (d + '________').slice(0, 8);
    return '010-' + a.slice(0, 4) + '-' + a.slice(4);
  }
  function modalStamp() {
    var m = S.modal;
    var close = function () { S.modal = null; render(); };
    if (m.phase === 'ask') {
      return h('div', { class: 'overlay' }, h('div', { class: 'sheet stamp' },
        h('div', { class: 'x', onclick: close }, '✕'),
        h('div', { class: 'stamps' }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return h('i', { class: n === 10 ? 'free' : '' }, n === 10 ? 'FREE' : '🧋'); })),
        h('h3', null, t('stampTitle')),
        h('p', null, t('stampDesc')),
        h('p', { class: 'ask' }, t('stampAsk')),
        h('div', { class: 'ofoot' },
          h('div', { class: 'btn ghost', onclick: close }, t('stampSkip')),
          h('button', { class: 'primary', onclick: function () { m.phase = 'phone'; render(); } }, t('stampPhone')))));
    }
    if (m.phase === 'phone') {
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'];
      return h('div', { class: 'overlay' }, h('div', { class: 'sheet stamp' },
        h('h3', null, t('stampEnter')),
        h('div', { class: 'phone' }, fmtDigits(m.digits)),
        h('div', { class: 'keypad' }, keys.map(function (k) {
          var label = k === 'back' ? t('kpBack') : (k === 'clear' ? t('kpClear') : k);
          return h('button', { class: 'key' + (k.length > 1 ? ' fn' : ''), onclick: function () {
            if (k === 'back') m.digits = m.digits.slice(0, -1);
            else if (k === 'clear') m.digits = '';
            else if (m.digits.length < 8) m.digits += k;
            m.err = null; render();
          } }, label);
        })),
        m.err ? h('div', { class: 'oerr', role: 'alert' }, '⚠ ' + m.err) : null,
        h('div', { class: 'ofoot' },
          h('button', { class: 'ghost', onclick: function () { m.phase = 'ask'; m.err = null; render(); } }, t('cancel')),
          h('button', { class: 'primary', onclick: function () {
            if (m.digits.length !== 8) { m.err = t('stampErr'); render(); return; }
            S.stampPhone = '010' + m.digits; m.phase = 'done'; render();
          } }, t('ok')))));
    }
    return h('div', { class: 'overlay' }, h('div', { class: 'sheet small' },
      h('h3', null, t('stampDoneTitle')),
      h('p', null, t('stampDone', maskPhone(S.stampPhone))),
      h('div', { class: 'ofoot' }, h('button', { class: 'primary', onclick: close }, t('ok')))));
  }

  function modalConfirm() {
    var m = S.modal;
    return h('div', { class: 'overlay' }, h('div', { class: 'sheet small' },
      h('div', { class: 'qic' }, '?'),
      h('p', { class: 'cmsg' }, lines(m.msg)),
      h('div', { class: 'ofoot' },
        h('button', { class: 'ghost', onclick: function () { S.modal = null; render(); } }, t('cancel')),
        h('button', { class: 'danger', onclick: function () { S.modal = null; m.onOk(); render(); } }, m.okLabel))));
  }
  function modalAlert() {
    return h('div', { class: 'overlay' }, h('div', { class: 'sheet small' },
      h('div', { class: 'qic warn' }, '!'),
      h('p', { class: 'cmsg' }, lines(S.modal.msg)),
      h('div', { class: 'ofoot' }, h('div', { class: 'btn primary', onclick: function () { S.modal = null; render(); } }, t('ok')))));
  }

  var screens = { attract: screenAttract, type: screenType, menu: screenMenu, review: screenReview, pay: screenPay };
  var modals = { options: modalOptions, set: modalSet, stamp: modalStamp, confirm: modalConfirm, alert: modalAlert };

  function render() {
    var keep = {};
    ['.obody', '.cartlist', '.rlist'].forEach(function (sel) { var e = root.querySelector(sel); if (e) keep[sel] = e.scrollTop; });
    root.innerHTML = '';
    document.documentElement.lang = S.lang;
    root.appendChild(screens[S.screen]());
    if (S.modal) root.appendChild(modals[S.modal.type]());
    Object.keys(keep).forEach(function (sel) { var e = root.querySelector(sel); if (e) e.scrollTop = keep[sel]; });
  }
  render();
})();
