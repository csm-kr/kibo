# KIBO, judged by a UX judge (Best UI/UX award lens)

Date: 2026-10-13 (13:00–13:45 UTC). Live: `https://kibo-407514467119.asia-northeast3.run.app`.
Method: headless Chromium (Playwright) from the scripts in this folder. 97 screenshots are in
`/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/5e4077f3-a03e-418a-bb20-c3c1f77daf49/scratchpad/judges/ux/shots/`.
File names below are relative to that folder. I sent 11 AI messages in total (3 on `/demo`, 2 in two-device mode, 5 on the Korean phone, 1 on the learned pizza kiosk). The cap was 12.

Limits of this test:
- Headless, so no microphone and no Gemini Live voice. Every order was typed or picked.
- Two other judge agents (impact, tech) were hitting the same server from the same IP at the same time. Many of the HTTP 429 errors below are partly caused by that. The way the UI behaves when a 429 happens is still a real finding.
- Timings were taken from a machine in Korea talking to `asia-northeast3`. Judges elsewhere in JAPAC will add network latency on top.

---

## 1. Scores

| Criterion (weight) | Score | Why (through a UX and first-impression lens) |
|---|---|---|
| Technical Merit & GenAI (40%) | **8 / 10** | The AI visibly drives a real UI. The "What the AI did" panel lists each Gemini tool call next to the server's check (`addToCart ✓ 28 ms`, `requestCheckout ✓`). A typed order reached the kiosk in 2.4–5.5 s. The text agent handled an ambiguous order ("버거 하나 주세요", "one burger please") with photo choice buttons, then asked for set and drink step by step, and inferred "to go" from a free sentence. Points off: a rate limit (429) on the event stream leaves screens frozen for minutes; the learned-kiosk replay can't be seen; the reply text lags the kiosk change by 3–7 s. |
| Problem Alignment & Impact (25%) | **8 / 10** | The problem is clear in 5 seconds: the headline, the side-by-side hero picture, and "Who it is for" covering older users, tourists and low vision. Every scenario names a persona. The "AI can fill the cart but cannot pay" promise is stated well. Points off: nothing on screen says how a real kiosk vendor would adopt this, and the impact numbers ("32 of 32", "1.1 s median") point to repo file paths a judge can't open. |
| Innovation (25%) | **7 / 10** | Using your own phone as the voice of an existing, unchanged kiosk is fresh, and KIBO Learn (learn a third-party screen once, replay without AI) is the most novel part. But on screen it is the least convincing: the learned kiosk renders at about half scale (text about 9 px on a laptop) and the replayed taps can't be seen. A judge has to take it on faith. |
| UX (10%) | **8 / 10** | Polished and consistent across landing, demo, kiosk and phone. The phone looks right: large type, photo buttons, Undo, Staff, a mic hint before the browser prompt, "Type instead", automatic Korean/English, a larger-text setting, and a big order number. Points off: kiosk feedback is Korean-only for an English judge; a stuck "Connecting to the kiosk…" screen with no message or retry; the upsell has no "No thanks"; at 360 px with larger text the cart total goes off-screen after each change. |

**Weighted (my lens): 7.9 / 10.**

**Best UI/UX verdict: contender, probably shortlisted.** It has a real design system rather than a hackathon skin: warm neutral palette, one accent blue, consistent cards and 56 px targets, the same components on `/demo` and `/assistant`. The flows are designed from journeys, the safety story is designed in, and the accessibility settings work. It has three weaknesses that a Best UX jury is likely to hit inside 3 minutes:
1. The frozen "Connecting to the kiosk…" state when the stream is rate-limited.
2. Korean-only kiosk feedback in the very moment the demo asks you to "watch the kiosk".
3. The learned-kiosk replay can't be seen.

Fix those (fixes 1–3 in section 4) and it is a strong candidate to win.

---

## 2. Walk logs

### (a) Cold judge: `/` then `/demo` at 1440×900, English

