/* 구름다락 커피 셀프 주문 키오스크 */
(function () {
  'use strict';

  var D = window.KIOSK_DATA;
  var G = D.groups;
  var ITEMS = {};
  D.items.forEach(function (it) { ITEMS[it.id] = it; });

  var PAGE_SIZE = 8;
  var MAX_LINE_QTY = 20;
  var IDLE_MS = 180000;
  var IDLE_COUNTDOWN = 30;

  var app = document.getElementById('app');
  var ov = document.getElementById('overlay');
  var toastEl = document.getElementById('toast');

  var S = freshState();
  var stack = [];

  function freshState() {
    return {
      screen: 'attract',
      dine: null,
      cat: D.categories[0].id,
      page: 0,
      cart: [],
      upsellShown: false
    };
  }

  /* ---------------- utils ---------------- */
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function plusWon(n) { return n > 0 ? '+' + won(n) : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function opt(g, id) { for (var i = 0; i < g.options.length; i++) if (g.options[i].id === id) return g.options[i]; return null; }
  function catLabel(id) { for (var i = 0; i < D.categories.length; i++) if (D.categories[i].id === id) return D.categories[i].label; return ''; }
  function dineLabel() { for (var i = 0; i < D.dineOptions.length; i++) if (D.dineOptions[i].id === S.dine) return D.dineOptions[i].label; return ''; }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 2200);
  }

  /* ---------------- option logic ---------------- */
  function visibleGroups(item, sel) {
    return (item.groups || []).filter(function (gid) {
      var g = G[gid];
      if (!g.showIf) return true;
      return Object.keys(g.showIf).every(function (k) { return sel[k] === g.showIf[k]; });
    });
  }

  function initSel(item) {
    var sel = {};
    (item.groups || []).forEach(function (gid) {
      var g = G[gid];
      if (g.type === 'single') {
        if (gid === 'temp') sel[gid] = item.temps.length === 1 ? item.temps[0] : null;
        else sel[gid] = g.default || null;
      } else if (g.type === 'multi') sel[gid] = [];
      else if (g.type === 'count') sel[gid] = 0;
    });
    return sel;
  }

  function unitPrice(item, sel) {
    var p = item.price;
    visibleGroups(item, sel).forEach(function (gid) {
      var g = G[gid], v = sel[gid];
      if (g.type === 'single' && v) p += opt(g, v).delta;
      else if (g.type === 'multi') v.forEach(function (o) { p += opt(g, o).delta; });
      else if (g.type === 'count') p += v * g.delta;
    });
    return p;
  }

  function optSummary(item, sel) {
    var parts = [];
    visibleGroups(item, sel).forEach(function (gid) {
      var g = G[gid], v = sel[gid];
      if (g.type === 'single') {
        if (!v) return;
        if (g.summaryAlways || v !== g.default) parts.push((g.summaryPrefix || '') + opt(g, v).label);
      } else if (g.type === 'multi') {
        v.forEach(function (o) { parts.push(opt(g, o).label); });
      } else if (g.type === 'count') {
        if (v > 0) parts.push('샷 추가 ' + v);
      }
    });
    return parts.join(' · ');
  }

  function setUnitPrice(m) {
    var p = m.item.price;
    m.picks.forEach(function (pk, i) {
      if (pk.choice != null) p += m.item.set.steps[i].choices[pk.choice].delta;
    });
    return p;
  }

  function setSummary(m) {
    return m.item.set.steps.map(function (st, i) {
      var pk = m.picks[i];
      var ch = st.choices[pk.choice];
      var name = ITEMS[ch.item].name;
      var extra = [];
      if (pk.temp) extra.push(pk.temp);
      if (pk.warm) extra.push(opt(G.warm, pk.warm).label);
      return st.short + ': ' + name + (extra.length ? '(' + extra.join(', ') + ')' : '');
    }).join(' / ');
  }

  /* ---------------- cart ---------------- */
  function cartCount() { return S.cart.reduce(function (a, l) { return a + l.qty; }, 0); }
  function cartTotal() { return S.cart.reduce(function (a, l) { return a + l.unit * l.qty; }, 0); }

  function addLine(line) {
    for (var i = 0; i < S.cart.length; i++) {
      if (S.cart[i].key === line.key) {
        var q = S.cart[i].qty + line.qty;
        if (q > MAX_LINE_QTY) { q = MAX_LINE_QTY; toast('한 메뉴는 최대 ' + MAX_LINE_QTY + '개까지 주문할 수 있습니다.'); }
        S.cart[i].qty = q;
        return;
      }
    }
    S.cart.push(line);
  }

  function addSimple(item, qty) {
    addLine({ key: item.id, itemId: item.id, cat: item.cat, name: item.name, opts: '', unit: item.price, qty: qty || 1 });
  }

  /* ---------------- screens ---------------- */
  var HOME_SVG = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>';

  function header() {
    return '<header class="top">' +
      '<div class="home-btn" data-act="home">' + HOME_SVG + '</div>' +
      '<div class="brand"><span class="logo-cloud"></span><span class="brand-ko">' + esc(D.store.name) + '</span><span class="brand-branch">' + esc(D.store.branch) + '</span></div>' +
      (S.dine ? '<div class="dine-chip">' + esc(dineLabel()) + '</div>' : '<div class="dine-chip empty"></div>') +
      '</header>';
  }

  var screens = {
    attract: function () {
      return '<div class="attract" data-act="start">' +
        '<div class="att-brand"><div class="att-logo"><span class="logo-cloud big"></span></div>' +
        '<div class="att-name">' + esc(D.store.name) + '</div><div class="att-en">' + esc(D.store.nameEn) + '</div></div>' +
        '<div class="att-hero"><div class="hero-cup">☕</div><div class="hero-side">🥐</div><div class="hero-side r">🍰</div></div>' +
        '<div class="att-promo">🌰 가을 시즌 한정 <b>밤 크림 라떼</b> 출시</div>' +
        '<div class="att-cta">주문하시려면 화면을 터치해주세요</div>' +
        '<div class="att-sub">TOUCH TO ORDER</div>' +
        '</div>';
    },

    dine: function () {
      var tiles = D.dineOptions.map(function (d) {
        return '<div class="dine-tile" data-act="dine" data-v="' + d.id + '">' +
          '<div class="dt-ico">' + d.icon + '</div><div class="dt-label">' + esc(d.label) + '</div><div class="dt-sub">' + esc(d.sub) + '</div></div>';
      }).join('');
      return header() +
        '<div class="dine-wrap"><h1 class="q">어디에서 드시나요?</h1>' +
        '<div class="dine-row">' + tiles + '</div>' +
        '<button class="btn-ghost" data-act="toAttract">처음으로</button></div>';
    },

    menu: function () {
      var tabs = D.categories.map(function (c) {
        return '<div class="tab' + (c.id === S.cat ? ' on' : '') + '" data-act="tab" data-v="' + c.id + '">' + esc(c.label) + '</div>';
      }).join('');

      var list = D.items.filter(function (it) { return it.cat === S.cat; });
      var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (S.page > pages - 1) S.page = pages - 1;
      var view = list.slice(S.page * PAGE_SIZE, S.page * PAGE_SIZE + PAGE_SIZE);

      var tiles = view.map(function (it) {
        var badges = '';
        if (it.badge) badges += '<span class="badge b-' + it.badge.toLowerCase() + '">' + it.badge + '</span>';
        if (it.temps && it.temps.length === 1) badges += '<span class="badge b-' + it.temps[0].toLowerCase() + '">' + it.temps[0] + ' ONLY</span>';
        if (it.timeBadge) badges += '<span class="badge b-time">' + it.timeBadge + '</span>';
        var cls = 'tile cat-' + it.cat + (it.soldOut ? ' soldout' : '') + (it.unavailable ? ' unavail' : '');
        return '<div class="' + cls + '" data-act="item" data-id="' + it.id + '">' +
          '<div class="badges">' + badges + '</div>' +
          '<div class="pic"><span>' + it.emoji + '</span></div>' +
          '<div class="t-name">' + esc(it.name) + '</div>' +
          '<div class="t-price">' + won(it.price) + '</div>' +
          (it.soldOut ? '<div class="stamp">SOLD OUT<br>품절</div>' : '') +
          (it.unavailable ? '<div class="stamp time">준비중</div>' : '') +
          '</div>';
      }).join('');
      for (var f = view.length; f < PAGE_SIZE; f++) tiles += '<div class="tile filler"></div>';

      var pager = pages > 1 ?
        '<div class="pager"><div class="pg-arrow' + (S.page === 0 ? ' dis' : '') + '" data-act="pgPrev">&#8249;</div>' +
        '<div class="pg-dots">' + Array.apply(null, Array(pages)).map(function (_, i) { return '<i class="' + (i === S.page ? 'on' : '') + '"></i>'; }).join('') +
        '<span class="pg-num">' + (S.page + 1) + ' / ' + pages + '</span></div>' +
        '<div class="pg-arrow' + (S.page === pages - 1 ? ' dis' : '') + '" data-act="pgNext">&#8250;</div></div>'
        : '<div class="pager"></div>';

      var lines = S.cart.length ? S.cart.map(function (l, i) {
        return '<div class="cart-line">' +
          '<div class="cl-info"><div class="cl-name">' + esc(l.name) + '</div>' + (l.opts ? '<div class="cl-opt">' + esc(l.opts) + '</div>' : '') + '</div>' +
          '<div class="cl-qty"><button class="qbtn" data-act="qtyMinus" data-i="' + i + '">−</button><span class="qv">' + l.qty + '</span><button class="qbtn" data-act="qtyPlus" data-i="' + i + '">+</button></div>' +
          '<div class="cl-price">' + won(l.unit * l.qty) + '</div>' +
          '<div class="cl-del" data-act="del" data-i="' + i + '">✕</div>' +
          '</div>';
      }).join('') : '<div class="cart-empty">메뉴를 선택해주세요</div>';

      return header() +
        '<div class="banner"><span class="bn-emoji">🍂</span><div><b>가을 시즌 한정</b> 밤 크림 라떼 · 홍시 스무디 · 애플 시나몬 티<div class="bn-sub">스탬프 10개 적립 시 아메리카노 1잔 무료</div></div></div>' +
        '<nav class="tabs">' + tabs + '</nav>' +
        '<section class="grid">' + tiles + '</section>' +
        pager +
        '<section class="cart">' +
        '<div class="cart-list" data-scroll="cart">' + lines + '</div>' +
        '<div class="cart-sum">' +
        '<div class="cs-count">총 <b>' + cartCount() + '</b>개</div>' +
        '<div class="cs-total"><span class="lbl">총 주문금액</span><span class="amt">' + won(cartTotal()) + '</span></div>' +
        '<div class="cs-btns"><button class="btn-clear" data-act="clearAll">전체 취소</button><button class="btn-order" data-act="checkout">주문하기</button></div>' +
        '</div></section>';
    },

    confirm: function () {
      var rows = S.cart.map(function (l) {
        return '<div class="cf-row"><div class="cf-info"><div class="cf-name">' + esc(l.name) + '</div>' + (l.opts ? '<div class="cf-opt">' + esc(l.opts) + '</div>' : '') + '</div>' +
          '<div class="cf-qty">' + l.qty + '개</div><div class="cf-price">' + won(l.unit * l.qty) + '</div></div>';
      }).join('');
      return header() +
        '<div class="page"><h1 class="q">주문 내역을 확인해주세요</h1>' +
        '<div class="cf-type">주문 유형 <b>' + esc(dineLabel()) + '</b></div>' +
        '<div class="cf-list" data-scroll="cf">' + rows + '</div>' +
        '<div class="cf-total"><span>총 결제금액</span><b>' + won(cartTotal()) + '</b></div>' +
        '<div class="btn-row"><button class="btn-sub" data-act="cfBack">이전</button><button class="btn-main" data-act="cfPay">결제하기</button></div></div>';
    },

    pay: function () {
      var methods = [
        { id: 'card', icon: '💳', label: '카드 결제', sub: '신용 · 체크카드' },
        { id: 'easy', icon: '📱', label: '간편결제', sub: 'QR · 바코드' },
        { id: 'coupon', icon: '🎟️', label: '모바일 쿠폰', sub: '교환권 · 금액권' }
      ];
      return header() +
        '<div class="page"><h1 class="q">결제 수단을 선택해주세요</h1>' +
        '<div class="pay-amt">결제금액 <b>' + won(cartTotal()) + '</b></div>' +
        '<div class="pay-row">' + methods.map(function (m) {
          return '<div class="pay-tile" data-act="payMethod" data-v="' + m.id + '"><div class="pt-ico">' + m.icon + '</div><div class="pt-label">' + m.label + '</div><div class="pt-sub">' + m.sub + '</div></div>';
        }).join('') + '</div>' +
        '<div class="btn-row"><button class="btn-sub" data-act="payBack">이전</button></div></div>';
    },

    card: function () {
      return header() +
        '<div class="page card-page"><h1 class="q">카드를 투입구에 끝까지 꽂아주세요</h1>' +
        '<div class="card-ill"><div class="slot"></div><div class="card-shape"><div class="chip-ic"></div></div><div class="arrow">⬇</div></div>' +
        '<div class="pay-amt">결제금액 <b>' + won(cartTotal()) + '</b></div>' +
        '<p class="card-note">결제가 완료될 때까지 카드를 빼지 마세요.</p>' +
        '<div class="btn-row"><button class="btn-sub" data-act="cardCancel">결제 취소</button></div></div>';
    }
  };

  function keepScroll(root, fn) {
    var saved = {};
    root.querySelectorAll('[data-scroll]').forEach(function (el) { saved[el.getAttribute('data-scroll')] = el.scrollTop; });
    fn();
    root.querySelectorAll('[data-scroll]').forEach(function (el) {
      var k = el.getAttribute('data-scroll');
      if (saved[k] != null) el.scrollTop = saved[k];
    });
  }

  var lastScreen = null;
  function render() {
    if (lastScreen !== S.screen) { toastEl.className = ''; lastScreen = S.screen; }
    keepScroll(app, function () {
      app.className = 'screen-' + S.screen;
      app.innerHTML = screens[S.screen]();
    });
    renderOverlay();
    bumpIdle();
  }

  /* ---------------- modals ---------------- */
  function renderOverlay() {
    keepScroll(ov, function () {
      ov.innerHTML = stack.map(function (m, i) {
        return '<div class="backdrop" style="z-index:' + (100 + i) + '">' + modalHtml[m.type](m) + '</div>';
      }).join('');
    });
    ov.style.display = stack.length ? 'block' : 'none';
  }
  function push(m) { stack.push(m); renderOverlay(); }
  function pop() { stack.pop(); renderOverlay(); }
  function top() { return stack[stack.length - 1]; }
  function findModal(type) { for (var i = stack.length - 1; i >= 0; i--) if (stack[i].type === type) return stack[i]; return null; }

  function alertBox(title, msg, buttons) {
    push({ type: 'alert', title: title, msg: msg, buttons: buttons || [{ label: '확인', act: 'closeTop', main: true }] });
  }

  function groupHtml(item, sel, gid) {
    var g = G[gid];
    var badge = g.required ? '<span class="req">필수</span>' : '<span class="optl">선택</span>';
    var hint = g.type === 'multi' && g.max > 1 ? '<span class="hint">최대 ' + g.max + '개</span>' :
      g.type === 'count' ? '<span class="hint">최대 ' + g.max + '회 · 1' + g.unit + '당 ' + plusWon(g.delta) + '</span>' : '';
    var body = '';
    if (g.type === 'count') {
      body = '<div class="counter"><button class="cbtn" data-act="cnt" data-g="' + gid + '" data-d="-1">−</button>' +
        '<span class="cval">' + sel[gid] + '</span>' +
        '<button class="cbtn" data-act="cnt" data-g="' + gid + '" data-d="1">+</button></div>';
    } else {
      body = '<div class="chips">' + g.options.map(function (o) {
        var on = g.type === 'single' ? sel[gid] === o.id : sel[gid].indexOf(o.id) >= 0;
        var off = gid === 'temp' && item.temps.indexOf(o.id) < 0;
        return '<div class="chip' + (on ? ' on' : '') + (off ? ' off' : '') + (gid === 'temp' ? ' t-' + o.id.toLowerCase() : '') + '" data-act="' + (g.type === 'single' ? 'pick' : 'toggle') + '" data-g="' + gid + '" data-o="' + o.id + '">' +
          '<span class="c-lbl">' + esc(o.label) + '</span>' +
          (o.sub ? '<span class="c-sub">' + esc(o.sub) + '</span>' : '') +
          (o.delta ? '<span class="c-delta">' + plusWon(o.delta) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
    }
    return '<div class="ogroup"><div class="og-head"><span class="og-title">' + esc(g.title) + '</span>' + badge + hint + '</div>' + body + '</div>';
  }

  var modalHtml = {
    alert: function (m) {
      return '<div class="dialog"><div class="dlg-title">' + esc(m.title) + '</div>' +
        '<div class="dlg-msg">' + esc(m.msg).replace(/\n/g, '<br>') + '</div>' +
        '<div class="dlg-btns">' + m.buttons.map(function (b) {
          return '<button class="' + (b.main ? 'btn-main' : 'btn-sub') + '" data-act="' + b.act + '">' + esc(b.label) + '</button>';
        }).join('') + '</div></div>';
    },

    option: function (m) {
      var it = m.item;
      var groups = visibleGroups(it, m.sel).map(function (gid) { return groupHtml(it, m.sel, gid); }).join('');
      return '<div class="sheet">' +
        '<div class="sh-head"><div class="sh-pic cat-' + it.cat + '">' + it.emoji + '</div>' +
        '<div class="sh-meta"><div class="sh-name">' + esc(it.name) + '</div><div class="sh-desc">' + esc(it.desc || '') + '</div><div class="sh-base">' + won(it.price) + '</div></div>' +
        '<div class="sh-x" data-act="closeTop">✕</div></div>' +
        '<div class="sh-body" data-scroll="opt">' + groups + '</div>' +
        '<div class="sh-foot"><div class="qty-box"><span class="qlbl">수량</span><button class="qbtn" data-act="mq" data-d="-1">−</button><span class="qv">' + m.qty + '</span><button class="qbtn" data-act="mq" data-d="1">+</button></div>' +
        '<div class="sh-total">' + won(unitPrice(it, m.sel) * m.qty) + '</div></div>' +
        '<div class="sh-btns"><button class="btn-sub" data-act="closeTop">취소</button><button class="btn-main" data-act="optAdd">장바구니 담기</button></div>' +
        '</div>';
    },

    set: function (m) {
      var it = m.item, steps = it.set.steps, st = steps[m.step], pk = m.picks[m.step];
      var prog = steps.map(function (s, i) {
        return '<div class="sp' + (i === m.step ? ' on' : '') + (i < m.step ? ' done' : '') + '"><span>' + (i + 1) + '</span>' + esc(s.title) + '</div>';
      }).join('');
      var choices = st.choices.map(function (c, ci) {
        var ref = ITEMS[c.item];
        return '<div class="set-choice' + (pk.choice === ci ? ' on' : '') + (ref.soldOut ? ' soldout' : '') + '" data-act="setPick" data-i="' + ci + '">' +
          '<div class="sc-pic">' + ref.emoji + '</div><div class="sc-name">' + esc(ref.name) + '</div>' +
          '<div class="sc-delta">' + (c.delta ? plusWon(c.delta) : '추가금 없음') + '</div>' +
          (ref.soldOut ? '<div class="stamp sm">품절</div>' : '') + '</div>';
      }).join('');
      var sub = '';
      if (pk.choice != null) {
        var ref = ITEMS[st.choices[pk.choice].item];
        if (st.kind === 'drink') {
          sub = '<div class="ogroup"><div class="og-head"><span class="og-title">온도 선택</span><span class="req">필수</span></div><div class="chips">' +
            ['HOT', 'ICED'].map(function (t) {
              var off = ref.temps.indexOf(t) < 0;
              return '<div class="chip t-' + t.toLowerCase() + (pk.temp === t ? ' on' : '') + (off ? ' off' : '') + '" data-act="setTemp" data-v="' + t + '"><span class="c-lbl">' + t + '</span></div>';
            }).join('') + '</div></div>';
        } else if ((ref.groups || []).indexOf('warm') >= 0) {
          sub = '<div class="ogroup"><div class="og-head"><span class="og-title">데우기</span><span class="req">필수</span></div><div class="chips">' +
            G.warm.options.map(function (o) {
              return '<div class="chip' + (pk.warm === o.id ? ' on' : '') + '" data-act="setWarm" data-v="' + o.id + '"><span class="c-lbl">' + o.label + '</span></div>';
            }).join('') + '</div></div>';
        }
      }
      var last = m.step === steps.length - 1;
      return '<div class="sheet set-sheet">' +
        '<div class="sh-head"><div class="sh-pic cat-set">' + it.emoji + '</div>' +
        '<div class="sh-meta"><div class="sh-name">' + esc(it.name) + '</div><div class="sh-desc">' + esc(it.desc) + '</div><div class="sh-base">' + won(it.price) + '</div></div>' +
        '<div class="sh-x" data-act="closeTop">✕</div></div>' +
        '<div class="set-prog">' + prog + '</div>' +
        '<div class="sh-body" data-scroll="set">' +
        '<div class="set-step-title">STEP ' + (m.step + 1) + '. ' + esc(st.title) + '</div>' +
        (st.kind === 'drink' ? '<div class="set-note">세트 음료는 레귤러 사이즈로 제공됩니다.</div>' : '') +
        '<div class="set-grid">' + choices + '</div>' + sub + '</div>' +
        '<div class="sh-foot">' +
        (last ? '<div class="qty-box"><span class="qlbl">수량</span><button class="qbtn" data-act="setQty" data-d="-1">−</button><span class="qv">' + m.qty + '</span><button class="qbtn" data-act="setQty" data-d="1">+</button></div>' : '<div class="qty-box"></div>') +
        '<div class="sh-total">' + won(setUnitPrice(m) * m.qty) + '</div></div>' +
        '<div class="sh-btns"><button class="btn-sub" data-act="setPrev">' + (m.step === 0 ? '취소' : '이전') + '</button>' +
        '<button class="btn-main" data-act="' + (last ? 'setAdd' : 'setNext') + '">' + (last ? '장바구니 담기' : '다음') + '</button></div>' +
        '</div>';
    },

    upsell: function () {
      var cards = D.upsell.map(function (id) {
        var it = ITEMS[id];
        var n = 0;
        S.cart.forEach(function (l) { if (l.key === id) n = l.qty; });
        return '<div class="ups-card"><div class="ups-pic">' + it.emoji + '</div><div class="ups-name">' + esc(it.name) + '</div>' +
          '<div class="ups-price">' + won(it.price) + '</div>' +
          (n ? '<div class="ups-in">담김 ' + n + '</div>' : '') +
          '<button class="btn-ups" data-act="upsAdd" data-id="' + id + '">담기</button></div>';
      }).join('');
      return '<div class="dialog wide"><div class="dlg-title">함께 드시면 더 맛있어요 🍰</div>' +
        '<div class="dlg-msg">음료와 잘 어울리는 디저트를 추천해 드려요.</div>' +
        '<div class="ups-row">' + cards + '</div>' +
        '<div class="ups-total">총 주문금액 <b>' + won(cartTotal()) + '</b></div>' +
        '<div class="dlg-btns"><button class="btn-sub" data-act="upsSkip">괜찮아요</button><button class="btn-main" data-act="upsGo">주문 계속하기</button></div></div>';
    },

    idle: function (m) {
      return '<div class="dialog"><div class="dlg-title">주문을 계속하시겠어요?</div>' +
        '<div class="dlg-msg">입력이 없어 <b class="idle-n">' + m.left + '</b>초 후 처음 화면으로 돌아갑니다.<br>담긴 메뉴는 모두 삭제됩니다.</div>' +
        '<div class="dlg-btns"><button class="btn-sub" data-act="idleQuit">처음으로</button><button class="btn-main" data-act="idleKeep">계속 주문하기</button></div></div>';
    }
  };

  /* ---------------- idle timeout ---------------- */
  var idleTimer = null, idleTick = null;
  function bumpIdle() {
    clearTimeout(idleTimer);
    if (S.screen === 'attract') return;
    if (findModal('idle')) return;
    idleTimer = setTimeout(showIdle, IDLE_MS);
  }
  function showIdle() {
    var m = { type: 'idle', left: IDLE_COUNTDOWN };
    push(m);
    idleTick = setInterval(function () {
      m.left--;
      if (m.left <= 0) { resetAll(); return; }
      var n = ov.querySelector('.idle-n');
      if (n) n.textContent = m.left;
    }, 1000);
  }
  function clearIdle() { clearInterval(idleTick); idleTick = null; }

  function resetAll() {
    clearIdle();
    stack = [];
    S = freshState();
    render();
  }

  /* ---------------- actions ---------------- */
  function openItem(it) {
    if (it.soldOut) { toast('죄송합니다. 품절된 메뉴입니다.'); return; }
    if (it.unavailable) { alertBox('주문 가능 시간이 아닙니다', it.unavailable); return; }
    if (it.set) {
      push({ type: 'set', item: it, step: 0, qty: 1, picks: it.set.steps.map(function () { return { choice: null, temp: null, warm: null }; }) });
      return;
    }
    if (!it.groups || !it.groups.length) {
      addSimple(it, 1);
      toast('장바구니에 담았습니다.');
      render();
      return;
    }
    push({ type: 'option', item: it, sel: initSel(it), qty: 1 });
  }

  function setStepError(m) {
    var st = m.item.set.steps[m.step], pk = m.picks[m.step];
    if (pk.choice == null) return st.kind === 'drink' ? '음료를 선택해주세요.' : st.short + '를 선택해주세요.';
    if (st.kind === 'drink' && !pk.temp) return '음료 온도(HOT/ICED)를 선택해주세요.';
    var ref = ITEMS[st.choices[pk.choice].item];
    if (st.kind === 'food' && (ref.groups || []).indexOf('warm') >= 0 && !pk.warm) return '데우기 여부를 선택해주세요.';
    return null;
  }

  var A = {
    start: function () { S.screen = 'dine'; },
    toAttract: function () { resetAll(); return false; },
    dine: function (el) { S.dine = el.dataset.v; S.screen = 'menu'; S.cat = D.categories[0].id; S.page = 0; },
    home: function () {
      if (!S.cart.length) { resetAll(); return false; }
      alertBox('처음으로 돌아갈까요?', '담긴 메뉴가 모두 삭제됩니다.', [{ label: '아니요', act: 'closeTop' }, { label: '처음으로', act: 'goHome', main: true }]);
      return false;
    },
    goHome: function () { resetAll(); return false; },
    tab: function (el) { S.cat = el.dataset.v; S.page = 0; },
    pgPrev: function () { if (S.page > 0) S.page--; },
    pgNext: function () {
      var n = D.items.filter(function (it) { return it.cat === S.cat; }).length;
      if (S.page < Math.ceil(n / PAGE_SIZE) - 1) S.page++;
    },
    item: function (el) { openItem(ITEMS[el.dataset.id]); return false; },
    closeTop: function () { pop(); return false; },

    /* option sheet */
    pick: function (el) {
      var m = findModal('option'), gid = el.dataset.g, o = el.dataset.o;
      if (gid === 'temp' && m.item.temps.indexOf(o) < 0) { toast(m.item.temps[0] + ' 전용 메뉴입니다.'); return false; }
      m.sel[gid] = o;
      renderOverlay(); return false;
    },
    toggle: function (el) {
      var m = findModal('option'), gid = el.dataset.g, o = el.dataset.o, g = G[gid], arr = m.sel[gid];
      var idx = arr.indexOf(o);
      if (idx >= 0) arr.splice(idx, 1);
      else if (arr.length >= g.max) {
        if (g.max === 1) { arr.splice(0, 1, o); }
        else { toast(g.title.replace(' 추가', '') + '은 최대 ' + g.max + '개까지 선택할 수 있습니다.'); return false; }
      } else arr.push(o);
      renderOverlay(); return false;
    },
    cnt: function (el) {
      var m = findModal('option'), gid = el.dataset.g, g = G[gid], d = +el.dataset.d, v = m.sel[gid] + d;
      if (v < 0) return false;
      if (v > g.max) { toast('샷 추가는 최대 ' + g.max + '회까지 가능합니다.'); return false; }
      m.sel[gid] = v;
      renderOverlay(); return false;
    },
    mq: function (el) {
      var m = findModal('option'), v = m.qty + (+el.dataset.d);
      if (v < 1) return false;
      if (v > MAX_LINE_QTY) { toast('한 메뉴는 최대 ' + MAX_LINE_QTY + '개까지 주문할 수 있습니다.'); return false; }
      m.qty = v; renderOverlay(); return false;
    },
    optAdd: function () {
      var m = findModal('option'), it = m.item;
      var missing = visibleGroups(it, m.sel).filter(function (gid) { return G[gid].type === 'single' && G[gid].required && !m.sel[gid]; });
      if (missing.length) {
        alertBox('필수 옵션을 선택해주세요', missing.map(function (gid) { return '· ' + G[gid].title; }).join('\n'));
        return false;
      }
      var key = it.id + '|' + JSON.stringify(visibleGroups(it, m.sel).map(function (gid) { return [gid, m.sel[gid]]; }));
      addLine({ key: key, itemId: it.id, cat: it.cat, name: it.name, opts: optSummary(it, m.sel), unit: unitPrice(it, m.sel), qty: m.qty });
      stack.splice(stack.indexOf(m), 1);
      toast('장바구니에 담았습니다.');
    },

    /* set sheet */
    setPick: function (el) {
      var m = findModal('set'), st = m.item.set.steps[m.step], ci = +el.dataset.i, ref = ITEMS[st.choices[ci].item];
      if (ref.soldOut) { toast('죄송합니다. 품절된 메뉴입니다.'); return false; }
      var pk = m.picks[m.step];
      if (pk.choice !== ci) { pk.choice = ci; pk.temp = ref.temps && ref.temps.length === 1 ? ref.temps[0] : null; pk.warm = null; }
      renderOverlay(); return false;
    },
    setTemp: function (el) {
      var m = findModal('set'), st = m.item.set.steps[m.step], pk = m.picks[m.step], ref = ITEMS[st.choices[pk.choice].item];
      if (ref.temps.indexOf(el.dataset.v) < 0) { toast(ref.temps[0] + ' 전용 메뉴입니다.'); return false; }
      pk.temp = el.dataset.v; renderOverlay(); return false;
    },
    setWarm: function (el) { var m = findModal('set'); m.picks[m.step].warm = el.dataset.v; renderOverlay(); return false; },
    setPrev: function () { var m = findModal('set'); if (m.step === 0) pop(); else { m.step--; renderOverlay(); } return false; },
    setNext: function () {
      var m = findModal('set'), err = setStepError(m);
      if (err) { toast(err); return false; }
      m.step++; renderOverlay(); return false;
    },
    setQty: function (el) {
      var m = findModal('set'), v = m.qty + (+el.dataset.d);
      if (v < 1 || v > MAX_LINE_QTY) return false;
      m.qty = v; renderOverlay(); return false;
    },
    setAdd: function () {
      var m = findModal('set'), err = setStepError(m);
      if (err) { toast(err); return false; }
      addLine({ key: m.item.id + '|' + JSON.stringify(m.picks), itemId: m.item.id, cat: m.item.cat, name: m.item.name, opts: setSummary(m), unit: setUnitPrice(m), qty: m.qty });
      stack.splice(stack.indexOf(m), 1);
      toast('장바구니에 담았습니다.');
    },

    /* cart */
    qtyMinus: function (el) { var l = S.cart[+el.dataset.i]; if (l.qty > 1) l.qty--; },
    qtyPlus: function (el) {
      var l = S.cart[+el.dataset.i];
      if (l.qty >= MAX_LINE_QTY) { toast('한 메뉴는 최대 ' + MAX_LINE_QTY + '개까지 주문할 수 있습니다.'); return false; }
      l.qty++;
    },
    del: function (el) { S.cart.splice(+el.dataset.i, 1); },
    clearAll: function () {
      if (!S.cart.length) return false;
      alertBox('전체 취소', '장바구니에 담긴 메뉴를 모두 삭제할까요?', [{ label: '아니요', act: 'closeTop' }, { label: '삭제', act: 'doClear', main: true }]);
      return false;
    },
    doClear: function () { S.cart = []; pop(); },
    checkout: function () {
      if (!S.cart.length) { toast('메뉴를 먼저 선택해주세요.'); return false; }
      var hasDessert = S.cart.some(function (l) { return l.cat === 'bakery'; });
      if (!hasDessert && !S.upsellShown) { S.upsellShown = true; push({ type: 'upsell' }); return false; }
      S.screen = 'confirm';
    },
    upsAdd: function (el) { addSimple(ITEMS[el.dataset.id], 1); toast('장바구니에 담았습니다.'); },
    upsSkip: function () { pop(); S.screen = 'confirm'; },
    upsGo: function () { pop(); S.screen = 'confirm'; },

    /* confirm / pay */
    cfBack: function () { S.screen = 'menu'; },
    cfPay: function () { S.screen = 'pay'; },
    payBack: function () { S.screen = 'confirm'; },
    payMethod: function (el) {
      if (el.dataset.v === 'card') { S.screen = 'card'; return; }
      alertBox('이용 불가', '현재 사용할 수 없는 결제 수단입니다.\n카드 결제를 이용해주세요.');
      return false;
    },
    cardCancel: function () { S.screen = 'pay'; },

    idleKeep: function () { clearIdle(); stack = stack.filter(function (m) { return m.type !== 'idle'; }); renderOverlay(); bumpIdle(); return false; },
    idleQuit: function () { resetAll(); return false; }
  };

  document.addEventListener('pointerdown', function () { bumpIdle(); }, true);
  document.addEventListener('keydown', function () { bumpIdle(); }, true);

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = A[el.dataset.act];
    if (!fn) return;
    var r = fn(el);
    if (r !== false) render();
  });

  render();
})();
