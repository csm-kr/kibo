import subprocess
SP='/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/666d8d65-fa84-4561-b38d-5aa95cc9bd9e/scratchpad'
s=open(SP+'/kibo-design/project/Main.dc.html').read()
js=s.split('data-dc-script')[1].split('\n',1)[1].rsplit('</script>',1)[0]
harness = r'''
const Q=[]; global.setTimeout=(f)=>{Q.push(f);return Q.length}; global.clearTimeout=()=>{};
const flush=()=>{while(Q.length)Q.shift()()};
const flushOnce=()=>{const n=Q.length; for(let i=0;i<n;i++) Q.shift()()};
class DCLogic{constructor(p){this.props=p}setState(o){this.state=Object.assign({},this.state,o)}}
''' + js + r'''
let c, v; const R=()=>{v=c.renderVals();return v}; let pass=0, fail=0;
const ok=(name,cond)=>{cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name)};
const say=(k)=>{R(); const i=['order','fries','vague','halal','pay'].indexOf(k); v.say[i].go(); flushOnce(); R();};
const noImg = () => { const all=JSON.stringify(R()); return !all.includes('"img":""'); };
// ---- Flow A (voice) ----
c=new Component({}); R(); ok('attract screen with hero image', v.k.attract && v.img.hero.startsWith('/_blob/'));
v.act.scan(); R(); ok('A2 QR → kiosk dine, phone mic guide', v.k.dine && v.p.mic && v.status==='connected');
v.act.allowMic(); R(); ok('A3 → phone dine with photos', v.p.dine && v.img.dine_in.startsWith('/_blob/'));
v.act.takeOut(); R(); ok('A4 → kiosk menu (burger), phone talk', v.k.menu && v.p.talk && v.catTitle==='버거');
say('order'); ok('A6 2 cheese sets = 13,800원, toast, tile lit', v.cartView.length===2 && v.totalText==='13,800원' && v.aiToast.includes('치즈버거') && v.products[0].style.includes('#0E5E5A'));
ok('set lines use set photo and options', v.cartView[0].img.startsWith('/_blob/') && v.cartView[0].optText.includes('피클 빼기') && v.cartView[0].optText.includes('제로콜라'));
flush(); R(); ok('highlight clears after 2s', !v.aiToast && !v.cartView[0].chipStyle.includes('#0E5E5A'));
say('fries'); ok('A7 fries L both → 14,800원 + upsell choice', v.totalText==='14,800원' && v.hasChoices && v.cartView[0].optText.includes('감자튀김 L'));
v.choices[1].pick(); flush(); R(); ok('upsell cone added → 15,800원, kiosk shows dessert', v.totalText==='15,800원' && v.catTitle==='디저트');
say('fries'); ok('already large message', v.msgs.slice(-1)[0].text.includes('이미 라지'));
v.act.undo(); R(); ok('undo removes cone', v.totalText==='14,800원');
say('pay'); ok('A8 kiosk review + phone confirm', v.k.review && v.p.confirm && v.status==='confirming');
v.act.sayYes(); flush(); R(); ok('voice yes → kiosk card, phone card', v.k.card && v.p.card);
v.act.insertCard(); R(); ok('approving state', v.payBusy && v.cardTitle.includes('승인'));
flush(); R(); ok('receipt question', v.k.receipt && v.status==='paid');
v.act.receiptNo(); R(); ok('A10 order number both', v.k.done && v.p.done && v.orderNo===127);
console.log('  voice: utter', v.utter, 'phone taps', v.pTaps, 'kiosk taps', v.kTaps);
// ---- exceptions ----
c=new Component({}); R(); v.act.scan(); v.act.allowMic(); v.act.dineIn(); R();
say('pay'); ok('empty cart pay refused', v.k.menu && v.msgs.slice(-1)[0].text.includes('없어요'));
say('vague'); ok('vague → 4 photo choices, sold-out disabled', v.choices.length===4 && v.choices[3].disabled && v.choices[0].img.startsWith('/_blob/'));
v.choices[1].pick(); R(); ok('then asks set or single', v.hasChoices && v.choices.length===2 && v.msgs.slice(-1)[0].text.includes('세트로'));
v.choices[1].pick(); flush(); R(); ok('bulgogi set added 7,200원', v.totalText==='7,200원' && v.cartView[0].name==='불고기버거 세트');
say('halal'); ok('halal → staff banner', v.staff===true);
say('pay'); v.act.confirmYes(); R(); v.act.editOrder(); R(); ok('card → [주문 수정] back to review/confirm', v.k.review && v.p.confirm);
c=new Component({}); R(); v.act.scan(); v.act.denyMic(); R(); ok('mic denied → text mode', v.p.dine && v.micHint.includes('마이크 없이'));
// ---- Flow B: full touch path, same Hero order ----
c=new Component({}); R(); v.act.touchStart(); R(); v.act.kTakeOut(); R();
ok('touch: phone untouched', v.p.off && v.k.menu);
const addCheeseSet = (drink, ingr) => {
  R(); v.products[0].open(); R(); ok('sheet step 1 variant with 3 photo options', v.sheet.open && v.sheet.options.length===3);
  v.sheet.options[1].pick(); R(); ok('step 2 side', v.sheet.title.includes('사이드'));
  v.sheet.options[1].pick(); R(); ok('step 3 drink', v.sheet.title.includes('음료'));
  v.sheet.options[drink].pick(); R(); ok('step 4 ingredients + qty', v.sheet.isCustom);
  if (ingr) { v.sheet.options[0].pick(); R(); }
  v.act.addFromSheet(); flush(); R();
};
addCheeseSet(1, true);
ok('touch upsell popup once', v.upsell.open); v.act.upsellNo(); R();
addCheeseSet(2, false);
ok('no second upsell', !v.upsell.open);
ok('touch total = voice total (14,800원)', v.totalText==='14,800원');
ok('sold-out tile not tappable', v.products[4].soldOut===true);
v.act.kioskCheckout(); R(); ok('kiosk review', v.k.review);
v.act.goPay(); R(); ok('payment method screen', v.k.method);
v.act.pickCard(); R(); v.act.insertCard(); flush(); R(); v.act.receiptYes(); R(); ok('touch payment completes', v.k.done && v.p.off);
console.log('  touch: kiosk taps', v.kTaps);
// mid-order switch
c=new Component({}); R(); v.act.touchStart(); v.act.kDineIn(); R(); v.products[0].open(); R(); v.act.closeSheet(); R(); v.act.scan(); R();
ok('mid-order QR keeps kiosk menu', v.k.menu && v.p.mic); v.act.allowMic(); R(); ok('goes straight to talk', v.p.talk);
ok('no empty image src anywhere', noImg());
console.log(`TOTAL ${pass} pass, ${fail} fail`);
'''
open(SP+'/e2e_check2.mjs','w').write(harness)
r=subprocess.run(['node',SP+'/e2e_check2.mjs'],capture_output=True,text=True); print(r.stdout, r.stderr[-1500:])