| # | Step | Result / timing | Screenshot |
|---|---|---|---|
| 1 | Open `/` | DOMContentLoaded 0.29 s, network idle 1.6 s, no console errors. Headline "Don't learn the kiosk. Just talk.", one sentence, two CTAs, and a hero picture of kiosk and phone. **Understood in about 5 s.** | `a01_landing_fold.png` |
| 2 | Scroll the landing (6,067 px tall) | Sections: Who it is for, How it works, One phone many kiosks, Safe by design, Works with kiosks that exist (evidence), Built on Google Cloud (clear diagram), Accessibility. Well paced. Weak spots: evidence cites repo paths (`spikes/blind-kiosk/results/v3run1/grade.txt`) that aren't links. "Example orders: 2 of 5 and 3 of 5 passed" reads as a weakness without context. The hero is a static picture with a "Tap to talk" button drawn in it, so a judge may try to click it. | `a02_landing_full.png`, `a03_landing_y900.png`, `a03_landing_y3700.png`, `a03_landing_y4400.png` |
| 3 | Click [Try the live demo] | Blank cream screen for about 0.5 s during the client-side navigation, then D1. | `a10_demo_intro_fold.png` |
| 4 | D1 intro | One sentence, a 3-step guide, three place cards (burger preselected), [Start] and [Use my phone instead]. **Understood in 5–8 s.** The pizza-shop thumbnail looks grey and unfinished next to the other two. | `a10_demo_intro_fold.png` |
| 5 | [Start] | Split view in 0.3 s. Kiosk "Burger shop kiosk (unchanged)" on the left, "Your phone (KIBO)" in the middle, Scenarios and "What the AI did" on the right. The phone asks "Eat here or take out?". The 3-step guide from D1 is gone. There are no example sentences until a dine option is picked. | `a20_demo_started.png` |
| 6 | [Eat here] | Kiosk jumps to the menu in 0.17 s and "Try saying" chips appear. The 5th chip ("I'll pay") is hidden behind the dock. | `a21_demo_after_dine.png` |
| 7 | Chip "Two cheeseburger sets, one without pickles. Drinks zero cola and cider." (AI msg 1) | User bubble appears at once and chips grey out, but there is **no visible activity indicator until about 1.3 s** (small "Working…" pill near the dock). **Kiosk changes at 5.0 s** with the highlight "AI가 담았어요: 치즈버거 세트" (Korean only). Phone cart at 5.1 s, total ₩13,800, then the reply. "What the AI did" shows two `addToCart ✓` rows. After it settles, the phone total is half hidden under the dock. | `a22_demo_sent_0.4s.png`, `a23_demo_kiosk_moving.png`, `a25_demo_cart_settled.png` |
| 8 | Chip "Make both fries large" (AI msg 2) | "Working…" at 1.4 s. Kiosk highlight "AI가 바꿨어요" (AI changed it) and both lines Fries L at **2.4 s**, ₩14,800. The reply and the two `updateCart ✓` rows appear several seconds later, so the log lags the kiosk. | `a27_demo_fries_highlight.png`, `a28_demo_fries_settled.png` |
| 9 | Chip "I'll pay" (AI msg 3) | Confirm card at **2.9 s**, kiosk on its review screen. **[Yes, pay now] stays washed out (disabled) for about 1.5 s more with no reason given.** The AI's line under the card is clipped by the sticky total panel. | `a30_demo_confirm_card.png`, `a31_demo_confirm_later.png` |
| 10 | [Yes, pay now] | 0.15 s. Kiosk shows payment-method choices (Korean). Phone: "Insert your card into the kiosk. On the kiosk, tap 카드 (Card), then insert your card." plus a blue [Insert the card at the kiosk] button **on the phone**. It isn't clear whether that button is a demo stand-in or part of the product. | `a32_demo_pay_standin.png` |
| 11 | Stand-in button | Kiosk "승인 중…" (approving) at 0.7 s. At 2 s the phone shows **Order number 697**, and the kiosk asks "영수증을 출력할까요?" (print a receipt?) with a Korean 10 s countdown, then shows 697. | `a33_demo_after_card_700ms.png`, `a33_demo_after_card_2000ms.png`, `a36_demo_kiosk_order_number.png` |
| 12 | End card (D3) | "Touch vs talk": 3 messages, 6 phone taps, 0 kiosk taps, 120 s, against 24 kiosk taps by touch, where touch time is "Not shown". The 120 s with nothing to compare against reads like a negative. **[Try again], Try another place and Open two-device mode sit below the fold of the phone column**, so a judge has to scroll inside it to find them. | `a35_demo_end_full.png`, `a37_demo_end_actions.png` |
| 13 | Scenario "The AI cannot pay" (fresh order) | The kiosk resets to its attract screen, but the phone shows **"Connecting to the kiosk…" for more than 60 s**. The console shows `429 /api/session/<id>/events`, and the server body says "Too many open screens. Please close one and try again." **The UI never shows this message and never retries** (EventSource does not reconnect after a non-200 response). **Dead end.** A reload goes back to D1 and loses the scenario. | `a38_demo_scenario_ai_cannot_pay.png`, `a40_demo_scenario_still_connecting.png`, `a41_demo_after_reload.png` |

