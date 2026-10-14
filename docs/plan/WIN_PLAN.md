# Win plan: the last four days (10-14 → 10-17)

Written 10-14 ~10:00 KST by the orchestrator from three read-only web research runs (Aside browser): official rules and the logged-in dashboard, past Google hackathon winners, and competitors, law and Google tools. Full reports with quotes and links: `videos/orchestrator/research-10-14/` (`A-official-rules.md`, `B-winners.md`, `C-landscape.md`; git-ignored). Supersedes nothing in `STRATEGY.md`; it adds what changed and the gate list we submit against.

## 1. What we verified today
| Fact | Source | Consequence |
|---|---|---|
| Submission form has 6 required fields: challenge, deployed link, deck PDF ≤ 5 MB, public GitHub URL, video link "up to 3 minutes", description ≤ 1,024 characters "how you are leveraging Firebase, Firestore, Cloud Run and Gemini" | dashboard form | description names all four; challenge = **Sustainability & Social Impact** |
| "Participants must submit their pitch deck using the prescribed template … may be subject to disqualification"; template = 16 slides (cover with team details, 13 content slots, links, thank-you) | form + template (`videos/orchestrator/template/`) | deck moves onto the template's look and slot order (in progress) |
| Video "strictly under three (3) minutes" (Terms prevail over the form's "3 to 4 minutes") | Terms | target 2:30–2:45 |
| Deployed app must work for the whole evaluation, 10-19 03:30 → 11-07 03:29 KST; "no additional consideration, retries, or allowances" | form | stability over features; no risky deploys during evaluation |
| Repo public and accessible through evaluation | form | publish before submitting (needs owner approval) |
| Deadline 10-19 03:29 KST (= 10-18 23:59 IST); we submit 10-17 | roadmap | unchanged |
| Team formation closes 10-14 23:59 IST; malo already lists Sungmin Cho (leader) and Ye seul Ahn | dashboard | nothing to do |
| "Ask The Expert Session" 10-15 17:30–18:30 KST | dashboard | a person attends with the questions in §6 |
| Top 50 teams shortlisted 11-07; finale Singapore 12-04, 2 people travel | roadmap, Terms | — |
| Special awards' selection methods (incl. Social Choice) are not published | rewards page | prepare, do not assume |
| `gemini-2.5-*` retire 10-20 on Vertex AI; we run `gemini-3.8-flash` and `gemini-3.8-live` (GA 2026-09) | Cloud model lifecycle; `scripts/deploy.sh` | no model risk during evaluation; name exact ids in README |
| Vertex AI Live lists 24 languages, the Developer API Live guide 99 | Cloud and AI-for-developers docs | claim only languages on both lists and tested (phase 14 step 4) |
| Close prior art: iCOMSYS (Korea) patent 2026-03, QR + phone call → server generates touch commands; voice-kiosk retrofits; QR touchpad remote control; learn-once/replay research | etnews 2026-03-18, techdaily 2026-09, workflow-use, arXiv 2604.09718 | never claim "first"; differentiate on mechanism and evidence |

## 2. What wins (from winners and judges)
- Judges decide in about **30 seconds** and check that the software does what the submission claims (Google Cloud DevRel, "How to Win the All Things Agentic Hackathon").
- Winners **show the AI's work** next to the result (Jayu's terminal trace, drone-copilot's telemetry) and show a **completed job**, not a conversation.
- "No mockups", "not a basic chatbot", reproducible code, claims linked from the README, honest labels on staged footage (Prospera labelled its simulated call and speed-ups).
- Accessibility entries win impact awards when real users shaped them (ViddyScribe, Vite Vere).
- The final stretch: "shift from building to storytelling and stability" (Gemini Live Agent Challenge organizers).

## 3. Positioning
**One line:** Don't learn the kiosk. Just talk.
**Close:** Your phone. Your language. The kiosk that's already there. ("Any kiosk" is not true: web/webview kiosks and kiosks with menu data.)
**Why us, against prior art:** your own phone and language (no hardware on the kiosk); the kiosk's own cart changes through server-checked actions grounded in menu data; the AI cannot pay, enforced by the server and proven by attack tests; KIBO Learn learns a web kiosk it has never seen once and replays without AI, with verified totals and measured cost.

## 4. Wow points and where each must land
| # | Wow | App | Video | Deck | Evidence |
|---|---|---|---|---|---|
| W1 | One sentence, the real kiosk cart fills itself | `/demo` first screen; two-device pairing | 0:00–0:08, before any title | cover band, slot 3 | live; `evidence/*` latency |
| W2 | You can see what the AI did | "What the AI did" trace with tool name + "checked against the menu" (phase 14 steps 0–1) | persistent trace panel 0:26–0:45 | slot 8 architecture | E2E specs |
| W3 | The AI cannot pay, proven | "You tapped Yes, pay now"; "Paid at the kiosk · confirmed by you" (done, step 0) | 3 s attack card `409 Please confirm on the card` | slot 6 | `evidence/forged-commands.json` (step 7) |
| W4 | Your language on a Korean-only kiosk | language picker, replies in that language, English kiosk subtitles (steps 0, 4) | 4 voices, 12–15 s | slot 5 | tested-language list in `NUMBERS.md` |
| W5 | It learns a kiosk it has never seen | `/learn` replay of real runs, tap ripples, verified total (step 3) | `/learn` 16× + learned kiosk replay | slots 12–13 | `spikes/blind-kiosks/RESULTS.md`, round 3 (`ROUND3.md`) |
| W6 | Built on Google Cloud, priced per order | — | architecture walk + 3 s real console | slots 8–10 | `evidence/cost-per-order.json`, `learn-cost.json` |
| W7 | A judge can drive it | off-script sentence on `/demo`; own phone via QR; works for 5 judges on one network | — | links slot | `evidence/shared-address.json` (step 7) |

## 5. Moves in flight (10-14)
| Move | Why | Owner | Status |
|---|---|---|---|
| Phase 14 (11 steps) | every UX/impact/number gap from the judge round | harness | running, step 1 |
| KIBO Learn round 3: general fixes for mid-line modals (I-194), verified kiosk totals (I-195), option-group coverage (I-197); informed reruns; **two new blind kiosks** (bubble tea, table-order tablet) built by independent agents, learned once with the frozen learner | the hold-out slide says "3 unsafe"; a principled fix measured on new unseen kiosks is the strongest Innovation/Tech evidence we can still add | learner agent in worktree `learn-r3`; two builder agents (sealed) | running |
| Deck onto the official template, prior-art answer on "Opportunities" | disqualification risk; judge question C4 | deck agent | running |
| Video v2 pre-production (script, music, graphics, animatic) | footage only after the phase 14 deploy | video agent | running |
| After phase 14: deploy, capture, video v2 final, deck final pass, fresh 3-judge review on the deployed build | — | orchestrator + agents | 10-14 night → 10-15 |

## 6. Questions for the Ask-the-Expert session (10-15 17:30 KST, a person attends)
1. Video length: Terms say strictly under 3 min, the form says 3 to 4 min. Is 2:45 right?
2. Deck: may we add appendix slides after the 16 template slots? Must slide 15 stay?
3. Is an unlisted YouTube video acceptable, or must it be public?
4. How is the Social Choice Award decided, and when?
5. During evaluation (10-19 → 11-06), may we deploy fixes, or is the submitted state judged?
6. Deadline label: the form shows "19/10/2026 03:29 AM (IST)", the roadmap 03:29 KST. Which?

## 7. Pre-submission gate (every box checked with evidence before we press submit on 10-17)
**A. Eligibility and admin**
- [ ] Both members 21+, working professionals (no students), living in JAPAC (owner confirms).
- [ ] Challenge selected: Sustainability & Social Impact.
- [ ] Team roles on the deck confirmed by the owner.

**B. Live app (judged as it is during evaluation, no retries)**
- [ ] Production revision = the code-freeze commit; `/api/health?deep=1` all ok; uptime check green for 24 h.
- [ ] `/demo` works cold in an incognito window on a laptop that never opened it, with no microphone (typed path), and with a microphone (voice path).
- [ ] Phone path: QR or `kibo-2026.web.app` + 6-digit code on iPhone Safari and Android Chrome.
- [ ] 5 browsers on one network for 3 min: all connected, no 429 (`evidence/shared-address.json`).
- [ ] Billing: AI Studio balance > ₩50,000, Vertex fallback live, budget alerts on, `min-instances` as planned through 11-07.
- [ ] No deploys from 10-19 to 11-06 except a fix for an outage (rule in `OPERATIONS.md`).

**C. Claims (judges check them)**
- [ ] Every number in app, README, deck, video and description appears in `docs/plan/NUMBERS.md` with an evidence file; all attempts counted.
- [ ] No "first", "only", "any kiosk", "99 languages", "compliant", "no audio stored" (unless proven) anywhere (grep).
- [ ] Prior art named on the deck's Opportunities slot and the landing "Why not" section.
- [ ] KIBO Learn results quoted with the skill-total count (R-014) and the three groups apart (tuned, fresh, development).
- [ ] Architecture diagram matches the code; exact model ids and regions stated.

**D. Deliverables**
- [ ] Deck: official template look and slot order, cover team details, PDF ≤ 5 MB, every page looked at, links clickable.
- [ ] Video: < 3:00 (target 2:30–2:45), result in the first 8 s, the AI's work visible, AI voice audible, honest labels (1×, synthetic voice, sped up), −14 LUFS, no clicks or crackle (analysis), English captions (`.srt` uploaded), thumbnail; public on YouTube (owner uploads); plays logged out.
- [ ] Repo: public (owner approves), MIT licence, README for judges with a claim → code table, "run it in 5 minutes", development timeline (fresh code), `.env.example`, `scan:repo` clean (no secrets), no third-party brands or photos.
- [ ] Description ≤ 1,024 characters, names Firebase, Firestore, Cloud Run and Gemini.
- [ ] All four links open logged out from a phone and a laptop.

**E. Submit**
- [ ] Submit on 10-17 (KST) at least 24 h before the deadline; screenshot the confirmation; re-open the dashboard to see it recorded.

## 8. Risks that still lose it
- A live failure during evaluation (the form allows no retries): freeze, uptime alert, fallback paths, no late deploys.
- A disqualifying format miss (deck template, video length, private repo).
- An overclaim a judge disproves in one click.
- No real users (Impact 25%): the owner's 5 + 3 person test is still the largest single gain left; even 3 people with consent and timings count.
