# Top 50 technical blog (draft v2 for Medium)

Not injected into harness steps (lives under `docs/plan/`). v0 was written 2026-11-26 evening and v1 the same night; v2
(2026-11-27, session kibo-fd for kibo-59) adds everything measured since v1: the meaning filter on the word layer, the
multi-turn sessions on Gemini Live with the customer-anchored gate, the three open-source models tried and not
shipped, the safety finding, and the first-hello branch. For the organizer's Top 50 blog (Medium, due
Sat 2026-11-28 12:00 IST = 15:30 KST; results cut-off Fri 11-27 22:00 KST; then a LinkedIn share and the link with a
team photo). The owner publishes.

Status words in the body are true as of 2026-11-27: production runs the open microphone as submitted, with the
original confirm rule (a tap or a fresh spoken utterance; the owner tried tap only on 11-27 01:25 KST and reversed it
about an hour later, per kibo-59); hold to talk is a candidate revision that takes
no traffic; listening without a press with the customer-anchored gate is being built into the app (branch
`feat/field-open`) for a phone test this week; the instant hello is a branch (`feat/fast-hello`), not in production.
Re-read them if any of that changes before publishing.

The body is publishable as it stands. One fenced block waits for the phone test (section 4).

## 1. Title options

1. **Your language, the kiosk's language** (pick)
   Subtitle: A phone as the voice remote for the kiosk already on the counter, and what we measured so it can tell
   you from the people around you, without a button.
2. **9 to 15 of 24: teaching a kiosk's voice remote who is talking**
   Subtitle: Voice ordering on Gemini Live, Cloud Run and Firestore, and a crowd benchmark that scored every idea
   before we kept it.
3. **The phone is the remote**
   Subtitle: Voice ordering on a kiosk that stays unchanged, a payment the AI cannot complete, and two open problems
   with numbers.

Why 1: it is the one message every other surface carries (deck page 06 "Your language. Its language."), and the
subtitle adds the new half.

## 2. Publishable body

Paste notes (not for publication):
- Paste everything between `BODY START` and `BODY END`.
- Medium may not render pasted raw Markdown (not checked): if it does not, paste from a rendered preview of this file.
- Medium has no tables (as far as we know): paste each of the two tables as a picture, or retype it as a list.
- Upload each picture from `docs/images/` where its `![…]` line stands; its text is the picture's description and can
  serve as the caption.
- Two fenced blocks sit in the body (section 4). Before publishing, each is either deleted whole (both fence lines and
  what is between them) or kept with its two fence lines removed. The text around them reads correctly either way.