Walk (a) total: about 10 s to the first action and about 60–90 s to an order number for a judge who reads. That is a good fit for 3 minutes.

### (b) Two-device mode: `/kiosk` at 1440×900, phone at 390×844 (iPhone UA, en-US)

| # | Step | Result / timing | Screenshot |
|---|---|---|---|
| 1 | `/kiosk` | Pairing panel and code in 0.65 s: "KIBO. Order by talking", "Waiting for a phone", a large QR, `kibo-2026.web.app`, code **755 510**, three steps. The kiosk shows a second QR and code in Korean, which is consistent but repeats the panel. | `b01_kiosk_pairing.png` |
| 2 | Phone `/app` | Ready in 0.23 s. Clean: code field, [Connect], [Scan a kiosk], how it works, settings. The placeholder "0 0 0 0 0 0" looks like an entered value. | `b02_phone_app_home.png` |
| 3 | Enter the code, [Connect] | Goes to `/assistant` in 0.22 s, then **stuck on "Connecting to the kiosk…"**. Both kiosk and phone streams got 429. I retried for about 10 min with no message on either screen. | `b04_phone_code_typed.png`, `b05_phone_after_connect.png`, `b07_phone_retry.png` |
| 4 | Second attempt after the limit cleared | The kiosk got its stream and showed "Phone connected at 22:20". **The phone still got 429 and stayed on "Connecting…"**, so the two screens disagreed. A phone reload 25 s later worked. | `b10_kiosk_pairing_retry.png`, `b11_phone_after_connect.png`, `b12_kiosk_after_connect.png`, `b13_phone_ready.png` |
| 5 | Phone intro, then [Start], then the mic hint | Two screens before ordering. "Tell your phone, and the kiosk orders for you" plus 3 steps, then a picture of the Allow prompt, "Turn on the microphone" and "Type instead". Clear, but one tap more than needed for someone who just scanned. | `b13_phone_ready.png`, `b14_phone_after_start.png` |
| 6 | [Type instead] | Dine question with photo buttons and a text field. | `b15_phone_type_mode.png` |
| 7 | Typed "Bulgogi burger set with cider, to go please" (AI msg 4) | **No indicator for 2.3 s** ("Working…" appears late). Kiosk at **5.5 s** (it chose 포장, take-out, by itself) with the highlight "AI가 담았어요: 불고기버거 세트". Product photos were still blank when the highlight fired. Phone cart at 5.9 s, settled at 12 s. Upsell: "Would you like a dessert too?" with [Soft cone] [Apple pie] and **no [No thanks]**. The KIBO side panel on the kiosk only says "Ordering · 1 item · ₩7,200 · Last change: by the AI", which leaves a lot of empty space. | `b17_kiosk_highlight.png`, `b18_phone_cart.png`, `b19_kiosk_cart.png` |
| 8 | Typed "No dessert, that's all. I'll pay" (AI msg 5) | Confirm card in 2.6 s, kiosk review in 2.7 s. [Yes, pay now] is washed out at first. | `b21_phone_confirm.png`, `b22_kiosk_review.png` |
| 9 | [Yes, pay now] | Kiosk payment-method screen in Korean. **Kiosk panel: "Paying at the kiosk · ₩7,200 · Last change: by the AI"**, right after *I* confirmed. That undercuts the "AI cannot pay" message. | `b23_phone_insert_card.png`, `b24_kiosk_payment_method.png` |
| 10 | Kiosk [카드] (Card) | "카드를 아래 투입구에 넣어 주세요 / 체험용 결제예요. 실제로 결제되지 않아요." ("Insert your card below / This is a demo payment, no money is charged"), Korean only. An English judge doesn't know that [카드 넣기] (Insert card) is safe or is the next step. | `b25_kiosk_insert_card.png` |
| 11 | [카드 넣기] | Phone order number **458** in 1.7 s with [Done]. The kiosk shows the receipt prompt, then the number, then returns to its start screen after a visible countdown. | `b26_phone_order_number.png`, `b27_kiosk_after_pay.png`, `b28_kiosk_after_12s.png` |

