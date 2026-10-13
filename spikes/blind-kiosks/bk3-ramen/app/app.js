(function () {
  'use strict';
  var M = window.MENU;
  var MAX_LINE_QTY = 9;
  var MAX_TOPPING = 3;

  function $(s) { return document.querySelector(s); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function won(n) { return fmt(n) + '원'; }
  function byId(id) { return M.items.find(function (i) { return i.id === id; }); }
  function findIn(list, id) { return list.find(function (o) { return o.id === id; }); }

  var state = { dine: null, filter: 'all', cart: [] };

  /* ---------- screens ---------- */
  function show(name) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === 'scr-' + name);
    });
  }

  function resetAll() {
    state.dine = null;
    state.filter = 'all';
    state.cart = [];
    closeModal();
    renderChips();
    renderGrid();
    renderCart();
    show('attract');
  }

  /* ---------- toast (cosmetic only) ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1400);
  }

  /* ---------- chips + grid ---------- */
  function renderChips() {
    var chips = [{ id: 'all', label: '전체' }].concat(M.categories);
    $('#chips').innerHTML = chips.map(function (c) {
      return '<button class="chip' + (state.filter === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' + c.label + '</button>';
    }).join('');
  }

  function renderGrid() {
    var items = M.items.filter(function (i) { return state.filter === 'all' || i.cat === state.filter; });
    $('#grid').innerHTML = items.map(function (i) {
      return '<div class="card' + (i.soldOut ? ' sold' : '') + (i.cat === 'set' ? ' is-set' : '') + '" data-id="' + i.id + '">' +
        '<div class="pic">' + i.emoji + '</div>' +
        '<div class="nm">' + i.name + '</div>' +
        (i.sub ? '<div class="sub">' + i.sub + '</div>' : '') +
        '<div class="pr">' + fmt(i.price) + '<small>원</small></div>' +
        (i.soldOut ? '<div class="sold-badge">품절</div>' : '') +
        '</div>';
    }).join('');
  }

  /* ---------- cart ---------- */
  function cartTotal() { return state.cart.reduce(function (s, l) { return s + l.unit * l.qty; }, 0); }
  function cartCount() { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); }

  function addToCart(item, key, unit, summary) {
    var fullKey = item.id + '|' + key;
    var line = state.cart.find(function (l) { return l.key === fullKey; });
    if (line) {
      if (line.qty >= MAX_LINE_QTY) { alert('한 메뉴는 최대 ' + MAX_LINE_QTY + '개까지 주문할 수 있습니다.'); return false; }
      line.qty += 1;
    } else {
      state.cart.push({ key: fullKey, itemId: item.id, name: item.name, summary: summary, unit: unit, qty: 1 });
    }
    renderCart();
    return true;
  }

  function renderCart() {
    var list = $('#cart-list');
    if (!state.cart.length) {
      list.innerHTML = '<div class="cart-empty">메뉴를 선택해 주세요</div>';
    } else {
      list.innerHTML = state.cart.map(function (l, i) {
        return '<div class="cline" data-i="' + i + '">' +
          '<div class="cl-info"><div class="cl-name">' + l.name + '</div>' +
          (l.summary ? '<div class="cl-opt">' + l.summary + '</div>' : '') + '</div>' +
          '<div class="cl-qty"><button class="q-btn" data-q="-1" aria-label="수량 빼기">−</button>' +
          '<span class="cl-n">' + l.qty + '</span>' +
          '<button class="q-btn" data-q="1" aria-label="수량 더하기">+</button></div>' +
          '<div class="cl-price">' + fmt(l.unit * l.qty) + '원</div>' +
          '</div>';
      }).join('');
    }
    $('#cart-total').textContent = won(cartTotal());
    $('#cart-count').textContent = cartCount() + '개';
  }

  /* ---------- modal helpers ---------- */
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function openConfirm(title, msg, yesLabel, onYes) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="overlay"><div class="sheet small" role="dialog">' +
      '<h2>' + title + '</h2><p class="confirm-msg">' + msg + '</p>' +
      '<div class="sheet-foot"><button class="ghost" data-act="no">아니요</button>' +
      '<button class="primary danger" data-act="yes">' + yesLabel + '</button></div></div></div>';
    root.querySelector('.sheet').addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      closeModal();
      if (a.dataset.act === 'yes') onYes();
    });
  }

  function firmnessRadios(selected) {
    return '<div class="radios">' + M.firmness.map(function (f) {
      return '<label class="radio"><input type="radio" name="firm" value="' + f.id + '"' +
        (selected === f.id ? ' checked' : '') + '><span>' + f.label + '</span></label>';
    }).join('') + '</div>';
  }

  /* ---------- ramen options ---------- */
  function openRamen(item) {
    var tq = {};
    M.toppings.forEach(function (t) { tq[t.id] = 0; });
    var root = $('#modal-root');
    root.innerHTML = '<div class="overlay"><div class="sheet" role="dialog">' +
      '<div class="sheet-head"><div class="pic">' + item.emoji + '</div><div><h2>' + item.name + '</h2>' +
      '<div class="base">' + won(item.price) + '</div></div></div>' +
      '<div class="opt-sec"><h3>면 익힘 정도 <em class="req">필수</em></h3>' + firmnessRadios(null) + '</div>' +
      '<div class="opt-sec"><h3>토핑 추가 <em class="optl">선택 · 종류별 최대 3개</em></h3>' +
      M.toppings.map(function (t) {
        return '<div class="trow" data-t="' + t.id + '"><span class="tn">' + t.label + '</span>' +
          '<span class="tp">+' + won(t.price) + '</span>' +
          '<div class="step"><div class="sbtn" data-d="-1">−</div><span class="tq">0</span><div class="sbtn" data-d="1">+</div></div></div>';
      }).join('') + '</div>' +
      '<div class="sheet-foot"><button class="ghost" data-act="cancel">취소</button>' +
      '<button class="primary" data-act="add">담기 <span class="run"></span></button></div>' +
      '</div></div>';

    function unit() {
      return item.price + M.toppings.reduce(function (s, t) { return s + t.price * tq[t.id]; }, 0);
    }
    function refresh() {
      root.querySelector('.run').textContent = won(unit());
      root.querySelectorAll('.trow').forEach(function (r) {
        r.querySelector('.tq').textContent = tq[r.dataset.t];
        r.classList.toggle('has', tq[r.dataset.t] > 0);
      });
    }
    refresh();

    root.querySelector('.sheet').addEventListener('click', function (e) {
      var sb = e.target.closest('.sbtn');
      if (sb) {
        var id = sb.closest('.trow').dataset.t;
        var q = tq[id] + Number(sb.dataset.d);
        if (q > MAX_TOPPING) { alert('토핑은 종류별로 최대 ' + MAX_TOPPING + '개까지 추가할 수 있습니다.'); return; }
        if (q < 0) return;
        tq[id] = q;
        refresh();
        return;
      }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'cancel') { closeModal(); return; }
      var f = root.querySelector('input[name=firm]:checked');
      if (!f) { alert('면 익힘 정도를 선택해 주세요.'); return; }
      var tops = M.toppings.filter(function (t) { return tq[t.id] > 0; });
      var key = f.value + '|' + tops.map(function (t) { return t.id + tq[t.id]; }).join(',');
      var summary = findIn(M.firmness, f.value).label +
        (tops.length ? ' · ' + tops.map(function (t) { return t.label + '×' + tq[t.id]; }).join(', ') : '');
      if (addToCart(item, key, unit(), summary)) { closeModal(); toast(item.name + ' 담았습니다'); }
    });
  }

  /* ---------- rice bowl options ---------- */
  function openRice(item) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="overlay"><div class="sheet" role="dialog">' +
      '<div class="sheet-head"><div class="pic">' + item.emoji + '</div><div><h2>' + item.name + '</h2>' +
      '<div class="base">' + won(item.price) + '</div></div></div>' +
      '<div class="opt-sec"><h3>밥 양 <em class="req">필수</em></h3><div class="radios">' +
      M.riceSize.map(function (r, idx) {
        return '<label class="radio"><input type="radio" name="rice" value="' + r.id + '"' + (idx === 0 ? ' checked' : '') + '>' +
          '<span>' + r.label + (r.price ? ' +' + won(r.price) : '') + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="sheet-foot"><button class="ghost" data-act="cancel">취소</button>' +
      '<button class="primary" data-act="add">담기 <span class="run">' + won(item.price) + '</span></button></div>' +
      '</div></div>';

    function chosen() { return findIn(M.riceSize, root.querySelector('input[name=rice]:checked').value); }
    root.querySelector('.sheet').addEventListener('change', function () {
      root.querySelector('.run').textContent = won(item.price + chosen().price);
    });
    root.querySelector('.sheet').addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'cancel') { closeModal(); return; }
      var r = chosen();
      if (addToCart(item, r.id, item.price + r.price, '밥 ' + r.label)) { closeModal(); toast(item.name + ' 담았습니다'); }
    });
  }

  /* ---------- set menu: 3-step modal ---------- */
  function openSet(item) {
    var steps = [
      { key: 'ramen', title: '라멘 선택', list: M.setRamen, err: '라멘을 선택해 주세요.' },
      { key: 'side', title: '사이드 선택', list: item.sides === 'hearty' ? M.setSideHearty : M.setSideBasic, err: '사이드를 선택해 주세요.' },
      { key: 'drink', title: '음료 선택', list: M.setDrink, err: '음료를 선택해 주세요.' }
    ];
    var sel = { ramen: null, side: null, drink: null, firm: null };
    var cur = 0;
    var root = $('#modal-root');

    function unit() {
      return item.price + steps.reduce(function (s, st) {
        var o = sel[st.key] && findIn(st.list, sel[st.key]);
        return s + (o ? o.delta : 0);
      }, 0);
    }

    function render() {
      var st = steps[cur];
      root.innerHTML = '<div class="overlay"><div class="sheet set-sheet" role="dialog">' +
        '<div class="sheet-head"><div class="pic">' + item.emoji + '</div><div><h2>' + item.name + '</h2>' +
        '<div class="base">' + won(item.price) + ' · ' + item.sub + '</div></div></div>' +
        '<div class="steps">' + steps.map(function (s, i) {
          return '<div class="stp' + (i === cur ? ' cur' : '') + (i < cur ? ' done' : '') + '">' + (i + 1) + '. ' + s.title + '</div>';
        }).join('') + '</div>' +
        '<div class="step-title">STEP ' + (cur + 1) + '/3 · ' + st.title + '</div>' +
        '<div class="choices">' + st.list.map(function (o) {
          return '<div class="choice' + (sel[st.key] === o.id ? ' on' : '') + '" data-c="' + o.id + '">' +
            '<span class="c-ico">' + o.emoji + '</span><span class="c-nm">' + o.label + '</span>' +
            '<span class="c-pr">' + (o.delta ? '+' + won(o.delta) : '추가금 없음') + '</span></div>';
        }).join('') + '</div>' +
        (cur === 0 ? '<div class="opt-sec"><h3>면 익힘 정도 <em class="req">필수</em></h3>' + firmnessRadios(sel.firm) + '</div>' : '') +
        '<div class="set-note">세트 라멘은 토핑 추가가 되지 않습니다.</div>' +
        '<div class="sheet-foot">' +
        (cur === 0 ? '<button class="ghost" data-act="cancel">취소</button>' : '<button class="ghost" data-act="prev">이전</button>') +
        (cur < 2 ? '<button class="primary" data-act="next">다음 <span class="run">' + won(unit()) + '</span></button>'
                 : '<button class="primary" data-act="add">담기 <span class="run">' + won(unit()) + '</span></button>') +
        '</div></div></div>';

      var sheet = root.querySelector('.sheet');
      sheet.addEventListener('change', function (e) {
        if (e.target.name === 'firm') sel.firm = e.target.value;
      });
      sheet.addEventListener('click', onClick);
    }

    function validate(i) {
      var st = steps[i];
      if (!sel[st.key]) { alert(st.err); return false; }
      if (i === 0 && !sel.firm) { alert('면 익힘 정도를 선택해 주세요.'); return false; }
      return true;
    }

    function onClick(e) {
      var c = e.target.closest('.choice');
      if (c) { sel[steps[cur].key] = c.dataset.c; render(); return; }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'cancel') { closeModal(); return; }
      if (act === 'prev') { cur -= 1; render(); return; }
      if (act === 'next') { if (validate(cur)) { cur += 1; render(); } return; }
      if (act === 'add') {
        if (!validate(2)) return;
        var r = findIn(steps[0].list, sel.ramen), s = findIn(steps[1].list, sel.side), d = findIn(steps[2].list, sel.drink);
        var key = [sel.ramen, sel.firm, sel.side, sel.drink].join('|');
        var summary = r.label + '(' + findIn(M.firmness, sel.firm).label + ') / ' + s.label + ' / ' + d.label;
        if (addToCart(item, key, unit(), summary)) { closeModal(); toast(item.name + ' 담았습니다'); }
      }
    }

    render();
  }

  /* ---------- review + pay ---------- */
  function renderReview() {
    $('#review-dine').textContent = state.dine === '포장' ? '포장' : '매장 식사';
    $('#review-list').innerHTML = state.cart.map(function (l) {
      return '<div class="rline"><div class="r-l"><div class="r-name">' + l.name + ' <span class="r-x">×' + l.qty + '</span></div>' +
        (l.summary ? '<div class="r-opt">' + l.summary + '</div>' : '') + '</div>' +
        '<div class="r-price">' + won(l.unit * l.qty) + '</div></div>';
    }).join('');
    $('#review-total').textContent = won(cartTotal());
  }

  /* ---------- events ---------- */
  $('#attract-tap').addEventListener('click', function () { show('dine'); });
  $('#dine-back').addEventListener('click', function () { show('attract'); });
  document.querySelectorAll('.dine-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.dine = b.dataset.dine;
      $('#menu-dine').textContent = state.dine === '포장' ? '🛍️ 포장' : '🥢 매장 식사';
      show('menu');
    });
  });

  $('#chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    state.filter = c.dataset.cat;
    renderChips();
    renderGrid();
  });

  $('#grid').addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;
    var item = byId(card.dataset.id);
    if (item.soldOut) { alert('죄송합니다. ' + item.name + '은(는) 오늘 준비한 수량이 모두 소진되었습니다.'); return; }
    if (item.type === 'ramen') openRamen(item);
    else if (item.type === 'rice') openRice(item);
    else if (item.type === 'set') openSet(item);
    else if (addToCart(item, '', item.price, '')) toast(item.name + ' 담았습니다');
  });

  $('#cart-list').addEventListener('click', function (e) {
    var b = e.target.closest('.q-btn');
    if (!b) return;
    var i = Number(b.closest('.cline').dataset.i);
    var line = state.cart[i];
    var q = line.qty + Number(b.dataset.q);
    if (q > MAX_LINE_QTY) { alert('한 메뉴는 최대 ' + MAX_LINE_QTY + '개까지 주문할 수 있습니다.'); return; }
    if (q < 1) state.cart.splice(i, 1);
    else line.qty = q;
    renderCart();
  });

  $('#btn-clear').addEventListener('click', function () {
    if (!state.cart.length) { alert('취소할 메뉴가 없습니다.'); return; }
    openConfirm('전체 취소', '담은 메뉴를 모두 취소할까요?', '모두 취소', function () {
      state.cart = [];
      renderCart();
    });
  });

  $('#btn-home').addEventListener('click', function () {
    if (!state.cart.length) { resetAll(); return; }
    openConfirm('처음으로', '처음 화면으로 돌아가면 담은 메뉴가 모두 취소됩니다.', '처음으로', resetAll);
  });

  $('#btn-order').addEventListener('click', function () {
    if (!state.cart.length) { alert('메뉴를 먼저 선택해 주세요.'); return; }
    renderReview();
    show('review');
  });

  $('#review-back').addEventListener('click', function () { show('menu'); });
  $('#review-ok').addEventListener('click', function () {
    $('#pay-total').textContent = won(cartTotal());
    $('#pay-note').textContent = '결제 수단을 눌러 주세요.';
    document.querySelectorAll('.pm').forEach(function (p) { p.classList.remove('on'); });
    show('pay');
  });

  document.querySelectorAll('.pm').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('.pm').forEach(function (x) { x.classList.toggle('on', x === p); });
      $('#pay-note').textContent = '체험용 발매기입니다. 실제 결제는 진행되지 않습니다.';
    });
  });
  $('#pay-back').addEventListener('click', function () { show('review'); });

  renderChips();
  renderGrid();
  renderCart();
})();
