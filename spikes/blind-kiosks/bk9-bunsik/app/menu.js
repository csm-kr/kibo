/* 보리별 분식 — store menu data (loaded by the kiosk at boot) */
window.BORI_MENU = {
  store: { name: '보리별 분식', tagline: '오늘도 든든하게, 한 그릇 뚝딱' },

  /* Fixed store clock. The kiosk never reads the device clock. */
  clock: { label: '10.14 (수) 12:30', minutes: 12 * 60 + 30 },

  categories: [
    { id: 'tteok', label: '떡볶이' },
    { id: 'gimbap', label: '김밥' },
    { id: 'noodle', label: '라면/우동' },
    { id: 'fried', label: '튀김/순대' },
    { id: 'set', label: '세트' },
    { id: 'drink', label: '음료' }
  ],

  groups: {
    spice: {
      title: '맵기 선택', type: 'single', required: true,
      options: [
        { id: 'lv1', label: '1단계 순한맛', price: 0, pep: 1 },
        { id: 'lv2', label: '2단계 덜매운맛', price: 0, pep: 2 },
        { id: 'lv3', label: '3단계 보통맛', price: 0, pep: 3 },
        { id: 'lv4', label: '4단계 매운맛', price: 0, pep: 4 },
        { id: 'lv5', label: '5단계 아주매운맛', price: 0, pep: 5 }
      ]
    },
    tteok_topping: {
      title: '토핑 추가', type: 'multi', required: false, max: 3,
      maxMsg: '토핑은 최대 3개까지 선택할 수 있어요.',
      options: [
        { id: 'egg', label: '삶은 계란', price: 500 },
        { id: 'odeng', label: '어묵 추가', price: 1000 },
        { id: 'dangmyeon', label: '당면 사리', price: 1000 },
        { id: 'mandu', label: '만두 사리', price: 1000 },
        { id: 'ramen', label: '라면 사리', price: 1500 },
        { id: 'cheese', label: '모짜렐라 치즈', price: 1500 },
        { id: 'sausage', label: '비엔나 소시지', price: 1500 }
      ]
    },
    gimbap_cut: {
      title: '김밥 커팅', type: 'single', required: true,
      options: [
        { id: 'cut', label: '썰어서', price: 0 },
        { id: 'whole', label: '통으로', price: 0 }
      ]
    },
    gimbap_extra: {
      title: '김밥 추가', type: 'quantity', required: false, max: 3,
      note: '기본 김밥 1줄씩 추가돼요',
      maxMsg: '김밥은 최대 3줄까지 추가할 수 있어요.',
      options: [
        { id: 'extra_roll', label: '김밥 추가 1줄', price: 3000, maxQty: 3 }
      ]
    },
    ramen_addin: {
      title: '추가 재료', type: 'multi', required: false, max: 3,
      options: [
        { id: 'egg', label: '계란', price: 500 },
        { id: 'cheese', label: '치즈', price: 700 },
        { id: 'tteok', label: '떡 사리', price: 1000 }
      ]
    },
    noodle_firm: {
      title: '면 익힘 정도', type: 'single', required: true,
      options: [
        { id: 'firm', label: '꼬들하게', price: 0 },
        { id: 'normal', label: '보통', price: 0 },
        { id: 'soft', label: '푹 익혀서', price: 0 }
      ]
    },
    soondae_style: {
      title: '순대 구성', type: 'single', required: true,
      options: [
        { id: 'plain', label: '순대만', price: 0 },
        { id: 'mixed', label: '내장 섞어서', price: 0 }
      ]
    },
    set_tteok: {
      title: '떡볶이 선택', type: 'single', required: true, big: true,
      options: [
        { id: 'basic', label: '보리별 떡볶이', price: 0, icon: '🥘' },
        { id: 'cheese', label: '치즈 떡볶이', price: 1000, icon: '🧀' },
        { id: 'rose', label: '로제 떡볶이', price: 1500, icon: '🍲' }
      ]
    },
    set_gimbap: {
      title: '김밥 선택', type: 'single', required: true, big: true,
      options: [
        { id: 'basic', label: '보리별 김밥', price: 0, roll: 'basic' },
        { id: 'kimchi', label: '김치 김밥', price: 0, roll: 'kimchi' },
        { id: 'tuna', label: '참치 김밥', price: 500, roll: 'tuna' },
        { id: 'katsu', label: '돈까스 김밥', price: 1000, roll: 'katsu' }
      ]
    },
    set_drink: {
      title: '음료 선택', type: 'single', required: true, big: true,
      options: [
        { id: 'cola', label: '콜라', price: 0, icon: '🥤' },
        { id: 'cider', label: '사이다', price: 0, icon: '🫧' },
        { id: 'orange', label: '오렌지 주스', price: 500, icon: '🍊' },
        { id: 'sikhye', label: '식혜', price: 500, icon: '🍚' }
      ]
    }
  },

  items: [
    /* 떡볶이 */
    { id: 't1', cat: 'tteok', name: '보리별 떡볶이', price: 4500, icon: '🥘', best: true,
      desc: '쫀득한 쌀떡에 달큰 매콤한 고추장 소스', groups: ['spice', 'tteok_topping'] },
    { id: 't2', cat: 'tteok', name: '치즈 떡볶이', price: 5500, icon: '🧀',
      desc: '보리별 떡볶이 위에 치즈를 듬뿍', groups: ['spice', 'tteok_topping'] },
    { id: 't3', cat: 'tteok', name: '로제 떡볶이', price: 6500, icon: '🍲',
      promo: { price: 5500, label: '오늘의 할인' },
      desc: '크림과 고추장을 섞은 부드러운 로제 소스', groups: ['spice', 'tteok_topping'] },
    { id: 't4', cat: 'tteok', name: '짜장 떡볶이', price: 5500, icon: '🍛',
      desc: '춘장 소스에 매콤함을 더했어요', groups: ['spice', 'tteok_topping'] },
    { id: 't5', cat: 'tteok', name: '궁중 떡볶이', price: 6000, icon: '🥢',
      desc: '간장 양념으로 볶아 맵지 않아요', groups: ['tteok_topping'] },
    { id: 't6', cat: 'tteok', name: '점심 쫄볶이', price: 5000, icon: '🍜',
      timeLimited: { from: '11:00', to: '14:00', label: '점심 한정' },
      desc: '쫄면 사리와 떡을 함께 볶은 점심 메뉴', groups: ['spice', 'tteok_topping'] },

    /* 김밥 */
    { id: 'g1', cat: 'gimbap', name: '보리별 김밥', price: 3500, roll: 'basic', best: true,
      desc: '단무지·시금치·계란·당근이 들어간 기본 김밥', groups: ['gimbap_cut', 'gimbap_extra'] },
    { id: 'g2', cat: 'gimbap', name: '김치 김밥', price: 4000, roll: 'kimchi',
      desc: '볶은 김치로 새콤하게', groups: ['gimbap_cut', 'gimbap_extra'] },
    { id: 'g3', cat: 'gimbap', name: '참치 김밥', price: 4500, roll: 'tuna',
      desc: '마요 참치와 깻잎', groups: ['gimbap_cut', 'gimbap_extra'] },
    { id: 'g4', cat: 'gimbap', name: '치즈 김밥', price: 4500, roll: 'cheese',
      desc: '슬라이스 치즈 두 장', groups: ['gimbap_cut', 'gimbap_extra'] },
    { id: 'g5', cat: 'gimbap', name: '돈까스 김밥', price: 5000, roll: 'katsu',
      desc: '바삭한 돈까스를 통째로', groups: ['gimbap_cut', 'gimbap_extra'] },
    { id: 'g6', cat: 'gimbap', name: '멸치 김밥', price: 4500, roll: 'anchovy', soldOut: true,
      desc: '고추 멸치볶음으로 칼칼하게', groups: ['gimbap_cut', 'gimbap_extra'] },

    /* 라면/우동 */
    { id: 'n1', cat: 'noodle', name: '보리별 라면', price: 4000, icon: '🍜',
      desc: '얼큰한 국물의 기본 라면', groups: ['noodle_firm', 'ramen_addin'] },
    { id: 'n2', cat: 'noodle', name: '해물 라면', price: 5500, icon: '🦐',
      desc: '홍합·오징어를 넣은 시원한 국물', groups: ['ramen_addin'] },
    { id: 'n3', cat: 'noodle', name: '만두 라면', price: 5000, icon: '🥟',
      desc: '고기만두 4개가 들어가요', groups: ['ramen_addin'] },
    { id: 'n4', cat: 'noodle', name: '짬뽕 라면', price: 5500, icon: '🌶️',
      desc: '불맛 나는 짬뽕 국물', groups: ['ramen_addin'] },
    { id: 'n5', cat: 'noodle', name: '어묵 우동', price: 5500, icon: '🍢',
      desc: '맑은 국물에 어묵 꼬치 2개', groups: [] },
    { id: 'n6', cat: 'noodle', name: '김치 우동', price: 6000, icon: '🍲',
      desc: '칼칼한 김치 국물 우동', groups: [] },

    /* 튀김/순대 */
    { id: 'f1', cat: 'fried', name: '모둠 튀김', price: 5000, icon: '🍤',
      desc: '김말이·고추·오징어·야채 튀김 5조각', groups: [] },
    { id: 'f2', cat: 'fried', name: '김말이 튀김', price: 2500, icon: '🌯',
      desc: '당면을 김에 말아 튀긴 3개', groups: [] },
    { id: 'f3', cat: 'fried', name: '고추 튀김', price: 3000, icon: '🫑',
      desc: '고기소를 채운 고추 튀김 3개', groups: [] },
    { id: 'f4', cat: 'fried', name: '오징어 튀김', price: 3500, icon: '🦑',
      desc: '통오징어 튀김 3조각', groups: [] },
    { id: 'f5', cat: 'fried', name: '찹쌀 순대', price: 4500, icon: '🌭',
      desc: '찹쌀 순대 1인분, 소금 별도 제공', groups: ['soondae_style'] },
    { id: 'f6', cat: 'fried', name: '군만두', price: 3500, icon: '🥟',
      desc: '바삭하게 구운 군만두 5개', groups: [] },

    /* 세트 */
    { id: 's1', cat: 'set', name: '보리별 세트', price: 9900, icon: '🍱', best: true,
      desc: '떡볶이 + 김밥 + 음료를 골라 담는 세트',
      groups: ['set_tteok', 'spice', 'set_gimbap', 'gimbap_cut', 'set_drink'],
      steps: [
        { label: '떡볶이', q: '떡볶이와 맵기를 골라 주세요', groups: ['set_tteok', 'spice'] },
        { label: '김밥', q: '김밥과 커팅 방법을 골라 주세요', groups: ['set_gimbap', 'gimbap_cut'] },
        { label: '음료', q: '음료를 골라 주세요', groups: ['set_drink'] }
      ] },
    { id: 's2', cat: 'set', name: '떡튀순 세트', price: 12000, icon: '🍽️',
      desc: '보리별 떡볶이 + 모둠 튀김 + 찹쌀 순대', groups: ['spice'] },
    { id: 's3', cat: 'set', name: '튀순 세트', price: 8500, icon: '🧺',
      desc: '모둠 튀김 + 찹쌀 순대', groups: [] },

    /* 음료 */
    { id: 'd1', cat: 'drink', name: '콜라', price: 2000, icon: '🥤', desc: '355ml 캔', groups: [] },
    { id: 'd2', cat: 'drink', name: '사이다', price: 2000, icon: '🫧', desc: '355ml 캔', groups: [] },
    { id: 'd3', cat: 'drink', name: '오렌지 주스', price: 2500, icon: '🍊', desc: '250ml 병', groups: [] },
    { id: 'd4', cat: 'drink', name: '식혜', price: 2500, icon: '🍚', desc: '가게에서 직접 담근 식혜 340ml', groups: [] },
    { id: 'd5', cat: 'drink', name: '생수', price: 1000, icon: '💧', desc: '500ml', groups: [] }
  ]
};
