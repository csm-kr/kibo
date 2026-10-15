# Submission: Google Cloud AI Builder Cup 2026

Not injected into harness steps (lives under `docs/plan/`).

## Hard rules (breaking one disqualifies)
| Item | Rule |
|---|---|
| Deadline | Dashboard: 2026-10-19 03:29 KST (= 10-18 23:59 IST). The form shows a different time zone; use the earlier one. Target: submit on 10-17 |
| Team | 2 members (Sungmin Cho, Ye Seul Ahn) |
| Tech | Gemini/Gemma or Google agent platforms; deploy on Cloud Run or Firebase. A competing cloud as the primary platform disqualifies |
| Fresh code | Only code written during the hackathon. Planning documents are fine; reusing existing code is not |
| Language | Code, docs, video and deck all in English |
| Uptime | URL, APIs and integrations must work throughout judging (2026-10-19 to 11-06); no retries if down |
| IP | Third-party IP disqualifies; organizers get a 6-month right of first refusal |

## Form (all required)
1. Challenge: Sustainability & Social Impact
2. Prototype link: the Cloud Run URL of **`/demo`**
3. Deck PDF on the mandatory template, ≤ 5 MB
4. Public GitHub repo (https)
5. Demo video link: rules say strictly under 3 minutes → **≤ 2:50**, public YouTube, English captions
6. Solution description ≤ 1,024 characters, naming how Firebase/Firestore, Cloud Run and Gemini are used

## Solution description (draft)
For form field 6. **988 / 1,024 characters**, counted by `scripts/submission.test.ts` (it fails if the text grows past 1,024 or this count goes stale). No pricing or sales pitch (T&C).

```text
Talk to your own phone, and the self-order kiosk already there fills its own cart. KIBO is for older adults, people with low vision and visitors who cannot read Korean. They scan the kiosk's QR (or enter its code at a short Firebase Hosting URL) and speak or type. Gemini Live (voice) and Gemini Flash (text) turn each sentence into tool calls. A Next.js app on Cloud Run checks every call against the menu data and a server-side state machine, then applies it in a Firestore transaction. Each change streams to both screens. The AI can open the order review but cannot pay: payment needs the user's own yes or tap, then the card at the kiosk. For web kiosks with no integration, KIBO Learn uses Gemini once to explore the screen and write a skill, then replays orders without AI. On two kiosks it had never seen, KIBO finished 16 of 20 orders hands-free, handed 2 to staff and refused 2; none was wrong (round 4, synthetic kiosks). The text agent passed 80 of 82 team-written test cases.
```
<!-- Evidence (docs/plan/NUMBERS.md): "16 of 20 orders hands-free, handed 2 to staff and refused 2; none was wrong" (word for word the NUMBERS.md headline; the 2 handed to staff are the orders whose skill total differed from the kiosk's, R-014): spikes/blind-kiosks/ROUND4.md (bk9, bk10, grade-v2.json `skillPredicts` vs `kioskTotal`); "80 of 82": evals/results/2026-10-15T09-56.md (gemini-3.8-flash, backend auto as in production, all calls on the API key, 10-15, 16-judge-r3-fixes:3; cases written by the KIBO team, evals/agent-cases.json). Re-run `npm run eval:agent` before submitting and update the number if it changes. -->

**Elevator (2 sentences):** KIBO turns your own phone into the voice of the self-order kiosk in front of you: say the order, and the kiosk fills its own cart. Gemini decides, the KIBO server checks every action against the kiosk's own data, and only you can confirm the payment.

## Judging and what we show
| Criterion | Weight | What we show |
|---|---|---|
| Technical merit & GenAI | 40% | Gemini Live voice, function-calling agent, Firestore realtime sync, Cloud Run; KIBO Learn; architecture diagram |
| Problem alignment & impact | 25% | Kiosk barriers for older, disabled and foreign users; measured touch vs voice; sourced statistics only |
| Innovation | 25% | No kiosk replacement, the user's own phone becomes the accessibility tool; KIBO Learn connects kiosks without integration (measured numbers only) |
| UX | 10% | Phone-only flow, Nielsen heuristics, older-user accessibility, undo and call-staff |

## Repo checklist
- `plan.md` (Korean) stays out of the repo; README, code and comments in English. Korean only as kiosk UI strings.
- No personal videos, no real store photos or screens.
- Harness files adapted from a third-party repo stay out (no license, pre-hackathon code).
- Ideas borrowed from browser-harness, jev-browser, dev-browser and Aside are credited in the README; no code copied.
- Music: Google Lyria only.
- gitleaks over the whole history before making the repo public.

## Video (≤ 2:50, English)
| Time | Scene |
|---|---|
| 0:00–0:25 | Problem: someone stuck at a complex kiosk; MALO simulator touch flow with a rising tap counter |
| 0:25–0:35 | "Don't learn the kiosk. Just talk." |
| 0:35–1:25 | Hero demo, real screens: phone and kiosk split; one sentence → cart fills itself → fries to large → confirm → card |
| 1:25–1:40 | Touch vs talk: 24 taps on the efficient touch path (`evidence/touch-hero-efficient.json`) vs this order's messages and taps; human timings only once `evidence/human-runs.json` exists (`docs/plan/NUMBERS.md`) |
| 1:40–1:55 | Korean-only kiosk, a visitor speaks English |
| 1:55–2:25 | KIBO Learn: the agent explores the pizza kiosk (sped up) → one order replayed on it; the never-seen kiosk results as numbers, only from `docs/plan/NUMBERS.md` (the older blind café run is retired) |
| 2:25–2:40 | Architecture: Gemini, function calling, Firestore, Cloud Run → logo; 10 s spare |

Made with our motion-graphics skill (`.claude/skills/motion-demo-video/`). Motion graphics frame real footage; they never fake a feature.

## Deck (mandatory template, 16 slots)
| Slot | Content |
|---|---|
| 1 Team | malo · Sungmin Cho, Ye Seul Ahn · Sustainability & Social Impact |
| 3 Idea | "Don't learn the kiosk. Just talk." problem and solution in one paragraph |
| 4 Opportunities | No kiosk replacement, BYOD phone, KIBO Learn connects kiosks without integration; USP |
| 5 Features | QR connect, natural voice ordering, live sync, confirm-before-pay, multilingual, accessible UI |
| 6 Flow | QR → talk → agent tools → kiosk updates → confirm → pay |
| 7 Wireframes | `/kiosk`, `/assistant` |
| 8 Architecture | the diagram from `docs/ARCHITECTURE.md` |
| 9 Technologies | Gemini (Live + function calling), Firestore, Cloud Run, Next.js; most effort here (40%) |
| 10 Cost | measured cost per session |
| 11 Snapshots | real screenshots |
| 12 Benchmarks | blind KIBO Learn numbers first; eval pass rate; latency; touch vs voice |
| 13 Future | more adapters (hospital, airport, ticketing, civil service), native kiosks, B2B and B2G |
| 14 Links | GitHub, video, product link |

## Promotional images
Video thumbnail, README hero image, architecture diagram. Images are generated offline (Codex image generation); real product screens are always real captures. The Social Choice Award mechanism is unannounced; check the dashboard weekly.
