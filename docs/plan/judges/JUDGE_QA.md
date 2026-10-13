# Judge Q&A matrix (v1, 10-13 23:30 KST)

Built from three independent judge reviews of the live app (tech 7.4/10, impact 6.25/10, UX 7.9/10; reports in `judges/{tech,impact,ux}/REPORT.md`). Every row: the question a judge asks, the answer we give, the proof that must be on screen, what exists now, and who closes the gap.

Owners: **HF** = hotfix now (separate branch, deployed tonight) · **P13** = phase 13 (KIBO Learn, running) · **P14** = phase 14 product fixes · **DECK** · **VIDEO** · **HUMAN** = needs a person (teammate).

## A. Does it really work?
| # | Question | Answer | Proof to show | Now | Owner |
|---|---|---|---|---|---|
| A1 | Is the AI really driving the kiosk, or is it a scripted animation? | Gemini calls tools; the server applies them; the kiosk mirrors the session. | Off-script sentence on `/demo`; "What the AI did" rows next to the kiosk highlight; video shot of both screens in sync. | Yes (all three judges confirmed live). | VIDEO, DECK |
| A2 | Can the AI pay by itself? Even with "yes, I confirm" in the same sentence, a bystander's "yes", or its own voice echo? | No. `confirmCheckout` needs `confirming`, a matching `cartVersion`, a user tap or a new utterance ≥ 1.5 s later; `paid` needs the kiosk's card action. Half-duplex mic. | Tech judge sent ~17 forged commands: all refused (401/403/409/400). Scene "Just pay for me" → card only. Video shows the 409 "Please confirm on the card". | Server: yes. Echo/bystander path untested. | VIDEO, DECK; P14 test for voice echo |
| A3 | Will the demo survive a judging panel on one office network until 11-06? | Yes after the hotfix: higher per-address caps, slots released on disconnect, visible "Reconnecting…" with backoff. | A 5-judges-on-one-IP test; uptime history. | **No: live freeze seen by all three judges (429, I-033).** | **HF** |
| A4 | Can Gemini billing fail mid-judging? | Voice and text fall back to Vertex AI (post-paid) automatically; prepaid key topped up (KRW 100,000); budget alerts. | ADR-012; deep health `liveRelay`; a slide line. | Partly (fallback live since 10-13 20:30; deep health was 503 at 22:04 during the credit gap). | DECK; P14 measure relay latency in production |
| A5 | How fast does it feel? | Kiosk changes ~1.1 s after you stop talking (voice); typed turns 5–16 s today. | p50/p90 on production, both paths. | Voice: synthetic only. Typed: 7.2 s median (tech judge). | **P14: cut perceived latency** (instant feedback, skip the second model round when all tools succeeded, stream text) |
| A6 | Does voice work on real phones, real voices, noise? | — | iPhone + Android recordings on the deployed URL; N attempted / M passed. | **No** (TTS on a laptop only). | **HUMAN** + VIDEO |
| A7 | Are the numbers consistent and complete (all attempts)? | One source of truth: `docs/plan/NUMBERS.md` generated from evidence files. | Same number everywhere; failures counted. | **No: 32/32 vs 42/42 vs 44/44; voice 6/6 vs 8/8; I-115 failed run left out.** | **P14 numbers-final** |

## B. Unseen kiosks (KIBO Learn)
| # | Question | Answer | Proof | Now | Owner |
|---|---|---|---|---|---|
| B1 | Does it work on a kiosk it has never seen? | Gemini learns once, must pass self-tests + a coverage audit; replays without AI; refuses what it cannot express. | Baseline vs final on 4 blind kiosks + **2 fresh kiosks built after the learner fixes** (true hold-out); `/learn` replay of a real run. | Baseline: 2/4 learned, orders 5 correct / 10 refused / 5 unsafe of 40. Final + fresh pending. | **P13** |
| B2 | Is it ever unsafe? | Goal: unsafe = 0 (refuse before the first click when a step is ambiguous). | Final table with unsafe column. | 5 unsafe in baseline (ambiguous `수량 더하기`). | **P13 step 4** |
| B3 | Isn't the final run tuned to the test kiosks? | Yes for bk1–4 (patterns), so we add bk5/bk6 built and revealed after the fixes. | PROTOCOL "Fresh test set"; commit order. | Being built (independent agents). | P13 step 7 |
| B4 | Can I see it learn and replay? | `/learn` timeline replay; the learned kiosk shows each replayed tap. | `/learn/<run>`; tap ripples + caption "4 taps, kiosk total ✓". | No (`/learned/doughhouse` renders at 0.56×, taps invisible, no English). | **P13 step 8 + P14** |
| B5 | How does the bridge get onto a real vendor's kiosk? | Web kiosks: one script tag (or kiosk-browser extension / WebView injection) by the vendor or operator; native kiosks: adapter, roadmap. | One slide + landing section + README. | No. | **P14 + DECK** |
| B6 | "Third-party" Doughhouse? | It is our dev-set kiosk; say so. | Copy fix. | Wrong wording on `/demo`. | **P14** |

