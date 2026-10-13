/* Fictional menu data for the Dalbit Pass rest-area food court kiosk. */
window.KIOSK_DATA = {
  brand: { name: '달빛고개 휴게소 푸드코트', nameEn: 'Dalbit Pass Rest Area Food Court' },
  counters: [
    { id: 'rec', label: '추천', caption: '오늘의 추천 메뉴 · 각 코너에서 받아 가세요' },
    { id: 'korean', label: '한식', no: 1, caption: '1번 코너 · 한식' },
    { id: 'snack', label: '분식', no: 2, caption: '2번 코너 · 분식' },
    { id: 'noodle', label: '면류', no: 3, caption: '3번 코너 · 면류' },
    { id: 'drink', label: '음료·간식', no: 4, caption: '4번 코너 · 음료·간식' },
    { id: 'set', label: '세트', no: 5, caption: '5번 코너 · 세트 (식사 + 음료)' }
  ],
  recommended: ['spicy-udon', 'beef-soup', 'sotteok', 'walnut-s', 'pork-cutlet', 'set-hansang'],
  groups: {
    spice: {
      title: '맵기 선택', type: 'single', ui: 'chip', required: true, min: 1, max: 1, def: null,
      reqMsg: '맵기를 선택해 주세요.',
      options: [
        { id: 'mild', label: '순한맛', price: 0 },
        { id: 'regular', label: '보통', price: 0 },
        { id: 'spicy', label: '매운맛', price: 0 }
      ]
    },
    size: {
      title: '양 선택', type: 'multi', ui: 'check', required: false, min: 0, max: 1, def: null,
      options: [{ id: 'large', label: '곱빼기', price: 1000 }]
    },
    topping: {
      title: '토핑 추가 (최대 2개)', type: 'multi', ui: 'chip', required: false, min: 0, max: 2, def: null,
      maxMsg: '토핑은 최대 2개까지 선택할 수 있습니다.',
      options: [
        { id: 'egg', label: '계란', price: 500 },
        { id: 'cheese', label: '치즈', price: 500 },
        { id: 'tteok', label: '떡', price: 500 }
      ]
    },
    temp: {
      title: '온도', type: 'single', ui: 'button', required: true, min: 1, max: 1, def: 'hot',
      options: [
        { id: 'hot', label: 'HOT', price: 0 },
        { id: 'iced', label: 'ICE', price: 500 }
      ]
    },
    setMealA: {
      title: '식사 선택', type: 'single', ui: 'card', required: true, min: 1, max: 1, def: null,
      reqMsg: '식사 메뉴를 선택해 주세요.',
      options: [
        { id: 'kimchi-stew', label: '김치찌개', price: 0, emoji: '🥘' },
        { id: 'jeyuk-bowl', label: '제육덮밥', price: 0, emoji: '🍛' },
        { id: 'beef-soup', label: '소고기국밥', price: 500, emoji: '🍲' },
        { id: 'pork-cutlet', label: '왕돈까스', price: 1000, emoji: '🍖' }
      ]
    },
    setMealB: {
      title: '면 선택', type: 'single', ui: 'card', required: true, min: 1, max: 1, def: null,
      reqMsg: '면 메뉴를 선택해 주세요.',
      options: [
        { id: 'udon', label: '가락우동', price: 0, emoji: '🍜' },
        { id: 'janchi-guksu', label: '잔치국수', price: 0, emoji: '🍜' },
        { id: 'ramyeon', label: '라면', price: 500, emoji: '🍜' }
      ]
    },
    setDrink: {
      title: '음료 선택', type: 'single', ui: 'card', required: true, min: 1, max: 1, def: 'cola',
      reqMsg: '음료를 선택해 주세요.',
      options: [
        { id: 'cola', label: '콜라', price: 0, emoji: '🥤' },
        { id: 'cider', label: '사이다', price: 0, emoji: '🥤' },
        { id: 'sikhye', label: '식혜', price: 500, emoji: '🥛' },
        { id: 'americano', label: '아메리카노', price: 1000, emoji: '☕' }
      ]
    }
  },
  bag: { id: 'bag', label: '봉투', price: 100 },
  items: [
    { id: 'beef-soup', name: '소고기국밥', counter: 'korean', price: 9000, emoji: '🍲', desc: '사골 육수에 소고기를 듬뿍 넣은 국밥', rec: true },
    { id: 'kimchi-stew', name: '김치찌개', counter: 'korean', price: 8000, emoji: '🥘', desc: '묵은지와 돼지고기로 끓인 찌개 + 공기밥' },
    { id: 'doenjang-stew', name: '된장찌개', counter: 'korean', price: 8000, emoji: '🥘', desc: '집된장으로 끓인 구수한 찌개 + 공기밥' },
    { id: 'jeyuk-bowl', name: '제육덮밥', counter: 'korean', price: 8500, emoji: '🍛', desc: '매콤한 돼지고기 볶음 덮밥' },
    { id: 'bibimbap', name: '산채비빔밥', counter: 'korean', price: 8500, emoji: '🥗', desc: '산나물 다섯 가지와 고추장' },
    { id: 'pork-cutlet', name: '왕돈까스', counter: 'korean', price: 9500, emoji: '🍖', desc: '손바닥 두 개 크기의 등심 돈까스', rec: true },
    { id: 'pollack-soup', name: '황태해장국', counter: 'korean', price: 9000, emoji: '🐟', desc: '황태와 콩나물로 시원하게 끓인 해장국' },

    { id: 'sotteok', name: '소떡소떡', counter: 'snack', price: 4000, emoji: '🍢', desc: '떡과 소시지를 번갈아 꽂은 꼬치', rec: true },
    { id: 'hotbar', name: '핫바', counter: 'snack', price: 3500, emoji: '🌭', desc: '통통한 어묵 핫바 (케첩 제공)' },
    { id: 'tteokbokki', name: '떡볶이', counter: 'snack', price: 4500, emoji: '🌶️', desc: '쌀떡 떡볶이 1인분' },
    { id: 'veg-kimbap', name: '야채김밥', counter: 'snack', price: 3500, emoji: '🍙', desc: '단무지·시금치·계란 김밥 한 줄' },
    { id: 'tuna-kimbap', name: '참치김밥', counter: 'snack', price: 4500, emoji: '🍙', desc: '참치마요 김밥 한 줄' },
    { id: 'sundae', name: '순대', counter: 'snack', price: 5000, emoji: '🥓', desc: '찰순대 1인분', soldOut: true },
    { id: 'fishcake', name: '꼬치어묵', counter: 'snack', price: 3000, emoji: '🍢', desc: '어묵 꼬치 3개 + 국물' },

    { id: 'udon', name: '가락우동', counter: 'noodle', price: 6000, emoji: '🍜', desc: '가쓰오 국물의 기본 우동', groups: ['size'] },
    { id: 'spicy-udon', name: '얼큰우동', counter: 'noodle', price: 6500, emoji: '🍜', desc: '고춧가루 국물의 얼큰한 우동', groups: ['spice', 'size'], rec: true },
    { id: 'jjamppong', name: '해물짬뽕', counter: 'noodle', price: 8500, emoji: '🍜', desc: '홍합과 오징어를 넣은 짬뽕', groups: ['spice', 'size'] },
    { id: 'bibim-guksu', name: '비빔국수', counter: 'noodle', price: 7000, emoji: '🍝', desc: '새콤달콤 양념 비빔국수', groups: ['spice', 'size'] },
    { id: 'janchi-guksu', name: '잔치국수', counter: 'noodle', price: 6000, emoji: '🍜', desc: '멸치 육수 잔치국수', groups: ['size'] },
    { id: 'ramyeon', name: '라면', counter: 'noodle', price: 4500, emoji: '🍜', desc: '기본 라면 (김치 제공)', groups: ['topping'] },
    { id: 'naengmyeon', name: '물냉면', counter: 'noodle', price: 8000, emoji: '🥣', desc: '살얼음 육수 물냉면', groups: ['size'], soldOut: true },

    { id: 'walnut-s', name: '호두과자 (소)', counter: 'drink', price: 3000, emoji: '🥮', desc: '갓 구운 호두과자 10개입', rec: true },
    { id: 'walnut-l', name: '호두과자 (대)', counter: 'drink', price: 5000, emoji: '🥮', desc: '갓 구운 호두과자 20개입' },
    { id: 'walnut-gift', name: '호두과자 선물상자', counter: 'drink', price: 12000, emoji: '🎁', desc: '30개입 선물용 상자 (포장 전용)', takeoutOnly: true },
    { id: 'potato', name: '알감자', counter: 'drink', price: 4000, emoji: '🥔', desc: '버터에 구운 알감자 한 컵' },
    { id: 'americano', name: '아메리카노', counter: 'drink', price: 3000, emoji: '☕', desc: '원두커피 (ICE 변경 시 +500원)', groups: ['temp'] },
    { id: 'sikhye', name: '식혜', counter: 'drink', price: 2500, emoji: '🥛', desc: '직접 담근 식혜 한 컵' },
    { id: 'cola', name: '콜라', counter: 'drink', price: 2000, emoji: '🥤', desc: '캔 355ml' },
    { id: 'water', name: '생수', counter: 'drink', price: 1000, emoji: '💧', desc: '500ml' },

    { id: 'set-hansang', name: '한상세트', counter: 'set', price: 10000, emoji: '🍱', desc: '식사 1 + 음료 1', kind: 'set', groups: ['setMealA', 'setDrink'], rec: true },
    { id: 'set-noodle', name: '면사랑세트', counter: 'set', price: 8000, emoji: '🍱', desc: '면 1 + 음료 1', kind: 'set', groups: ['setMealB', 'setDrink'] }
  ]
};
