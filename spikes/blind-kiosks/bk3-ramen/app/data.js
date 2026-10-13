/* 면구름 라멘 — menu data (fictional) */
window.MENU = {
  categories: [
    { id: 'ramen', label: '라멘' },
    { id: 'rice', label: '덮밥' },
    { id: 'side', label: '사이드' },
    { id: 'drink', label: '음료' },
    { id: 'set', label: '세트' }
  ],

  items: [
    { id: 'r_tonkotsu', cat: 'ramen', type: 'ramen', name: '돈코츠 라멘', price: 9500, emoji: '🍜', sub: '진한 돼지뼈 육수' },
    { id: 'r_spicy', cat: 'ramen', type: 'ramen', name: '매운 돈코츠 라멘', price: 10000, emoji: '🌶️', sub: '얼큰한 고추기름' },
    { id: 'r_shoyu', cat: 'ramen', type: 'ramen', name: '쇼유 라멘', price: 9000, emoji: '🍜', sub: '맑은 간장 육수' },
    { id: 'r_shio', cat: 'ramen', type: 'ramen', name: '시오 라멘', price: 9000, emoji: '🍜', sub: '담백한 소금 육수' },
    { id: 'r_miso', cat: 'ramen', type: 'ramen', name: '미소 라멘', price: 9500, emoji: '🍜', sub: '구수한 된장 육수' },
    { id: 'r_tantan', cat: 'ramen', type: 'ramen', name: '탄탄멘', price: 10500, emoji: '🥜', sub: '고소한 참깨 육수' },
    { id: 'r_chashu', cat: 'ramen', type: 'ramen', name: '차슈 듬뿍 라멘', price: 12500, emoji: '🍥', sub: '차슈 5장' },
    { id: 'r_tsuke', cat: 'ramen', type: 'ramen', name: '츠케멘', price: 11000, emoji: '🥢', sub: '찍어 먹는 굵은 면', soldOut: true },

    { id: 'd_chashu', cat: 'rice', type: 'rice', name: '차슈 덮밥', price: 8500, emoji: '🍚' },
    { id: 'd_gyu', cat: 'rice', type: 'rice', name: '규동', price: 8000, emoji: '🍚' },
    { id: 'd_chicken', cat: 'rice', type: 'rice', name: '치킨 마요 덮밥', price: 7500, emoji: '🍗' },
    { id: 'd_salmon', cat: 'rice', type: 'rice', name: '연어 덮밥', price: 11000, emoji: '🍣' },

    { id: 's_gyoza', cat: 'side', type: 'simple', name: '교자 (5개)', price: 4500, emoji: '🥟' },
    { id: 's_karaage', cat: 'side', type: 'simple', name: '가라아게 (4조각)', price: 5500, emoji: '🍗' },
    { id: 's_takoyaki', cat: 'side', type: 'simple', name: '타코야키 (6개)', price: 5000, emoji: '🐙', soldOut: true },
    { id: 's_minidon', cat: 'side', type: 'simple', name: '미니 차슈덮밥', price: 4000, emoji: '🍚' },
    { id: 's_rice', cat: 'side', type: 'simple', name: '공기밥', price: 1000, emoji: '🍚' },
    { id: 's_edamame', cat: 'side', type: 'simple', name: '에다마메', price: 3000, emoji: '🫛' },

    { id: 'k_cola', cat: 'drink', type: 'simple', name: '콜라', price: 2000, emoji: '🥤' },
    { id: 'k_cider', cat: 'drink', type: 'simple', name: '사이다', price: 2000, emoji: '🥤' },
    { id: 'k_zero', cat: 'drink', type: 'simple', name: '제로 콜라', price: 2000, emoji: '🥤' },
    { id: 'k_oolong', cat: 'drink', type: 'simple', name: '우롱차', price: 2500, emoji: '🍵' },
    { id: 'k_yuja', cat: 'drink', type: 'simple', name: '유자 에이드', price: 3500, emoji: '🍋' },

    { id: 'set_basic', cat: 'set', type: 'set', name: '라멘 기본 세트', price: 13500, emoji: '🍱', sub: '라멘+사이드+음료', sides: 'basic' },
    { id: 'set_hearty', cat: 'set', type: 'set', name: '라멘 든든 세트', price: 15000, emoji: '🍱', sub: '라멘+든든 사이드+음료', sides: 'hearty' }
  ],

  firmness: [
    { id: 'firm', label: '꼬들' },
    { id: 'normal', label: '보통' },
    { id: 'soft', label: '부드럽게' }
  ],

  toppings: [
    { id: 'chashu', label: '차슈', price: 2000 },
    { id: 'egg', label: '계란', price: 1000 },
    { id: 'nori', label: '김', price: 500 },
    { id: 'sprouts', label: '숙주', price: 500 },
    { id: 'menma', label: '멘마', price: 1000 },
    { id: 'cornbutter', label: '콘버터', price: 1500 }
  ],

  riceSize: [
    { id: 'regular', label: '보통', price: 0 },
    { id: 'large', label: '곱빼기', price: 1000 }
  ],

  setRamen: [
    { id: 'tonkotsu', label: '돈코츠 라멘', delta: 0, emoji: '🍜' },
    { id: 'shoyu', label: '쇼유 라멘', delta: 0, emoji: '🍜' },
    { id: 'shio', label: '시오 라멘', delta: 0, emoji: '🍜' },
    { id: 'miso', label: '미소 라멘', delta: 0, emoji: '🍜' },
    { id: 'spicy', label: '매운 돈코츠 라멘', delta: 500, emoji: '🌶️' },
    { id: 'tantan', label: '탄탄멘', delta: 1000, emoji: '🥜' },
    { id: 'chashu', label: '차슈 듬뿍 라멘', delta: 3000, emoji: '🍥' }
  ],

  setSideBasic: [
    { id: 'gyoza', label: '교자 (5개)', delta: 0, emoji: '🥟' },
    { id: 'edamame', label: '에다마메', delta: 0, emoji: '🫛' },
    { id: 'karaage', label: '가라아게 (4조각)', delta: 1000, emoji: '🍗' }
  ],

  setSideHearty: [
    { id: 'karaage', label: '가라아게 (4조각)', delta: 0, emoji: '🍗' },
    { id: 'minidon', label: '미니 차슈덮밥', delta: 0, emoji: '🍚' }
  ],

  setDrink: [
    { id: 'cola', label: '콜라', delta: 0, emoji: '🥤' },
    { id: 'cider', label: '사이다', delta: 0, emoji: '🥤' },
    { id: 'zero', label: '제로 콜라', delta: 0, emoji: '🥤' },
    { id: 'oolong', label: '우롱차', delta: 500, emoji: '🍵' },
    { id: 'yuja', label: '유자 에이드', delta: 1500, emoji: '🍋' }
  ]
};
