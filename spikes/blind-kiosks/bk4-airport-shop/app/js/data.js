/* SKY PANTRY (하늘곳간) — fictional airport grab-and-go kiosk menu data. */
window.KIOSK_DATA = {
  brand: { ko: '하늘곳간', en: 'SKY PANTRY' },
  // Fixed fake clock. Time-limited items are checked against this value only.
  fakeClock: '08:15',
  categories: [
    { id: 'meal', ko: '김밥·도시락', en: 'Gimbap & Meals' },
    { id: 'bakery', ko: '샌드위치·베이커리', en: 'Sandwich & Bakery' },
    { id: 'drink', ko: '음료', en: 'Drinks' },
    { id: 'snack', ko: '간식', en: 'Snacks' },
    { id: 'travel', ko: '여행용품', en: 'Travel Goods' },
    { id: 'souvenir', ko: '기념품', en: 'Souvenirs' }
  ],
  groups: {
    heat: {
      ko: '데우기 여부', en: 'Heating', type: 'single', required: true, def: null,
      options: [
        { id: 'heat', ko: '데워 주세요', en: 'Heat it', delta: 0 },
        { id: 'noheat', ko: '데우지 않음', en: 'No heating', delta: 0 }
      ]
    },
    sauce: {
      ko: '소스 선택', en: 'Sauce', type: 'single', required: true, def: null,
      options: [
        { id: 'honeymustard', ko: '허니머스타드', en: 'Honey Mustard', delta: 0 },
        { id: 'sweetchili', ko: '스위트칠리', en: 'Sweet Chili', delta: 0 },
        { id: 'garlicmayo', ko: '갈릭마요', en: 'Garlic Mayo', delta: 300 }
      ]
    },
    temp: {
      ko: '온도', en: 'Temperature', type: 'single', required: true, def: null,
      options: [
        { id: 'hot', ko: 'HOT 따뜻하게', en: 'HOT', delta: 0 },
        { id: 'ice', ko: 'ICE 차갑게', en: 'ICED', delta: 300 }
      ]
    },
    size: {
      ko: '사이즈', en: 'Size', type: 'single', required: true, def: 'regular',
      options: [
        { id: 'regular', ko: '레귤러', en: 'Regular', delta: 0 },
        { id: 'large', ko: '라지', en: 'Large', delta: 700 }
      ]
    },
    shot: {
      ko: '샷 추가', en: 'Extra shot', type: 'quantity', required: false, def: null, max: 2,
      options: [
        { id: 'shot', ko: '에스프레소 샷', en: 'Espresso shot', delta: 500, maxQty: 2 }
      ]
    },
    color: {
      ko: '색상', en: 'Color', type: 'single', required: true, def: null,
      options: [
        { id: 'navy', ko: '네이비', en: 'Navy', delta: 0 },
        { id: 'gray', ko: '그레이', en: 'Gray', delta: 0 },
        { id: 'beige', ko: '베이지', en: 'Beige', delta: 0 }
      ]
    },
    wrap: {
      ko: '선물 포장', en: 'Gift wrap', type: 'single', required: false, def: 'nowrap',
      options: [
        { id: 'nowrap', ko: '포장 안 함', en: 'No wrap', delta: 0 },
        { id: 'giftwrap', ko: '선물 포장', en: 'Gift wrap', delta: 1000 }
      ]
    }
  },
  items: [
    // 김밥·도시락
    { id: 'k1', cat: 'meal', ko: '야채김밥', en: 'Veggie Gimbap', price: 3500, pic: '🥬', groups: [] },
    { id: 'k2', cat: 'meal', ko: '참치김밥', en: 'Tuna Gimbap', price: 4200, pic: '🐟', groups: [] },
    { id: 'k3', cat: 'meal', ko: '불고기김밥', en: 'Bulgogi Gimbap', price: 4500, pic: '🥩', groups: [], soldOut: true },
    { id: 'k4', cat: 'meal', ko: '아침 한정 계란김밥 세트', en: 'Morning Egg Gimbap Set', price: 5500, pic: '🍳', groups: [], time: { from: '06:00', to: '11:00' } },
    { id: 'k5', cat: 'meal', ko: '제육도시락', en: 'Spicy Pork Lunchbox', price: 6900, pic: '🍱', groups: ['heat'] },
    { id: 'k6', cat: 'meal', ko: '치킨마요덮밥', en: 'Chicken Mayo Rice Bowl', price: 6500, pic: '🍚', groups: ['heat'] },
    { id: 'k7', cat: 'meal', ko: '유부초밥 4입', en: 'Tofu Pocket Rice (4 pcs)', price: 4000, pic: '🍣', groups: [] },
    // 샌드위치·베이커리
    { id: 's1', cat: 'bakery', ko: '햄치즈 샌드위치', en: 'Ham & Cheese Sandwich', price: 4300, pic: '🥪', groups: ['heat'] },
    { id: 's2', cat: 'bakery', ko: '에그마요 샌드위치', en: 'Egg Mayo Sandwich', price: 3900, pic: '🥚', groups: [] },
    { id: 's3', cat: 'bakery', ko: '치킨 랩', en: 'Chicken Wrap', price: 5200, pic: '🌯', groups: ['heat', 'sauce'] },
    { id: 's4', cat: 'bakery', ko: '버터 크루아상', en: 'Butter Croissant', price: 2800, pic: '🥐', groups: [] },
    { id: 's5', cat: 'bakery', ko: '블루베리 머핀', en: 'Blueberry Muffin', price: 3200, pic: '🧁', groups: [] },
    { id: 's6', cat: 'bakery', ko: '클래식 핫도그', en: 'Classic Hot Dog', price: 3800, pic: '🌭', groups: ['sauce'] },
    // 음료
    { id: 'd1', cat: 'drink', ko: '아메리카노', en: 'Americano', price: 2500, pic: '☕', groups: ['temp', 'size', 'shot'] },
    { id: 'd2', cat: 'drink', ko: '카페라떼', en: 'Caffe Latte', price: 3200, pic: '🥛', groups: ['temp', 'size', 'shot'] },
    { id: 'd3', cat: 'drink', ko: '생수 500ml', en: 'Still Water 500ml', price: 1000, pic: '💧', groups: [] },
    { id: 'd4', cat: 'drink', ko: '꿀바나나우유', en: 'Honey Banana Milk', price: 1800, pic: '🍌', groups: [], promo: '1+1' },
    { id: 'd5', cat: 'drink', ko: '제주감귤주스', en: 'Jeju Tangerine Juice', price: 2400, pic: '🍊', groups: [], promo: '1+1' },
    { id: 'd6', cat: 'drink', ko: '레몬 탄산수', en: 'Lemon Sparkling Water', price: 1600, pic: '🍋', groups: [] },
    { id: 'd7', cat: 'drink', ko: '활주로 라거 500ml', en: 'Runway Lager 500ml', price: 4500, pic: '🍺', groups: [], age19: true },
    // 간식
    { id: 'n1', cat: 'snack', ko: '버터감자칩', en: 'Butter Potato Chips', price: 2000, pic: '🥔', groups: [], promo: '1+1' },
    { id: 'n2', cat: 'snack', ko: '초코 크런치바', en: 'Choco Crunch Bar', price: 1500, pic: '🍫', groups: [] },
    { id: 'n3', cat: 'snack', ko: '젤리 믹스', en: 'Gummy Mix', price: 2200, pic: '🍬', groups: [] },
    { id: 'n4', cat: 'snack', ko: '견과류 한줌', en: 'Mixed Nuts Pack', price: 2500, pic: '🥜', groups: [] },
    { id: 'n5', cat: 'snack', ko: '치킨텐더 4조각', en: 'Chicken Tenders (4 pcs)', price: 5500, pic: '🍗', groups: ['sauce'] },
    { id: 'n6', cat: 'snack', ko: '구운 달걀 2입', en: 'Roasted Eggs (2 pcs)', price: 2000, pic: '🥚', groups: [] },
    // 여행용품
    { id: 't1', cat: 'travel', ko: '여행용 목베개', en: 'Travel Neck Pillow', price: 15000, pic: '💤', groups: ['color'] },
    { id: 't2', cat: 'travel', ko: '멀티 여행 어댑터', en: 'Universal Travel Adapter', price: 18000, pic: '🔌', groups: [], soldOut: true },
    { id: 't3', cat: 'travel', ko: '휴대용 보조배터리', en: 'Portable Power Bank', price: 25000, pic: '🔋', groups: [] },
    { id: 't4', cat: 'travel', ko: '일회용 마스크 5매', en: 'Disposable Masks (5 pcs)', price: 3000, pic: '😷', groups: [] },
    { id: 't5', cat: 'travel', ko: '여행용 세면도구 키트', en: 'Travel Toiletry Kit', price: 8500, pic: '🧴', groups: [] },
    { id: 't6', cat: 'travel', ko: '수면 안대', en: 'Sleep Eye Mask', price: 6000, pic: '😴', groups: [] },
    // 기념품
    { id: 'g1', cat: 'souvenir', ko: '한복 곰 키링', en: 'Hanbok Bear Keyring', price: 9000, pic: '🧸', groups: ['wrap'] },
    { id: 'g2', cat: 'souvenir', ko: '전통 문양 손거울', en: 'Traditional Pattern Hand Mirror', price: 12000, pic: '🪞', groups: ['wrap'] },
    { id: 'g3', cat: 'souvenir', ko: '꿀약과 6입', en: 'Honey Yakgwa (6 pcs)', price: 7500, pic: '🍯', groups: [] },
    { id: 'g4', cat: 'souvenir', ko: '서울 엽서 세트', en: 'Seoul Postcard Set', price: 5000, pic: '✉️', groups: [] },
    { id: 'g5', cat: 'souvenir', ko: '자개 책갈피', en: 'Mother-of-Pearl Bookmark', price: 8000, pic: '🔖', groups: ['wrap'] }
  ]
};