### (c) Phone at 360×800, Korean locale, larger text on

| # | Step | Result / timing | Screenshot |
|---|---|---|---|
| 1 | `/app` (ko-KR) | Whole UI in Korean automatically, no horizontal overflow (scrollWidth 360). | `c01_app_ko_360.png` |
| 2 | Wrong code 123456 | Clear inline error in Korean: "번호가 맞는 키오스크가 없어요. 키오스크 화면의 번호를 확인해 주세요." ("No kiosk matches that number. Check the number on the kiosk screen.") | `c03_app_ko_wrong_code.png` |
| 3 | `/app/scan` | Camera hint with a picture of the Allow prompt and [카메라 켜기] (turn on camera). The camera does not start before the tap. | `c04_app_scan_ko.png` |
| 4 | Larger text, then connect | The phone got 429 for **about 3 min** (12 reloads). Separately, **the kiosk's stream got 429 silently and stayed on "Waiting for a phone" while the phone was ordering.** A kiosk reload fixed it. | `c12_assistant_ko_stuck_connecting.png`, `c21_kiosk_stale_waiting.png`, `c22_kiosk_after_reload.png` |
| 5 | Intro, then mic hint, then [글자로 입력할게요] (type instead) | Fine. The brand name is localized ("말로 버거"). The language button shows the *other* language ("English"), which is good. | `c11_assistant_ko_intro.png`, `c13_ko_mic_hint.png`, `c14_ko_dine.png` |
| 6 | Layout at 360 with larger text | The bottom dock (text field, big mic, Close, voice) takes about 31% of the height. The placeholder is cut off ("예: 치즈버거 세트 ㅎ"). | `c14_ko_dine.png` |
| 7 | "버거 하나 주세요" ("one burger please", AI msg 6) | Indicator at 2.2 s, reply at 6.5 s: "어떤 버거로 드릴까요?" ("Which burger?") with 6 photo buttons. **The choices have no prices.** | `c15_ko_ambiguous_reply.png` |
| 8 | Pick 불고기버거 (bulgogi burger), then 세트 (set), then 제로콜라 (zero cola) (AI msgs 7–9) | Asks single / set / large set, then the drink, then adds the item (kiosk at 2.65 s after the last pick). **Four round trips, about 25 s for one item.** The kiosk stays empty until the end. Upsell again with no "괜찮아요" (no thanks). **After the change the cart and total are completely off-screen.** They are in an inner scroll container about 500 px down. | `c19_ko_after_pick_done.png`, `c23_kiosk_ko_highlight.png`, `c24_ko_after_drink.png`, `c26_ko_scrolled_to_cart.png` |
| 9 | "디저트는 괜찮아요. 결제할게요" ("no dessert, I'll pay", AI msg 10) | Confirm card in 3.0 s. [네, 결제할게요] (yes, pay) disabled for 1.9 s more. The total (about 50 px) and the pay button fit, but [더 고를게요] (pick more) is hidden behind the sticky total panel. AI wording: "주문 내역 확인 **카드**가 화면에 나왔습니다" ("the order confirm *card* has appeared on screen") leaks an internal term. | `c27_ko_confirm_card_early.png`, `c28_ko_confirm_card.png` |
| 10 | Switch to English mid-order | Instant. Item names switch, and the earlier AI line stays in Korean, which is acceptable. | `c30_ko_switched_to_english.png` |

