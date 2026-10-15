# UX: user flows and Nielsen's 10 heuristics

Principle: **the user only looks at and talks to the phone; the kiosk is a mirror that confirms what changed, and the place to pay.** Designing for an older first-time user makes it easier for tourists and people with disabilities too. Personas are in `docs/PRD.md`.

## Screen roles
| Screen | Role | What the user does |
|---|---|---|
| Phone `/assistant` | **Primary.** Conversation, cart, confirmation | Talk or tap |
| Kiosk `/kiosk` | **Mirror.** Highlights what the AI changed; payment happens here | Glance to confirm; insert the card at the end; may also touch |

The user never has to switch between screens to understand the order: **the phone alone shows every line and the total.**

## Overall flow
```mermaid
flowchart TD
  S["Kiosk attract screen<br/>talk (QR) · touch"]
  S -->|scan QR| M["Phone: microphone hint"]
  S -->|touch| T["Flow B: touch ordering"]
  T -->|"QR mid-order, cart kept"| M
  T -->|"set, side, drink, ingredients, upsell"| T
  T -->|order| CONF
  C0["Flow C: /demo one screen<br/>3-step guide + example sentences"] --> D
  M -->|allow| D["Dine-in / take-out"]
  M -->|deny| X["Text and button mode"] --> D
  D --> TALK["Talk<br/>listening + transcript"]
  TALK --> AG{"AI decides"}
  AG -->|clear| CART["Kiosk 2 s highlight<br/>phone cart card"]
  AG -->|ambiguous| CH["Choice buttons"] --> CART
  AG -->|sold out| ALT["Alternative buttons"] --> CART
  AG -->|not in kiosk data| STAFF["Call-staff banner"]
  CART -->|undo| TALK
  CART -->|say more| TALK
  CART -->|"I'll pay"| CONF["Kiosk: order review<br/>Phone: confirm card"]
  CONF -->|"pick more"| TALK
  CONF -->|yes| PAY["Payment method → insert card at the kiosk"]
  PAY -->|edit order| CONF
  PAY -->|approved| RC["Print receipt?"]
  RC --> DONE["Order number on both screens"]
  DONE -->|after 10 s| S
  TALK -.->|"10 min idle, warned 1 min before"| S
```

## User journeys
What each persona goes through, where they could give up, and which moment must work: `docs/USER_JOURNEY.md`.

## Flow A: Sunja orders with her phone (core)
| # | Kiosk | Phone | Heuristics |
|---|---|---|---|
| A1 | Attract screen with two large choices: "Order by talking (QR)" and "Order by touch" | — | 2, 6 |
| A2 | "Connecting…" next to the QR; under it "Or open **<host>/app** and enter **123 456**" (the 6-digit pairing code; with `SHORT_APP_URL` set, the short host such as **kibo-2026.web.app**, which redirects to `/app`) | Camera shows a link; tapping opens `/assistant`. No install. Or, without a camera app: open `<host>/app`, type the 6 digits, [Connect]; or [Scan a kiosk] on `/app` scans the QR inside the web app (`/app/scan`). All three end in `/assistant` | 1, 7 |
| A3 | "Phone connected"; moves to dine option | **Mic hint screen:** "Tap **Allow** on the next screen" with a picture, then the browser prompt | 1, 10 |
| A4 | Unchanged | "Eat here or take out?" with two large photo buttons; speaking works too | 6 |
| A5 | — | **One large mic button.** "Listening…" with a waveform; stops automatically; shows what it heard | 1, 3 |
| A6 | Moves to the menu; two cheeseburger-set lines are **highlighted** and added. "Added by AI" status | Voice: "Added two cheeseburger sets. One without pickles with zero cola, one with cider." Cart card with photos + **[Undo]** | 1, 2, 3 |
| A7 | Both fries change to L with highlight | "Both fries are now large. +1,000 won" → "Would you like dessert too?" [No thanks] [Show me] (once per order) | 1, 6 |
| A8 | **Order review** screen (same content) | **Confirm card:** items and total in large type. **[Yes, pay now]** **[Pick more]**. Saying "yes" also works after the card appears | 5 |
| A9 | Payment: "Insert or tap your card" animation | "**Insert your card into the kiosk**" with an arrow to the kiosk | 2, 1 |
| A10 | Approving → approved → receipt? → **large order number** | **Large order number** + "We'll call your number at the counter." Stays on the phone | 1, 6 |
| A11 | Back to the attract screen after a visible 10 s countdown | Keeps the order number until the user closes it, then clears conversation and cart | 1 |

