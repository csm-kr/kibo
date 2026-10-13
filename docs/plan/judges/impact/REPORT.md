# Judge report: KIBO (impact and innovation lens)

Independent judge, track "Sustainability & Social Impact". Evaluated 2026-10-13, 22:00–22:40 KST, on the live Cloud Run URL with headless Chromium (laptop at 1440×900, phone at 390×844) and the repo (read-only). I used 5 of the 10 allowed AI messages; the other tries were blocked by the stream limit described in section 4.

**Weighted total: 6.25 / 10** (7×0.40 + 5×0.25 + 6×0.25 + 7×0.10)

## 1. Scores

| Criterion | Weight | Score | One line |
|---|---|---|---|
| Technical Merit & GenAI | 40% | **7** | Real Gemini tool calls that the server checks, on Cloud Run and Firestore. KIBO Learn is ambitious, but its orders on unseen kiosks are weak and sometimes unsafe. |
| Problem Alignment & Impact | 25% | **5** | The problem is real and well framed. There is no sourced statistic, no real user, no adoption path, and the legal claim looks wrong. |
| Innovation | 25% | **6** | "Your phone becomes the voice of the kiosk" is a fresh idea, and "learn once, replay without AI" is new. Neither is compared with the obvious alternatives, and the newer half has the least proof. |
| UX | 10% | **7** | Clean, consistent, accessible and honestly labelled; a cold judge gets `/demo` in under 20 s. But a stream 429 leaves `/demo` stuck with no message. |

**Technical, for.** Gemini is central. One typed sentence produced two `addToCart` calls with different options plus an eat-in/take-out `offerChoices`, each 24–32 ms on the server (`shots/malo-2.png`). "Just pay for me." only called `requestCheckout`. Payment needed my tap on [Yes, pay now] and the kiosk's card action, then order 488 appeared (`shots/malo2-2.png`, `malo2-paid.png`). Voice uses one-use tokens with the tools pinned on the server. Cost is measured: $0.0088 per text hero order and $0.0766 per voice order (`evidence/cost-per-order.json`). The evidence ledger in `docs/TESTING.md` is unusually disciplined.

**Technical, against.**
- KIBO Learn on held-out kiosks (`spikes/blind-kiosks/results/*/baseline/notes.md`):
  - bk1-cinema: 3 correct, 4 refused, 3 unsafe.
  - bk3-ramen: 2 correct, 6 refused, 2 unsafe.
  - bk2-bakery: no skill (hit the 2M-token cap).
  - bk4: still running.
- The protocol's own bar is "unsafe must be 0 to call a kiosk supported", so no held-out kiosk is supported yet.
- "Correct" means the total matched; cart lines were read in 0 of 10 orders (I-183).
- The learned bridge runs only on a copy of the kiosk page inside KIBO's own iframe (`docs/ARCHITECTURE.md:10`). Nothing shows how it gets onto a real kiosk.
- First AI audio takes 2,070 ms (median), missing the 2 s target. All voice numbers come from synthetic TTS on a laptop.
- A typed turn took about 6–13 s on the live site.

**Impact, for.**
- The target groups are the right ones, and the design follows through: large text, undo, staff always visible, text fallback, the phone in the user's language.
- The safety promise is concrete.
- "No new hardware" is a real advantage.