### (d) `/learned/doughhouse` (and the learned pizza in `/demo?k=doughhouse`)

| # | Step | Result | Screenshot |
|---|---|---|---|
| 1 | Open `/learned/doughhouse` at 1440×900 | Black frame, a 1080×1600 third-party kiosk iframe scaled to **0.5625** (16 px text renders at about 9 px), mostly blank. Only "도우하우스" (Doughhouse) and "화면을 터치하여 주문을 시작하세요" ("touch the screen to start ordering") are readable. KIBO overlay: "말로 주문하기 / Order by talking" and a QR. **No code, no steps, no English explanation of what this page proves.** The landing doesn't link here (its CTA goes to `/demo?k=doughhouse`). | `d01_learned_fold.png` |
| 2 | Touch the kiosk | Dine question in tiny type ("어디서 드시나요?", "where will you eat?"). Looks like an unstyled page, not like the "third-party kiosk" story. | `d03_learned_after_touch.png` |
| 3 | `/demo?k=doughhouse`, [Start], then [Take out] | Phone ready in 0.36 s. Example chips for pizza appear. The kiosk half is the same tiny screen. | `f02_pizza_started.png`, `f03_pizza_after_dine.png` |
| 4 | Chip "A large pepperoni with thin dough and extra bacon" (AI msg 11) | "Working…" at 1.6 s. **The KIBO bar under the kiosk says "Done on the kiosk" at about 5 s while the phone still says "Nothing in your order yet".** Phone cart at 7.9 s (Pepperoni · Large · Thin · Bacon ₩23,400). AI reply: "I am adding … Please wait a moment." after the item was already added. The kiosk's own cart line is in roughly 7 px type at the bottom of the iframe. **The replayed taps can't be seen.** On the plus side, the bilingual status bar "담았어요: 페퍼로니 / Added: Pepperoni" is exactly what the MALO kiosk is missing. | `f04_pizza_replay_1.png`, `f05_pizza_after_order.png` |

### Extra checks
- **Landing on a phone (390):** reads well, CTAs are large. `e01_landing_phone.png`
- **`/demo` on a phone:** D1 says "Talk or type **on the right** / Watch the kiosk **on the left**", which makes no sense on a phone. Only after [Start] does it say "Open this on a laptop". `e02_demo_phone.png`, `e03_demo_phone_after_start.png`
- **`/demo` → [Use my phone instead]:** clean pairing panel with code 817 735, and the scenarios become sentences to say aloud. But its event stream also got 429 silently, so it would never notice a phone connecting. `g01_demo_use_my_phone.png`

### Slow moments (more than 2 s without clear feedback)

| Where | What | How long |
|---|---|---|
| Kiosk side, any AI turn | No "KIBO is working" signal on the kiosk until it moves | 2.4–5.5 s |
| Phone, two-device typed turn and Korean turn | Nothing after the user bubble until the "Working…" pill | 2.2–2.3 s |
| Confirm card | [Yes, pay now] disabled with no reason | 1.5–1.9 s (felt as part of a 4–5 s wait) |
| Learned pizza | "Done on the kiosk" shown before the phone cart updates | ~3 s gap, 7.9 s total |
| Stream rate-limited (429) | "Connecting to the kiosk…" / "Waiting for a phone" with no message and no retry | Indefinite (seen for 1–10 min) |

### Dead ends
1. The 429 freeze above, on the phone, the kiosk and the own-phone demo.
2. The D3 end actions sit below the fold of the phone column.
3. The upsell has no decline button, so you have to type "no".
4. `/demo` on a phone wastes a tap before saying "use a laptop".
5. `/learned/doughhouse` has no explanation and no next step.

### Problems for an English-only judge
- **MALO kiosk feedback is Korean only:** the highlight ("AI가 담았어요: …", "AI added: …"), review, payment, receipt prompt and countdowns. In two-device mode, the steps 카드 (Card), 카드 넣기 (Insert card) and "체험용 결제예요" (this is a demo payment) are untranslated. The phone only translates 카드. The learned kiosk already has a bilingual bar, which shows the inconsistency.
- On `/learned/doughhouse`, the only English is "Order by talking".

