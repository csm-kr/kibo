// Menu data for the 별무리 시네마 스낵바 kiosk (fictional brand).
window.KIOSK_DATA = (function () {
  'use strict';

  var GROUPS = {
    popcornSize: {
      title: '사이즈', type: 'single', required: true, def: null,
      options: [
        { id: 'S', label: 'S', delta: 0 },
        { id: 'M', label: 'M', delta: 1000 },
        { id: 'L', label: 'L', delta: 2000 }
      ]
    },
    halfFlavors: {
      title: '반반 맛 선택', type: 'multi', required: true, min: 2, max: 2, def: null,
      options: [
        { id: 'original', label: '오리지널', delta: 0 },
        { id: 'caramel', label: '카라멜', delta: 0 },
        { id: 'cheese', label: '치즈', delta: 0 },
        { id: 'onion', label: '어니언', delta: 0 },
        { id: 'garlic', label: '갈릭버터', delta: 0 }
      ]
    },
    drinkSize: {
      title: '사이즈', type: 'single', required: true, def: 'R',
      options: [
        { id: 'R', label: 'R', delta: 0 },
        { id: 'L', label: 'L', delta: 500 }
      ]
    },
    coffeeTemp: {
      title: '온도', type: 'single', required: true, def: null,
      options: [
        { id: 'hot', label: 'HOT', delta: 0 },
        { id: 'ice', label: 'ICE', delta: 0 }
      ]
    },
    nachoSauce: {
      title: '소스', type: 'single', required: true, def: 'cheese',
      options: [
        { id: 'cheese', label: '치즈 소스', delta: 0 },
        { id: 'jalapeno', label: '할라피뇨 치즈 소스', delta: 500 }
      ]
    },
    squidSeason: {
      title: '시즈닝', type: 'single', required: true, def: 'butter',
      options: [
        { id: 'butter', label: '기본 버터', delta: 0 },
        { id: 'spicymayo', label: '청양마요', delta: 500 }
      ]
    },
    hotdogTopping: {
      title: '토핑 추가', type: 'multi', required: false, min: 0, max: 3, def: null,
      options: [
        { id: 'cheese', label: '치즈', delta: 500 },
        { id: 'jalapeno', label: '할라피뇨', delta: 500 },
        { id: 'onion', label: '크리스피 어니언', delta: 300 }
      ]
    },
    tenderDip: {
      title: '디핑 소스', type: 'single', required: true, def: 'honeymustard',
      options: [
        { id: 'honeymustard', label: '허니머스타드', delta: 0 },
        { id: 'bbq', label: '바비큐', delta: 0 },
        { id: 'sweetchili', label: '스위트칠리', delta: 300 }
      ]
    },
    slushFlavor: {
      title: '맛', type: 'single', required: true, def: null,
      options: [
        { id: 'bluelemon', label: '블루 레몬', delta: 0 },
        { id: 'strawberry', label: '딸기', delta: 0 },
        { id: 'greengrape', label: '청포도', delta: 0 }
      ]
    },
    comboPopcornSize: {
      title: '팝콘 사이즈', type: 'single', required: true, def: null,
      options: [
        { id: 'M', label: 'M (기본)', short: '팝콘 M', delta: 0 },
        { id: 'L', label: 'L 업그레이드', short: '팝콘 L', delta: 1000 }
      ]
    },
    comboFlavor: {
      title: '팝콘 맛', type: 'single', required: true, def: null,
      options: [
        { id: 'original', label: '오리지널', delta: 0 },
        { id: 'caramel', label: '카라멜', delta: 500 },
        { id: 'cheese', label: '치즈', delta: 500 },
        { id: 'onion', label: '어니언', delta: 500 },
        { id: 'garlic', label: '갈릭버터', delta: 500 },
        { id: 'half', label: '반반', delta: 1000 }
      ]
    },
    comboDrink1: {
      title: '음료 선택 (1잔)', type: 'single', required: true, def: null,
      options: [
        { id: 'cola', label: '콜라', delta: 0 },
        { id: 'zero', label: '제로콜라', delta: 0 },
        { id: 'cider', label: '사이다', delta: 0 },
        { id: 'icetea', label: '아이스티', delta: 500 },
        { id: 'lemonade', label: '레몬에이드', delta: 1000 }
      ]
    },
    comboDrinks2: {
      title: '음료 선택 (2잔)', type: 'quantity', required: true, min: 2, max: 2, def: null,
      options: [
        { id: 'cola', label: '콜라', delta: 0, maxQty: 2 },
        { id: 'zero', label: '제로콜라', delta: 0, maxQty: 2 },
        { id: 'cider', label: '사이다', delta: 0, maxQty: 2 },
        { id: 'icetea', label: '아이스티', delta: 500, maxQty: 2 },
        { id: 'lemonade', label: '레몬에이드', delta: 1000, maxQty: 2 }
      ]
    }
  };

  var CATS = [
    { id: 'combo', label: '콤보' },
    { id: 'popcorn', label: '팝콘' },
    { id: 'drink', label: '음료' },
    { id: 'snack', label: '스낵' },
    { id: 'hot', label: '핫푸드' },
    { id: 'dessert', label: '디저트' }
  ];

  var ITEMS = [
    { id: 'combo-single', cat: 'combo', name: '싱글 콤보', desc: '팝콘 M + 음료 1잔', price: 8500, pic: '🍿🥤', combo: { drinks: 1 } },
    { id: 'combo-couple', cat: 'combo', name: '커플 콤보', desc: '팝콘 M + 음료 2잔', price: 11500, pic: '🍿🥤🥤', combo: { drinks: 2 } },
    { id: 'combo-special', cat: 'combo', name: '스페셜 콤보', desc: '팝콘 M + 음료 2잔 + 클래식 핫도그', price: 15000, pic: '🍿🥤🌭', combo: { drinks: 2 } },
    { id: 'combo-family', cat: 'combo', name: '패밀리 콤보', desc: '팝콘 M + 음료 2잔 + 나쵸', price: 17500, pic: '🍿🥤🧀', combo: { drinks: 2 }, soldOut: true },

    { id: 'pc-original', cat: 'popcorn', name: '오리지널 팝콘', price: 5000, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-caramel', cat: 'popcorn', name: '카라멜 팝콘', price: 5500, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-cheese', cat: 'popcorn', name: '치즈 팝콘', price: 5500, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-onion', cat: 'popcorn', name: '어니언 팝콘', price: 5500, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-garlic', cat: 'popcorn', name: '갈릭버터 팝콘', price: 6000, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-cinnamon', cat: 'popcorn', name: '시나몬 버터 팝콘', price: 6000, pic: '🍿', groups: ['popcornSize'] },
    { id: 'pc-half', cat: 'popcorn', name: '반반 팝콘', price: 6000, pic: '🍿', groups: ['popcornSize', 'halfFlavors'] },
    { id: 'pc-truffle', cat: 'popcorn', name: '트러플 팝콘', price: 6500, pic: '🍿', groups: ['popcornSize'], soldOut: true },

    { id: 'dr-cola', cat: 'drink', name: '콜라', price: 2500, pic: '🥤', groups: ['drinkSize'] },
    { id: 'dr-zero', cat: 'drink', name: '제로콜라', price: 2500, pic: '🥤', groups: ['drinkSize'] },
    { id: 'dr-cider', cat: 'drink', name: '사이다', price: 2500, pic: '🥤', groups: ['drinkSize'] },
    { id: 'dr-icetea', cat: 'drink', name: '아이스티', price: 3000, pic: '🧋', groups: ['drinkSize'] },
    { id: 'dr-lemonade', cat: 'drink', name: '레몬에이드', price: 3800, pic: '🍋', groups: ['drinkSize'] },
    { id: 'dr-grapefruit', cat: 'drink', name: '자몽에이드', price: 3800, pic: '🍹', groups: ['drinkSize'], soldOut: true },
    { id: 'dr-americano', cat: 'drink', name: '아메리카노', price: 3500, pic: '☕', groups: ['coffeeTemp', 'drinkSize'] },
    { id: 'dr-water', cat: 'drink', name: '생수', price: 1500, pic: '💧', groups: [] },

    { id: 'sn-nacho', cat: 'snack', name: '나쵸', price: 4000, pic: '🧀', groups: ['nachoSauce'] },
    { id: 'sn-pretzel', cat: 'snack', name: '프레첼', price: 3500, pic: '🥨', groups: [] },
    { id: 'sn-squid', cat: 'snack', name: '버터구이 오징어', price: 5000, pic: '🦑', groups: ['squidSeason'] },
    { id: 'sn-churros', cat: 'snack', name: '츄러스', price: 3000, pic: '🥖', groups: [] },
    { id: 'sn-chilifries', cat: 'snack', name: '칠리 치즈 감자', price: 4500, pic: '🍟', groups: [] },

    { id: 'ht-classic', cat: 'hot', name: '클래식 핫도그', price: 4500, pic: '🌭', groups: ['hotdogTopping'] },
    { id: 'ht-chili', cat: 'hot', name: '칠리 핫도그', price: 5500, pic: '🌭', groups: ['hotdogTopping'] },
    { id: 'ht-cheeseball', cat: 'hot', name: '치즈볼 (5개)', price: 4000, pic: '🧆', groups: [] },
    { id: 'ht-tender', cat: 'hot', name: '치킨 텐더', price: 5500, pic: '🍗', groups: ['tenderDip'] },

    { id: 'ds-softcone', cat: 'dessert', name: '소프트 아이스크림', price: 2500, pic: '🍦', groups: [] },
    { id: 'ds-slush', cat: 'dessert', name: '슬러시', price: 3000, pic: '🧊', groups: ['slushFlavor'] },
    { id: 'ds-cookie', cat: 'dessert', name: '초코칩 쿠키', price: 2000, pic: '🍪', groups: [] }
  ];

  // Popup offer shown after every combo is added.
  var UPSELL = { id: 'upsell-nacho', name: '나쵸', tag: '콤보 특가', price: 3000, regular: 4000, note: '치즈 소스', pic: '🧀' };

  return { GROUPS: GROUPS, CATS: CATS, ITEMS: ITEMS, UPSELL: UPSELL, PAGE_SIZE: 6, MAX_QTY: 9 };
})();
