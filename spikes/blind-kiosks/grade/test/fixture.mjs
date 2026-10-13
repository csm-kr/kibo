// A small made-up kiosk in the answer-key schema and a skill for it, shared by the tests.
export const key = {
  kiosk: { name: '테스트 카페', nameEn: 'Test Cafe', domain: 'cafe' },
  categories: [{ label: '커피', itemCount: 2 }, { label: '세트', itemCount: 1 }],
  optionGroups: {
    temp: { title: '온도', type: 'single', required: true, min: 1, max: 1, default: null, appliesWhen: null,
      options: [{ id: 'hot', label: 'HOT', priceDelta: 0 }, { id: 'iced', label: 'ICED', labelEn: 'Iced', priceDelta: 500 }] },
    ice: { title: '얼음 양', type: 'single', required: true, min: 1, max: 1, default: 'regular', appliesWhen: 'temp is iced',
      options: [{ id: 'less', label: '적게', priceDelta: 0 }, { id: 'regular', label: '보통', priceDelta: 0 }] },
    shot: { title: '샷 추가', type: 'quantity', required: false, min: 0, max: 3, default: null, appliesWhen: null,
      options: [{ id: 'shot', label: '에스프레소 샷', priceDelta: 500, maxQty: 3 }] },
    drink1: { title: '첫 번째 음료', type: 'single', required: true, min: 1, max: 1, default: null, appliesWhen: 'set step 1',
      options: [{ id: 'ame', label: '아메리카노', priceDelta: 0 }, { id: 'latte', label: '카페라떼', priceDelta: 700 }] },
    drink2: { title: '두 번째 음료', type: 'single', required: true, min: 1, max: 1, default: null, appliesWhen: 'set step 2',
      options: [{ id: 'ame', label: '아메리카노', priceDelta: 0 }, { id: 'latte', label: '카페라떼', priceDelta: 700 }] },
  },
  items: [
    { name: '아메리카노', nameEn: 'Americano', category: '커피', basePrice: 3000, soldOut: false, timeLimited: null, optionGroups: ['temp', 'ice', 'shot'] },
    { name: '치즈볼 (5개)', category: '커피', basePrice: 4000, soldOut: true, timeLimited: null, optionGroups: [] },
    { name: '투게더 세트', category: '세트', basePrice: 9000, soldOut: false, timeLimited: null, optionGroups: ['drink1', 'drink2'] },
  ],
  holdoutOrders: [],
};

export const skill = () => ({
  kiosk: '테스트 카페',
  dineOptions: { eat_in: '매장에서 먹어요', take_out: '포장할게요' },
  recipes: {
    startOrder: [{ op: 'click', label: '시작' }, { op: 'click', label: '{dineOption}' }],
    addToCart: [
      { op: 'click', label: '{category}' }, { op: 'click', label: '{item}' },
      { op: 'forEach', over: 'options', as: 'option', steps: [{ op: 'clickIfVisible', label: '{option}' }] },
      { op: 'repeat', times: '{qtyMinus1}', steps: [{ op: 'click', label: '+' }] },
      { op: 'click', label: '담기' },
    ],
  },
  catalog: [
    { name: '아메리카노 3,000원', category: '커피', price: 3000, soldOut: false, optionGroups: [
      { name: '온도', required: true, min: 1, max: 1, options: [{ name: 'HOT', priceDelta: 0 }, { name: 'ICED (+500원)', priceDelta: 500 }] },
      { name: '얼음 양', required: true, min: 1, max: 1, visibleWhen: 'ICED', options: [{ name: '적게', priceDelta: 0 }, { name: '보통', priceDelta: 0 }] },
      { name: '샷 추가', type: 'quantity', required: false, min: 0, max: 3, options: [{ name: '샷 추가', priceDelta: 500, maxQty: 3 }] },
    ] },
    { name: '치즈볼', category: '커피', price: 4000, soldOut: true, optionGroups: [] },
    { name: '투게더 세트', category: '세트', price: 9000, soldOut: false, optionGroups: [
      { name: '첫 번째 음료', required: true, min: 1, max: 1, options: [{ name: '아메리카노', priceDelta: 0 }, { name: '카페라떼', priceDelta: 700 }] },
      { name: '두 번째 음료', required: true, min: 1, max: 1, options: [{ name: '아메리카노', priceDelta: 0 }, { name: '카페라떼', priceDelta: 700 }] },
    ] },
    { name: '쿠키', category: '디저트', price: 2000, soldOut: false, optionGroups: [] },
  ],
  cartTotalPattern: '합계 ([0-9,]+)원',
});
