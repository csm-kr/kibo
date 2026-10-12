/* 구름다락 커피 - 메뉴 데이터 (매장 키오스크 v2.3.1) */
window.KIOSK_DATA = {
  store: {
    name: '구름다락 커피',
    nameEn: 'GUREUM DARAK COFFEE',
    branch: '연남숲길점'
  },

  dineOptions: [
    { id: 'DINE_IN', label: '매장', sub: '매장에서 먹고 갈게요', icon: '🍽️' },
    { id: 'TAKE_OUT', label: '포장', sub: '가지고 갈게요', icon: '🛍️' }
  ],

  categories: [
    { id: 'season', label: '시즌 한정' },
    { id: 'coffee', label: '커피' },
    { id: 'noncoffee', label: '논커피' },
    { id: 'tea', label: '티' },
    { id: 'ade', label: '에이드·스무디' },
    { id: 'bakery', label: '베이커리·디저트' },
    { id: 'set', label: '세트' }
  ],

  /* 옵션 그룹 정의 */
  groups: {
    temp: {
      title: '온도 선택', type: 'single', required: true,
      summaryAlways: true,
      options: [
        { id: 'HOT', label: 'HOT', delta: 0 },
        { id: 'ICED', label: 'ICED', delta: 0 }
      ]
    },
    sizeCoffee: {
      title: '사이즈', type: 'single', required: true, default: 'R',
      summaryAlways: true,
      options: [
        { id: 'R', label: '레귤러', sub: '355ml', delta: 0 },
        { id: 'L', label: '라지', sub: '473ml', delta: 500 },
        { id: 'X', label: '맥스', sub: '591ml', delta: 1000 }
      ]
    },
    sizeDrink: {
      title: '사이즈', type: 'single', required: true, default: 'R',
      summaryAlways: true,
      options: [
        { id: 'R', label: '레귤러', sub: '355ml', delta: 0 },
        { id: 'L', label: '라지', sub: '473ml', delta: 700 }
      ]
    },
    bean: {
      title: '원두 선택', type: 'single', required: true, default: 'BASE',
      options: [
        { id: 'BASE', label: '다락 블렌드', sub: '고소·묵직', delta: 0 },
        { id: 'DECAF', label: '디카페인', sub: '카페인 97% 제거', delta: 500 }
      ]
    },
    shot: {
      title: '에스프레소 샷 추가', type: 'count', required: false,
      max: 3, delta: 500, unit: '샷'
    },
    syrup: {
      title: '시럽 추가', type: 'multi', required: false, max: 2,
      options: [
        { id: 'VANILLA', label: '바닐라 시럽', delta: 500 },
        { id: 'HAZELNUT', label: '헤이즐넛 시럽', delta: 500 },
        { id: 'CARAMEL', label: '카라멜 시럽', delta: 500 },
        { id: 'STEVIA', label: '스테비아(저당)', delta: 300 }
      ]
    },
    milk: {
      title: '우유 변경', type: 'single', required: true, default: 'MILK',
      options: [
        { id: 'MILK', label: '일반 우유', delta: 0 },
        { id: 'LOWFAT', label: '저지방 우유', delta: 0 },
        { id: 'SOY', label: '두유', delta: 500 },
        { id: 'OAT', label: '오트밀크', delta: 600 }
      ]
    },
    whip: {
      title: '휘핑크림', type: 'single', required: true, default: 'ON',
      summaryPrefix: '휘핑크림 ',
      options: [
        { id: 'ON', label: '올려주세요', delta: 0 },
        { id: 'OFF', label: '빼주세요', delta: 0 },
        { id: 'MORE', label: '많이 올려주세요', delta: 500 }
      ]
    },
    ice: {
      title: '얼음 양', type: 'single', required: true, default: 'NORMAL',
      showIf: { temp: 'ICED' },
      summaryPrefix: '얼음 ',
      options: [
        { id: 'LESS', label: '적게', delta: 0 },
        { id: 'NORMAL', label: '보통', delta: 0 },
        { id: 'MORE', label: '많이', delta: 0 }
      ]
    },
    honey: {
      title: '꿀 추가', type: 'multi', required: false, max: 1,
      options: [
        { id: 'HONEY', label: '꿀 추가', delta: 500 }
      ]
    },
    warm: {
      title: '데우기', type: 'single', required: true,
      summaryAlways: true,
      options: [
        { id: 'WARM', label: '데워주세요', delta: 0 },
        { id: 'NOWARM', label: '그대로 주세요', delta: 0 }
      ]
    },
    creamcheese: {
      title: '토핑 추가', type: 'multi', required: false, max: 1,
      options: [
        { id: 'CC', label: '크림치즈 추가', delta: 1000 }
      ]
    }
  },

  items: [
    /* ---------- 시즌 한정 ---------- */
    { id: 'chestnut_latte', cat: 'season', name: '밤 크림 라떼', price: 5500, emoji: '🌰', badge: 'NEW',
      desc: '국산 밤 페이스트와 부드러운 크림을 올린 가을 한정 라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'whip', 'ice'] },
    { id: 'persimmon_smoothie', cat: 'season', name: '홍시 스무디', price: 5800, emoji: '🍅', badge: 'NEW',
      desc: '잘 익은 홍시를 통째로 갈아 만든 스무디',
      temps: ['ICED'], groups: ['temp', 'sizeDrink'] },
    { id: 'apple_cinnamon_tea', cat: 'season', name: '애플 시나몬 티', price: 4800, emoji: '🍎', badge: 'NEW',
      desc: '사과 조각과 시나몬 스틱을 우린 따뜻한 블렌딩 티',
      temps: ['HOT', 'ICED'], groups: ['temp', 'honey', 'ice'] },

    /* ---------- 커피 (12개, 2페이지) ---------- */
    { id: 'americano', cat: 'coffee', name: '아메리카노', price: 3200, emoji: '☕', badge: 'BEST',
      desc: '다락 블렌드 원두로 추출한 깔끔한 블랙 커피',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'syrup', 'ice'] },
    { id: 'cafe_latte', cat: 'coffee', name: '카페라떼', price: 3900, emoji: '🥛', badge: 'BEST',
      desc: '에스프레소와 스팀 우유의 부드러운 조화',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'syrup', 'ice'] },
    { id: 'vanilla_latte', cat: 'coffee', name: '바닐라라떼', price: 4400, emoji: '🍦',
      desc: '바닐라 빈 시럽이 들어간 달콤한 라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'syrup', 'ice'] },
    { id: 'caramel_macchiato', cat: 'coffee', name: '카라멜 마키아토', price: 4700, emoji: '🍮',
      desc: '카라멜 드리즐을 듬뿍 올린 라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'syrup', 'ice'] },
    { id: 'cappuccino', cat: 'coffee', name: '카푸치노', price: 3900, emoji: '☁️',
      desc: '풍성한 우유 거품과 시나몬 파우더',
      temps: ['HOT'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'syrup'] },
    { id: 'cold_brew', cat: 'coffee', name: '콜드브루', price: 3800, emoji: '🧊',
      desc: '찬물로 12시간 추출한 깔끔한 커피',
      temps: ['ICED'], groups: ['temp', 'sizeCoffee', 'syrup', 'ice'] },
    { id: 'cold_brew_latte', cat: 'coffee', name: '콜드브루 라떼', price: 4300, emoji: '🥃',
      desc: '콜드브루와 우유를 섞은 고소한 라떼',
      temps: ['ICED'], groups: ['temp', 'sizeCoffee', 'milk', 'syrup', 'ice'] },
    { id: 'einspanner', cat: 'coffee', name: '아인슈페너', price: 4800, emoji: '🍨', soldOut: true,
      desc: '진한 커피 위에 달콤한 크림을 얹은 비엔나 커피',
      temps: ['ICED'], groups: ['temp', 'bean', 'shot', 'ice'] },
    { id: 'cafe_mocha', cat: 'coffee', name: '카페모카', price: 4600, emoji: '🍫',
      desc: '초콜릿 소스와 에스프레소, 휘핑크림',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'whip', 'ice'] },
    { id: 'espresso', cat: 'coffee', name: '에스프레소', price: 2800, emoji: '☕',
      desc: '다락 블렌드 더블 샷',
      temps: ['HOT'], groups: ['temp', 'bean', 'shot'] },
    { id: 'condensed_latte', cat: 'coffee', name: '연유라떼', price: 4500, emoji: '🥫',
      desc: '달콤한 연유를 넣은 베트남식 라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'milk', 'ice'] },
    { id: 'hazelnut_americano', cat: 'coffee', name: '헤이즐넛 아메리카노', price: 3700, emoji: '🌰',
      desc: '헤이즐넛 향이 은은한 아메리카노',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeCoffee', 'bean', 'shot', 'syrup', 'ice'] },

    /* ---------- 논커피 ---------- */
    { id: 'choco_latte', cat: 'noncoffee', name: '초코라떼', price: 4200, emoji: '🍫',
      desc: '벨기에산 초콜릿으로 만든 진한 초코라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeDrink', 'milk', 'whip', 'ice'] },
    { id: 'greentea_latte', cat: 'noncoffee', name: '녹차라떼', price: 4300, emoji: '🍵',
      desc: '제주 녹차 파우더로 만든 라떼',
      temps: ['HOT', 'ICED'], groups: ['temp', 'sizeDrink', 'milk', 'ice'] },
    { id: 'sweetpotato_latte', cat: 'noncoffee', name: '고구마라떼', price: 4300, emoji: '🍠', soldOut: true,
      desc: '여주 고구마로 만든 든든한 라떼',
      temps: ['HOT'], groups: ['temp', 'sizeDrink', 'milk'] },
    { id: 'strawberry_milk', cat: 'noncoffee', name: '딸기우유', price: 4800, emoji: '🍓',
      desc: '수제 딸기청과 우유',
      temps: ['ICED'], groups: ['temp', 'sizeDrink', 'ice'] },

    /* ---------- 티 ---------- */
    { id: 'earl_grey', cat: 'tea', name: '얼그레이 티', price: 3500, emoji: '🫖',
      desc: '베르가못 향의 클래식 홍차',
      temps: ['HOT', 'ICED'], groups: ['temp', 'honey', 'ice'] },
    { id: 'chamomile', cat: 'tea', name: '캐모마일 티', price: 3500, emoji: '🌼',
      desc: '카페인 없는 편안한 허브티',
      temps: ['HOT', 'ICED'], groups: ['temp', 'honey', 'ice'] },
    { id: 'yuja_tea', cat: 'tea', name: '유자차', price: 3800, emoji: '🍋',
      desc: '고흥 유자청으로 만든 상큼한 차',
      temps: ['HOT', 'ICED'], groups: ['temp', 'ice'] },
    { id: 'peppermint', cat: 'tea', name: '페퍼민트 티', price: 3500, emoji: '🌿',
      desc: '상쾌한 민트 허브티',
      temps: ['HOT'], groups: ['temp', 'honey'] },

    /* ---------- 에이드·스무디 ---------- */
    { id: 'lemonade', cat: 'ade', name: '레몬에이드', price: 4500, emoji: '🍋',
      desc: '생레몬을 착즙한 탄산 에이드',
      temps: ['ICED'], groups: ['temp', 'sizeDrink', 'ice'] },
    { id: 'grapefruit_ade', cat: 'ade', name: '자몽에이드', price: 4800, emoji: '🍊',
      desc: '자몽 과육이 씹히는 에이드',
      temps: ['ICED'], groups: ['temp', 'sizeDrink', 'ice'] },
    { id: 'greengrape_ade', cat: 'ade', name: '청포도에이드', price: 4800, emoji: '🍇',
      desc: '청포도청으로 만든 상큼한 에이드',
      temps: ['ICED'], groups: ['temp', 'sizeDrink', 'ice'] },
    { id: 'strawberry_yogurt_smoothie', cat: 'ade', name: '딸기 요거트 스무디', price: 5300, emoji: '🍓',
      desc: '딸기와 플레인 요거트를 갈아 만든 스무디',
      temps: ['ICED'], groups: ['temp', 'sizeDrink', 'whip'] },
    { id: 'mango_smoothie', cat: 'ade', name: '망고 스무디', price: 5300, emoji: '🥭',
      desc: '애플망고 과육 듬뿍 스무디',
      temps: ['ICED'], groups: ['temp', 'sizeDrink'] },

    /* ---------- 베이커리·디저트 ---------- */
    { id: 'croissant', cat: 'bakery', name: '버터 크루아상', price: 3300, emoji: '🥐',
      desc: '프랑스산 버터로 겹겹이 구운 크루아상',
      groups: ['warm'] },
    { id: 'bagel', cat: 'bakery', name: '플레인 베이글', price: 2800, emoji: '🥯',
      desc: '쫄깃한 뉴욕식 플레인 베이글',
      groups: ['warm', 'creamcheese'] },
    { id: 'salt_bread', cat: 'bakery', name: '소금빵', price: 2900, emoji: '🥖', soldOut: true,
      desc: '버터 풍미 가득한 겉바속촉 소금빵',
      groups: ['warm'] },
    { id: 'choco_muffin', cat: 'bakery', name: '초코 머핀', price: 3200, emoji: '🧁',
      desc: '초코칩이 콕콕 박힌 촉촉한 머핀',
      groups: ['warm'] },
    { id: 'cheesecake', cat: 'bakery', name: '뉴욕 치즈케이크', price: 5800, emoji: '🍰',
      desc: '진하고 꾸덕한 크림치즈 케이크',
      groups: [] },
    { id: 'tiramisu', cat: 'bakery', name: '티라미수', price: 6200, emoji: '🍮',
      desc: '마스카포네 치즈와 에스프레소 시트',
      groups: [] },
    { id: 'macaron', cat: 'bakery', name: '마카롱 (3개입)', price: 5400, emoji: '🍬',
      desc: '바닐라·딸기·피스타치오 마카롱',
      groups: [] },
    { id: 'cookie', cat: 'bakery', name: '초코칩 쿠키', price: 2500, emoji: '🍪',
      desc: '겉은 바삭, 속은 쫀득한 쿠키',
      groups: [] },

    /* ---------- 세트 ---------- */
    { id: 'brunch_set', cat: 'set', name: '브런치 세트', price: 6000, emoji: '🥐☕',
      desc: '음료 1잔 + 베이커리 1개',
      set: {
        steps: [
          { title: '음료 선택', short: '음료', kind: 'drink',
            choices: [
              { item: 'americano', delta: 0 },
              { item: 'cafe_latte', delta: 700 },
              { item: 'earl_grey', delta: 300 },
              { item: 'lemonade', delta: 1300 }
            ] },
          { title: '베이커리 선택', short: '베이커리', kind: 'food',
            choices: [
              { item: 'croissant', delta: 0 },
              { item: 'bagel', delta: 0 },
              { item: 'salt_bread', delta: 0 },
              { item: 'choco_muffin', delta: 0 }
            ] }
        ]
      } },
    { id: 'cake_set', cat: 'set', name: '케이크 세트', price: 9500, emoji: '🍰☕',
      desc: '음료 1잔 + 조각 케이크 1개',
      set: {
        steps: [
          { title: '음료 선택', short: '음료', kind: 'drink',
            choices: [
              { item: 'americano', delta: 0 },
              { item: 'cafe_latte', delta: 700 },
              { item: 'vanilla_latte', delta: 1200 }
            ] },
          { title: '케이크 선택', short: '케이크', kind: 'food',
            choices: [
              { item: 'cheesecake', delta: 0 },
              { item: 'tiramisu', delta: 400 }
            ] }
        ]
      } },
    { id: 'together_set', cat: 'set', name: '투게더 세트', price: 14500, emoji: '☕☕🍰',
      desc: '음료 2잔 + 디저트 1개',
      set: {
        steps: [
          { title: '첫 번째 음료', short: '음료1', kind: 'drink',
            choices: [
              { item: 'americano', delta: 0 },
              { item: 'cafe_latte', delta: 700 },
              { item: 'vanilla_latte', delta: 1200 },
              { item: 'earl_grey', delta: 300 }
            ] },
          { title: '두 번째 음료', short: '음료2', kind: 'drink',
            choices: [
              { item: 'americano', delta: 0 },
              { item: 'cafe_latte', delta: 700 },
              { item: 'vanilla_latte', delta: 1200 },
              { item: 'earl_grey', delta: 300 }
            ] },
          { title: '디저트 선택', short: '디저트', kind: 'food',
            choices: [
              { item: 'cheesecake', delta: 0 },
              { item: 'tiramisu', delta: 400 },
              { item: 'macaron', delta: 0 }
            ] }
        ]
      } },
    { id: 'morning_set', cat: 'set', name: '모닝 세트', price: 4500, emoji: '🌅',
      desc: '아메리카노 + 버터 크루아상',
      timeBadge: '07:00~10:00',
      unavailable: '모닝 세트는 오전 7시부터 10시까지만 주문 가능합니다.' }
  ],

  /* 결제 직전 추천 팝업에 노출되는 메뉴 */
  upsell: ['cheesecake', 'tiramisu', 'cookie']
};