### Suspected server issue behind the 429s
The stream limit is 10 open streams per IP (`src/lib/limits/ip.ts`, `MAX_STREAMS`). Slots came back about 4–4.5 min after I closed my pages, both times. One probe that got a slot and closed it after 1.5 s saw 429 again immediately. This is confounded by the other agents, but it suggests closed streams are released late (client disconnects not reaching `req.signal`, so the slot is held until the keep-alive write fails or the 15 min cap). If that's right, a single judge who reloads `/demo` and `/kiosk` a few times, or a judging panel behind one office network, could lock themselves out for minutes. **Worth checking in the Cloud Run logs before submission.**

---

## 3. Ten questions a UX judge would ask, and where the answer should be

| # | Question / doubt | Scenario or screen that should answer it | Does it today? |
|---|---|---|---|
| 1 | "Is the AI really driving the kiosk, or is this a scripted animation?" | D2 "What the AI did" plus the kiosk highlight; type an off-script sentence. | Yes, if the judge notices the panel. Make the kiosk highlight readable in English. |
| 2 | "What stops the AI from paying on its own?" | Scenario **The AI cannot pay** ("Just pay for me" stops at the review). Show the refused `confirmCheckout` row and "You tapped Yes" in the log. | Partly. The scenario exists, but I couldn't run it because of the 429. The kiosk panel says "Last change: by the AI" after the user confirms. |
| 3 | "How does a 72-year-old discover this at a real kiosk and get from the QR to talking?" | `/kiosk` K1 attract screen (QR, code), then P1 mic hint, then P2. Journey J1, two-device mode. | Yes; the steps are clear. Two phone screens (intro, mic hint) could be one. |
| 4 | "What happens when it mishears or the request is vague?" | Scenarios **Not sure what to pick** and **Oops, undo**; the choice buttons in `c15`. | Yes: photo choices. But four round trips for one item is slow, and the choices lack prices. |
| 5 | "How does a tourist know what the Korean kiosk just did?" | Airport rail scenario (Mei) and J2. | Not on the MALO kiosk; the highlight is Korean only. The phone side is fine. |
| 6 | "Does it work without the kiosk vendor's cooperation?" | `/demo?k=doughhouse` and `/learned/doughhouse`. They need a visible "what KIBO learned" view and visible taps. | Not convincingly: the replay can't be seen and the page is unexplained. |
| 7 | "Is it actually faster or easier than touch?" | D3 Touch vs talk (3 messages vs 24 taps). | Partly: the tap count lands, but "120 s" for talk with touch time "Not shown" invites the wrong comparison. |
| 8 | "What if I have no mic, deny it, or it's noisy?" | P1 [Type instead], Flow C3, PX "try typing" after failures. | Yes, as far as I could test (text mode only). |
| 9 | "Can it answer allergen or halal questions honestly?" | Scenario **A question the kiosk can't answer** (staff call). | Not tested (message budget). The landing claims it clearly. |
| 10 | "Is it accessible: large text, screen reader, low vision?" | `/app` Larger text, Minsu scenarios, `aria-live` cart summary. | Mostly. At 360 px with larger text the cart total is off-screen after each change, and the dock eats about 31% of the screen. |

---

## 4. Eight most valuable fixes, ranked by (effect on a judge) / (effort)

1. **Make stream failures visible and self-healing.** Screens: phone P1–P3, `/kiosk` pairing panel, `/demo` D2 and own-phone mode.
   - When the event stream fails (HTTP 429 or any non-200), show the server's own message instead of "Connecting to the kiosk…". For example: "Too many KIBO screens are open from this network. Close other KIBO tabs, then tap Retry." Add a [Retry] button and retry automatically with backoff (5 s, 10 s, 20 s). EventSource will not retry by itself after a 429.
   - On the kiosk, show "Not live, reconnecting…" instead of "Waiting for a phone".
   - On the server, check whether closed streams release their slot promptly. Consider limiting per session instead of per IP, or raising `MAX_STREAMS` for the judging weeks.
   - *Effect: removes the only true dead end. Effort: S–M.*
