(function () {
  'use strict';

  var D = window.KIOSK_DATA;
  // Fake inactivity timer (deterministic, no real clock):
  // the warning opens right after the 12th counted tap of an order, once per order.
  var IDLE_TAP = 12;
  var IDLE_START = 30;   // seconds shown in the warning
  var IDLE_STEP = 10;    // fake seconds that pass per tap on the dark backdrop
  var LINE_MAX = 9;
  var TEMP_GROUPS = ['temp', 'tempUp', 'tempIced'];
  var SCREENS = ['attract', 'type', 'menu', 'review', 'pay'];

  function $(id) { return document.getElementById(id); }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function itemById(id) { return D.items.filter(function (i) { return i.id === id; })[0]; }
  function opt(g, id) { return D.groups[g].options.filter(function (o) { return o.id === id; })[0]; }

  var S = { screen: 'attract', type: null, cat: 'coffee', cart: [], taps: 0, idleShown: false, idleOpen: false, idleLeft: IDLE_START };
  var draft = null;
  var dlgOk = null;

  // ---------- price & option helpers ----------
  function isIced(sel) { return TEMP_GROUPS.some(function (g) { return sel[g] === 'iced'; }); }
  function applicable(item, sel) {
    return item.groups.filter(function (g) { return !D.groups[g].onlyWhenIced || isIced(sel); });
  }
  function unitPrice(item, sel) {
    var p = item.price;
    applicable(item, sel).forEach(function (g) {
      var G = D.groups[g], v = sel[g];
      if (G.type === 'single') { if (v) p += opt(g, v).price; }
      else if (G.type === 'multi') { v.forEach(function (id) { p += opt(g, id).price; }); }
      else { p += v * G.options[0].price; }
    });
    return p;
  }
  function summary(item, sel) {
    var parts = [];
    if (item.hotOnly) parts.push('HOT');
    applicable(item, sel).forEach(function (g) {
      var v = sel[g];
      if (TEMP_GROUPS.indexOf(g) >= 0) parts.push(v === 'iced' ? 'ICED' : 'HOT');
      else if (g === 'ice') parts.push('얼음 ' + opt(g, v).label);
      else if (g === 'shot') { if (v > 0) parts.push('샷 추가 ' + v); }
      else if (g === 'syrup') { v.forEach(function (id) { parts.push(opt(g, id).label); }); }
      else if (g === 'milk') { if (v !== 'regular') parts.push(opt(g, v).label); }
      else if (g === 'warm') { if (v === 'warm') parts.push('데워 주세요'); }
    });
    return parts.join(' · ');
  }
  function normalize(item, sel) {
    var out = {};
    applicable(item, sel).forEach(function (g) {
      var G = D.groups[g];
      if (G.type === 'multi') {
        out[g] = G.options.map(function (o) { return o.id; }).filter(function (id) { return sel[g].indexOf(id) >= 0; });
      } else out[g] = sel[g];
    });
    return out;
  }

  // ---------- screens ----------
  function show(name) {
    SCREENS.forEach(function (n) { $('scr-' + n).hidden = n !== name; });
    S.screen = name;
  }
  function resetOrder(notice) {
    S.type = null; S.cat = 'coffee'; S.cart = []; S.taps = 0;
    S.idleShown = false; S.idleOpen = false; S.idleLeft = IDLE_START;
    draft = null; dlgOk = null;
    $('opt-modal').hidden = true; $('dialog').hidden = true; $('idle').hidden = true; $('toast').hidden = true;
    $('attract-notice').textContent = notice || '';
    $('attract-notice').hidden = !notice;
    show('attract');
  }
  function total() { return S.cart.reduce(function (s, l) { return s + l.unit * l.qty; }, 0); }
  function count() { return S.cart.reduce(function (s, l) { return s + l.qty; }, 0); }

  function renderTabs() {
    $('tabs').innerHTML = D.categories.map(function (c) {
      return '<div class="tab' + (c.id === S.cat ? ' on' : '') + '" data-act="cat" data-cat="' + c.id + '">' + c.label + '</div>';
    }).join('');
  }
  function renderGrid() {
    $('grid').innerHTML = D.items.filter(function (i) { return i.cat === S.cat; }).map(function (i) {
      var tag = '';
      if (i.groups.indexOf('tempIced') >= 0) tag = '<div class="tag iced">ICE ONLY</div>';
      else if (i.hotOnly) tag = '<div class="tag hot">HOT ONLY</div>';
      return '<div class="card' + (i.soldOut ? ' soldout' : '') + '" data-act="item" data-id="' + i.id + '">' +
        '<div class="pic cat-' + i.cat + '">' + i.pic + '</div>' + tag +
        '<span class="nm">' + esc(i.name) + '</span><span class="pr">' + won(i.price) + '</span>' +
        (i.soldOut ? '<div class="so">품절</div>' : '') + '</div>';
    }).join('');
  }
  function renderCart() {
    var lines = $('cart-lines');
    if (!S.cart.length) {
      lines.innerHTML = '<div class="cart-empty">메뉴를 선택해 주세요</div>';
    } else {
      lines.innerHTML = S.cart.map(function (l, i) {
        var it = itemById(l.id);
        return '<div class="line" data-idx="' + i + '">' +
          '<div class="l-info"><span class="l-name">' + esc(it.name) + '</span><span class="l-opts">' + esc(l.summary) + '</span></div>' +
          '<div class="l-qty"><button type="button" data-act="l-minus" data-idx="' + i + '"' + (l.qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span>' + l.qty + '</span><button type="button" data-act="l-plus" data-idx="' + i + '">+</button></div>' +
          '<div class="l-price">' + won(l.unit * l.qty) + '</div>' +
          '<button type="button" class="l-del" data-act="l-del" data-idx="' + i + '">✕</button></div>';
      }).join('');
    }
    $('cart-count').textContent = count();
    $('cart-total').textContent = won(total());
  }
  function renderReview() {
    $('review-type').textContent = S.type === 'take' ? '🛍️ 포장 주문' : '🍽️ 매장 식사';
    $('review-lines').innerHTML = S.cart.map(function (l) {
      var it = itemById(l.id);
      return '<div class="rv-line"><div class="rv-name">' + esc(it.name) + ' <span class="rv-qty">x ' + l.qty + '</span></div>' +
        '<div class="rv-opts">' + esc(l.summary) + '</div><div class="rv-price">' + won(l.unit * l.qty) + '</div></div>';
    }).join('');
    $('review-total').textContent = won(total());
  }
  function renderPay() {
    $('pay-total').textContent = won(total());
    $('pay-guide').textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('.pay-m'), function (m) { m.classList.remove('on'); });
  }

  // ---------- toast / dialog ----------
  function toast(msg) { $('toast').textContent = msg; $('toast').hidden = false; }
  function ask(msg, okLabel, cancelLabel, onOk) {
    $('dlg-msg').textContent = msg;
    $('dlg-ok').textContent = okLabel;
    $('dlg-cancel').textContent = cancelLabel || '';
    $('dlg-cancel').hidden = !cancelLabel;
    dlgOk = onOk || null;
    $('dialog').hidden = false;
  }

  // ---------- option popup ----------
  function openOptions(item) {
    var sel = {};
    item.groups.forEach(function (g) {
      var G = D.groups[g];
      sel[g] = G.type === 'multi' ? [] : G.type === 'quantity' ? 0 : G.def;
    });
    draft = { item: item, sel: sel, qty: 1 };
    $('opt-pic').textContent = item.pic;
    $('opt-pic').className = 'opt-pic cat-' + item.cat;
    $('opt-name').textContent = item.name;
    $('opt-base').textContent = won(item.price) + (item.hotOnly ? ' · HOT 전용 메뉴' : '');
    hideErr();
    renderOpts();
    $('opt-modal').hidden = false;
    $('opt-body').scrollTop = 0;
  }
  function renderOpts() {
    var it = draft.item, sel = draft.sel;
    $('opt-body').innerHTML = applicable(it, sel).map(function (g) {
      var G = D.groups[g], badge, body;
      if (G.type === 'quantity') badge = '<em class="opt-note">최대 ' + G.max + '회</em>';
      else if (G.type === 'multi') badge = '<em class="opt-note">최대 ' + G.max + '개</em>';
      else badge = '<em class="req">필수</em>';
      if (G.type === 'quantity') {
        var o = G.options[0];
        body = '<div class="qty-opt"><span>' + o.label + ' <small>+' + won(o.price) + '</small></span>' +
          '<div class="stepper"><button type="button" data-act="st-minus" data-group="' + g + '">−</button>' +
          '<span class="st-val">' + sel[g] + '</span>' +
          '<button type="button" data-act="st-plus" data-group="' + g + '">+</button></div></div>';
      } else {
        body = '<div class="choices' + (TEMP_GROUPS.indexOf(g) >= 0 ? ' temp-choices' : '') + '">' + G.options.map(function (o) {
          var on = G.type === 'multi' ? sel[g].indexOf(o.id) >= 0 : sel[g] === o.id;
          return '<div class="choice c-' + o.id + (on ? ' on' : '') + '" data-act="choose" data-group="' + g + '" data-opt="' + o.id + '">' +
            o.label + (o.price ? '<small>+' + won(o.price) + '</small>' : '') + '</div>';
        }).join('') + '</div>';
      }
      return '<div class="grp" data-group="' + g + '"><div class="grp-title">' + G.title + badge + '</div>' + body + '</div>';
    }).join('');
    $('q-val').textContent = draft.qty;
    $('opt-total').textContent = won(unitPrice(it, sel) * draft.qty);
  }
  function showErr(msg) { $('opt-err').textContent = msg; $('opt-err').hidden = false; }
  function hideErr() { $('opt-err').hidden = true; $('opt-err').textContent = ''; }

  function choose(g, id) {
    var G = D.groups[g], sel = draft.sel;
    if (G.type === 'single') {
      var wasIced = isIced(sel);
      sel[g] = id;
      if (!wasIced && isIced(sel)) sel.ice = D.groups.ice.def;
    } else {
      var i = sel[g].indexOf(id);
      if (i >= 0) sel[g].splice(i, 1);
      else if (sel[g].length >= G.max) { showErr('시럽은 최대 ' + G.max + '개까지 선택할 수 있어요.'); return; }
      else sel[g].push(id);
    }
    hideErr();
    renderOpts();
  }

  function addLine(item, sel, qty) {
    var norm = normalize(item, sel);
    var key = item.id + '|' + JSON.stringify(norm);
    var line = S.cart.filter(function (l) { return l.key === key; })[0];
    if (line) {
      line.qty += qty;
      if (line.qty > LINE_MAX) { line.qty = LINE_MAX; renderCart(); return false; }
    } else {
      S.cart.push({ key: key, id: item.id, sel: norm, qty: qty, unit: unitPrice(item, sel), summary: summary(item, sel) });
    }
    renderCart();
    return true;
  }
  function confirmOptions() {
    var it = draft.item, sel = draft.sel;
    var missing = applicable(it, sel).filter(function (g) { return D.groups[g].required && !sel[g]; })[0];
    if (missing) {
      showErr(TEMP_GROUPS.indexOf(missing) >= 0 ? '온도(HOT/ICED)를 선택해 주세요.' : D.groups[missing].title + '을(를) 선택해 주세요.');
      return;
    }
    var ok = addLine(it, sel, draft.qty);
    $('opt-modal').hidden = true;
    toast(ok ? it.name + ' ' + draft.qty + '개를 담았어요.' : '한 메뉴는 최대 ' + LINE_MAX + '개까지 주문할 수 있어요.');
    draft = null;
  }

  // ---------- idle warning ----------
  function openIdle() {
    S.idleShown = true; S.idleOpen = true; S.idleLeft = IDLE_START;
    renderIdle();
    $('idle').hidden = false;
  }
  function renderIdle() {
    $('idle-sec').textContent = S.idleLeft;
    $('idle-fill').style.width = (S.idleLeft / IDLE_START * 100) + '%';
  }

  // ---------- events ----------
  var tapCtx = null;
  window.addEventListener('click', function () {
    tapCtx = { screen: S.screen, idle: S.idleOpen };
    $('toast').hidden = true;
  }, true);
  document.addEventListener('click', function () {
    if (!tapCtx || tapCtx.idle || tapCtx.screen === 'attract' || S.screen === 'attract') return;
    S.taps++;
    if (S.taps === IDLE_TAP && !S.idleShown) openIdle();
  });

  $('kiosk').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    var act = a ? a.dataset.act : null;

    if (S.idleOpen) {
      if (e.target === $('idle')) {
        S.idleLeft -= IDLE_STEP;
        if (S.idleLeft <= 0) resetOrder('입력이 없어 주문이 취소되었습니다.');
        else renderIdle();
      } else if (act === 'idle-continue') {
        S.idleOpen = false; $('idle').hidden = true;
      } else if (act === 'idle-home') {
        resetOrder();
      }
      return;
    }
    if (!$('dialog').hidden) {
      if (act === 'dlg-ok') { var f = dlgOk; dlgOk = null; $('dialog').hidden = true; if (f) f(); }
      else if (act === 'dlg-cancel') { dlgOk = null; $('dialog').hidden = true; }
      return;
    }
    if (S.screen === 'attract') {
      $('attract-notice').hidden = true;
      S.taps = 0;
      show('type');
      return;
    }
    if (!$('opt-modal').hidden) {
      if (act === 'choose') choose(a.dataset.group, a.dataset.opt);
      else if (act === 'st-plus') {
        var G = D.groups[a.dataset.group];
        if (draft.sel[a.dataset.group] >= G.max) showErr('샷 추가는 최대 ' + G.max + '회까지 가능해요.');
        else { draft.sel[a.dataset.group]++; hideErr(); renderOpts(); }
      } else if (act === 'st-minus') {
        if (draft.sel[a.dataset.group] > 0) { draft.sel[a.dataset.group]--; hideErr(); renderOpts(); }
      } else if (act === 'q-plus') {
        if (draft.qty >= LINE_MAX) showErr('한 번에 최대 ' + LINE_MAX + '개까지 담을 수 있어요.');
        else { draft.qty++; hideErr(); renderOpts(); }
      } else if (act === 'q-minus') {
        if (draft.qty > 1) { draft.qty--; hideErr(); renderOpts(); }
      } else if (act === 'opt-cancel') { $('opt-modal').hidden = true; draft = null; }
      else if (act === 'opt-add') confirmOptions();
      return;
    }
    if (!act) return;

    switch (act) {
      case 'home':
        ask('주문을 취소하고 처음 화면으로 돌아갈까요?', '처음으로', '계속 주문', function () { resetOrder(); });
        break;
      case 'type':
        S.type = a.dataset.type; S.cat = 'coffee';
        $('type-badge').textContent = S.type === 'take' ? '🛍️ 포장' : '🍽️ 매장';
        renderTabs(); renderGrid(); renderCart();
        show('menu');
        $('grid').scrollTop = 0;
        break;
      case 'cat':
        S.cat = a.dataset.cat; renderTabs(); renderGrid(); $('grid').scrollTop = 0;
        break;
      case 'item': {
        var it = itemById(a.dataset.id);
        if (it.soldOut) ask('죄송합니다. [' + it.name + ']은(는) 품절된 메뉴입니다.\n다른 메뉴를 선택해 주세요.', '확인', null);
        else if (!it.groups.length) {
          toast(addLine(it, {}, 1) ? it.name + ' 1개를 담았어요.' : '한 메뉴는 최대 ' + LINE_MAX + '개까지 주문할 수 있어요.');
        } else openOptions(it);
        break;
      }
      case 'l-minus': {
        var lm = S.cart[+a.dataset.idx];
        if (lm.qty > 1) { lm.qty--; renderCart(); }
        break;
      }
      case 'l-plus': {
        var lp = S.cart[+a.dataset.idx];
        if (lp.qty >= LINE_MAX) toast('한 메뉴는 최대 ' + LINE_MAX + '개까지 주문할 수 있어요.');
        else { lp.qty++; renderCart(); }
        break;
      }
      case 'l-del':
        S.cart.splice(+a.dataset.idx, 1); renderCart();
        break;
      case 'clear':
        if (S.cart.length) ask('장바구니를 모두 비울까요?', '비우기', '취소', function () { S.cart = []; renderCart(); });
        break;
      case 'order':
        if (!S.cart.length) ask('장바구니가 비어 있어요.\n메뉴를 먼저 담아 주세요.', '확인', null);
        else { renderReview(); show('review'); }
        break;
      case 'back-menu':
        show('menu');
        break;
      case 'to-pay':
        ask('총 ' + won(total()) + '을 결제할까요?', '결제하기', '다시 확인', function () { renderPay(); show('pay'); });
        break;
      case 'back-review':
        renderReview(); show('review');
        break;
      case 'pay-method': {
        Array.prototype.forEach.call(document.querySelectorAll('.pay-m'), function (m) { m.classList.toggle('on', m === a); });
        var guide = { card: '카드를 아래 단말기에 끝까지 꽂아 주세요.', qr: 'QR 코드를 아래 스캐너에 보여 주세요.', voucher: '상품권 바코드를 아래 스캐너에 보여 주세요.' };
        $('pay-guide').textContent = guide[a.dataset.m];
        break;
      }
    }
  });

  resetOrder();
})();