- Where the six topics the organizer asks for sit: problem ("The problem we chose"); solution and how it works ("What
  we built", "How it works"); stack and Google Cloud tools ("The stack" list); technical approach ("How it works", "The
  AI cannot pay", "Kiosks with no integration", "Four turns on Gemini Live"); challenges and how we address them
  ("Problem 1", including "What we tried and are not shipping", and "Problem 2"); potential impact ("What this could
  change, and what comes next").

<!-- BODY START -->

# Your language, the kiosk's language

### A phone as the voice remote for the kiosk already on the counter, and what we measured so it can tell you from the people around you, without a button

*By Team malo (Sungmin Cho, Ye Seul Ahn). A Top 50 story from the Google Cloud AI Builder Cup 2026.*

![A spoken order on the phone, and the Korean kiosk filling the same cart](docs/images/hero.webp)

A traveller stands at a burger kiosk in Seoul. The screen is in Korean, a set needs a side and a drink, and a queue is forming behind her. She scans the kiosk's QR code with her phone and says, in English: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." Two lines appear in the kiosk's cart, each with its own options. She never touched the screen, and the kiosk never left Korean.

That is KIBO. Your language on the phone, the kiosk's language on the counter. The phone is the remote, and the kiosk stays unchanged.

Since the submission we have worked on two problems, the heart of this post: telling the customer apart from the people nearby without a button, and the wait for KIBO's first hello.

## The problem we chose

Our challenge is Sustainability & Social Impact. Self-order kiosks leave out older adults, people with low vision, and travellers who cannot read the screen. In Korea, 17.9% of people aged 65 and over say they can order or check in at a kiosk (KIHASA, 2024, self-reported). By 2030, 1 in 6 people in the world will be 60 or over, and at least 2.2 billion people have a near or distance vision impairment (both WHO). Neither is a kiosk figure.

## What we built

There is no app to install. You scan the kiosk's QR code, a web page opens, and you talk. The kiosk fills its own cart while you watch, and payment stays where it was: your card, at the kiosk.

![The demo after a spoken "yes": kiosk, phone and the list of Gemini tool calls](docs/images/voice-to-card.webp)

On our fictional burger kiosk, the full demo order takes 24 taps by touch in an automated run. By voice it took 3 sentences and 2 taps on the kiosk's card step, in one recorded take with a synthetic voice on October 16.

The AI talks in nine languages (speech tested in English, Korean and Japanese), and a fictional airport rail ticket machine shows Japanese screens that an English voice order fills.

[[OPTIONAL-KIOSK START]]

Another example is a city railway ticket machine run by a fictional operator. Its screen is in Japanese and the fare depends on the station. A visitor says where they are going and which tickets they need in their own language, and the machine fills in the purchase.

[[OPTIONAL-KIOSK END]]

## How it works

![Architecture: phone and kiosk, Cloud Run, Firestore, Gemini Live, Gemini Flash and Vertex AI](docs/images/architecture.webp)

The phone talks to Gemini Live directly, with an ephemeral token (a one-use, short-lived key) from our server that pins the model, the instructions and the tools. With function calling, the model asks to run one of 11 tools, such as `addToCart`.

Every change, from the AI or a finger on the kiosk, is one `POST /api/command`. Tool arguments come from a browser, so the server trusts none of them: it validates the body with zod (a schema library), matches the actor token, ignores a repeated `commandId`, checks the order's state machine and the menu data, takes prices from the menu, and applies the change in a Firestore transaction. Both screens read the session through server-sent events.

The stack:

- **Gemini Live** for voice with function calling; **Gemini Flash** for the text agent with the same tools.
- **Vertex AI** for a voice relay and text fallback, and for the offline learner below.
- **Cloud Run** (`asia-northeast3`) for the Next.js app, its API and the voice relay.
- **Firestore** for one session document per order; **Secret Manager** for the Gemini API key.

## The AI cannot pay

![The order states: the AI may open the confirm card; your tap or a new "yes" confirms; the kiosk's card action pays](docs/images/safety.webp)

The AI can open the confirm card, but it cannot complete a payment. The server accepts `confirmCheckout` in the `confirming` state when the cart version matches the card and there is a tap on the card or a new user utterance at least 1.5 seconds after the review opened. The `paid` state comes from the kiosk's card action and nowhere else. On a local production build, 37 of 37 forged commands were refused and 5 of 5 legitimate ones accepted.

## Kiosks with no integration

For a web kiosk that shares no menu data, KIBO Learn has Gemini on Vertex AI explore its page once, offline, and write click recipes that later orders replay with no AI. On two kiosks it had never seen, KIBO handled all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong (round 4, synthetic kiosks). Across all six never-seen kiosks, 3 of 60 orders were unsafe.

## Where it stands in quiet

![96 of 98 test cases passed; the kiosk moves 2.1 s after you stop talking; first audio 3.2 s](docs/images/results.webp)

The text agent passed 96 of 98 team-written cases. By voice, the kiosk highlights the new line a median 2,118 ms after the end of speech (7 of 8 runs, a synthetic voice on a laptop). The spoken reply starts at a median 3,172 ms, past our 2-second target.

## Problem 1: telling you apart without a press

A kiosk stands in a queue, and the finale on December 4 in Singapore is a live demo. Our goal is that you talk without pressing anything, and KIBO tells you apart from the people around you by following the flow of meaning: what continues your order, and what answers KIBO's last question.

Every number in this section comes from synthetic voices (Gemini text-to-speech) and recorded read speech, mixed digitally: no room, no phone microphone, no echo cancellation.

**Where we started.** On November 22, with bystanders 20 to 5 dB quieter than the customer, the open microphone of production got 0 of 12 English orders right: Live ends a turn after one second of silence, and with people talking that second never comes. Hold to talk got 22 of 24 English and Korean orders right in a simulated hold, with bystanders up to as loud. It waits as a candidate, our safety net: it costs every customer a gesture.

**The judge came before the fix.** We froze a benchmark that scores every idea on the same set: 1,320 trials in 98 cells. Each is a mix around a customer (small talk, a rival order from the same menu, four people at once, or music, from 15 dB quieter to 5 dB louder), plus a 3-second sample of the customer. In the word layer, Gemini Flash transcribes what a candidate lets through, and we count the customer's words kept and the bystanders' words leaked, 12 trials per cell. In the order layer, the real Gemini Live hears it, and a run is right when the AI reacts within 5 seconds of the customer finishing and the cart holds exactly the two sets.

| Around the customer | Open microphone, English | Open microphone, Korean | Perfect hold, English | Perfect hold, Korean |
|---|---|---|---|---|
| nobody | 5 | 6 | 6 | 6 |
| small talk, 10 dB quieter | 0 | 0 | 6 | 6 |
| small talk, as loud | 0 | 0 | 4 | 4 |
| a rival order, as loud | 0 | 0 | 4 | 4 |
| four people at once, as loud | 0 | 0 | 1 | 3 |

*Orders right, of 6 runs per cell on Gemini Live: a screen, not a pass (our pass line needs 20).*

"Perfect hold" is an oracle: a script holds the button over the customer's speech using the answer key, the ceiling for any press or gate. It still failed a third of the runs with one bystander as loud, because a bystander talking during the customer's sentence is inside the held audio.

**Meaning works on a transcript.** Our meaning layer, a Gemini Flash call that keeps the words that continue the customer's order or answer KIBO, cut the small talk leaked at equal loudness from 71% to 1% in English and 82% to 0% in Korean, a bystander's "yes" from 100% to 4% and 92% to 10%, and a spoken voice-over standing in for lyrics to 0%, keeping the customer's words. A rival order from the same menu is where it fails: 40% and 31% of the neighbour's words still leaked, and the customer's words kept fell from 95% to 69% and from 98% to 79%. It also needs the dialogue state: a Korean one-word answer kept 44% of its words without it, 100% with it.

As a separate call it took a median 3.1 seconds (Flash-Lite about 0.8 seconds, but it leaked more of a rival order: 49% against 30% on the same six trials). And a phone has no transcript to filter: in our open-microphone runs with a bystander as loud, Live gave an input transcript in 0 of 12 small-talk runs and 1 of 12 rival-order runs. So the judgement has to sit inside Live as instructions, and a loudness gate on the phone has to end the turn when the near voice stops.

**Four turns on Gemini Live.** One sentence does not show a flow, so we built 61.5-second sessions: the customer's four turns 12 seconds apart (the order, "Make both fries large", "No, thanks", "That's all. I'll pay.") under a bystander talking throughout, small talk or a neighbour discussing their own food from the same menu. Right means the order in the cart, the review reached, and no bystander item ever added. The customer speaks on a fixed clock, sometimes over KIBO's reply, so a few misses are the bench's.

Our first no-press stack, the loudness gate plus flow instructions inside Live, matched a perfect hold on small talk 10 dB quieter (8 of 12 right in both) and broke on menu talk (1 of 12 against 11), adding the neighbour's items in 11 of 12 sessions. The gate followed the loudest recent talker, which between the customer's turns is the neighbour, and the instructions did not stop Live acting on their sentences.

We changed two things, chosen offline on the same recordings: the gate takes the customer's level from their own first turn, and no longer lowers its bar after KIBO asks a question (in an offline replay, that had let a neighbour 10 dB quieter through 86 to 89% of the time within 4 seconds of a question).

| Bystander 10 dB quieter, 24 sessions | Orders right | Sessions with a neighbour's item |
|---|---|---|
| Perfect hold | 19 | 1 |
| First no-press stack | 9 | 11 |
| Customer-anchored gate | 15 | 2 |

*Small talk and menu talk, English and Korean, 6 sessions per cell on Gemini Live.*

The anchored gate acted on a customer turn a median 1.3 seconds after its last word, against 1.1 seconds under a perfect hold. At equal loudness nothing we built gets there, and neither does a perfect hold: 1 or 2 of 6 in every cell. The anchored gate was not run on Live at that level.

**What we tried and are not shipping.** Three open-source models ran in front of the same judge, word layer only. None is in the product, which uses Gemini for every AI feature.

- **Noise removal (GTCRN).** Nothing to fix (music as loud left 97% of the customer's words anyway), and under a talker as loud it cut the customer's words kept from 95% to 78%.
- **A voice gate (Silero VAD with the CAM++ speaker model, comparing each second with the customer's sample).** It stops a lone bystander (1 to 15% of their words leaked in English, 18 to 36% in Korean, against 90 to 100% open), but kept 22% of English one-word answers and 39% of the customer's words under a bystander as loud, and is weaker in Korean.
- **Voice extraction (VoxLock, pulling the sampled voice out of the mix).** The best at overlap in Korean (a rival order as loud leaked 28% of its words, against 64% under a perfect hold), but while the customer is silent it passes a lone bystander at full level (88 to 100% of their words), and it needed 1.4 seconds of compute per second of audio on one thread of our busy laptop.

**The safety finding.** The rule's "new user utterance" is anyone's. In the first no-press stack, with the microphone open and the gate deciding what Live hears, a bystander's words confirmed the checkout in 4 of 48 sessions, three of them as the session ended; on single sentences, a bystander's "Yes. Yes, that's right." reached the payment step in 5 of 6 English runs. The payment itself still needs the kiosk's card action, and the AI cannot complete it. What we are adding for the no-press build, not yet measured: a spoken confirmation counts when it came through the gate as the customer's own speech and is a confirmation and nothing else; a tap on the card always works.

**How we will know.** The benchmark screens ideas; a real phone in a loud place decides. The protocol: three arms in one sitting (production, hold to talk, no press), 10 orders each, the phone 20 to 30 cm away with no headset, a second person making small talk and then talking about the same menu, orders right with no retry. The no-press arm is being built into the app for that test this week.

[[FIELD-TEST START]]

**On a real phone.** The loud-place test had not been run when this was written.

[[FIELD-TEST END]]

## Problem 2: the first hello

From the tap on the microphone to KIBO's hello, production took 3.5 to 6.0 seconds, median 3.8 (5 runs on November 20, headless Chrome on a laptop with a fake microphone).

On a branch, the phone plays the greeting itself at the tap (a clip of Live's own voice), tells Live it was said, and connects underneath. On a local server with the microphone already allowed, tap to first sound went from a median 3,569 ms (12 runs) to 27 ms (10 runs); otherwise the clip plays once the person allows the microphone. Live itself is ready a median 2.2 seconds after the tap, short of our 2-second target, and a much smaller instruction (1,089 characters instead of 32,315) did not shorten its setup in three sessions each. The branch is not in production and not yet measured on a phone.

## What this could change, and what comes next

A store that adopts KIBO keeps its kiosk and adds no hardware. The customer keeps their phone, language and text size, and the same way of talking works at the next kiosk.

Today, production runs the open microphone as submitted; hold to talk is a candidate; listening without a press, with the customer-anchored gate, is being built into the app for a phone test this week; the instant hello is a branch. There are no vendor or store partnerships yet, and payment in the demo is virtual. Before the finale we run the phone test, choose between no press and hold to talk from its numbers, and freeze the build.

- Demo: https://kibo-407514467119.asia-northeast3.run.app/demo (short address: kibo-2026.web.app)
- Code: https://github.com/csm-kr/kibo
- Video (3 minutes): https://youtu.be/2jPeDGbLsQM

<!-- BODY END -->

## 3. LinkedIn post draft

Under 1,300 characters with the link placeholder. In LinkedIn, type `@` and pick the Google Cloud and Hack2skill
pages so the tags become real mentions.

```text
We are Team malo, one of the Top 50 teams in the Google Cloud AI Builder Cup 2026, and we have published the story of KIBO.

KIBO lets you order at a self-order kiosk by talking to your own phone, in your own language. Gemini Live turns each sentence into function calls, a Cloud Run server checks every call against the kiosk's menu and applies it in a Firestore transaction, and the kiosk fills its own cart. The AI cannot complete a payment.

Most of the post is what we measured since, on a frozen crowd benchmark (synthetic voices, a digital mix). A Gemini filter that follows the flow of the order removed small talk but not a neighbour ordering from the same menu. On four-turn Gemini Live sessions, with a bystander 10 dB quieter, anchoring our gate to the customer's first turn raised right orders from 9 to 15 of 24, against 19 for a perfect press-to-talk. Three open-source models did not make the cut.

Read: <Medium link>
Try: https://kibo-407514467119.asia-northeast3.run.app/demo
Code: https://github.com/csm-kr/kibo

@Google Cloud @Hack2skill
#Top50Stories #Hack2skill #AIBuilderCup #GoogleCloud
```

## 4. Open blocks

Two fenced blocks, both inside the body. Each starts with a START line and ends with an END line in double square
brackets. No other double square bracket is in this file, so a search for two opening brackets shows the four fence
lines and nothing else.

| Block | Where | What to do before publishing | From |
|---|---|---|---|
| OPTIONAL-KIOSK | "What we built", after the languages paragraph | Keep the paragraph (fence lines removed) only if the city railway ticket machine is in the deployed demo when the post goes out; otherwise delete the block. Generic on purpose until kibo-59 sends its numbers: the machine is being rebuilt with real Tokyo place names under a fictional operator and a compound spoken order. Check the wording against the real machine (screen language, how the fare is chosen, that its name and look copy no real operator) | No measured number in it; branch `feat/jp-metro-kiosk` (worktree `jp-metro`), not deployed on 11-27 |
| FIELD-TEST | "Problem 1", after "How we will know" | Replace the paragraph with the phone test's result in one paragraph (orders right with no retry, of 10, per arm; the phone, the place, the date) and remove the two fence lines, or delete the block. Kept as it stands with the fence lines removed, it is true until the test runs | `docs/TESTING.md` "Field test in a loud place" and its result file when it exists |

Filling the field-test block:
- Write each arm as "k of 10", never "k / 10". Say which build each arm ran (production revision, hold candidate, the
  no-press build) and that it is one person, one phone, one place.
- If the no-press arm did better than hold to talk or production, still say it is 10 orders, not a pass.
- When it lands, also correct the sentences that say the test is ahead: "a real phone in a real loud room is still
  ahead of us" and "Before the finale we run that phone test" (closing section), "is being built into the app for that
  test this week" ("How we will know"), and the LinkedIn post if it should carry the result.
- Each fence has a blank line after its START line and before its END line so a preview renders the block cleanly.

## 5. Facts ledger (not for publication)

Every number or capability claim in the body, in reading order, re-derived on 2026-11-27 by kibo-fd from the file
named (bench numbers recomputed from the raw rows, not copied from READMEs). Bench logs live in
`spikes/speaker-gate/bench/logs/`; word and single-sentence Live logs carry manifest sha `51967c1a…`, flow logs carry
`026b37a7…` (`manifest-flow.json`). Word-layer figures are pooled kept and leaked words over the named cell, 12 trials
unless noted. "Own sum" means added from the named cells.

| Claim in the body | Source |
|---|---|
| Top 50; finale 2026-12-04 Singapore; a live demo | `docs/GOAL.md` section 1 and answer sheet rows A1 and "Finale format"; `phases/HANDOFF.md` "FINALE PREP" |
| Team malo: Sungmin Cho, Ye Seul Ahn; challenge Sustainability & Social Impact | `README.md` line 315; `phases/HANDOFF.md` "SUBMITTED" |
| Opening scene: Korean screen, English speech, two lines with different options | `docs/PRD.md` "Demo scenario" and "Killer scene"; the sentence word for word from `spikes/speaker-gate/bench/sources.ts` `HERO.en` |
| 17.9% of people 65+ (KIHASA 2024, self-reported); 1 in 6 by 2030; at least 2.2 billion; neither a kiosk figure | `docs/plan/SOURCES.md` S16, S44, S45 |
| No install; QR; the kiosk fills its own cart; pay by card at the kiosk | `docs/PRD.md` "Core features"; `README.md` "Try it in 60 seconds" |
| 24 taps by touch, automated run | `docs/plan/NUMBERS.md` line 27 "Touch hero order" (`evidence/touch-hero-efficient.json`) |
| 3 sentences and 2 taps on the card step, one recorded take, synthetic voice, October 16 | `docs/plan/NUMBERS.md` line 28 (`evidence/voice-only-hero.json`; production `kibo-00023-hth`, 10-16, Gemini TTS customer) |
| Nine AI languages; speech tested in English, Korean, Japanese | `docs/plan/NUMBERS.md` line 30 "Languages" (`evidence/live-languages.json` 18/18; Japanese 3 recorded runs) |
| Airport rail ticket machine (fictional), Japanese screens, English voice order | `docs/PRD.md` "Kiosks in the demo"; `docs/plan/DECK_FACTS.md` slot 5 |
| OPTIONAL-KIOSK paragraph | No number. Branch `feat/jp-metro-kiosk` (commits `976ec50` "KOHAKU METRO ticket machine … fares by distance in yen, Japanese screen by default", `87262ac`); kibo-59's brief of 11-27 (being rebuilt: real Tokyo place names, fictional operator, compound spoken order) |
| Direct Gemini Live; one-use ephemeral token pinning model, instructions, tools | `docs/ADR.md` ADR-003; `README.md` "Built on Google Cloud" |
| 11 tools, such as `addToCart` | `docs/ARCHITECTURE.md` "Agent tools (11)"; `docs/ADR.md` ADR-004 (its title still says 9 tools: I-447) |
| Server checks: zod, actor token, repeated `commandId`, state machine, catalog; prices from menu data; Firestore transaction; server-sent events | `docs/ARCHITECTURE.md` "`/api/command` processing order"; `docs/ADR.md` ADR-010; project `CLAUDE.md` |
| Stack list | `README.md` "Built on Google Cloud" table |
| `confirmCheckout` needs `confirming`, a matching cart version, and a tap or a new user utterance 1.5 s after the review; `paid` from the kiosk's card action and nowhere else; production runs this rule | `docs/ADR.md` ADR-005; production state per kibo-59's message of 11-27 (the owner reversed `CONFIRM_TAP_ONLY=1` about an hour after 01:25 KST: "that is the point"). `docs/plan/OPERATIONS.md` "Production state (11-27 01:25 KST)" and `phases/HANDOFF.md` line 23 still say tap-only at the time of writing; not checked against Cloud Run by kibo-fd |
| 37 of 37 forged commands refused, 5 of 5 legitimate accepted, local production build | `docs/plan/NUMBERS.md` line 25 (`evidence/forged-commands.json`) |
| KIBO Learn: Gemini on Vertex AI, once, offline; skill = catalog + click recipes; replay without AI; the kiosk's total checked | `docs/ADR.md` ADR-007; `README.md` "Built on Google Cloud" |
| "On two kiosks it had never seen … (round 4, synthetic kiosks)." word for word | `docs/plan/NUMBERS.md` line 34 (the public headline, R-014) |
| Across all six never-seen kiosks, 3 of 60 unsafe | `docs/TESTING.md` evidence ledger, round 4 row (32 correct / 15 refused / 3 unsafe / 10 not learned of 60) |
| 96 of 98 cases; highlight median 2,118 ms (7 of 8 runs); reply median 3,172 ms, past the 2 s target | `docs/plan/NUMBERS.md` lines 17, 19, 20 |
| Goal: talk without pressing, told apart by the flow of meaning | `docs/GOAL.md` section 1 "How, stated by the owner (11-26 23:40)" |
| Synthetic voices (Gemini TTS) and recorded read speech, digital mix; no room, phone microphone or echo cancellation | `spikes/speaker-gate/README.md` "Voices and sources", "Limits"; flow set: `bench/flow-sources.ts` (48 TTS clips, `sources-flow.json`) |
| 11-22: 0 of 12 English, bystanders 20 to 5 dB quieter, open microphone (production) | `spikes/crowd-voice/README.md` table "Order, English, right of 3", Shipped column at -20, -15, -10, -5 dB (own sum, 4 × 3) |
| Live ends a turn after one second of silence | `docs/ARCHITECTURE.md` "Recognition settings" (1,000 ms) |
| Hold to talk 22 of 24 English and Korean, simulated hold, bystanders up to as loud; a candidate; the safety net | `spikes/crowd-voice/README.md` `--ptt` table at -15, -10, -5, 0 dB (own sum: English 3+3+2+2, Korean 3+3+3+3); `phases/HANDOFF.md` "FINALE PREP"; `docs/ADR.md` ADR-014 |
| Benchmark 1,320 trials in 98 cells, frozen; conditions and levels -15 to +5 dB; a 3-second sample | `spikes/speaker-gate/README.md` "The set (version 2…)"; enrolments are 3.00 to 4.67 s (`candidates/README.md`; `spikes/speaker-gate/candidates.md` J): "3-second" is the shortest |
| Word layer (Gemini Flash transcribes; kept and leaked; 12 per cell); order layer definition of right | `spikes/speaker-gate/README.md` "Scoring"; each `words-*.json` `transcriber.model` = `gemini-3.8-flash` |
| Baseline table (five rows), open en / ko: 5/6, 0/0, 0/0, 0/0, 0/0 | `live-open-summary.json` (`runsPerCell` 6), `right` in cells `alone`, `chat@-10`, `chat@0`, `order@0`, `babble@0`, `en/` and `ko/` (re-read 11-27; v1's music and voice-over rows cut for length: `music@0` 4/5, `song@0` 1/0) |
| Baseline table, perfect hold en / ko: 6/6, 6/6, 4/4, 4/4, 1/3 | `live-hold-oracle-summary.json`, same cells (re-read 11-27) |
| Pass line 20 runs | `docs/GOAL.md` section 5 "Adopt" |
| Perfect hold = script over the customer's speech (± 0.2 s) from the answer key | `spikes/speaker-gate/README.md` "Baselines through the same contract" |
| A perfect hold failed a third of the runs with one bystander as loud | `live-hold-oracle-summary.json` `chat@0`, `order@0`: 4 of 6 each, en and ko (16 of 24 right; four people at once is the separate row, 1 and 3) |
| Meaning filter is a Gemini Flash call on a transcript | `words-l3-flow-text-2026-11-26T15-07-06-590Z.json` (candidate `l3-flow-text`); `calls.jsonl` rows `kind: flow`, `model: gemini-3.8-flash`; settings in `spikes/speaker-gate/README.md` "L3, meaning" (thinking low, temperature 0, JSON) |
| Small talk as loud: leaked 71% to 1% (en), 82% to 0% (ko); customer kept unchanged (95, 99) | `words-open-2026-11-26T13-51-41-631Z.json` against `words-l3-flow-text-2026-11-26T15-07-06-590Z.json`, cell `chat@0`, en and ko, 12 trials each (all TTS customers); kept 95 → 95, 99 → 99 |
| Bystander's yes 100% to 4% (en), 92% to 10% (ko) | same two logs, `yes@0` leaked |
| A spoken voice-over standing in for lyrics, leaked to 0% | same two logs, `song@0` (6 TTS trials each): en 22% → 0, ko 16% → 0, kept unchanged; the song cell is a spoken voice-over of lyric-like lines (`spikes/speaker-gate/README.md` "Song is a stand-in"; `docs/ISSUE.md` I-445) |
| Rival order as loud: 40% and 31% leaked; customer kept 95% to 69%, 98% to 79% | same two logs, `order@0` en and ko (open leaked 74%, 91%) |
| A Korean one-word answer kept 44% of its words without the state, 100% with it | `words-l3-flow-text-2026-11-26T15-07-06-590Z.json` `ko/short` kept 44 (open 100); `words-l3-flow-text-asked-slice-2026-11-26T15-26-51-718Z.json` `ko/short` kept 100 (state: hero in the cart, the customer's earlier words, KIBO asking "Is that everything?", per `spikes/speaker-gate/README.md`) |
| Median 3.1 s as a separate call | `calls.jsonl`, `kind: flow`, `model: gemini-3.8-flash`, at ≤ 15:07:07Z (the full run): 990 calls, median 3,063 ms (p90 6,546) |
| Flash-Lite about 0.8 s | `calls.jsonl`, `model: gemini-3.5-flash-lite`: thinking minimal 30 calls median 787 ms, low 30 calls 848 ms (the README's 793 and 854 take the upper middle value) |
| Flash-Lite leaked 49% of a rival order against 30% for Flash on the same six English trials | `words-l3-flow-lite-minimal-slice-2026-11-26T15-26-36-863Z.json` `en/order@0` (n 6) leaked 49%; the same 6 trials in `words-l3-flow-text-2026-11-26T15-07-06-590Z.json` leaked 30% (recomputed per trial) |
| No input transcript in any of 12 small-talk runs, 1 of 12 rival-order runs, bystander as loud | `live-open.jsonl` (v2 sha), field `heard` non-empty: `en/chat@0` 0 of 6, `ko/chat@0` 0 of 6, `en/order@0` 1 of 6, `ko/order@0` 0 of 6 (`en/alone` 6 of 6) |
| The judgement inside Live as instructions; a loudness gate ends the turn | `spikes/speaker-gate/candidates/l3-flow-live/instructions.txt`; `spikes/speaker-gate/candidates/l1-loud/README.md` (the gate's close ends the activity) |
| Flow sessions: 61.5 s, four turns 12 s apart with those texts, bystander throughout (chat or same-menu talk); right = hero cart, review reached, no bystander item | `spikes/speaker-gate/README.md` Stage 2 "Judge additions" (flow session paragraph); `bench/flowScoring.ts` `isRightFlow` |
| The customer speaks on a fixed clock, sometimes over KIBO's reply | same paragraph, "Limit: … half-duplex muting then drops …" |
| First no-press stack on small talk 10 dB quieter: 8 of 12 right, perfect hold 8 of 12 | `npx tsx spikes/speaker-gate/bench/flow-report.ts` (run 11-27): `l1-loud+l3-flow-live` `en/chat@-10` 4, `ko/chat@-10` 4; `hold-oracle` 5 and 3 |
| Menu talk 10 dB quieter: 1 of 12 against 11 of 12; neighbour's items in 11 of 12 | same output: `l1-loud+l3-flow-live` `en/menu@-10` right 1, items 5; `ko/menu@-10` right 0, items 6; `hold-oracle` 5 and 6 |
| The gate followed the loudest recent talker; between turns the neighbour is that talker; instructions did not stop Live | `spikes/speaker-gate/candidates/l1-loud/README.md` contract table, row "level" (default: loudest run of speech in the last 5 s, a lone talker never gated out; "fed a lone neighbour's sentences to Live as turns", 12.8 activity ends per session against hold-oracle's 4); `spikes/speaker-gate/README.md` Stage 2 "`l3-flow-live` in Live" |
| Two changes chosen offline (offline replay, no API cost); first-turn anchor; no lowering after a question; it opened for a -10 dB neighbour 86 to 89% of the time within its 4 s window after a question | `spikes/speaker-gate/candidates/l1-loud/README.md` "The pick (11-27)" (`screen.ts`, 64 flow mixes and 72 single-sentence trials, `work/screen.json`; "opened the gate on a lone -10 dB neighbour 86 to 89% of the time inside its 4 s window") |
| Table: perfect hold 19, first no-press 9, anchored 15 right of 24; neighbour's items 1, 11, 2 | `flow-report.ts` output: `hold-oracle` -10 dB cells right 5+5+3+6, items 0+1+0+0; `l1-loud+l3-flow-live` right 4+1+4+0, items 0+5+0+6; `l1-pick+l3-flow-live-taponly` (`logs/flow-l1-pick+l3-flow-live-taponly.jsonl`, 24 sessions, -10 dB cells only) right 5+3+3+4, items 0+0+0+2 |
| Anchored gate acted a median 1.3 s after the customer's last word; perfect hold 1.1 s | `flow-report.ts` output: `l1-pick+l3-flow-live-taponly` median 1,285 ms (p90 2,009, n 60); `hold-oracle` median 1,144 ms (p90 1,327, n 85, all eight cells; 1,140 on the -10 dB cells per `spikes/speaker-gate/README.md`) |
| At equal loudness 1 or 2 of 6 in every cell for a perfect hold; nothing we built gets there | `flow-report.ts`: `hold-oracle` `chat@0` 2, 2; `menu@0` 1, 1; `l1-loud+l3-flow-live` 2, 1, 0, 0 |
| The anchored gate was not run on Live at equal loudness | `flow-l1-pick+l3-flow-live-taponly.jsonl` has -10 dB cells only; `candidates/l1-loud/README.md` "At 0 dB no variant does anything (bystander-only time open 95 to 99%)" |
| Three open-source models, word layer only, not in the product | `spikes/speaker-gate/candidates.md` J (licences: GTCRN MIT, Silero VAD MIT, CAM++ Apache-2.0, VoxLock Apache-2.0; G and J tables); no `live-l0-*`, `live-l2-*` or `live-c-*` log; `CLAUDE.md` (Gemini for all AI features) |
| GTCRN: music as loud kept 97% without it; with a talker as loud kept 95% to 78% | `words-open-2026-11-26T13-51-41-631Z.json` `en/music@0` kept 97; `words-l0-gtcrn-2026-11-26T14-19-03-314Z.json` against open, `en/chat@0` kept 95 → 78 |
| Voice gate: Silero VAD + CAM++, each second against the sample | `spikes/speaker-gate/candidates.md` J2 (1.0 s windows every 0.25 s) |
| Voice gate stops a lone bystander: 1 to 15% (en), 18 to 36% (ko); open 90 to 100% | `words-l2-campp-2026-11-26T14-49-34-842Z.json` cells `silent+chat@0`, `silent+order@0`, `silent+read@0`: en 15, 9, 1; ko 26, 36, 18; open (`words-open-…`) en 100, 95, 98; ko 100, 90, 99 |
| Voice gate kept 22% of English one-word answers; 39% at equal loudness; weaker in Korean | `words-l2-campp-…` `en/short` kept 22; `en/chat@0` kept 39 (leaked 16); Korean: the silent cells above, and `spikes/speaker-gate/candidates.md` J2 (a Korean-only threshold keeps 68% against English 81% at the same leak, `candidates/l2-campp/logs/tune-20261126T233859.json`) |
| Extraction (VoxLock) best at overlap in Korean: rival order as loud leaked 28% against 64% under a perfect hold | `words-c-voxlock-2026-11-26T16-12-39-113Z.json` `ko/order@0` leaked 28 (kept 92); `words-hold-oracle-…` `ko/order@0` leaked 64 |
| Passes a lone bystander at full level (88 to 100% of their words) | `words-c-voxlock-…` `silent+chat@0`, `silent+order@0`, `silent+read@0`: en 100, 99, 88; ko 95, 89, 98 (VoxLock alone; with a VAD after it, `words-c-voxlock-vad-2026-11-26T16-17-41-752Z.json`, en 95, 99, 86; ko 86, 83, 91, not quoted); signal check `spikes/speaker-gate/candidates/c-voxlock/logs/check-lone-bystander-20261126.txt` (gain 1.06 to 1.08 on a lone non-target voice; the author's `voxlock` package gives the same) |
| 1.4 s of compute per second of audio on one thread of a busy laptop | `spikes/speaker-gate/candidates/c-voxlock/logs/speed-20261127T005646.json`: 1,418 ms of compute per second of audio, 40 ms streaming chunks, 20 trials, while other projects loaded the machine (190 s of CPU for 142 s of audio) |
| Bystander's words confirmed a checkout in 4 of 48 no-press sessions, three as the session ended | `flow-l1-loud+l3-flow-live.jsonl`, `confirmCheckout` tool events after bystander speech: f0045 en chat@-10 at 61.2 s, f0040 ko chat@0 at 63.6 s, f0006 ko menu@-10 at 62.0 s, f0004 ko chat@-10 at 39.5 s (2 more, f0041 and f0036, followed the customer's own "I'll pay"); recomputed 11-27 against `refs-flow.json` turn times |
| On single sentences a bystander's "Yes. Yes, that's right." reached the payment step in 5 of 6 English runs (open microphone) | `live-open-summary.json` `en/review-yes@0` `yesAccepted` 5 of `n` 6 (ko 1 of 6, not quoted); the line from `spikes/speaker-gate/bench/sources.ts` `YES.en`; cell defined in `spikes/speaker-gate/README.md` (hero order in, confirm card open, a bystander says yes) |
| The rule's fresh utterance is anyone's; the payment still needs the kiosk's card action; the AI cannot complete it | `docs/ADR.md` ADR-005; `spikes/speaker-gate/README.md` Stage 2 "Safety" (the runner sends tool calls through the app's own `runCommand` and `machine.ts` `isConfirmed`, so the bench's rule is the app's) |
| For the no-press build, being added and not measured: a spoken confirmation counts when it came through the gate as the customer's own speech and is a confirmation and nothing else; a tap always works | kibo-59's brief correction of 11-27 (no code or log yet; state it as in progress) |
| Field test protocol; the no-press arm being built for it this week | `docs/TESTING.md` "Field test in a loud place"; branch `feat/field-open` (worktree `fast-hello`, head `58be670` on 11-27), `phases/HANDOFF.md` "Next build: the field candidate" |
| Tap to hello 3.5 to 6.0 s, median 3.8, 5 runs, production, 11-20, headless Chrome, fake microphone, not a phone | `mentoring/tap-to-hello-20261120.json` (`helloRangeMs` 3458 to 6028, `helloMedianMs` 3813; its `about`: "Headless Chrome on a laptop … with a fake mic, not a real phone"; folder not in git) |
| The phone plays the greeting at the tap (a clip of Live's own voice), tells Live it was said, connects underneath | `.claude/worktrees/fast-hello/docs/ARCHITECTURE.md` "The first hello (11-26)" items (1) to (3) and "The voice" (clips kept only when Live's own transcript equals the line) |
| Tap to first sound median 3,569 ms (12 runs) to 27 ms (10 runs), local server, microphone already allowed; otherwise the clip plays once the person allows it | `.claude/worktrees/fast-hello/evidence/tap-to-hello-local-baseline.json` `firstSoundMs` median 3,568.5 (2,565 to 4,505, 12 of 12 ok); `…-final.json` 27 (21 to 526, 10 of 10 ok); recomputed from `runs` 11-27. Condition: `.claude/worktrees/fast-hello/docs/plan/NUMBERS.md` line 29 ("the microphone already allowed"; "never beside the 11-20 … reading … as if the same measure": the body gives them in separate paragraphs, labelled production and local server) and ARCHITECTURE "The first hello" item (2) (otherwise "the moment the person allows it") |
| Live ready median 2.2 s, short of the 2 s target | `…-final.json` `setupCompleteMs` median 2,198 (2,040 to 4,094); baseline 2,845; target in `docs/GOAL.md` "Hard targets (proposed)" |
| A smaller instruction (1,089 instead of 32,315 characters) did not shorten setup, 3 sessions each | `.claude/worktrees/fast-hello/docs/ARCHITECTURE.md` "Not kept: a smaller setup" (1.7, 1.7, 2.0 s against 1.6, 1.8, 2.2 s; `spikes/fast-hello/logs/setup-2026-11-26T1402.json`) |
| Branch, not production, not measured on a phone | `.claude/worktrees/fast-hello/docs/plan/NUMBERS.md` line 29 ("Not production and not a phone"); `phases/HANDOFF.md` "First hello done (branch `feat/fast-hello`, head `58be670` …, not merged)" |
| Status of each piece: production the open microphone as submitted; hold to talk a candidate; no-press with the anchored gate being built for a phone test this week; instant hello a branch | kibo-59's brief and correction of 11-27; `phases/HANDOFF.md` "FINALE PREP", "Next build", "First hello done"; `git worktree list` 11-27 (worktree `fast-hello` on branch `feat/field-open`) |
| Nothing replaced, no hardware; the same way of talking at the next kiosk | `docs/PRD.md` "Why the phone", "Why not something else" |
| No vendor or store partnerships; virtual payment; no real phone in a loud room yet | `docs/PRD.md` "How KIBO gets onto a kiosk", "Out of MVP scope"; `docs/GOAL.md` section 2 "Missing" |
| Before the finale: phone test, choose, freeze | `docs/GOAL.md` section 1 "Constraints" (12-02 freeze), "Plan of 11-26" |
| Links: demo, GitHub, video (3 minutes) | `phases/HANDOFF.md` "SUBMITTED" (video 3:01); `README.md` |
| LinkedIn: with a bystander 10 dB quieter, 9 to 15 of 24 against 19; small talk removed, a same-menu neighbour not | as the body rows above |

Left out on purpose, with the source if one is wanted back:
- The closing line "Your language, the kiosk's language, and a phone that …" (cut for length; the body ends on the links).
- From v1: the model calling `confirmCheckout` right after the review in two of three voice cost runs, refused by the server (`docs/plan/NUMBERS.md` line 23); the `POST /api/command` JSON excerpt (`src/lib/commands/schemas.ts`, `data/kiosks/malo.json`; cut for length); 55% of the bystander's words through a perfect hold at equal loudness (`words-hold-oracle-2026-11-26T13-56-32-346Z.json` `en/chat@0`); "the whole menu sits in the instructions" and the typed-turn test of the nine languages; the "only my voice" instruction to Live (2 of 6 against 1 of 6, `spikes/crowd-voice/README.md`); the music
  findings in detail and GTCRN under quieter and louder music; the loudness gate's first reads (52% to 15%, 3%),
  superseded by the anchored gate; the components of the 11-20 hello (token 0.9 s, setup 2.1 s, hello 0.6 s,
  `mentoring/tap-to-hello-20261120.json`) and the "something heard within half a second" target; the 2 handed to staff
  being total mismatches; the empty RESULT-BLOCK table and its fill rules.
- From the flow sessions (`spikes/speaker-gate/README.md` Stage 2): spurious replies, activity ends, frames dropped
  by half-duplex muting, gate closes inside a sentence, turns acted on, p90 delays; the open baseline's 1 of 16;
  three of the anchored gate's wrong carts reading "both fries large" as a large set (a reading problem, also seen
  under hold); the four voice confirms the tap-only rule refused in the anchored batch; the ablation not run (perfect
  hold + flow instructions), which leaves open whether the instructions help on their own.
- From the first hello: "the tools cannot be left out" (only setup without tools was faster, 1.2 s); the components of the local baseline.
- From the meaning filter: English short answers and short answers under chat with the state (6% to 61%, Korean 28%
  to 56%), Flash-Lite at thinking low, p90 latencies.
- From the three models (`spikes/speaker-gate/candidates.md` J to J6): VoxLock's English overlap failure (en order@0
  67% kept, 66% leaked), its Korean and English details, VoxLock plus VAD, the voice gate's phone needs (28.3 MB,
  about 2 s of enrolment, 430 to 560 ms to decide), all compute speeds but VoxLock's, and the combination of the voice
  gate with extraction, which was not built.
- From v1's own cut list, still out: the never-seen kiosk breakdown, Gemini Embedding 2 as a voice fingerprint (0 of
  48 same voice), the tourist arrivals, Google's documentation on picking one speaker, the text path into Live and
  plain transcription cost, the 11-22 table and older reaction medians, third-party numbers, revision names, cost per
  order and experiment spend, Korean law, the nine language names, the 1,590 ms hold-to-talk highlight.

## 6. Questions for the owner

1. **Naming models that are not Gemini:** the body now names the three open-source models we tried (GTCRN, Silero VAD
   with CAM++, VoxLock) and says plainly that none is in the product, which uses Gemini for every AI feature. Keep the
   names, or describe them without names because Google AI usage is 40% of the score?
2. **First-hello numbers in public:** the branch's own `docs/plan/NUMBERS.md` says "no public surface until measured
   on the deployed service and a phone", and the body publishes the local-server result (3,569 ms to 27 ms) labelled
   as a branch, not production, not a phone. Publish it so, or cut Problem 2 to the production reading and the plan?
3. **The no-press confirm rule:** the safety paragraph says that for the no-press build a spoken confirmation will
   count when it came through the gate as the customer's own speech and is a confirmation and nothing else, and that
   a tap always works. Nothing of it is built or measured yet. Publish it as "we are adding", or say only that the
   bench found the weakness?
4. **The optional kiosk paragraph:** keep or drop, and if kept, is the railway machine deployed and what is it called?
5. **Demo link and the 2-second target:** the body leads with the submitted Cloud Run `/demo` URL and states the
   2-second target, which `docs/GOAL.md` marks as proposed. Both right to publish?