## Flow B: touch ordering
Pressing "Order by touch" runs the familiar kiosk flow (dine option → category → item → set → side → drink → ingredients → review → payment). **The user can switch to voice at any time by scanning the small QR on every screen; the cart is kept.**

## Flow C: judges on `/demo`
- **C1** One-sentence intro and a **3-step guide**: ① talk or type on the right ② watch the kiosk on the left move ③ confirm to pay. Three equal **place cards**, each with a capture of its kiosk, a title, one line and the persona it serves: Burger shop (MALO BURGER, connected directly, default), Airport rail (SKYLINE AIRPORT RAIL ticket machine) and Pizza shop, no integration (Doughhouse, learned by KIBO Learn). **[Start]** opens the selected card; the choice is in the URL (`/demo?k=malo|airport_rail|doughhouse`). The kiosk half's caption names the place. Below 900px wide, D1 says first "Open this on a laptop to see the kiosk and the phone side by side." with [Open the kiosk], and its steps say "to the phone" instead of "on the right / on the left" (14-final:1).
- **C2** The assistant on the right is **the same component** as `/assistant`, in English, with the place's example sentences (`examplesFor(kioskId, "en")`; MALO: "One cheeseburger set with zero cola", "Make the fries large", "Is this halal?"). On the ticket machine the phone skips the dine question and goes straight to talking.
- **C2a** An optional **[Scenarios]** column, open by default from 1440px wide (closed below), lists what to try on this kiosk (`scenariosFor(kioskId)` in `src/lib/demo/scenarios.ts`): title, persona, goal and tags as text labels. Choosing one starts a fresh order (like [Try again]) and shows its steps: each sentence is a chip that sends it as the user's message, with a "watch" hint and a check mark that ticks from the live session. **[Play it for me]** sends the same sentences through the same path (real `/api/chat`), one per step, waits up to 20 s for the step's check, pauses 1.5 s, and stops at the confirm card: "Your turn: tap **Yes, pay now** on the phone, then the card on the kiosk." It needs the dine option first, never sends from `confirming` on, never retries, and on a failed step says "This step didn't go as expected. You can type it yourself or try again."
- **C2b** **What the AI did** (from 1440px wide at the bottom of the scenario column, open; below that under the phone, collapsed with a count) lists each tool call Gemini made and what the KIBO server answered, newest first: plain words from menu data ("Added 1 × Cheeseburger set (Zero cola · No pickles)", "Opened your order review", "Tried to pay → you must confirm it yourself") and the tool name with its result in a second line (`addToCart ✓ 180 ms`, `confirmCheckout refused (CONFLICT)`); the user's own confirm is listed too, "You tapped Yes, pay now" or "You confirmed by saying yes" with `confirmCheckout ✓ … · needs your tap or a new 'yes'`, under the legend "Gemini decides; the KIBO server checks every action against the kiosk's data and rules before the kiosk moves." Beside the phone it stays through the review; under the phone it steps aside while the confirm card is open, so the total and [Yes, pay now] stay on screen, and comes back with its rows after [Pick more] (I-129, I-084). Below 900px wide `/demo` says "Open this on a laptop" and links to the kiosk's two-device mode (I-074). Typed and spoken turns both report. Not a live region (the cart announcements are). The phone `/assistant` never shows it (heuristic 8).
- **C2c** On the learned pizza kiosk the judge watches KIBO tap: each click the bridge replays gets a numbered mark on the kiosk half, and the strip under it says what was tapped, then "✓ matches" with the kiosk's own total only after the server checked it (screen map LK). While the phone waits for the AI the strip says "KIBO is working…" instead of the last result, so nothing reads as done before it happened (I-221).
- **C3** If there is no mic or it is denied, or the Live connection fails, text input comes forward automatically. On `/demo` the phone's text field is open from the start; on `/assistant` it sits behind [Type] in the bottom dock and, once opened, stays open for the order (`docs/UI_GUIDE.md` "Phone design").
- **C1a** Next to [Start], **[Use my phone instead]** runs the same place with a real phone: the tall kiosk on the left with its own QR and 6-digit code on K1, and in place of the simulated phone KIBO's slim status column (as on a landscape `/kiosk`; it never repeats the QR or the code, 14-final:1): three steps ("Scan the QR on the kiosk, or open **<host>/app** and type the code shown there", …), then "Phone connected at <time>" and a read-only status line (step, item count, total, who made the last change; from the review on "Confirmed by you", never the AI) with the kiosk's step in English ("Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged."). The judge orders by voice on their own phone; the session keeps the demo limits. The scenario guide stays, its sentences as text to say on the phone (no chips, no [Play it for me]); choosing a scenario keeps the current order, so the phone needs no new scan. The kiosk half offers [Connect another phone], which shows the new QR and code on the kiosk, and the column waits again at once. Payment is on the kiosk half. At the end the panel shows **[Try again]** (a fresh pairable order, so the phone scans again) and **Try another place**; there is no Touch vs talk card, because the messages and taps happened on the other phone. [Back to the start] returns to D1.
- **C4** From the review on, a white line under the kiosk caption says the Korean kiosk's step in English ("Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged."). At payment, a "Kiosk: insert card (demo)" button under the kiosk half, drawn on the kiosk's dark frame in its accent colour, stands in for the card reader and counts as a kiosk tap; the phone half shows only the words, so no phone control pays (15-judge-fixes:2). P5 names the kiosk's own button ("On the kiosk, tap 카드 (Card), then insert your card."), and its picture points left, toward the kiosk half.
- **C5** Right under the order number: **[Try again]** and **Try another place** with the two other places, brought into view when the end card appears, so a judge never scrolls for them (14-final:1). On MALO BURGER a **Touch vs talk** card follows: "This order with KIBO" (messages to the AI, taps on the phone, taps on the kiosk, counted in this browser for this order, and the seconds from [Start] to the order number only beside people's touch times) beside the hero order by touch (the medians of `evidence/human-runs.json` when it exists, else the automated efficient run's taps, with "Not shown: an automated run taps at machine speed." for its time, and then no seconds on the KIBO side either). The touch side is titled "The same order by touch" only when this cart is the hero cart, else "The reference order by touch" with the reference order spelled out from menu data. No ratios. Then a link to the real two-device mode of the same kiosk (`/kiosk?k=<kioskId>`). The ticket machine ends with a reference number ("Please take your tickets from the machine."). With the learned pizza kiosk the order ends at the review (the user would pay on the kiosk itself): **[Try again]** and **Try another place**.