**Impact, against.**
- There is no sourced statistic anywhere. `STRATEGY.md` itself says: "No sourced statistic; no real users".
- Personas and journeys are invented; the journey scores are "target feelings". `evidence/human-runs.json` exists only as a template.
- `PRD.md` says existing kiosks are due by 2027-01-28. Press and law-firm summaries say 2026-01-28, and they report a December 2025 revision that lets small shops use a call bell or staff instead ([JoongAng Daily](https://www.koreajoongangdaily.com/korea/govt-eases-kiosk-implementation-rules-to-ensure-access-to-people-with-disabilities/12353212), [DLA Piper](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2024/ensuring-kiosk-accessibility-for-individuals-with-disabilities-), [KMA](https://kma.global/korea-accessibility-kiosks/)). That revision weakens the operator's reason to buy.
- The main persona needs a smartphone, a QR scan, a mic permission, and the will to talk in a queue. No number is given for how many people over 70 can do that. One trade report of Korea Communications Commission (KCC) data says 27.2% of people 70+ had smartphones in 2024 ([Mobile World Live](https://www.mobileworldlive.com/asia-pacific/smartphone-adoption-by-older-koreans-surges/)). That figure likely measures something else, which is why the primary source is needed.
- Only Korean and English. The instructions answer every other language in English, and voice transcription is fixed to ko-KR or en-US (`src/lib/agent/instructions.ts:55`, `src/lib/agent/live.ts:50`). That is weak for a JAPAC tourist story.

**Innovation.**
- For: the bring-your-own-device accessibility layer; KIBO Learn's learn-once, verify-the-total, refuse-instead-of-guessing design with an audit and a finish gate; the "kiosk is a mirror" pattern with a person approving payment.
- Against: no comparison with a barrier-free kiosk, the store's mobile or QR ordering, or Gemini Live with the camera pointed at the kiosk. A Google judge will ask about the last one first.
- Against: the direct adapter, the only fully working path, still needs integration with the kiosk's software. The novelty therefore rests on KIBO Learn, which has the least proof.

**UX.**
- For: one clear promise, a 3-step guide, place cards that name a persona, and the "What the AI did" panel. Landing loads at DOMContentLoaded 0.8 s and network idle 2.0 s. Lighthouse accessibility is 100 (local build).
- Against: the stuck "Connecting…" screen; the Doughhouse card thumbnail is unreadable; no evidence from real users.

## 2. The 12 questions (ordered by impact on score)

| # | Question | A convincing answer must show | Shown now? |
|---|---|---|---|
| 1 | Does it work on a kiosk it has never seen? | For each held-out kiosk: learned or not, minutes, tokens, and correct / refused / unsafe (unsafe = 0), with cart lines checked. Plus a video of a kiosk built by someone else being learned, then a spoken order replayed on it. | **Partly.** bk1 and bk3 `notes.md`; bk2 has no skill. The landing shows only the older café run, from before the finish gate. No held-out kiosk in `/demo`. |
| 2 | Who installs the QR or bridge, and why would an owner allow it? | The setup path in minutes; the owner's gain in numbers (orders rescued, staff minutes, queue time); why KIBO beats a call bell; one operator or vendor conversation. | **No.** `PRD.md` "Business model" is one line; the bridge exists only in KIBO's iframe. |
| 3 | Is the problem real, and how big? | Primary-source statistics: a Korea Consumer Agency survey of 300 people 65+ (complicated steps 51.5%, queue pressure 49% per [Asia Economy](https://cm.asiae.co.kr/en/article/2020092509125021794)); the Ministry of Education 2025 adult digital literacy survey, which includes a kiosk task ([JoongAng](https://www.koreajoongangdaily.com/korea/80-of-older-adults-struggle-with-digital-devices-govt-survey-finds/12358302)); KTO visitor numbers; kiosk counts. | **No.** |
| 4 | Has a real older adult or non-Korean reader used it? | 5+ people aged 60+ and 3+ non-Korean readers: completion, seconds and taps vs touch, where they stalled, quotes given with consent. | **No.** Planned for 10/16. |
| 5 | Why not a barrier-free kiosk, mobile or QR ordering, or Gemini Live with the camera? | A comparison table: cost, time to deploy, who it serves, languages, whether it works on today's kiosk, whether the AI acts or only advises. | **No.** `STRATEGY.md` lists it as a gap. |
| 6 | What about someone with no smartphone, who can't scan a QR, or won't talk in a queue? | The fallbacks shown as a scenario, plus the smartphone share of the target group from a primary source. | **Partly.** K1 has a large-text and low-screen button; there is a 6-digit code and a text mode. No statistic and no scenario. |
| 7 | Does it understand how older people actually speak? | Eval cases with vague and colloquial requests, real older voices, and choice buttons when the menu can answer. | **No.** All 44 cases are clean sentences written by the team. Live, "something not spicy for my grandson" called staff. |
| 8 | Is it faster than touch? | Human runs, 3+ each, median seconds, ideally with older people. | **Partly.** 24 taps from an automated run; no human runs and no real-kiosk counts. |
| 9 | Can the AI pay, or put the wrong thing in the cart? | A live refusal to pay; tests; unsafe replays = 0 on learned kiosks. | **Direct kiosk: yes** (live, order 488; `machine.test.ts`). **Learned kiosks: no** (3 and 2 unsafe). |
| 10 | Which languages for a JAPAC audience? | At least Chinese and Japanese, with tests. | **No.** |
| 11 | What happens to my voice and data? | One plain slide: no account, no personal data, no audio or transcripts logged, TTL deletion, Gemini data terms. | **Partly.** Covered in `docs/SECURITY.md`; nothing user-facing. |
| 12 | Will it hold up with many people and during judging? | Cost per order (exists), concurrency on the deployed URL, behaviour behind a shared IP. | **Partly.** `load-check.json` is local only. Live 429 hang seen (section 4); limits per address are 10 open screens, 24 voice sessions and 300 chat messages a day (`src/lib/limits/ip.ts`). |

## 3. Scenarios the video and deck must cover

| # | Scenario | Answers | Exists? |
|---|---|---|---|
| S1 | Sunja (72), burger kiosk at lunch rush with a queue: one-sentence set order, both fries changed, confirm, card. Real older voice, timed against touch. | Q3, 4, 7, 8 | **Partly** (`/demo` "Sunja's lunch"; no real person or timing) |
| S2 | Mid-order rescue: she gets stuck on touch, scans the QR, and the phone carries on with the same cart (the state machine already supports this). | Q5, 2 | **No** |
| S3 | Mei, tourist, Korean-only airport rail machine: tickets in English; "which platform?" goes to staff instead of a guess. | Q10, 9 | **Yes** (`/demo` "Mei's tickets", "Which platform?") |
| S4 | "Is this halal?": answered from data only, otherwise staff. | Q9 | **Yes** |
| S5 | "Just pay for me": confirm card only, payment needs the user. | Q9 | **Yes** (and confirmed live) |
| S6 | A kiosk KIBO has never seen, built by someone else: learning (sped up), one spoken order replayed and verified, one honest refusal, the results table. | Q1, 9 | **Partly** (only Doughhouse, which the team built) |
| S7 | Operator onboarding: what gets installed, how long, cost per order. | Q2, 12 | **No** |
| S8 | No smartphone / won't talk: kiosk large-text mode, staff call; a hearing-impaired user types in a noisy shop. | Q6 | **Partly** (the features exist; no scenario) |
| S9 | Minsu, low vision, using VoiceOver or TalkBack on the phone. | Q6, 4 | **No** |
| S10 | "Something not spicy for my grandson" answered with menu choice buttons. | Q7 | **No** (live, it called staff) |
| S11 | Hospital or civil-service kiosk, shown as roadmap only. | Q2, 3 | **Partly** (one landing line) |
| S12 | Privacy in one sentence. | Q11 | **No** |

## 4. What made me doubt the claims

Live:
- **Stuck demo.** Between 22:08 and 22:36 KST, 5 of 7 `/demo` starts from this network stayed on "Connecting to the kiosk..." for 30–60+ s.
  - The events route returned 429 "Too many open screens. Please close one and try again." The UI never shows that message (I-033 open).
  - Other evaluators were using the site from the same network. That is exactly the shared-office case (I-154), and the per-address caps are low: 10 open screens, 24 voice sessions and 300 chat messages per day.
  - Because of this I could not test the learned pizza or airport scenarios live.
- **Over-cautious staff call.** "Also something not spicy for my grandson, he is 6, and a hot coffee for me" added the coffee, then called staff ("This kiosk does not have spice level information"), even though the menu names "Spicy chicken burger" and "Spicy wings". It is safe, but it hands Sunja the very wait KIBO promises to remove.
- **Slow turns.** Each typed turn took about 6–13 s until settled. That is long at a lunch rush.
- **Honest comparison card.** The Touch-vs-talk card is fair: it says "Your order is different." Good.

Materials:
1. The landing advertises the older café result; the newer unsafe replays are not shown.
2. Leakage: `PROTOCOL.md` lists each test kiosk's patterns, and `phases/13-blind-kiosks/step4.md` fixes "each failure pattern in BASELINE.md". So the final run is informed by the test set.
3. The test kiosks are static web pages that AI agents built from briefs the team wrote. Real kiosks are mostly native apps, which are out of scope, and no source gives the share of web kiosks.
4. Doughhouse is called "this third-party screen" although the team built it.
5. The legal paragraph in the PRD (dates, the "3× cost" claim) is not backed up, and it leaves out the December 2025 call-bell option.
6. Numbers drift between surfaces: landing 32/32, submission text 42/42, ledger 44/44 (that run was stitched together after an HTTP 402).
7. Every user-facing measurement comes from a machine: TTS voices, a laptop, Playwright taps.
8. The sustainability angle is unused: avoiding kiosk replacement (e-waste, cost) has no number.
9. On learned kiosks the user pays at the kiosk with no confirm card on the phone, so the safety promise differs by kiosk type. This is not said up front.

## 5. The 5 changes that would raise my score most

1. **Real users (Impact +2).** Five people 60+ and three non-Korean readers on the two-device setup, touch vs KIBO on the same cart: completion, seconds, where they stalled, two quotes. Put it on one slide and in 15 s of video.
2. **Sourced problem and corrected law paragraph (Impact +1).** Two or three primary statistics; the current decree text including the call-bell option; one line on why KIBO beats a call bell.
3. **An honest "never seen" result (Innovation +1, Technical +1).**
   - Unsafe = 0: refuse before the first click when a label is ambiguous.
   - Verify cart lines, not only totals.
   - Run the final on 1–2 kiosks built after the fixes.
   - Put one held-out kiosk in `/demo`.
   - Fix the "third-party" wording.
4. **"Why not X" and "who installs it" (Innovation +1, Impact +1).** A comparison table (barrier-free kiosk, mobile or QR ordering, Gemini Live camera), the operator onboarding path, and the mid-order rescue scene (S2).
5. **A sturdier live path (Technical +0.5, UX +1).**
   - Show the 429 message and retry instead of hanging.
   - Relax the per-address caps for `/demo` during judging.
   - Add colloquial requests to the eval and answer with menu choice buttons instead of a staff call.
   - Add Chinese and Japanese, or state "Korean and English" clearly on the landing.

Sources for the external checks (all secondary; confirm with the primary documents before quoting):
- [JoongAng Daily: kiosk rules eased](https://www.koreajoongangdaily.com/korea/govt-eases-kiosk-implementation-rules-to-ensure-access-to-people-with-disabilities/12353212)
- [DLA Piper: kiosk accessibility](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2024/ensuring-kiosk-accessibility-for-individuals-with-disabilities-)
- [KMA: Korea accessibility kiosks](https://kma.global/korea-accessibility-kiosks/)
- [Asia Economy: Korea Consumer Agency kiosk survey](https://cm.asiae.co.kr/en/article/2020092509125021794)
- [JoongAng Daily: digital literacy survey](https://www.koreajoongangdaily.com/korea/80-of-older-adults-struggle-with-digital-devices-govt-survey-finds/12358302)
- [Mobile World Live: smartphone adoption by older Koreans](https://www.mobileworldlive.com/asia-pacific/smartphone-adoption-by-older-koreans-surges/)