2. **English subtitle for every kiosk change in the demo and two-device mode.** Screens: D2 kiosk caption and the K-side KIBO panel.
   - Reuse the learned kiosk's bilingual bar on MALO and the airport rail: "AI가 담았어요: 치즈버거 세트" with "AI added: Cheeseburger set (Fries M · Zero cola · No pickles)" underneath.
   - Mirror the kiosk step in the KIBO panel: "Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged."
   - *Effect: high; the main "watch the kiosk" moment becomes readable to most judges. Effort: S.*
3. **Make KIBO Learn visible.** Screens: `/demo?k=doughhouse` kiosk half and `/learned/doughhouse`.
   - Zoom the iframe to its active region, or scale it to fit the height.
   - Draw a tap ripple and a number at each replayed click, with a caption: "KIBO tapped 페퍼로니 → 라지 → 씬 → 베이컨: 4 taps, kiosk total 23,400원 ✓ matches".
   - Give `/learned/doughhouse` an English header: "A third-party kiosk KIBO has never been integrated with. Scan to order by talking." Add the 6-digit code.
   - Only say "Done on the kiosk" after the cart is verified.
   - *Effect: lifts Innovation (25%) more than anything else. Effort: M.*
4. **Make the safety promise show up in the log.** Screens: D2 "What the AI did" and the K-side panel.
   - After [Yes, pay now], add a row "You tapped Yes, pay now → confirmCheckout ✓ (needs your tap)".
   - Change "Last change: by the AI" to "Confirmed by you" once the user confirms.
   - *Effect: high on trust. Effort: S.*
5. **Keep the end actions in view.** Screen: D3.
   - Scroll the phone column to [Try again] when D3 appears, or pin [Try again] and "Try another place" in the phone's bottom dock.
   - Also show the next step in the scenario column ("Next: see KIBO drive a kiosk it learned →").
   - *Effect: medium-high; stops judges leaving after one order. Effort: S.*
6. **Respond within 300 ms on every send, and never disable the pay button silently.** Screens: P3, P4, D2.
   - Show "Working…" (or a typing indicator) straight away, and mirror "KIBO is working…" in the kiosk toolbar.
   - On the confirm card, either accept the tap while the reply finishes or label the wait ("One moment, KIBO is finishing…").
   - *Effect: medium; the demo feels faster. Effort: S.*
7. **Add a decline button to every upsell and prices to choice buttons.** Screens: P3 choices, A7.
   - Add [No thanks] / [괜찮아요] next to the dessert choices.
   - Show the price on each choice ("불고기버거 · 5,200원").
   - Remove the "Please wait a moment" and "확인 카드" wording from replies.
   - *Effect: medium (heuristics 3 and 6, J1). Effort: S.*
8. **Keep the cart visible on small phones with larger text.** Screen: P3 at 360 px.
   - After each cart change, scroll to the cart, or show a sticky one-line summary above the dock ("내 주문 1개 · 7,200원 ›"). The sr-only text already exists.
   - In text mode, shrink the dock (hide the 88 px mic while the keyboard is in use).
   - Widen the input so the placeholder isn't cut off.
   - *Effect: medium for J1 and accessibility reviewers. Effort: S–M.*

Smaller items, not ranked:
- On `/demo` below 900 px, show "Open this on a laptop" on D1 straight away and remove the "on the right / on the left" copy.
- Keep a compact 3-step strip in D2.
- Make the evidence paths on the landing into GitHub links, and put the 2/5 and 3/5 result in context.
- In "Touch vs talk", hide the talk time when there is no touch time to compare it with.
- Preload the kiosk menu photos so the first highlight doesn't land on blank cards.
- Replace the "000000" placeholder in `/app` with "6 digits".
- Label the dock's [Close] as "Close keyboard" or use an icon with a tooltip.
- Explain or relabel the stand-in [Insert the card at the kiosk] button as "Demo: insert card at kiosk", and move it to the kiosk half.