## C. Problem and impact
| # | Question | Answer | Proof | Now | Owner |
|---|---|---|---|---|---|
| C1 | Is the problem real and how big? | Sourced statistics (older adults and kiosks; smartphone ownership 65+/70+; visitors). | Primary sources with dates. | **None sourced.** | Research agent → DECK, landing |
| C2 | Is the legal driver right? | Correct dates of the kiosk accessibility rule + the Dec 2025 call-bell/staff option; why KIBO still helps. | Law text article numbers. | PRD date likely wrong. | Research → P14 docs fix |
| C3 | Has a real older adult or non-Korean reader used it? | — | 5 people 60+, 3 non-Korean readers: completion, time, quotes (consent). | **No.** | **HUMAN** (biggest impact gain) |
| C4 | Why not a barrier-free kiosk, the shop's mobile/QR ordering, or Gemini Live with the camera on the kiosk? | Comparison table: works on today's kiosk, no new hardware, AI acts but cannot pay, one phone for every kiosk. | Table slide + landing. | No. | DECK + P14 landing |
| C5 | Who installs the QR, why would an owner allow it? | Operator benefits (rescued orders, staff minutes, accessibility compliance option), setup steps. | Slide; numbers only if sourced. | No. | DECK |
| C6 | What about people with no smartphone or who won't talk in a queue? | Kiosk keeps touch + large text + staff call; phone has typing; code entry without camera. | Scenario S8. | Features exist; no scenario. | VIDEO/DECK |
| C7 | Does it understand how older people speak? | Colloquial requests → menu choice buttons, not a staff call. | Eval cases with vague/colloquial phrasing. | Live miss: "not spicy for my grandson" → staff. | **P14 eval + instructions** |
| C8 | Languages for JAPAC? | Korean + English today; AI replies in the user's language. | — | ko/en only. | P14 optional (ja/zh) or state it plainly |
| C9 | Privacy? | No account, no personal data, no audio stored, sessions expire. | One line on landing + slide. | Only in SECURITY.md. | P14 + DECK |
| C10 | Sustainability? | No kiosk replacement (cost, e-waste). | Sourced replacement cost if found. | No number. | Research → DECK |

## D. UX first impression
| # | Question | Fix | Owner |
|---|---|---|---|
| D1 | What did the Korean kiosk just do? (English-only judge) | English subtitle under every kiosk change and step on MALO + airport (reuse the learned kiosk's bilingual bar); payment step explained in English. | **P14** |
| D2 | Did the AI or I confirm? | Log "You tapped Yes, pay now"; panel "Confirmed by you". | **P14** |
| D3 | Where next after paying? | Keep [Try again] / Try another place in view on D3. | **P14** |
| D4 | Is it working? | Feedback within 300 ms; no silent disabled pay button. | **P14** |
| D5 | Upsell / choices | [No thanks]; prices on choice buttons; no internal words ("card") in replies. | **P14** |
| D6 | Small phone + large text | Sticky one-line cart summary; smaller dock while typing. | **P14** |
| D7 | `/demo` on a phone | Say "open on a laptop" on D1 straight away. | **P14** |

## E. Submission completeness
| # | Item | Owner |
|---|---|---|
| E1 | Public repo, licence (not "All rights reserved"), README fixed (stale "not built yet", diagram with `kibo-voice`, Firebase short URL) | P14 repo-ready + user approval to publish |
| E2 | Fresh-code question: first commit adds 25,892 lines (spikes written 10-11) | README "Development timeline" with dates; check the hackathon start date |
| E3 | Video ≤ 2:50 with captions, deck PDF ≤ 5 MB on the official template | VIDEO, DECK; HUMAN for the official template |
