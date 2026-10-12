# Strategy to win

Not injected into harness steps (lives under `docs/plan/`). Checked against the contest pages on 2026-10-12; re-check the dashboard weekly because organizers change details.

One line for judges: **"Don't learn the kiosk. Just talk."** One complete path (phone sentence → kiosk fills itself → confirm → pay) beats four half-built ones.

## Verified facts (2026-10-12)
Sources: [overview](https://aibuildercup.com/), [themes and criteria](https://aibuildercup.com/themes.html), [prizes](https://aibuildercup.com/rewards.html), [FAQ](https://aibuildercup.com/Faqs.html), [T&C](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub).

- Weights: technical merit & GenAI 40%, problem alignment & impact 25%, innovation 25%, UX 10%; the same for every theme.
- Dates: deadline 10-18; **10-19 to 11-06 is a scoring round by a judges' panel, not a public vote**; finalists 11-07; Singapore finale 12-04, at most 2 people travel.
- Prizes ($30k): winner $10k, 1st runner-up $7k, 2nd runner-up $5k. Four special awards of $2k: **Best use of Google Cloud AI tools, Most Impactful Solution, Social Choice Award, Best UI/UX**. Unclear whether special awards are for finalists only.
- Sub-criteria to echo in the deck and video:
  - Technical: "scalability & sustainability", "robustness, Google Cloud architectural depth".
  - Impact: "measurable real-world viability".
  - UX: "experience & integration" (do the parts, including the GenAI, work together), "clean design of the user interface".
  - Requirements mention "integration with existing systems", which is KIBO's pitch, and list "Accessibility" as a category: name it.
- T&C: no advertisements or solicitation in submitted content (no pricing or sales pitch); IDs, age and employment can be checked at any stage; one student on the team disqualifies the team; all members must live in JAPAC.
- Not on public pages (dashboard only, keep `docs/plan/SUBMISSION.md` as the source): deck template, 5 MB limit, 1,024-character description, 03:29 KST deadline, uptime/no-retry rule.

## What wins similar contests
- **Accessibility wins impact and public votes.** Gemini API Developer Competition: Vite Vere (cognitive disabilities) won Most Impactful and People's Choice; Gaze Link (ALS) and ViddyScribe (blind viewers) also won; Best Overall, Jayu, is an assistant that works across existing apps. [Google Developers Blog](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/)
- **Voice agents that act, and confirm before acting.** Gemini Live Agent Challenge winners confirmed actions out loud or acted only after permission. [Google Cloud Blog](https://cloud.google.com/blog/topics/developers-practitioners/winners-and-highlights-of-the-gemini-live-agent-challenge)
- **Google's Live-agent rubric:** natural interruptions and a distinct voice; evidence of grounding; graceful errors and timeouts; a clear architecture diagram and visual proof of Cloud deployment; working software, not mockups. [Devpost rules](https://geminiliveagentchallenge.devpost.com/rules)
- **Finales favored auditable agents that plug into existing systems**, with people approving the important decisions. [Hack2skill blog](https://blog.hack2skill.com/gen-ai-exchange-hackathon-finale)
- **The video is often all a judge watches:** show what the product does first, script it, don't cram. Admitting the weakest point before judges find it raised scores. [Devpost](https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video), [judge notes](https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l)

## Per criterion
| Criterion | Weight | Judges look for | Our evidence | Gap | Move (owner, day) |
|---|---|---|---|---|---|
| Technical & GenAI | 40% | Works; GenAI central; scalable; grounded; Google Cloud depth | Design: Live + 9 tools, server state machine, Firestore transactions, one-use tokens; KIBO Learn Gemini results | App is a skeleton; eval, latency, cost not measured; no deployment proof | Dev: text hero path on Cloud Run 10/13; eval set 10/13 evening; Live voice 10/14; deploy script with `--region`. Video: an off-menu request refused (grounding) and 5 s of Cloud Run / Firestore console (10/17) |
| Impact | 25% | Problem fit; measurable viability | Personas; legal context (unverified); touch vs voice planned | No sourced statistic; no real users | Teammate: one government-sourced statistic and the decree text (10/14); 2–3 people aged 60+ or non-Korean readers try Flow A, notes with consent, no faces (10/15–16). Dev: measured cost per order (10/14, `docs/TESTING.md`) |
| Innovation | 25% | Differentiation; GenAI beyond the surface | Phone as an accessibility layer over existing kiosks; KIBO Learn blind run 40/40 items | No comparison with alternatives | Teammate: comparison slide (new barrier-free kiosk / voice on the kiosk / AI tapping the screen every order / KIBO), qualitative or sourced (10/15). Dev: quote replay time only as measured (0.7–5.2 s per order so far, `holdout.run2.log`) |
| UX | 10% (+ Best UI/UX award) | Intuitive, accessible, clean, cohesive | Nielsen rules, journeys, accessibility spec, prototype 42 checks, `docs/UI_QA.md` | Judges arrive cold, often without a mic | Dev: `/demo` with tappable example sentences, automatic text fallback, [Try again] (10/14); QA pass at every phase end. Teammate: Lighthouse accessibility score and an incognito run on a non-dev laptop (10/16) |

## Top 5 moves (score gain per hour)
1. **Video leads with the result:** real phone sentence → kiosk fills itself within the first 10 s; 5 s of Cloud Run / Firestore console next to the architecture diagram. About 1 h; touches every criterion.
2. **`/demo` safe for a cold judge** (2–3 h): tappable sentences, text fallback, reset. The 40% asks whether it works.
3. **Measure, then publish:** eval pass rate per type, median latency, cost per order, touch vs voice; each number with its evidence file (`docs/TESTING.md`).
4. **Deck in the rubric's words** (teammate, ~4 h): "Accessibility", "integration with existing systems", "scalability"; a comparison slide; an honest limits slide (blind cafe orders 2/5–3/5, the rest refused before running, not mis-ordered).
5. **Small trial with older users** (teammate, 2–3 h): completion and time, with quotes. Feeds Impact and Most Impactful.

## Risks that lose it outright
- **Scope (biggest):** only the skeleton exists on 10-12. Follow the cut order in `docs/plan/SCHEDULE.md`; keep the 10/14 22:00 voice go/no-go.
- **Third-party IP:** real drink brands were in the hero script; renamed on 10-12 (`docs/ISSUE.md` I-009). Keep checking menu data, copy and the video.
- **Fresh code:** scan git history for pre-hackathon code; gitleaks before going public. Harness files stay git-ignored.
- **Downtime 10-19 to 11-06:** preview model retired (model ids are env vars; pick the replacement now), Gemini 429s, billing failure. `min-instances=1`, uptime alerts, daily smoke test, no deploys during judging.
- **Overclaiming:** verify the barrier-free decree before quoting; replay time only as measured (0.7–5.2 s); say "web/webview kiosks", not "any kiosk"; no OpenAI numbers in public materials.
- **Optics:** OpenAI learner code and results in `spikes/` will be public; label them development-only or keep them out. Images are made with Codex image generation for now (decided 10-12); credit it in the README as an offline design tool, not product AI.
- **Admin:** mandatory deck template; video ≤ 2:50 and public; submit 10/17; confirm both members are eligible.

## Social Choice Award
- The award exists ($2k); how it is decided is not published. The only precedent: post on LinkedIn/Instagram with the team name and program hashtag, then submit the link in the dashboard's Forms section. Do not assume it works the same way.
- By 10/17: a 30–45 s vertical cut of real footage with English captions, a thumbnail, and post copy built on the accessibility story with a "try `/demo`" link. When the mechanism opens, both members post from their own accounts.
- Never: paid boosts, bots, extra accounts, vote trading, incentives, pricing or sales pitch. Keep daily caps and the text fallback so a traffic spike cannot take `/demo` down.
