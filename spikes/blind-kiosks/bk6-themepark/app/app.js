/* Starsea Park ticket & snack kiosk — static, deterministic, no network. */
(function () {
  'use strict';

  var K = window.KIOSK;
  var ITEMS = {};
  K.items.forEach(function (it) { ITEMS[it.id] = it; });
  var PROMO_ID = 's-churros';
  var AGE_MAX = 9;
  var QTY_MAX = 20;
  var TOP_MAX = 2;

  var T = {
    ko: {
      welcome: '별바다 파크에 오신 것을 환영합니다',
      sub: '입장권 · 자유이용권 · 간식 · 음료 · 기념품',
      touch: '화면을 터치하여 주문을 시작하세요',
      langLabel: '언어 선택',
      home: '처음으로',
      banner: '별사탕 츄러스 2+1 행사 중! 2개 담으면 1개 더 드려요',
      cart: '장바구니',
      total: '합계',
      order: '주문하기',
      soldout: '품절',
      from: '대인',
      cancel: '취소',
      add: '담기',
      discTitle: '할인 유형',
      required: '필수',
      optional: '선택',
      perPerson: '1인',
      people: '인원 선택',
      discNoteNone: '할인 유형을 먼저 선택해 주세요. 우대 요금은 입장 시 증빙을 확인합니다.',
      discNoteDisabled: '입장 시 복지카드 또는 장애인 증명서를 확인합니다. (동반 1인 미적용)',
      discNoteSenior: '경로 우대는 만 65세 이상 대인만 선택할 수 있습니다.',
      seniorReset: '경로 우대는 대인만 가능하여 청소년·소인 인원이 초기화되었습니다.',
      errDisc: '할인 유형을 선택해 주세요.',
      errPeople: '인원을 1명 이상 선택해 주세요.',
      errAgeMax: '연령별 최대 9명까지 선택할 수 있습니다.',
      errTop: '추가 선택은 최대 2개까지 가능합니다.',
      errQty: '한 번에 최대 20개까지 주문할 수 있습니다.',
      topTitle: '추가 선택 (최대 2개)',
      sizeTitle: '사이즈',
      qty: '수량',
      sum: '합계',
      added: '장바구니에 담았습니다.',
      promoAdded: function (n) { return '2+1 혜택으로 별사탕 츄러스 ' + n + '개가 무료로 추가되었습니다.'; },
      memberTitle: '회원이신가요?',
      memberBody: '별바다 멤버십 회원은 결제 금액의 3%를 포인트로 적립할 수 있어요.',
      memberYes: '회원 적립하기',
      memberNo: '비회원으로 계속',
      memberInfo: '포인트는 결제 완료 후 영수증 하단 QR코드로 적립됩니다.',
      ok: '확인',
      soldOutMsg: '품절된 상품입니다. 다른 상품을 선택해 주세요.',
      emptyCart: '장바구니가 비어 있습니다. 상품을 먼저 담아 주세요.',
      delConfirm: '선택한 상품을 장바구니에서 삭제할까요?',
      del: '삭제',
      clearAll: '전체 삭제',
      clearConfirm: '장바구니의 모든 상품을 삭제할까요?',
      homeConfirm: '주문 내역이 모두 삭제됩니다. 처음 화면으로 돌아갈까요?',
      yes: '확인',
      free: '2+1 증정',
      freeBadge: '증정',
      emptyDrawer: '담긴 상품이 없습니다.',
      reviewTitle: '주문 내역을 확인해 주세요',
      lineCount: function (n) { return '상품 ' + n + '건'; },
      payTotal: '총 결제 금액',
      reviewNote: '※ 우대 요금은 입장 시 증빙 서류를 확인합니다. 미지참 시 차액이 발생합니다.',
      back: '이전',
      pay: '결제하기',
      payTitle: '결제 수단을 선택해 주세요',
      payAmount: '결제하실 금액',
      payConfirm: function (m) { return m + '(으)로 결제를 진행할까요?'; },
      payGo: '결제 진행',
      payNotice: '연습용 키오스크입니다. 실제 결제는 진행되지 않습니다.',
      unitPerson: '명',
      persons: function (n) { return n + '명'; }
    },
    en: {
      welcome: 'Welcome to Starsea Park',
      sub: 'Admission · Ride Passes · Snacks · Drinks · Souvenirs',
      touch: 'Touch the screen to start your order',
      langLabel: 'Language',
      home: 'Home',
      banner: 'Star Candy Churros 2+1! Add 2 and get 1 more free',
      cart: 'Cart',
      total: 'Total',
      order: 'Order',
      soldout: 'SOLD OUT',
      from: 'Adult',
      cancel: 'Cancel',
      add: 'Add to cart',
      discTitle: 'Discount type',
      required: 'Required',
      optional: 'Optional',
      perPerson: 'per person',
      people: 'Number of visitors',
      discNoteNone: 'Please choose a discount type first. Proof is checked at the entrance.',
      discNoteDisabled: 'A disability card or certificate is checked at the entrance. (Not for companions)',
      discNoteSenior: 'Senior discount is for adults aged 65 or older only.',
      seniorReset: 'Senior discount is adult-only, so youth and child counts were reset.',
      errDisc: 'Please select a discount type.',
      errPeople: 'Please select at least 1 visitor.',
      errAgeMax: 'Up to 9 visitors per age group.',
      errTop: 'You can choose up to 2 extras.',
      errQty: 'You can order up to 20 at a time.',
      topTitle: 'Extras (up to 2)',
      sizeTitle: 'Size',
      qty: 'Quantity',
      sum: 'Total',
      added: 'Added to cart.',
      promoAdded: function (n) { return '2+1 deal: ' + n + ' free Star Candy Churros added.'; },
      memberTitle: 'Are you a member?',
      memberBody: 'Starsea members earn 3% of the payment as points.',
      memberYes: 'Earn points',
      memberNo: 'Continue as guest',
      memberInfo: 'Points are earned with the QR code on your receipt after payment.',
      ok: 'OK',
      soldOutMsg: 'This item is sold out. Please choose another item.',
      emptyCart: 'Your cart is empty. Please add an item first.',
      delConfirm: 'Remove the selected item from your cart?',
      del: 'Delete',
      clearAll: 'Clear all',
      clearConfirm: 'Remove all items from your cart?',
      homeConfirm: 'Your order will be cleared. Go back to the start screen?',
      yes: 'OK',
      free: '2+1 free',
      freeBadge: 'FREE',
      emptyDrawer: 'Your cart is empty.',
      reviewTitle: 'Please check your order',
      lineCount: function (n) { return n + (n === 1 ? ' item' : ' items'); },
      payTotal: 'Total payment',
      reviewNote: '* Discount proof is checked at the entrance. Without it, the difference is charged.',
      back: 'Back',
      pay: 'Pay',
      payTitle: 'Please select a payment method',
      payAmount: 'Amount to pay',
      payConfirm: function (m) { return 'Pay with ' + m + '?'; },
      payGo: 'Proceed',
      payNotice: 'This is a practice kiosk. No real payment is made.',
      unitPerson: '',
      persons: function (n) { return n + (n === 1 ? ' visitor' : ' visitors'); }
    }
  };

  var S;
  var onConfirm = null;

  function reset() {
    S = {
      lang: 'ko', screen: 'attract', cat: K.categories[0].id, cart: [], seq: 0,
      memberAsked: false, sheet: null, modal: null, drawer: false, toast: null,
      payMethod: null, paid: false
    };
    onConfirm = null;
  }

  // ---------- helpers ----------
  function t(k) { return T[S.lang][k]; }
  function L(o) { return S.lang === 'ko' ? o.ko : o.en; }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function discDelta(id) { var d = find(K.discounts, id); return d ? d.delta : 0; }
  function personPrice(item, age, disc) { return item.ages[age] + discDelta(disc); }
  function people(counts) { return counts.adult + counts.youth + counts.child; }

  function unitPrice(line) {
    var it = ITEMS[line.id];
    if (line.free) return 0;
    if (it.kind === 'ticket') {
      var s = 0;
      K.ages.forEach(function (a) { s += line.counts[a.id] * personPrice(it, a.id, line.disc); });
      return s;
    }
    var p = it.price;
    (line.tops || []).forEach(function (id) { p += find(K.toppings, id).delta; });
    if (line.size) p += find(K.sizes, line.size).delta;
    return p;
  }
  function linePrice(line) { return unitPrice(line) * line.qty; }
  function cartTotal() { return S.cart.reduce(function (s, l) { return s + linePrice(l); }, 0); }
  function cartCount() {
    return S.cart.reduce(function (s, l) {
      return s + (ITEMS[l.id].kind === 'ticket' ? people(l.counts) : l.qty);
    }, 0);
  }
  function keyOf(l) { return l.id + '|' + (l.tops || []).join(',') + '|' + (l.size || ''); }

  function optText(l) {
    var it = ITEMS[l.id];
    if (l.free) return t('free');
    if (it.kind === 'ticket') {
      var ppl = K.ages.filter(function (a) { return l.counts[a.id] > 0; })
        .map(function (a) { return L(a) + ' ' + l.counts[a.id] + t('unitPerson'); }).join(' · ');
      return (l.disc ? L(find(K.discounts, l.disc)) + ' / ' : '') + ppl;
    }
    if (l.size) return L(find(K.sizes, l.size));
    if (l.tops && l.tops.length) return l.tops.map(function (id) { return '+' + L(find(K.toppings, id)); }).join(', ');
    return '';
  }

  // ---------- cart logic ----------
  function syncPromo() {
    var before = 0;
    S.cart.forEach(function (l) { if (l.free) before += l.qty; });
    S.cart = S.cart.filter(function (l) { return !l.free; });
    var paid = 0;
    S.cart.forEach(function (l) { if (l.id === PROMO_ID) paid += l.qty; });
    var n = Math.floor(paid / 2);
    if (n > 0) S.cart.push({ uid: 'promo', id: PROMO_ID, kind: 'snack', tops: [], qty: n, free: true });
    return n - before;
  }

  function addLine(line) {
    var capped = false;
    if (line.kind !== 'ticket') {
      var k = keyOf(line);
      var ex = S.cart.filter(function (l) { return !l.free && keyOf(l) === k; })[0];
      if (ex) {
        if (ex.qty + line.qty > QTY_MAX) { capped = true; ex.qty = QTY_MAX; } else ex.qty += line.qty;
      } else {
        line.uid = 'L' + (++S.seq);
        S.cart.push(line);
      }
    } else {
      line.uid = 'L' + (++S.seq);
      S.cart.push(line);
    }
    var gained = syncPromo();
    S.toast = capped ? t('errQty') : (gained > 0 ? t('promoAdded')(gained) : t('added'));
    if (!S.memberAsked) {
      S.memberAsked = true;
      S.modal = { type: 'member' };
    }
  }

  function confirmBox(text, fn, okLabel) {
    S.modal = { type: 'confirm', text: text, ok: okLabel || t('yes') };
    onConfirm = fn;
  }
  function alertBox(text) { S.modal = { type: 'alert', text: text }; }

  function openItem(id) {
    var it = ITEMS[id];
    if (it.soldOut) { alertBox(t('soldOutMsg')); return; }
    if (it.kind === 'goods') { addLine({ id: id, kind: 'goods', qty: 1 }); return; }
    if (it.kind === 'ticket') {
      S.sheet = { id: id, disc: null, counts: { adult: 0, youth: 0, child: 0 }, err: '', note: '' };
    } else if (it.kind === 'snack') {
      S.sheet = { id: id, tops: [], qty: 1, err: '' };
    } else {
      S.sheet = { id: id, size: it.sized ? 'R' : null, qty: 1, err: '' };
    }
  }

  function sheetAdd() {
    var sh = S.sheet;
    var it = ITEMS[sh.id];
    if (it.kind === 'ticket') {
      if (it.discount && !sh.disc) { sh.err = t('errDisc'); return; }
      if (people(sh.counts) < 1) { sh.err = t('errPeople'); return; }
      S.sheet = null;
      addLine({ id: it.id, kind: 'ticket', disc: it.discount ? sh.disc : null,
        counts: { adult: sh.counts.adult, youth: sh.counts.youth, child: sh.counts.child }, qty: 1 });
      return;
    }
    S.sheet = null;
    if (it.kind === 'snack') {
      var tops = K.toppings.map(function (o) { return o.id; })
        .filter(function (id) { return sh.tops.indexOf(id) >= 0; });
      addLine({ id: it.id, kind: 'snack', tops: tops, qty: sh.qty });
    } else {
      addLine({ id: it.id, kind: 'drink', size: sh.size, qty: sh.qty });
    }
  }

  function sheetSum() {
    var sh = S.sheet;
    var it = ITEMS[sh.id];
    if (it.kind === 'ticket') {
      var s = 0;
      K.ages.forEach(function (a) { s += sh.counts[a.id] * personPrice(it, a.id, sh.disc || 'general'); });
      return s;
    }
    return unitPrice({ id: sh.id, tops: sh.tops, size: sh.size, qty: sh.qty }) * sh.qty;
  }

  function lineByUid(uid) { return S.cart.filter(function (l) { return l.uid === uid; })[0]; }

  // ---------- actions ----------
  function act(a, el) {
    var sh = S.sheet;
    var d = el.dataset;
    switch (a) {
      case 'lang': S.lang = d.lang; break;
      case 'start': S.screen = 'menu'; break;
      case 'cat': S.cat = d.cat; break;
      case 'item': openItem(d.id); break;
      case 'sheet-close': S.sheet = null; break;
      case 'sheet-add': sheetAdd(); break;
      case 'disc':
        sh.disc = d.v; sh.err = '';
        if (d.v === 'senior' && (sh.counts.youth || sh.counts.child)) {
          sh.counts.youth = 0; sh.counts.child = 0; sh.err = t('seniorReset');
        }
        break;
      case 'age-plus':
        if (sh.disc === 'senior' && d.age !== 'adult') break;
        if (sh.counts[d.age] >= AGE_MAX) { sh.err = t('errAgeMax'); break; }
        sh.counts[d.age] += 1; sh.err = '';
        break;
      case 'age-minus':
        if (sh.counts[d.age] > 0) sh.counts[d.age] -= 1;
        sh.err = '';
        break;
      case 'top':
        var i = sh.tops.indexOf(d.v);
        if (i >= 0) { sh.tops.splice(i, 1); sh.err = ''; }
        else if (sh.tops.length >= TOP_MAX) sh.err = t('errTop');
        else { sh.tops.push(d.v); sh.err = ''; }
        break;
      case 'size': sh.size = d.v; break;
      case 'qty-plus':
        if (sh.qty >= QTY_MAX) sh.err = t('errQty'); else { sh.qty += 1; sh.err = ''; }
        break;
      case 'qty-minus': if (sh.qty > 1) sh.qty -= 1; sh.err = ''; break;
      case 'open-drawer': S.drawer = true; break;
      case 'close-drawer': S.drawer = false; break;
      case 'line-plus':
        var lp = lineByUid(d.uid);
        if (lp.qty >= QTY_MAX) { S.toast = t('errQty'); break; }
        lp.qty += 1;
        if (syncPromo() > 0) S.toast = t('promoAdded')(1);
        break;
      case 'line-minus':
        var lm = lineByUid(d.uid);
        if (lm.qty > 1) { lm.qty -= 1; syncPromo(); }
        break;
      case 'line-del':
        var uid = d.uid;
        confirmBox(t('delConfirm'), function () {
          S.cart = S.cart.filter(function (l) { return l.uid !== uid; });
          syncPromo();
        }, t('del'));
        break;
      case 'clear-all':
        if (!S.cart.length) { alertBox(t('emptyCart')); break; }
        confirmBox(t('clearConfirm'), function () { S.cart = []; }, t('del'));
        break;
      case 'order':
        if (!S.cart.length) { alertBox(t('emptyCart')); break; }
        S.drawer = false; S.screen = 'review';
        break;
      case 'home':
        if (S.cart.length) confirmBox(t('homeConfirm'), reset);
        else reset();
        break;
      case 'review-back': S.screen = 'menu'; break;
      case 'review-pay': S.screen = 'payment'; S.payMethod = null; S.paid = false; break;
      case 'pay-back': S.screen = 'review'; S.payMethod = null; S.paid = false; break;
      case 'pay-method':
        S.payMethod = d.m; S.paid = false;
        confirmBox(t('payConfirm')(L(find(K.payMethods, d.m))), function () { S.paid = true; }, t('payGo'));
        break;
      case 'member-yes': S.modal = { type: 'alert', text: t('memberInfo'), info: true }; break;
      case 'member-no': S.modal = null; break;
      case 'm-ok': S.modal = null; break;
      case 'm-cancel': S.modal = null; onConfirm = null; break;
      case 'm-yes':
        var fn = onConfirm;
        S.modal = null; onConfirm = null;
        if (fn) fn();
        break;
    }
  }

  // ---------- rendering ----------
  var $ = function (id) { return document.getElementById(id); };

  function header() {
    return '<header class="top"><div class="brand"><span class="brand-star"></span>' + esc(L(K.brand)) +
      '</div><button class="home" data-act="home">' + t('home') + '</button></header>';
  }

  function renderAttract() {
    return '<div class="att">' +
      '<div class="bubbles"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="logo"><div class="logo-mark"><span></span></div>' +
      '<div class="logo-txt">' + esc(L(K.brand)) + '<small>AQUARIUM · RIDES · SKY DECK</small></div></div>' +
      '<div class="att-welcome">' + t('welcome') + '</div>' +
      '<div class="att-sub">' + t('sub') + '</div>' +
      '<div class="att-touch">' + t('touch') + '</div>' +
      '<div class="langs"><span class="langs-l">' + t('langLabel') + '</span>' +
      '<button data-act="lang" data-lang="ko" class="' + (S.lang === 'ko' ? 'on' : '') + '">한국어</button>' +
      '<button data-act="lang" data-lang="en" class="' + (S.lang === 'en' ? 'on' : '') + '">English</button></div>' +
      '<div class="waves"></div></div>';
  }

  function cardHtml(it) {
    var price = it.kind === 'ticket' ? t('from') + ' ' + won(it.ages.adult) : won(it.price);
    return '<div class="card' + (it.soldOut ? ' so' : '') + '" data-act="item" data-id="' + it.id + '">' +
      (it.promo ? '<i class="badge">2+1</i>' : '') +
      '<div class="pic pic-' + it.cat + '">' + it.emoji + '</div>' +
      '<div class="nm">' + esc(L(it)) + '</div><div class="pr">' + price + '</div>' +
      (it.soldOut ? '<div class="so-ov">' + t('soldout') + '</div>' : '') +
      '</div>';
  }

  function renderMenu() {
    var tabs = K.categories.map(function (c) {
      return '<li data-act="cat" data-cat="' + c.id + '" class="' + (S.cat === c.id ? 'on' : '') + '">' + esc(L(c)) + '</li>';
    }).join('');
    var cards = K.items.filter(function (it) { return it.cat === S.cat; }).map(cardHtml).join('');
    return header() +
      '<div class="banner"><span class="banner-ic">2+1</span>' + t('banner') + '</div>' +
      '<ul class="tabs">' + tabs + '</ul>' +
      '<div class="grid">' + cards + '</div>' +
      '<footer class="bar">' +
      '<div class="bar-cart" data-act="open-drawer"><span class="cart-ic"></span>' + t('cart') + '<b class="cnt-badge">' + cartCount() + '</b></div>' +
      '<div class="bar-total">' + t('total') + '<strong>' + won(cartTotal()) + '</strong></div>' +
      '<button class="bar-order" data-act="order">' + t('order') + '</button>' +
      '</footer>';
  }

  function stepper(minusAct, plusAct, n, extra, disabled) {
    var dis = disabled ? ' disabled' : '';
    return '<div class="step"><button data-act="' + minusAct + '"' + extra + dis + '>−</button>' +
      '<span class="cnt">' + n + '</span><button data-act="' + plusAct + '"' + extra + dis + '>+</button></div>';
  }

  function renderSheet() {
    var sh = S.sheet;
    if (!sh) return '';
    var it = ITEMS[sh.id];
    var body = '';
    var basePrice = it.kind === 'ticket' ? '' : '<div class="sh-base">' + won(it.price) + '</div>';
    if (it.kind === 'ticket') {
      if (it.discount) {
        var note = sh.disc === 'disabled' ? t('discNoteDisabled') : sh.disc === 'senior' ? t('discNoteSenior') :
          sh.disc ? '' : t('discNoteNone');
        body += '<div class="sec">' + t('discTitle') + ' <em class="req">' + t('required') + '</em></div>' +
          '<div class="seg">' + K.discounts.map(function (o) {
            return '<div class="seg-o' + (sh.disc === o.id ? ' on' : '') + '" data-act="disc" data-v="' + o.id + '">' +
              esc(L(o)) + (o.delta ? '<small>' + t('perPerson') + ' ' + won(o.delta) + '</small>' : '') + '</div>';
          }).join('') + '</div>' +
          (note ? '<div class="note">' + note + '</div>' : '');
      }
      body += '<div class="sec">' + t('people') + '</div>';
      body += K.ages.map(function (a) {
        var off = sh.disc === 'senior' && a.id !== 'adult';
        return '<div class="age' + (off ? ' off' : '') + '">' +
          '<div class="age-l">' + L(a) + '<small>' + (S.lang === 'ko' ? a.subKo : a.subEn) + '</small></div>' +
          '<div class="age-p">' + won(personPrice(it, a.id, sh.disc || 'general')) + '</div>' +
          stepper('age-minus', 'age-plus', sh.counts[a.id], ' data-age="' + a.id + '"', off) +
          '</div>';
      }).join('');
    } else if (it.kind === 'snack') {
      body += '<div class="sec">' + t('topTitle') + ' <em class="opt">' + t('optional') + '</em></div>' +
        '<div class="tops">' + K.toppings.map(function (o) {
          return '<div class="chk' + (sh.tops.indexOf(o.id) >= 0 ? ' on' : '') + '" data-act="top" data-v="' + o.id + '">' +
            '<span class="box"></span>' + esc(L(o)) + '<span class="chk-p">+' + won(o.delta) + '</span></div>';
        }).join('') + '</div>';
      body += '<div class="qty-row"><span>' + t('qty') + '</span>' + stepper('qty-minus', 'qty-plus', sh.qty, '', false) + '</div>';
    } else {
      if (it.sized) {
        body += '<div class="sec">' + t('sizeTitle') + ' <em class="req">' + t('required') + '</em></div>' +
          '<div class="sizes">' + K.sizes.map(function (o) {
            return '<button class="size' + (sh.size === o.id ? ' on' : '') + '" data-act="size" data-v="' + o.id + '">' +
              esc(L(o)) + (o.delta ? ' +' + won(o.delta) : '') + '</button>';
          }).join('') + '</div>';
      }
      body += '<div class="qty-row"><span>' + t('qty') + '</span>' + stepper('qty-minus', 'qty-plus', sh.qty, '', false) + '</div>';
    }
    return '<div class="sh-head"><div class="sh-pic pic-' + it.cat + '">' + it.emoji + '</div>' +
      '<div class="sh-title">' + esc(L(it)) + basePrice + '</div></div>' +
      '<div class="sh-body">' + body + '</div>' +
      '<div class="sh-err" role="alert">' + (sh.err || '') + '</div>' +
      '<div class="sh-sum">' + t('sum') + ' <b>' + won(sheetSum()) + '</b></div>' +
      '<div class="sh-btns"><button class="btn-ghost" data-act="sheet-close">' + t('cancel') + '</button>' +
      '<button class="btn-main" data-act="sheet-add">' + t('add') + '</button></div>';
  }

  function lineHtml(l) {
    var it = ITEMS[l.id];
    var ctrl;
    if (l.free) ctrl = '<span class="ln-q">×' + l.qty + '</span>';
    else if (it.kind === 'ticket') ctrl = '<span class="ln-q">' + t('persons')(people(l.counts)) + '</span>';
    else ctrl = '<div class="step sm"><button data-act="line-minus" data-uid="' + l.uid + '"' + (l.qty <= 1 ? ' disabled' : '') + '>−</button>' +
      '<span class="cnt">' + l.qty + '</span><button data-act="line-plus" data-uid="' + l.uid + '">+</button></div>';
    return '<div class="ln' + (l.free ? ' free' : '') + '">' +
      '<div class="ln-pic pic-' + it.cat + '">' + it.emoji + '</div>' +
      '<div class="ln-nm">' + esc(L(it)) + '<span class="ln-opt">' + esc(optText(l)) + '</span></div>' +
      '<div class="ln-ctrl">' + ctrl + '</div>' +
      '<div class="ln-pr">' + won(linePrice(l)) + '</div>' +
      (l.free ? '<div class="ln-badge">' + t('freeBadge') + '</div>'
        : '<div class="ln-del" data-act="line-del" data-uid="' + l.uid + '">' + t('del') + '</div>') +
      '</div>';
  }

  function renderDrawer() {
    var list = S.cart.length ? S.cart.map(lineHtml).join('') : '<div class="empty">' + t('emptyDrawer') + '</div>';
    return '<div class="dr-head">' + t('cart') + '<span class="dr-n">' + cartCount() + '</span>' +
      '<button class="x" data-act="close-drawer">✕</button></div>' +
      '<div class="dr-list">' + list + '</div>' +
      '<div class="dr-foot"><div class="dr-clear" data-act="clear-all">' + t('clearAll') + '</div>' +
      '<div class="dr-total">' + t('total') + '<b>' + won(cartTotal()) + '</b></div>' +
      '<button class="btn-main" data-act="order">' + t('order') + '</button></div>';
  }

  function renderReview() {
    var rows = S.cart.map(function (l) {
      var it = ITEMS[l.id];
      var q = it.kind === 'ticket' ? t('persons')(people(l.counts)) : '×' + l.qty;
      return '<div class="rv-row' + (l.free ? ' free' : '') + '"><div class="rv-nm">' + esc(L(it)) +
        '<small>' + esc(optText(l)) + '</small></div><div class="rv-q">' + q + '</div>' +
        '<div class="rv-p">' + won(linePrice(l)) + '</div></div>';
    }).join('');
    var hasDisc = S.cart.some(function (l) { return l.disc && l.disc !== 'general'; });
    return header() +
      '<h2 class="title">' + t('reviewTitle') + '</h2>' +
      '<div class="rv-list">' + rows + '</div>' +
      (hasDisc ? '<div class="rv-note">' + t('reviewNote') + '</div>' : '') +
      '<div class="rv-sum"><div class="rv-cnt">' + t('lineCount')(S.cart.length) + '</div>' +
      '<div class="rv-total">' + t('payTotal') + ' <b id="review-total">' + won(cartTotal()) + '</b></div></div>' +
      '<div class="rv-btns"><button class="btn-ghost" data-act="review-back">' + t('back') + '</button>' +
      '<button class="btn-main" data-act="review-pay">' + t('pay') + '</button></div>';
  }

  function renderPayment() {
    var m = K.payMethods.map(function (pm) {
      return '<div class="meth' + (S.payMethod === pm.id ? ' on' : '') + '" data-act="pay-method" data-m="' + pm.id + '">' +
        '<div class="meth-ic">' + pm.icon + '</div>' + esc(L(pm)) + '</div>';
    }).join('');
    return header() +
      '<h2 class="title">' + t('payTitle') + '</h2>' +
      '<div class="pay-amt">' + t('payAmount') + '<strong id="pay-total">' + won(cartTotal()) + '</strong></div>' +
      '<div class="methods">' + m + '</div>' +
      (S.paid ? '<div class="pay-notice">' + t('payNotice') + '</div>' : '') +
      '<div class="rv-btns"><button class="btn-ghost" data-act="pay-back">' + t('back') + '</button></div>';
  }

  function renderModal() {
    var m = S.modal;
    if (!m) return '';
    if (m.type === 'member') {
      return '<div class="mo-ic member"></div><div class="mo-title">' + t('memberTitle') + '</div>' +
        '<div class="mo-text">' + t('memberBody') + '</div>' +
        '<div class="mo-btns col"><button class="btn-main" data-act="member-yes">' + t('memberYes') + '</button>' +
        '<div class="mo-link" data-act="member-no">' + t('memberNo') + '</div></div>';
    }
    if (m.type === 'confirm') {
      return '<div class="mo-ic ask">?</div><div class="mo-text">' + esc(m.text) + '</div>' +
        '<div class="mo-btns"><button class="btn-ghost" data-act="m-cancel">' + t('cancel') + '</button>' +
        '<button class="btn-main" data-act="m-yes">' + esc(m.ok) + '</button></div>';
    }
    return '<div class="mo-ic ' + (m.info ? 'info">i' : 'warn">!') + '</div><div class="mo-text' + (m.info ? '' : ' err') + '">' + esc(m.text) + '</div>' +
      '<div class="mo-btns"><button class="btn-main" data-act="m-ok">' + t('ok') + '</button></div>';
  }

  function render() {
    document.documentElement.lang = S.lang;
    ['attract', 'menu', 'review', 'payment'].forEach(function (id) {
      $(id).classList.toggle('show', S.screen === id);
    });
    $('attract').innerHTML = S.screen === 'attract' ? renderAttract() : '';
    $('menu').innerHTML = S.screen === 'menu' ? renderMenu() : '';
    $('review').innerHTML = S.screen === 'review' ? renderReview() : '';
    $('payment').innerHTML = S.screen === 'payment' ? renderPayment() : '';

    var drawerOn = S.drawer && S.screen === 'menu';
    $('drawer').innerHTML = S.screen === 'menu' ? renderDrawer() : '';
    $('drawer').classList.toggle('open', drawerOn);
    $('drawer-backdrop').classList.toggle('open', drawerOn);
    $('drawer').classList.toggle('noanim', S.screen !== 'menu');
    $('drawer-backdrop').classList.toggle('noanim', S.screen !== 'menu');

    $('sheet').innerHTML = renderSheet();
    $('sheet-wrap').classList.toggle('open', !!S.sheet);

    $('modal').innerHTML = renderModal();
    $('modal-wrap').classList.toggle('open', !!S.modal);

    $('toast').textContent = S.toast || '';
    $('toast').classList.toggle('show', !!S.toast);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    var hadToast = !!S.toast;
    S.toast = null;
    if (el && !el.disabled) act(el.dataset.act, el);
    if (el || hadToast) render();
  });
  reset();
  render();
})();
