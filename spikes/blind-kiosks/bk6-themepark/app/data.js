/* Starsea Park (별바다 파크) — fictional menu data. All names and prices are invented. */
window.KIOSK = {
  brand: { ko: '별바다 파크', en: 'Starsea Park' },

  categories: [
    { id: 'adm', ko: '입장권', en: 'Admission' },
    { id: 'pass', ko: '자유이용권', en: 'Ride Passes' },
    { id: 'snack', ko: '간식', en: 'Snacks' },
    { id: 'drink', ko: '음료', en: 'Drinks' },
    { id: 'goods', ko: '기념품', en: 'Souvenirs' }
  ],

  // Per-person price change for discountable tickets.
  discounts: [
    { id: 'general', ko: '일반', en: 'Standard', delta: 0 },
    { id: 'disabled', ko: '장애인 우대', en: 'Disability', delta: -10000 },
    { id: 'senior', ko: '경로 우대', en: 'Senior (65+)', delta: -8000 }
  ],

  ages: [
    { id: 'adult', ko: '대인', en: 'Adult', subKo: '만 19세 이상', subEn: 'Age 19+' },
    { id: 'youth', ko: '청소년', en: 'Youth', subKo: '만 13~18세', subEn: 'Age 13-18' },
    { id: 'child', ko: '소인', en: 'Child', subKo: '36개월~만 12세', subEn: '36 months-12' }
  ],

  sizes: [
    { id: 'R', ko: 'R 레귤러', en: 'R Regular', delta: 0 },
    { id: 'L', ko: 'L 라지', en: 'L Large', delta: 1000 }
  ],

  toppings: [
    { id: 'cheese', ko: '치즈 소스', en: 'Cheese sauce', delta: 500 },
    { id: 'choco', ko: '초코 소스', en: 'Chocolate sauce', delta: 500 },
    { id: 'condensed', ko: '연유 드리즐', en: 'Condensed milk drizzle', delta: 500 },
    { id: 'icecream', ko: '아이스크림 토핑', en: 'Ice cream topping', delta: 1000 }
  ],

  payMethods: [
    { id: 'card', ko: '신용/체크카드', en: 'Credit/Debit card', icon: '💳' },
    { id: 'easy', ko: '간편결제 (QR·바코드)', en: 'Mobile pay (QR/Barcode)', icon: '📱' },
    { id: 'voucher', ko: '모바일 상품권', en: 'Mobile gift voucher', icon: '🎁' }
  ],

  items: [
    // 입장권 — tickets: price per age; some need a discount type
    { id: 't-aqua', cat: 'adm', kind: 'ticket', ko: '아쿠아리움 입장권', en: 'Aquarium Admission', emoji: '🐠',
      ages: { adult: 29000, youth: 25000, child: 21000 }, discount: true },
    { id: 't-sky', cat: 'adm', kind: 'ticket', ko: '오션 스카이 전망대', en: 'Ocean Sky Deck', emoji: '🔭',
      ages: { adult: 12000, youth: 10000, child: 8000 }, discount: false },
    { id: 't-pkg', cat: 'adm', kind: 'ticket', ko: '아쿠아리움+전망대 패키지', en: 'Aquarium + Sky Deck Package', emoji: '🎟️',
      ages: { adult: 36000, youth: 31000, child: 26000 }, discount: true },
    { id: 't-4d', cat: 'adm', kind: 'ticket', ko: '4D 해저탐험 영상관', en: '4D Deep Sea Theater', emoji: '🎬',
      ages: { adult: 7000, youth: 7000, child: 5000 }, discount: false },

    // 자유이용권
    { id: 'p-day', cat: 'pass', kind: 'ticket', ko: '종일 자유이용권', en: 'Full-Day Ride Pass', emoji: '🎢',
      ages: { adult: 59000, youth: 52000, child: 47000 }, discount: true },
    { id: 'p-pm', cat: 'pass', kind: 'ticket', ko: '오후 자유이용권', en: 'Afternoon Ride Pass', emoji: '🎡',
      ages: { adult: 47000, youth: 41000, child: 37000 }, discount: true },
    { id: 'p-big5', cat: 'pass', kind: 'ticket', ko: '빅5 어트랙션 이용권', en: 'Big 5 Ride Ticket', emoji: '🎠',
      ages: { adult: 35000, youth: 35000, child: 30000 }, discount: false },

    // 간식 — optional toppings (max 2)
    { id: 's-churros', cat: 'snack', kind: 'snack', ko: '별사탕 츄러스', en: 'Star Candy Churros', emoji: '⭐', price: 4500, promo: true },
    { id: 's-hotdog', cat: 'snack', kind: 'snack', ko: '고래 꼬리 핫도그', en: 'Whale Tail Corn Dog', emoji: '🌭', price: 5500, soldOut: true },
    { id: 's-croffle', cat: 'snack', kind: 'snack', ko: '소금빵 크로플', en: 'Salt Butter Croffle', emoji: '🥐', price: 6000 },
    { id: 's-popcorn', cat: 'snack', kind: 'snack', ko: '산호 팝콘', en: 'Coral Popcorn', emoji: '🍿', price: 6500 },
    { id: 's-waffle', cat: 'snack', kind: 'snack', ko: '해마 와플', en: 'Seahorse Waffle', emoji: '🧇', price: 5000 },
    { id: 's-potato', cat: 'snack', kind: 'snack', ko: '통감자 버터구이', en: 'Buttered Whole Potato', emoji: '🥔', price: 5000 },

    // 음료 — size R/L (water has no size)
    { id: 'd-lemon', cat: 'drink', kind: 'drink', ko: '블루 레모네이드', en: 'Blue Lemonade', emoji: '🍋', price: 4500, sized: true },
    { id: 'd-ade', cat: 'drink', kind: 'drink', ko: '파도 자몽에이드', en: 'Wave Grapefruit Ade', emoji: '🍹', price: 5000, sized: true },
    { id: 'd-ame', cat: 'drink', kind: 'drink', ko: '아이스 아메리카노', en: 'Iced Americano', emoji: '🧊', price: 4000, sized: true },
    { id: 'd-smoothie', cat: 'drink', kind: 'drink', ko: '딸기 스무디', en: 'Strawberry Smoothie', emoji: '🍓', price: 5500, sized: true },
    { id: 'd-choco', cat: 'drink', kind: 'drink', ko: '핫초코', en: 'Hot Chocolate', emoji: '🍫', price: 4500, sized: true },
    { id: 'd-water', cat: 'drink', kind: 'drink', ko: '생수 500ml', en: 'Bottled Water 500ml', emoji: '💧', price: 1500, sized: false },

    // 기념품 — added straight to the cart on tap
    { id: 'g-seal', cat: 'goods', kind: 'goods', ko: '아기 물범 인형', en: 'Baby Seal Plush', emoji: '🦭', price: 15000 },
    { id: 'g-lamp', cat: 'goods', kind: 'goods', ko: '해파리 무드등', en: 'Jellyfish Mood Lamp', emoji: '💡', price: 22000, soldOut: true },
    { id: 'g-key', cat: 'goods', kind: 'goods', ko: '고래 키링', en: 'Whale Keyring', emoji: '🐋', price: 6000 },
    { id: 'g-card', cat: 'goods', kind: 'goods', ko: '바다 엽서 세트', en: 'Sea Postcard Set', emoji: '💌', price: 4000 },
    { id: 'g-band', cat: 'goods', kind: 'goods', ko: '펭귄 머리띠', en: 'Penguin Headband', emoji: '🐧', price: 9000 },
    { id: 'g-mug', cat: 'goods', kind: 'goods', ko: '별바다 머그컵', en: 'Starsea Mug', emoji: '☕', price: 12000 }
  ]
};