## Exception flows
| Situation | Phone | Kiosk | Heuristics |
|---|---|---|---|
| **Misheard** | Shows what it heard. **[Undo]** once or "No, cancel that" reverts the last change | Last change reverted | 3, 9 |
| **Ambiguous** ("one burger") | Asks with **choice buttons** (photos): cheeseburger / bulgogi / double… then "Make it a set?" No need to remember options | Shows the category | 6, 5 |
| **Sold out** | "The shrimp burger is sold out." + two similar items as buttons | Sold-out mark | 9 |
| **Order before the dine option** (a learned kiosk, which asks it before its menu; or "I'll pay" on MALO with none chosen) | "Eat here or take out?" with the two buttons; nothing is added yet. After the tap the phone sends the same message again, shown as "Continuing your order…", so the user never retypes it (15-judge-fixes:1). With voice open, the tap goes to the conversation as the answer | Moves to the menu once the dine option is in, then the lines appear | 3, 6 |
| **Place the machine does not sell** (a real station, "to the airport") | Never swaps in another ticket: "This machine doesn't sell that. It sells express tickets to City Center, 39 min, 10,500 won, and …", then the matching tickets as buttons with **[Call staff]** last (the same staff call as the header) | Unchanged | 9, 6 |
| **Not in kiosk data** (halal etc.) | Does not guess: "This kiosk doesn't have that information. **I've called staff.**" | Staff banner | 9, 10 |
| **User is stuck** | **[Call staff]** always visible at the top | Staff banner | 3, 10 |
| **Phone screen off / disconnected** | Reopening on the same phone **continues** (token stored on the phone); cart kept | "Connection paused" after 60 s without ping; touch still works | 3, 9 |
| **Idle** | One minute before expiry: "Still ordering?" **[Continue]** | Same warning | 5 |
| **Someone else scans the same QR** | "Someone else is using this kiosk" | Unchanged | 5 |
| **Noise** | After two failures: "Try typing or choosing a button" | — | 9, 7 |
| **Learned kiosk replay fails** | "Please check the kiosk screen" + [Call staff] | Shows its own real cart; the session keeps its last verified cart and calls staff | 9 |
| **Change of mind at payment** | — | **[Edit order]** returns to review | 3 |
| **Server busy** (the screen's stream refused, e.g. too many screens on one network; I-033) | "Busy right now. Reconnecting…" in place of "Connecting to the kiosk…", or as a pill above the dock with the order kept; reconnects by itself after 3 s, 6 s, 12 s, … up to 30 s | A strip at the top: "잠시 후 다시 연결합니다…"; reconnects the same way | 1, 9 |

## Screen map
Every screen and state that a QA pass must look at (`docs/UI_QA.md`). Ids are used in QA findings.

| Id | Screen | Session status | Next |
|---|---|---|---|
| K1 | Kiosk attract (talk QR, touch, large text). On a landscape screen the kiosk is as tall as the screen and KIBO's slim status column sits beside every kiosk screen (where to find the QR and code, phone status, order line; never a second QR or code; see Flow C1a) | `idle` | K2 or phone P1 |
| K2 | Kiosk dine-in / take-out, small QR in the toolbar row; [처음으로] bottom left (standalone `/kiosk` only) | `connected` / `ordering` | K3, or K1 by [처음으로] |
| K3 | Kiosk menu: category rail, photo grid, cart bar ([처음으로] first in its button row on the standalone `/kiosk`; with items it asks "주문을 취소하고 처음으로 갈까요?" first), small QR | `ordering` | K4, K5, K6, or K1 by [처음으로] |
| K4 | Kiosk product sheet: set → side → drink → ingredients | `ordering` | K3 |
| K5 | Kiosk upsell pop-up (once per order) | `ordering` | K3 |
| K6 | Kiosk order review | `confirming` | K7 or K3 |
| K7 | Kiosk payment method → card insert → approving | `paying` | K8 or K6 (edit) |
| K8 | Kiosk receipt? → order number | `paid` | K1 after 10 s |
| KX | Kiosk banners: staff called, connection paused and server busy ("잠시 후 다시 연결합니다…") (a strip at the top that pushes the screen down), AI highlight + status line (in the toolbar row for 2 s; on a Korean kiosk KIBO's English subtitle row under it for 6 s, "AI added: …"), KIBO's "처리하고 있어요 · Working…" in the toolbar row (KIBO blue with its tag) while the phone waits for the AI, from the send until the reply or 20 s (14-final:1), idle warning. A visible kiosk never pauses (I-172): it waits on K1 with its QR and code for a phone, and a learned kiosk's bridge must replay as soon as a phone orders; only a tab hidden for 60 s closes its stream, and it reopens when visible | any | — |
| P0 | Phone app home `/app` (the installed app's start page; optional, a QR link never needs it): a [Larger text] switch beside the logo (the settings card has the same one; 15-judge-fixes:2), [Continue my order] while this phone holds an open order, the 6-digit code field (hint "6 digits", not "000000", which looked typed in) with [Connect] (wrong code: "That code doesn't match a kiosk. Check the number on the kiosk screen."), [Scan a kiosk], how it works, settings (language, AI voice, larger text) that `/assistant` reads; in an in-app browser a note to open Safari or Chrome | — | P1 by [Connect], the scanner, or P2–P5 by [Continue my order] |
| P0-scan | Phone QR scanner `/app/scan`: camera hint with [Turn on the camera] (nothing starts before the tap), scanning (camera with a framing square, "Point at the QR on the kiosk", light toggle when the camera has one), "This QR is not a KIBO kiosk." for any other code, and without a camera "Open your camera app and scan the QR there, or paste the link below" with a link field | — | P1 (`/assistant`, the claim runs there), or `/app` by [Back] |
| P1 | Phone mic hint (or in-app browser warning) | `connected`, or `ordering` when scanned mid-order | P2, or P3 when the dine option is already set; text mode if denied |
| P2 | Phone dine option (not on a kiosk without dine options, such as the ticket machine: P3 directly) | `connected` | P3 |
| P3 | Phone talk: mic, transcript, last two messages, cart card, choices (with prices from menu data; an offer also has [No thanks]), [Undo]; "Working…" from the moment a message is sent; a one-line cart summary above the dock while the cart card is out of view; the mic shrinks to 56px while the keyboard is up | `ordering` | P4 |
| P4 | Phone confirm card: the lines and [Pick more] scroll; the total, [Yes, pay now] and a compact mic ("You can also say yes.") with [Type] stay at the bottom. On a learned kiosk: no [Yes, pay now]; "Tap 주문하기 (Order) on the kiosk and pay there." (label from the skill) and [Pick more] | `confirming` | P5 or P3 (learned: ends here) |
| P5 | Phone "insert your card into the kiosk" | `paying` | P6 |
| P6 | Phone order number, kept until the user closes it | `paid` | P7 |
| P7 | Phone session ended / someone else is using this kiosk | `expired` / other | — |
| P-lang | Phone "Language and text size" sheet (the app bar's globe-and-Aa button, on `/assistant` and the `/demo` phone; 15-judge-fixes:2): "Text size" with the [Larger text] switch first (on a phone ≤ 380px wide with larger text, the AI voice switch too, because the dock gives it up there), then "Screens and AI" (한국어, English), then "The AI talks and writes in it · screens in English" (日本語, 中文(简体), Español, Tiếng Việt, Français, ไทย, Bahasa Indonesia), each in its own words with the English name under it, the one in use ticked, and "Checked by typing. Speaking these languages is not tested yet."; [Close] or Escape | any | the screen it opened from |
| PX | Phone overlays: idle warning, staff called, reconnecting, "Busy right now. Reconnecting…" (server busy, also on `/demo` D2), "Please check the kiosk screen" (learned kiosk), "Paused · Tap to continue" after 20 min with no change and no input (not after payment, so the order number stays in view; also on `/demo` D2) | any | — |
| D1 | `/demo` intro with 3-step guide and three place cards (burger shop, airport rail, pizza shop); [Start] and [Use my phone instead]; below 900px wide the "Open this on a laptop" note first | — | D2 |
| D2 | `/demo` split: kiosk left, assistant right, example sentences, card stand-in, optional scenario guide on the right (open from 1440px wide) with "What the AI did" at its bottom (under the phone below 1440px). Own-phone state ([Use my phone instead]): the status column instead of the assistant, waiting (steps; the QR and code are on the kiosk half's K1) then connected (phone status, read-only order line); guide sentences as text; no "What the AI did" | all (own phone: `idle` until claimed) | D3 |
| D3 | `/demo` end: [Try again] and Try another place (the two other places) under the order number and in view, then the Touch vs talk card (MALO only), link to `/kiosk?k=<kioskId>`; learned kiosk: at the review, [Try again], [How KIBO learned this kiosk] (L2), Try another place | `paid` (learned: `confirming`) | D1 |
| L1 | `/learn`: "Watch KIBO learn a kiosk from its screens alone.", how learning works and its limits in two lines, the one learner headline word for word from `docs/plan/NUMBERS.md` (also on the landing) with "Every never-seen kiosk so far" one click away (15-judge-fixes:3), one card per recorded run (one sheet cropped from a recorded screenshot at about its recorded size, with a caption saying what it shows; who built the kiosk; minutes and turns, items found, orders without AI with the unsafe count; the files behind the numbers in one grey "Sources" line). Then "How KIBO gets onto a real kiosk": direct adapter from menu data; on web kiosks one script tag, a kiosk-browser extension or WebView injection by the vendor or store; native apps on the roadmap; no vendor partnerships (14-final:3). Linked from the landing page ("Works with kiosks that exist") and `/learned/<kiosk>` | — | L2 |
| L2 | `/learn/<runId>`: replay of one recorded learning run, one step per trace turn: the kiosk screenshot, the action in plain words, [Back] [Play] [Next], speed 1×/4×/16×, a turn slider, milestones to jump to (first items, all categories, coverage audit, self-test, finished), "What KIBO knows" counters. It starts playing by itself at 4× with a visible [Pause]; Back, Next, the slider or a milestone pause it. With reduced motion it never plays by itself. Every Korean label in the captions, the notes and the learned menu carries its English, "세트 (Set)", from a static glossary written from the runs' own labels (`src/lib/learn/glossary.ts`; never translated at runtime). The traces record no tap positions, so no tap mark is drawn on the screenshots (I-266). At the last turn: the learned skill (categories, items, prices, options) and [Order on this kiosk] (`/demo?k=<kioskId>`) when the kiosk is in the demo, else why not. Linked from the D1 pizza card and D3. [Larger picture] shows the screenshot at its own size. On phones the action and the controls come before the screenshot, so [Play] is on the first screen (I-199); file paths sit in grey "Sources" lines. A trace shows the kiosk as it looked when learned (Doughhouse: 10-13, before its restyle) | — | L1, D1 |
| LK | `/learned/<kiosk>`: the learned kiosk page, unchanged, laid out at the learner's width but at least 1120 px tall instead of 1600 so it draws ≥ 0.8× at 1440×900, beside KIBO's panel: "A pizza kiosk KIBO learned by itself (our development kiosk). Scan the QR or enter the code to order by talking." (and Korean), the QR, the 6-digit code with its address, then "Phone connected", the replay line and [Watch how KIBO learned it] (L1). Each click the bridge replays gets a numbered KIBO-blue mark on its target for 350 ms before the click, and the line names the tap ("tap 3: 라지"); after the server checked the kiosk's own total: "Added: Pepperoni. KIBO tapped 피자 → 페퍼로니 → 라지 → … · 7 taps · kiosk total 23,400원 ✓ matches", or plainly that the cart did not match and nothing was added. In `/demo` the same marks and line, the line as a strip under the page (14-final:3) | `ordering` | — |

## Nielsen's 10 heuristics, as KIBO rules
| # | Heuristic | KIBO rule |
|---|---|---|
| 1 | Visibility of system status | Always show connection, "listening", "working", "AI is helping". AI changes get a **2 s highlight** on the kiosk. Spoken replies are also shown as text |
| 2 | Match with the real world | Use counter-staff words ("Added", "Eat here?"). Never show technical terms (session, token, agent) |
| 3 | User control and freedom | **[Undo]** after every change. Switch between touch and voice any time. Cancel anything before payment. **The AI cannot reach payment without the user** |
| 4 | Consistency and standards | Phone and kiosk use the same item names, price format and order. Fixed button positions (primary bottom right, staff at top). `/demo` and `/assistant` share components. All kiosks share one flow |
| 5 | Error prevention | Confirm card, ask when ambiguous, server-side option and price validation, expiry warning, duplicate-command blocking |
| 6 | Recognition rather than recall | Choices shown as **buttons with photos**; example sentences; the cart is always visible on the phone; the order number stays |
| 7 | Flexibility and efficiency | Experts say it in one sentence; first-timers go step by step with questions and buttons; touch, voice and text all work |
| 8 | Minimalist design | **One task per screen** on the phone. Only the last two messages are large. Demo counters appear **only in demo mode** |
| 9 | Recognize, diagnose, recover | Errors say what failed and what to do next in plain words ("The shrimp burger is sold out. How about this?"). No red alerts or error codes |
| 10 | Help and documentation | "Try saying…" examples at the start and when stuck; the staff button is always there; mic permission hint on first use |

## Accessibility (set for older users)
- **Text:** phone body ≥ 20px; totals and order numbers ≥ 32px; all kiosk text ≥ 40px on the 1080×1920 canvas (`docs/UI_GUIDE.md`). Respect the system font size.
- **Touch targets:** ≥ 56×56px; primary buttons full width on the phone.
- **Contrast:** body ≥ 4.5:1 (WCAG AA). Never rely on color alone.
- **Screen readers:** every control labelled; cart changes announced with `aria-live` when AI voice is off (suppressed while the AI speaks, to avoid overlap).
- **Voice replies:** short, one thing at a time, slightly slow; can be turned off. Half-duplex (mic paused while the AI speaks) to avoid self-interruption.
- **Language:** the phone's screens are Korean or English and follow the browser language (anything else falls back to English). The app bar's language button (globe and the language in use, in its own words) opens a picker (P-lang): Korean and English change the screens and the AI; Japanese, Chinese (Simplified), Spanish, Vietnamese, French, Thai and Indonesian change only what the AI speaks and writes, with the mic label, [Yes, pay now], [Pick more], "Insert your card into the kiosk" and the order number translated and each cart line showing the kiosk's Korean name with the English one under it. Typed messages are answered in the language they are written in, whatever the picker says (14-final:4); spoken ones too, and a tap on a choice keeps the language of the user's earlier words, although the tap sends the button's label (16-judge-r3-fixes:0). With an AI-only language the choice question, [No thanks] and the fixed choice labels (set or single, yes or no, [Call staff]) are in that language too; item and option names stay as the menu data has them. The AI names the confirm button by the words on screen in its language ("はい、支払います"), not "Yes, pay now" (15-judge-fixes:2).
- **Text size:** [Larger text] is in the same sheet as the language (globe-and-Aa button in the app bar), so it is one tap away on every phone screen, including a QR scan that lands on `/assistant`; `/app` has it beside the logo. On the phone it scales the root font size by 1.15; on `/demo` it zooms the phone half only (15-judge-fixes:2). `/app`'s settings keep Korean and English only; the kiosk starts in its default language (Korean) and its K1 language row switches the kiosk to English for one order.
- **In-app browsers** (KakaoTalk, Naver, Instagram, Facebook, LINE) have unreliable microphones: detect and suggest opening in Safari/Chrome. P1 shows [Copy link] before the phone claims the QR, so the copied link still connects in the other browser; [Order here by typing] claims in the app and a banner stays. `/app` and `/app/scan` show the same advice (cameras often fail there too).

## Copy
- Polite, short sentences, one piece of information per sentence.
- Action buttons are verbs: [Yes, pay now], [Undo], [Call staff].
- Kiosk copy follows real kiosk wording: "Make it a set?", "Insert your card below", "Print a receipt?".

## System sequence (Flow A)
```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant K as Kiosk /kiosk
  participant P as Phone /assistant
  participant API as Cloud Run API
  participant FS as Firestore
  participant L as Gemini Live
  K->>API: POST /api/session
  API->>FS: create session (idle), store secrets
  API-->>K: sessionId, QR, kioskToken
  U->>P: scan QR
  P->>API: POST /api/session/claim (QR token)
  API->>FS: status=connected, deviceToken hash
  API-->>P: deviceToken
  FS-->>K: onSnapshot, phone connected
  P->>API: POST /api/live-token (deviceToken)
  API-->>P: ephemeral token (one use, model and tools pinned)
  P->>L: connect + audio stream
  U->>P: two cheeseburger sets, one without pickles
  L-->>P: function call addToCart twice
  P->>API: POST /api/command (commandId, deviceToken)
  API->>API: zod validation, option rules, recentCommandIds
  API->>FS: transaction: cart, lastChange, screen
  API-->>P: updated cart
  P->>L: toolResponse
  L-->>P: voice reply
  FS-->>K: onSnapshot, menu + 2 s highlight
  FS-->>P: onSnapshot, cart card
  U->>P: I'll pay
  L-->>P: function call requestCheckout
  P->>API: command requestCheckout
  API->>FS: status=confirming
  U->>P: Yes, pay now
  P->>API: confirmCheckout (cartVersion)
  API->>FS: status=paying
  FS-->>K: payment screen
  U->>K: insert card
  K->>API: card action (kioskToken)
  API->>FS: status=paid, order number
  FS-->>K: order number
  FS-->>P: order number
```

## Prototype
`design/prototype/Main.dc.html` (Claude Design) implements Flow A, Flow B and the main exceptions with generated menu photos. Its state logic is checked by `design/prototype/e2e_check.py` (42 checks).
