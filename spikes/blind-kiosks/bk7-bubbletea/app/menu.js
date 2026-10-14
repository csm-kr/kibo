/* Store menu master for 펄린당 (PEARLIN TEA HOUSE), Seoul Yeonnam branch.
   Fictional brand. Prices in KRW. */
window.MENU = {
  brand: { ko: '펄린당', en: 'PEARLIN TEA HOUSE', sub: '珍珠堂' },
  takeoutCupFee: 200,   // per drink cup, take-out only
  setDiscount: 800,     // per drink+snack set
  cats: [
    { id: 'milk', ko: '밀크티', en: 'Milk Tea' },
    { id: 'fruit', ko: '과일티', en: 'Fruit Tea' },
    { id: 'cheese', ko: '치즈폼', en: 'Cheese Foam' },
    { id: 'coffee', ko: '커피', en: 'Coffee' },
    { id: 'snack', ko: '스낵', en: 'Snacks' },
    { id: 'season', ko: '겨울 시즌', en: 'Winter Season' }
  ],
  groups: {
    size: {
      ko: '사이즈', en: 'Size', type: 'single', required: true, def: 'M',
      opts: [
        { id: 'M', ko: 'M', en: 'M', p: 0 },
        { id: 'L', ko: 'L', en: 'L', p: 700 }
      ]
    },
    sizeCoffee: {
      ko: '사이즈', en: 'Size', type: 'single', required: true, def: 'M',
      opts: [
        { id: 'M', ko: 'M', en: 'M', p: 0 },
        { id: 'L', ko: 'L', en: 'L', p: 500 }
      ]
    },
    temp: {
      ko: '온도', en: 'Temperature', type: 'single', required: true, def: 'ice',
      opts: [
        { id: 'ice', ko: 'ICE', en: 'ICE', p: 0 },
        { id: 'hot', ko: 'HOT', en: 'HOT', p: 0 }
      ]
    },
    ice: {
      ko: '얼음량', en: 'Ice Level', type: 'single', required: true, def: null,
      hideWhenHot: true,
      opts: [
        { id: 'none', ko: '얼음 없음', en: 'No ice', p: 0 },
        { id: 'less', ko: '얼음 적게', en: 'Less ice', p: 0 },
        { id: 'regular', ko: '얼음 보통', en: 'Regular ice', p: 0 },
        { id: 'extra', ko: '얼음 많이', en: 'Extra ice', p: 0 }
      ]
    },
    sweet: {
      ko: '당도', en: 'Sweetness', type: 'single', required: true, def: null,
      opts: [
        { id: 's0', ko: '0%', en: '0%', p: 0 },
        { id: 's30', ko: '30%', en: '30%', p: 0 },
        { id: 's50', ko: '50%', en: '50%', p: 0 },
        { id: 's70', ko: '70%', en: '70%', p: 0 },
        { id: 's100', ko: '100%', en: '100%', p: 0 }
      ]
    },
    shot: {
      ko: '샷 추가', en: 'Extra Shot', type: 'quantity', required: false, def: null,
      opts: [
        { id: 'extraShot', ko: '에스프레소 샷', en: 'Espresso shot', p: 500, max: 2 }
      ]
    },
    topping: {
      ko: '토핑', en: 'Toppings', type: 'multi', required: false, def: null, max: 3,
      opts: [
        { id: 'pearl', ko: '타피오카 펄', en: 'Tapioca Pearl', p: 500 },
        { id: 'whitePearl', ko: '화이트 펄', en: 'White Pearl', p: 500 },
        { id: 'coconut', ko: '코코넛 젤리', en: 'Coconut Jelly', p: 500 },
        { id: 'aloe', ko: '알로에', en: 'Aloe', p: 600, soldOut: true },
        { id: 'pudding', ko: '푸딩', en: 'Pudding', p: 700 },
        { id: 'redBean', ko: '팥', en: 'Red Bean', p: 600 },
        { id: 'grassJelly', ko: '그라스젤리', en: 'Grass Jelly', p: 600, soldOut: true },
        { id: 'milkFoam', ko: '밀크폼', en: 'Milk Foam', p: 800 },
        { id: 'cheeseFoam', ko: '치즈폼', en: 'Cheese Foam', p: 1000 }
      ]
    },
    seasoning: {
      ko: '맛 선택', en: 'Flavor', type: 'single', required: true, def: 'original',
      opts: [
        { id: 'original', ko: '오리지널', en: 'Original', p: 0 },
        { id: 'spicy', ko: '매콤', en: 'Spicy', p: 0 },
        { id: 'cheese', ko: '치즈 시즈닝', en: 'Cheese seasoning', p: 500 }
      ]
    }
  },
  // snacks offered inside the drink+snack set modal
  setSnacks: ['pineappleCake', 'nougatCracker', 'eggTart', 'castella'],
  items: [
    // 밀크티
    { id: 'classicMilk', cat: 'milk', ko: '클래식 밀크티', en: 'Classic Milk Tea', price: 4300, emoji: '🧋', tone: '#c89b6d',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '진하게 우린 아쌈 홍차와 우유', den: 'Strong-brewed Assam black tea with milk' },
    { id: 'brownSugarPearl', cat: 'milk', ko: '흑당 펄 밀크티', en: 'Brown Sugar Pearl Milk Tea', price: 5200, emoji: '🧋', tone: '#7a4a2a',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice', badge: 'BEST',
      dko: '흑당 시럽에 졸인 쫀득한 펄이 기본으로 들어가요', den: 'Chewy pearls simmered in brown sugar syrup, included' },
    { id: 'earlGreyMilk', cat: 'milk', ko: '얼그레이 밀크티', en: 'Earl Grey Milk Tea', price: 4500, emoji: '🧋', tone: '#a98a7a',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '베르가못 향이 은은한 얼그레이 밀크티', den: 'Earl grey with a soft bergamot note' },
    { id: 'taroMilk', cat: 'milk', ko: '타로 밀크티', en: 'Taro Milk Tea', price: 4800, emoji: '🧋', tone: '#a98bc4', badge: 'BEST',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '고소한 타로 페이스트를 넣은 보랏빛 밀크티', den: 'Nutty taro paste blended with milk tea' },
    { id: 'oolongMilk', cat: 'milk', ko: '우롱 밀크티', en: 'Oolong Milk Tea', price: 4500, emoji: '🧋', tone: '#b07c4f',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '로스팅한 우롱차의 구수한 밀크티', den: 'Roasted oolong tea with milk' },
    { id: 'matchaMilk', cat: 'milk', ko: '말차 밀크티', en: 'Matcha Milk Tea', price: 4900, emoji: '🍵', tone: '#8fae6b',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '쌉싸름한 말차와 우유', den: 'Bittersweet matcha with milk' },
    { id: 'jasmineMilk', cat: 'milk', ko: '자스민 밀크티', en: 'Jasmine Milk Tea', price: 4500, emoji: '🧋', tone: '#d8c79a',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '꽃향 가득한 자스민 녹차 밀크티', den: 'Floral jasmine green tea with milk' },
    // 과일티
    { id: 'passionGreen', cat: 'fruit', ko: '패션후르츠 그린티', en: 'Passion Fruit Green Tea', price: 4800, emoji: '🍹', tone: '#e8b33a',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '새콤한 패션후르츠 과육과 녹차', den: 'Tangy passion fruit pulp with green tea' },
    { id: 'mangoOolong', cat: 'fruit', ko: '망고 우롱티', en: 'Mango Oolong Tea', price: 5000, emoji: '🥭', tone: '#f0a23a', badge: 'BEST',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '망고 과육을 갈아 넣은 우롱티', den: 'Oolong tea with blended mango' },
    { id: 'grapefruitGreen', cat: 'fruit', ko: '자몽 그린티', en: 'Grapefruit Green Tea', price: 4800, emoji: '🍊', tone: '#ef7f5f',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '자몽 과육이 씹히는 녹차 (HOT 가능)', den: 'Green tea with grapefruit bits (hot available)' },
    { id: 'lycheeJasmine', cat: 'fruit', ko: '리치 자스민티', en: 'Lychee Jasmine Tea', price: 4900, emoji: '🍹', tone: '#f2c6cf', badge: 'NEW',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '달콤한 리치와 자스민 녹차', den: 'Sweet lychee with jasmine green tea' },
    { id: 'peachOolong', cat: 'fruit', ko: '복숭아 우롱티', en: 'Peach Oolong Tea', price: 4900, emoji: '🍑', tone: '#f4a98a',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '백도 과육과 우롱티', den: 'White peach with oolong tea' },
    { id: 'lemonBlack', cat: 'fruit', ko: '레몬 홍차', en: 'Lemon Black Tea', price: 4300, emoji: '🍋', tone: '#e9d24a',
      g: ['size', 'temp', 'ice', 'sweet', 'topping'],
      dko: '생레몬을 넣은 상큼한 홍차 (HOT 가능)', den: 'Black tea with fresh lemon (hot available)' },
    // 치즈폼
    { id: 'cheeseOolong', cat: 'cheese', ko: '치즈폼 우롱티', en: 'Cheese Foam Oolong Tea', price: 5300, emoji: '🧀', tone: '#e7c27a',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '짭짤한 크림치즈 폼을 올린 우롱티', den: 'Oolong tea topped with salty cream-cheese foam' },
    { id: 'cheeseBlack', cat: 'cheese', ko: '치즈폼 홍차', en: 'Cheese Foam Black Tea', price: 5300, emoji: '🧀', tone: '#c98b52',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '크림치즈 폼을 올린 아쌈 홍차', den: 'Assam black tea with cream-cheese foam' },
    { id: 'cheeseStrawberry', cat: 'cheese', ko: '치즈폼 딸기 그린티', en: 'Cheese Foam Strawberry Green Tea', price: 5800, emoji: '🍓', tone: '#ec7f8f',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '생딸기 그린티 위에 치즈폼', den: 'Strawberry green tea with cheese foam' },
    { id: 'cheeseMatcha', cat: 'cheese', ko: '치즈폼 말차 라떼', en: 'Cheese Foam Matcha Latte', price: 5800, emoji: '🍵', tone: '#9cba74',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '말차 라떼 위에 치즈폼', den: 'Matcha latte with cheese foam' },
    { id: 'cheeseBrownSugar', cat: 'cheese', ko: '치즈폼 흑당 밀크티', en: 'Cheese Foam Brown Sugar Milk Tea', price: 5900, emoji: '🧀', tone: '#8a5a36',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice', soldOut: true,
      dko: '흑당 밀크티 위에 치즈폼', den: 'Brown sugar milk tea with cheese foam' },
    // 커피
    { id: 'americano', cat: 'coffee', ko: '아메리카노', en: 'Americano', price: 3000, emoji: '☕', tone: '#5a3a28',
      g: ['sizeCoffee', 'temp', 'ice', 'shot'],
      dko: '고소한 블렌드 원두 아메리카노', den: 'House blend americano' },
    { id: 'cafeLatte', cat: 'coffee', ko: '카페라떼', en: 'Cafe Latte', price: 3800, emoji: '☕', tone: '#b48a66',
      g: ['sizeCoffee', 'temp', 'ice', 'shot'],
      dko: '에스프레소와 우유', den: 'Espresso with milk' },
    { id: 'vanillaLatte', cat: 'coffee', ko: '바닐라 라떼', en: 'Vanilla Latte', price: 4200, emoji: '☕', tone: '#d9bf8f',
      g: ['sizeCoffee', 'temp', 'ice', 'shot'],
      dko: '바닐라 시럽을 넣은 라떼', den: 'Latte with vanilla syrup' },
    { id: 'brownSugarLatte', cat: 'coffee', ko: '흑당 카페라떼', en: 'Brown Sugar Cafe Latte', price: 4500, emoji: '☕', tone: '#7a4a2a',
      g: ['sizeCoffee', 'temp', 'ice', 'shot'],
      dko: '흑당 시럽과 에스프레소 라떼', den: 'Espresso latte with brown sugar syrup' },
    { id: 'yuanyang', cat: 'coffee', ko: '원앙 커피 밀크티', en: 'Yuanyang Coffee Milk Tea', price: 4800, emoji: '☕', tone: '#9a6a48',
      g: ['sizeCoffee', 'temp', 'ice', 'shot'],
      dko: '커피와 밀크티를 반반 섞은 홍콩식 음료', den: 'Half coffee, half milk tea' },
    // 스낵
    { id: 'pineappleCake', cat: 'snack', ko: '펑리수', en: 'Pineapple Cake', price: 2500, emoji: '🍍', tone: '#f0c75e',
      g: [], dko: '버터 반죽에 파인애플 잼 (1개)', den: 'Buttery pastry with pineapple jam (1 pc)' },
    { id: 'nougatCracker', cat: 'snack', ko: '누가크래커', en: 'Nougat Crackers', price: 3500, emoji: '🍘', tone: '#e6d3a8',
      g: [], dko: '파 크래커 사이 밀크 누가 (3개입)', den: 'Scallion crackers with milk nougat (3 pcs)' },
    { id: 'eggTart', cat: 'snack', ko: '에그타르트', en: 'Egg Tart', price: 2800, emoji: '🥧', tone: '#f2c14e', soldOut: true,
      g: [], dko: '바삭한 페이스트리 에그타르트 (1개)', den: 'Flaky pastry egg tart (1 pc)' },
    { id: 'castella', cat: 'snack', ko: '대만 카스테라', en: 'Taiwanese Castella', price: 3800, emoji: '🍰', tone: '#f5dd9a',
      g: [], dko: '폭신한 대만식 카스테라 조각', den: 'A slice of fluffy Taiwanese sponge cake' },
    { id: 'jipai', cat: 'snack', ko: '지파이', en: 'Jipai Chicken Cutlet', price: 5900, emoji: '🍗', tone: '#d68a3a',
      g: ['seasoning'], noSet: true,
      dko: '얇게 펴서 튀긴 대만식 닭가슴살 튀김', den: 'Large flattened Taiwanese fried chicken' },
    // 겨울 시즌
    { id: 'sweetPotatoMilk', cat: 'season', ko: '군고구마 밀크티', en: 'Roasted Sweet Potato Milk Tea', price: 5500, emoji: '🍠', tone: '#c4733f',
      g: ['size', 'sweet', 'topping'], only: 'hot', badge: 'NEW',
      dko: '군고구마를 곱게 갈아 넣은 따뜻한 밀크티', den: 'Warm milk tea with roasted sweet potato' },
    { id: 'gingerBrownSugar', cat: 'season', ko: '생강 흑당 밀크티', en: 'Ginger Brown Sugar Milk Tea', price: 5300, emoji: '🫚', tone: '#b98a4a',
      g: ['size', 'sweet', 'topping'], only: 'hot',
      dko: '생강청과 흑당을 넣은 따뜻한 밀크티', den: 'Warm milk tea with ginger and brown sugar' },
    { id: 'strawberryPearlMilk', cat: 'season', ko: '딸기 펄 우유', en: 'Strawberry Pearl Milk', price: 5800, emoji: '🍓', tone: '#f08ca0',
      g: ['size', 'ice', 'sweet', 'topping'], only: 'ice',
      dko: '생딸기 청과 우유, 펄 포함', den: 'Fresh strawberry with milk, pearls included' }
  ]
};
