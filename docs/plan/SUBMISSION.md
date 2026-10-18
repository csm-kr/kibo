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
5. Demo video link: the public Terms (re-read 10-18) say "a video demonstration strictly three to four minutes in length"; the FAQ still says under 3 minutes and the form field "up to 3 minutes", so the final cut is **3:00.6** (v4.6), public YouTube, English captions
6. Solution description ≤ 1,024 characters, naming how Firebase/Firestore, Cloud Run and Gemini are used

## Solution description (draft)
For form field 6. **1,021 / 1,024 characters**, counted by `scripts/submission.test.ts` (it fails if the text grows past 1,024 or this count goes stale). No pricing or sales pitch (T&C). Revised 10-17 for the worldwide framing and the own-phone `/demo` (ADR-013).

```text
Talk to your own phone, and the self-order kiosk already there fills its own cart. KIBO is for older adults, people with low vision and travellers: by 2030, 1 in 6 people worldwide will be 60+; in Korea, 17.9% of people 65+ say they can order or check in at a kiosk. Scan the kiosk's QR (or type its code at a short Firebase Hosting URL) and speak; on the demo a laptop is the kiosk. Gemini Live (voice) or Flash (text) turns each sentence into tool calls. Our Cloud Run server checks each call against the menu and state machine, applies it in a Firestore transaction and streams it to both screens. The AI cannot pay: that takes your yes or tap, then your card at the kiosk. With no integration, KIBO Learn has Gemini explore a web kiosk once; orders then replay without AI. On two kiosks it had never seen, KIBO handled all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong (round 4, synthetic kiosks). The text agent passed 91 of 92 team-written cases.
```
<!-- Evidence: "1 in 6 people worldwide will be 60+" by 2030: docs/plan/SOURCES.md S44 (WHO, Ageing and health fact sheet, 1 Oct 2025, "By 2030, 1 in 6 people in the world will be aged 60 years or over"; worldwide context, not about kiosks); "17.9% of people 65+ say they can order or check in at a kiosk": S16 (KIHASA, Nov 2024, p. 32, Table 5; self-reported, re-analysis of the 2023 Survey of Older Koreans). The rest from docs/plan/NUMBERS.md: "all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong" (word for word the NUMBERS.md headline, led with safety since 10-15, same results; all 20 = 10 per kiosk, 18 correct + 2 refused + 0 unsafe in grader terms; the 2 handed to staff are the orders whose skill total differed from the kiosk's, R-014): spikes/blind-kiosks/ROUND4.md (bk9, bk10, grade-v2.json `skillPredicts` vs `kioskTotal`); "91 of 92": evals/results/2026-10-18T16-28.md (gemini-3.8-flash, backend auto as in production, all 228 calls on the API key, 10-18, final text-agent code 42cee75, one full run; the miss, c-en-grandson-not-spicy, passed 6 of 6 re-runs, evals/results/2026-10-18T16-44* to 16-46; earlier full runs that day on older code: 88/88, 87/88, 86/88; cases written by the KIBO team, evals/agent-cases.json). "on the demo a laptop is the kiosk": /demo [Start], ADR-013. Re-run `npm run eval:agent` before submitting and update the number if it changes. -->

**Elevator (2 sentences):** KIBO turns your own phone into the voice of the self-order kiosk in front of you: say the order, and the kiosk fills its own cart. Gemini decides, the KIBO server checks every action against the kiosk's own data, and the payment waits for your own yes or tap, then your card.

## Judging and what we show
| Criterion | Weight | What we show |
|---|---|---|
| Technical merit & GenAI | 40% | Gemini Live voice, function-calling agent, Firestore realtime sync, Cloud Run; KIBO Learn; architecture diagram |
| Problem alignment & impact | 25% | Worldwide groups as context (S44 WHO: 1 in 6 people 60 or over by 2030; S45 WHO: at least 2.2 billion with a near or distance vision impairment; S46 UN Tourism: an estimated 1.52 billion international tourist arrivals in 2025), none of them a kiosk figure; Korea as one example (S16: 17.9% of people 65+ say they can order or check in at a kiosk); touch vs talk (24 taps vs 3 sentences · 2 taps: `evidence/touch-hero-efficient.json`, automated; `evidence/voice-only-hero.json`, one recorded take; `docs/plan/DECK_FACTS.md` slot 12); every statistic sourced in `docs/plan/SOURCES.md` |
| Innovation | 25% | No kiosk replacement, the user's own phone becomes the accessibility tool; KIBO Learn connects kiosks without integration (measured numbers only) |
| UX | 10% | The judge's own phone on `/demo` (the laptop is the kiosk, ADR-013), voice until payment, Nielsen heuristics, older-user accessibility, undo and call-staff |

## Repo checklist
- `plan.md` (Korean) stays out of the repo; README, code and comments in English. Korean only as kiosk UI strings.
- No personal videos, no real store photos or screens.
- Harness files adapted from a third-party repo stay out (no license, pre-hackathon code).
- Ideas borrowed from browser-harness, jev-browser, dev-browser and Aside are credited in the README; no code copied.
- Music: our own score, synthesized from the video's cue list (`videos/orchestrator/video-v4/build/score_v4.py`), with percussion samples from VSCO 2 Community Edition (CC0); no third-party tracks.
- gitleaks over the whole history before making the repo public.

## Video (3:00.6, English)
Final v4.6 (10-18, 3:00.6; the Terms ask for three to four minutes). v4.5 (2:42.0) is not a fallback any more: it still shows 80/82. The v4.3 beat sheet is `videos/orchestrator/video-v4/PLAN-draft.md`; what changed since and every check on the final files are in `REPORT-v4.4.md` to `REPORT-v4.6.md` there (git-ignored). Real screens throughout; scenes in order:

| Scene | What it shows |
|---|---|
| Hook | TOUCH vs TALK on the burger kiosk, tagged "One example: a burger kiosk in Seoul": **24 taps vs 3 sentences · 2 taps**. Footnote: "Counted until the card is paid, on both sides. Not counted: waking the kiosk; scanning the QR and turning on the mic." Touch from `evidence/touch-hero-efficient.json`; talk from `evidence/voice-only-hero.json` (one recorded take on production, 10-16, order 259) (`docs/plan/DECK_FACTS.md` slot 12) |
| Title | "Don't learn the kiosk. Just talk." |
| Language montage | Real voice orders: English → English kiosk, English → the ticket machine's 日本語 screen, Japanese → Korean kiosk, an older Korean voice → Korean kiosk |
| Impact | 1 in 6 people 60 or over by 2030 (S44) · 2.2 billion with a vision impairment (S45) · 1.5 billion international tourist arrivals in 2025 (S46), then Korea: 17.9% of people 65+ say they can order or check in at a kiosk (S16) |
| Pairing, hero order, review, payment | QR → connected; Gemini Live answers aloud, tool-call chips checked by the server before the kiosk moves; the AI stops at the review; your yes, your card |
| Care | Larger text; an allergy question → [Call staff]; asking for the menu by voice: "Show me the drinks, please." moves the kiosk to its drinks, and a phone set to Korean turns English on its own (take n1-t1 on production, 10-18) |
| KIBO Learn | Gemini on Vertex AI explores a kiosk it has never seen, then a replay without AI; the round 4 short form "20 / 20 safe · 0 wrong" with its line under it (`docs/plan/NUMBERS.md`) |
| Under the hood | The architecture node by node (Gemini Live direct or through the relay on Cloud Run, `/api/command`, Firestore transaction, SSE, Gemini Flash with Vertex AI as backup, Firebase Hosting, Secret Manager); 1.7 s end of speech → kiosk highlight (median, synthetic voice on a laptop) · 91 / 92 test cases passed (`docs/plan/NUMBERS.md`) |
| Recap, end card | QR and kibo-2026.web.app |

Made with our motion-graphics skill (`.claude/skills/motion-demo-video/`). Motion graphics frame real footage; they never fake a feature.

## Deck (mandatory template, 16 slots)
The final deck has 28 pages (10-17); which pages hold each slot is at the top of `docs/plan/DECK_FACTS.md`.

| Slot | Content |
|---|---|
| 1 Team | malo · Sungmin Cho, Ye Seul Ahn · Sustainability & Social Impact |
| 3 Idea | "Don't learn the kiosk. Just talk." problem and solution in one paragraph |
| 4 Opportunities | No kiosk replacement, BYOD phone, KIBO Learn connects kiosks without integration; USP |
| 5 Features | QR connect, natural voice ordering, live sync, confirm-before-pay, the AI in 9 named languages and kiosk screens in Korean, English and (ticket machine) 日本語, accessible UI |
| 6 Flow | QR → talk → agent tools → kiosk updates → confirm → pay; on `/demo` the laptop is the kiosk and the judge's own phone scans it |
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
