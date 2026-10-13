// Menu data for the fictional "포근밀 베이커리카페" kiosk.
window.KIOSK_DATA = {
  brand: '포근밀 베이커리카페',
  brandEn: 'Pogeunmil Bakery Cafe',
  categories: [
    { id: 'coffee', label: '커피' },
    { id: 'noncoffee', label: '논커피' },
    { id: 'tea', label: '티' },
    { id: 'bread', label: '빵' },
    { id: 'cake', label: '케이크' },
    { id: 'sandwich', label: '샌드위치' }
  ],
  groups: {
    temp: {
      title: '온도 선택', type: 'single', required: true, def: null,
      options: [{ id: 'hot', label: 'HOT', price: 0 }, { id: 'iced', label: 'ICED', price: 0 }]
    },
    tempUp: {
      title: '온도 선택', type: 'single', required: true, def: null,
      options: [{ id: 'hot', label: 'HOT', price: 0 }, { id: 'iced', label: 'ICED', price: 500 }]
    },
    tempIced: {
      title: '온도 선택', type: 'single', required: true, def: 'iced',
      options: [{ id: 'iced', label: 'ICED ONLY', price: 0 }]
    },
    ice: {
      title: '얼음 양', type: 'single', required: true, def: 'regular', onlyWhenIced: true,
      options: [{ id: 'less', label: '적게', price: 0 }, { id: 'regular', label: '보통', price: 0 }, { id: 'more', label: '많이', price: 0 }]
    },
    shot: {
      title: '샷 추가', type: 'quantity', required: false, max: 3,
      options: [{ id: 'shot', label: '에스프레소 샷', price: 500 }]
    },
    syrup: {
      title: '시럽 추가', type: 'multi', required: false, max: 2,
      options: [
        { id: 'vanilla', label: '바닐라 시럽', price: 500 },
        { id: 'hazelnut', label: '헤이즐넛 시럽', price: 500 },
        { id: 'caramel', label: '카라멜 시럽', price: 500 },
        { id: 'brownsugar', label: '흑당 시럽', price: 700 }
      ]
    },
    milk: {
      title: '우유 선택', type: 'single', required: true, def: 'regular',
      options: [
        { id: 'regular', label: '일반 우유', price: 0 },
        { id: 'lowfat', label: '저지방 우유', price: 0 },
        { id: 'oat', label: '오트 밀크', price: 600 },
        { id: 'soy', label: '두유', price: 500 }
      ]
    },
    warm: {
      title: '데우기', type: 'single', required: true, def: 'none',
      options: [{ id: 'none', label: '그대로 주세요', price: 0 }, { id: 'warm', label: '따뜻하게 데워 주세요', price: 0 }]
    }
  },
  items: [
    // 커피
    { id: 'americano', name: '아메리카노', cat: 'coffee', price: 3800, pic: '☕', groups: ['temp', 'ice', 'shot', 'syrup'] },
    { id: 'latte', name: '카페라떼', cat: 'coffee', price: 4300, pic: '☕', groups: ['tempUp', 'ice', 'shot', 'syrup', 'milk'] },
    { id: 'vanillabean', name: '바닐라빈 라떼', cat: 'coffee', price: 4800, pic: '☕', groups: ['tempUp', 'ice', 'shot', 'milk'] },
    { id: 'cappuccino', name: '카푸치노', cat: 'coffee', price: 4300, pic: '☕', groups: ['temp', 'ice', 'shot', 'syrup', 'milk'] },
    { id: 'caramelmac', name: '카라멜 마키아토', cat: 'coffee', price: 5000, pic: '☕', groups: ['tempUp', 'ice', 'shot', 'syrup', 'milk'] },
    { id: 'mocha', name: '카페모카', cat: 'coffee', price: 4900, pic: '☕', groups: ['tempUp', 'ice', 'shot', 'syrup', 'milk'] },
    { id: 'coldbrew', name: '콜드브루', cat: 'coffee', price: 4500, pic: '🧊', groups: ['tempIced', 'ice', 'syrup'] },
    { id: 'espresso', name: '에스프레소', cat: 'coffee', price: 3000, pic: '☕', groups: ['shot'], hotOnly: true },
    // 논커피
    { id: 'choco', name: '초코라떼', cat: 'noncoffee', price: 4500, pic: '🍫', groups: ['tempUp', 'ice', 'milk'] },
    { id: 'greentea', name: '녹차라떼', cat: 'noncoffee', price: 4700, pic: '🍵', groups: ['tempUp', 'ice', 'milk'] },
    { id: 'sweetpotato', name: '고구마라떼', cat: 'noncoffee', price: 4800, pic: '🍠', groups: ['temp', 'ice', 'milk'] },
    { id: 'strawberry', name: '딸기라떼', cat: 'noncoffee', price: 5300, pic: '🍓', groups: ['tempIced', 'ice', 'milk'], soldOut: true },
    { id: 'lemonade', name: '레몬에이드', cat: 'noncoffee', price: 4800, pic: '🍋', groups: ['tempIced', 'ice'] },
    { id: 'blacksesame', name: '흑임자 라떼', cat: 'noncoffee', price: 5000, pic: '🥛', groups: ['tempUp', 'ice', 'milk'] },
    // 티
    { id: 'chamomile', name: '캐모마일', cat: 'tea', price: 3800, pic: '🫖', groups: ['temp', 'ice'] },
    { id: 'peppermint', name: '페퍼민트', cat: 'tea', price: 3800, pic: '🌿', groups: ['temp', 'ice'] },
    { id: 'earlgrey', name: '얼그레이', cat: 'tea', price: 4000, pic: '🫖', groups: ['temp', 'ice', 'syrup'] },
    { id: 'yuja', name: '유자차', cat: 'tea', price: 4500, pic: '🍊', groups: ['tempUp', 'ice'] },
    { id: 'grapefruit', name: '자몽차', cat: 'tea', price: 4700, pic: '🍊', groups: ['tempUp', 'ice'] },
    { id: 'milktea', name: '로열 밀크티', cat: 'tea', price: 5000, pic: '🧋', groups: ['tempUp', 'ice', 'syrup', 'milk'] },
    // 빵
    { id: 'saltbread', name: '소금빵', cat: 'bread', price: 3200, pic: '🥐', groups: ['warm'] },
    { id: 'croissant', name: '버터 크루아상', cat: 'bread', price: 3800, pic: '🥐', groups: ['warm'] },
    { id: 'redbean', name: '단팥빵', cat: 'bread', price: 2800, pic: '🍞', groups: [] },
    { id: 'bagel', name: '크림치즈 베이글', cat: 'bread', price: 4200, pic: '🥯', groups: ['warm'] },
    { id: 'garlic', name: '마늘 바게트', cat: 'bread', price: 4500, pic: '🥖', groups: [] },
    { id: 'anbutter', name: '앙버터', cat: 'bread', price: 4300, pic: '🥖', groups: [], soldOut: true },
    { id: 'soboro', name: '소보로빵', cat: 'bread', price: 2600, pic: '🍞', groups: [] },
    { id: 'milkbread', name: '우유식빵', cat: 'bread', price: 6500, pic: '🍞', groups: [] },
    // 케이크
    { id: 'strawcake', name: '딸기 생크림 케이크', cat: 'cake', price: 6500, pic: '🍰', groups: [] },
    { id: 'chococake', name: '초코 가나슈 케이크', cat: 'cake', price: 6800, pic: '🍫', groups: [] },
    { id: 'cheesecake', name: '뉴욕 치즈케이크', cat: 'cake', price: 6300, pic: '🧀', groups: [] },
    { id: 'tiramisu', name: '티라미수', cat: 'cake', price: 6900, pic: '🍮', groups: [], soldOut: true },
    { id: 'carrotcake', name: '당근 케이크', cat: 'cake', price: 6200, pic: '🥕', groups: [] },
    { id: 'lemonpound', name: '레몬 파운드', cat: 'cake', price: 3900, pic: '🍋', groups: [] },
    // 샌드위치
    { id: 'hamcheese', name: '햄치즈 샌드위치', cat: 'sandwich', price: 6300, pic: '🥪', groups: ['warm'] },
    { id: 'eggmayo', name: '에그마요 샌드위치', cat: 'sandwich', price: 5800, pic: '🥪', groups: [] },
    { id: 'chickenclub', name: '치킨 클럽 샌드위치', cat: 'sandwich', price: 7200, pic: '🥪', groups: ['warm'] },
    { id: 'blt', name: '베이컨 토마토 샌드위치', cat: 'sandwich', price: 6900, pic: '🥓', groups: ['warm'] },
    { id: 'ricotta', name: '리코타 샐러드 샌드위치', cat: 'sandwich', price: 6800, pic: '🥗', groups: [] },
    { id: 'croque', name: '크로크무슈', cat: 'sandwich', price: 6500, pic: '🧀', groups: ['warm'] }
  ]
};
