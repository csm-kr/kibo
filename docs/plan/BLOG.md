# Top 50 technical blog (draft v2 for Medium)

Not injected into harness steps (lives under `docs/plan/`). v0 was written 2026-11-26 evening and v1 the same night; v2
(2026-11-27, session kibo-fd for kibo-59) adds everything measured since v1: the meaning filter on the word layer, the
multi-turn sessions on Gemini Live with the customer-anchored gate, the three open-source approaches tried and not
shipped, the safety finding, and the first-hello branch. For the organizer's Top 50 blog (Medium, due
Sat 2026-11-28 12:00 IST = 15:30 KST; results cut-off Fri 11-27 22:00 KST; then a LinkedIn share and the link with a
team photo). The owner publishes.

Status words in the body are true as of 2026-11-27: production runs the open microphone as submitted, with the
original confirm rule (a tap or a fresh spoken utterance; the owner tried tap only on 11-27 01:25 KST and reversed it
15 minutes later, at 01:40, per `docs/plan/OPERATIONS.md`); hold to talk is a candidate revision that takes
no traffic; listening without a press with the customer-anchored gate is being built into the app (branch
`feat/field-open`) for a phone test this week; the instant hello is a branch (`feat/fast-hello`), not in production.
Re-read them if any of that changes before publishing.

The body is publishable as it stands. One fenced block waits for the phone test (section 4).

## 1. Title options

1. **Your language, the kiosk's language** (pick)
   Subtitle: A phone as the voice remote for the kiosk already on the counter, and what we measured while teaching
   it to tell you from the people around you.
2. **45 of 80 without a press, 64 with a perfect one: teaching a kiosk's voice remote who is talking**
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

### A phone as the voice remote for the kiosk already on the counter, and what we measured while teaching it to tell you from the people around you

*By Team malo (Sungmin Cho, Ye Seul Ahn). A Top 50 story from the Google Cloud AI Builder Cup 2026.*

![A spoken order on the phone, and the Korean kiosk filling the same cart](docs/images/hero.webp)

A traveller stands at a burger kiosk in Seoul. The screen is in Korean, a set needs a side and a drink, and a queue is forming behind her. She scans the kiosk's QR code with her phone and says, in English: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." Two lines appear in the kiosk's cart, each with its own options. She never touched the screen, and the kiosk never left Korean.

That is KIBO. Your language on the phone, the kiosk's language on the counter. The phone is the remote, and the kiosk stays unchanged.

Since the submission we have worked on two problems: telling the customer apart from the people nearby without a button, and the wait for KIBO's first hello.

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

The finale on December 4 in Singapore is a live demo. Our goal is that you talk without pressing anything, and KIBO tells you apart from the people around you by following the flow of meaning: what continues your order, and what answers KIBO's last question.

Every number here comes from synthetic voices (Gemini text-to-speech) and recorded read speech, mixed digitally: no room, no phone microphone, no echo cancellation.

**Where we started.** On November 22, production's open microphone got 0 of 12 English orders right with bystanders 20 to 5 dB quieter: Live ends a turn after one second of silence, and with people talking that second never comes. Hold to talk got 22 of 24 English and Korean orders right in a simulated hold, with bystanders up to as loud: our safety net.

**The judge came before the fix.** We froze a benchmark that scores every idea on the same set: 1,320 trials in 98 cells, each a mix around a customer (talk, a rival order, a crowd or music, from 15 dB quieter to 5 dB louder). In the word layer, Gemini Flash transcribes what a candidate lets through, and we count the customer's words kept and the bystanders' words leaked. In the order layer, Gemini Live hears it, and a run is right when the AI reacts within 5 seconds and the cart holds exactly the two sets.

| Around the customer | Open microphone, English | Open microphone, Korean | Perfect hold, English | Perfect hold, Korean |
|---|---|---|---|---|
| nobody | 5 | 6 | 6 | 6 |
| small talk, 10 dB quieter | 0 | 0 | 6 | 6 |
| small talk, as loud | 0 | 0 | 4 | 4 |
| a rival order, as loud | 0 | 0 | 4 | 4 |
| four people at once, as loud | 0 | 0 | 1 | 3 |

*Orders right, of 6 runs per cell on Gemini Live: a screen, not a pass (our pass line needs 20).*

"Perfect hold" is an oracle: a script holds the button over the customer's speech using the answer key. It still failed a third of the runs with one bystander as loud: talk during the customer's sentence is inside the held audio.

**Meaning works on a transcript.** Our meaning layer, a Gemini Flash call that keeps the words that continue the customer's order or answer KIBO, cut the small talk leaked at equal loudness from 71% to 1% in English and 82% to 0% in Korean. A rival order from the same menu is where it fails: 40% and 31% of the neighbour's words still leaked. As a separate call it took a median 3.1 seconds, and a phone has no transcript to filter: with a bystander as loud, Live returned an input transcript in 1 of 24 runs. So the judgement has to sit inside Live as instructions, and a loudness gate on the phone has to end the turn when the near voice stops.

**Four turns on Gemini Live.** We built sessions of a median 61.5 seconds: the customer's four turns (the order, "Make both fries large", "No, thanks", "That's all. I'll pay.") under bystanders talking in turn throughout (six synthetic voices): small talk, or neighbours discussing food from the same menu. In a median session a bystander talks for about 26 seconds while both the customer and KIBO are silent. Right means the order in the cart, the review reached, and no stray item (anything outside the customer's order) ever added.

Our first no-press stack, the loudness gate plus flow instructions inside Live, broke on menu talk 10 dB quieter: 1 of 12 sessions right against 11 under a perfect hold, with stray items in 11 of 12. The gate followed the loudest recent talker, which between the customer's turns is a bystander.

We changed three things, chosen in an offline replay of the same recordings: the gate takes the customer's level from their own first turn, no longer lowers its bar after KIBO asks a question, and waits 1.0 second instead of 0.7 before ending a turn.

| Bystander 10 dB quieter | Sessions | Orders right | With an item outside the customer's order |
|---|---|---|---|
| Perfect hold | 80 | 64 | 1 |
| Customer-anchored gate | 80 | 45 | 12 |
| First no-press stack | 24 | 9 | 11 |

*Small talk and menu talk, English and Korean. Each 80 is 8 recordings per cell played two or three times, so the sessions are not independent and the 95% ranges (gate 45 to 67% right, hold 70 to 87%) are too narrow. The hold row allowed a spoken confirmation and the gate row a tap only; the last row is one run of 6 recordings per cell.*

Without a press, the anchored gate got 45 of 80 right against 64 and let stray items in 12 sessions (11 under menu talk) against 1. Counting the turns each acted on (188 and 164 of 240), the gate acted a median 1.3 seconds after the customer's last word against 1.1, and on the order itself 1.5 against 1.2.

**What the instructions add.** On the same recordings, the anchored gate with our ordinary instructions let stray items in 6 of 24 sessions, against 7 of 64 with the flow instructions over every repeat: too few to call. At equal loudness under a perfect hold, orders right were 11 of 24 with the flow instructions and 6 without (one run each): small talk 8 and 4 of 12, menu talk only 3 and 2. The anchored gate was not run on Live at equal loudness.

**What did not work.** With the first gate a deeper bar scored worse on the word layer; a shallower one cuts more of the bystanders' speech offline but has not run on Live. Holding back the first turn to trim the speech before it delayed KIBO's first reply to a median 3.4 seconds from 1.4 for no gain in orders right or stray items, so we dropped it. One change stays: once the gate knows the customer's level, a turn no longer reaches back into the speech before it, and Live heard the customer's "No, thanks" in 21 of 24 sessions against 8 (the whole answer and nothing else, 19 against 7). It has not lowered stray items on Live (2, 3 and 7 of 24 in three batches, against 7 of 64 for the anchored gate). A neighbour who talks first can also set the customer's level; we changed the rule so louder speech raises it.

**What we tried and are not shipping.** Three open-source approaches fell short on the word layer and are not in the product, which uses Gemini for every AI feature. Noise removal (GTCRN) did not help: music alone cost few words, and where words were lost it lost more. A voice gate (Silero VAD with CAM++) kept 22% of the words in English short answers ("Yes.", "That's all."): 2 of 12 answers, and "Yes." in none of 6. Voice extraction (VoxLock) passed a lone bystander at full level.

**The spoken confirmation.** The rule's "new user utterance" is anyone's. Count a `confirmCheckout` call with no customer speech in the 6 seconds before it. In the first no-press stack, which accepted a spoken confirmation, such a call confirmed the checkout in 3 of 48 sessions (two after the recording ended). Every later no-press batch ran on a bench server that accepts only a tap, where such a call came in 5 of 176 (one after the end), refused there, likely accepted under production's rule. The payment itself still needs the kiosk's card action.

So the phone build has a guard: a spoken confirmation counts only if the whole utterance came through the gate as the customer's and a Gemini Flash-Lite check, which refuses if it fails, finds a confirmation and nothing else. A neighbour's one-syllable fragment that made Live try to confirm on our bench was refused 5 of 5 times, which the gate's condition alone would not have done; across 21 test sentences run 5 times each, the check gave no wrong answer. Alone in local Live sessions, the customer confirmed by voice 6 of 6 times, a median of about 1.6 seconds after the last word. With a simulated neighbour 10 dB quieter talking from the moment of the tap, it does not work yet: payment was reached in 1 of 12 sessions, and after two changes to the level rule the right order reached payment in 0 of 24. In all 24 of those, KIBO answered the neighbour before the customer's first line. The guard is built and measured on test sentences and local sessions, not yet in a loud place, and the first sentence is the open problem.

**How we will know.** The benchmark screens ideas; a real phone in a loud place decides. Three arms in one sitting (production, hold to talk, no press), 10 orders each, the phone 20 to 30 cm away with no headset, a second person making small talk, then menu talk, orders right with no retry.

[[FIELD-TEST START]]

**On a real phone.** The loud-place test had not been run when this was written.

[[FIELD-TEST END]]

## Problem 2: the first hello

From the tap on the microphone to KIBO's hello, production took 3.5 to 6.0 seconds, median 3.8 (5 runs on November 20, headless Chrome on a laptop with a fake microphone).

On a branch, the phone plays the greeting itself at the tap, tells Live it was said, and connects underneath. On a local server with the microphone already allowed, tap to first sound went from a median 3,569 ms (12 runs) to 27 ms (10 runs); otherwise the clip plays once the person allows the microphone. Live itself is ready a median 2.2 seconds after the tap, short of our 2-second target. The branch is not in production and not yet measured on a phone.

## What this could change, and what comes next

A store that adopts KIBO keeps its kiosk and adds no hardware. The customer keeps their phone, language and text size, and the same way of talking works at the next kiosk.

Today, production runs the open microphone as submitted; hold to talk is a candidate; listening without a press is being built into the app for a phone test this week; the instant hello is a branch. There are no vendor or store partnerships yet, and payment in the demo is virtual. Before the finale we run the phone test, choose between no press and hold to talk from its numbers, and freeze the build.

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

Most of the post is what we measured since, on a frozen crowd benchmark (synthetic voices, a digital mix). On transcripts, a Gemini filter that follows the flow of the order removed small talk but not a neighbour ordering from the same menu. On four-turn Gemini Live sessions with a bystander 10 dB quieter, our gate anchored to the customer's first turn got 45 of 80 sessions (32 recordings, replayed) right without a press, against 64 for a perfect press. Three open-source approaches did not make the cut.

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
- When it lands, also correct the sentences that say the test is ahead: "is being built into the app for a phone
  test this week" and "Before the finale we run the phone test" (closing section), "not yet in a loud place" (the guard paragraph in "The spoken confirmation"),
  and the LinkedIn post if it should carry the result.
- Each fence has a blank line after its START line and before its END line so a preview renders the block cleanly.

## 5. Facts ledger (not for publication)

Every number or capability claim in the body, in reading order, re-derived on 2026-11-27 by kibo-fd from the file
named (bench numbers recomputed from the raw rows, not copied from READMEs). Bench logs live in
`spikes/speaker-gate/bench/logs/`; word and single-sentence Live logs carry manifest sha `51967c1a…`, flow logs carry
`026b37a7…` (`manifest-flow.json`). Word-layer figures are pooled kept and leaked words over the named cell, 12 trials
unless noted. "Own sum" means added from the named cells. Problem 1 was brought to the final bench table on 11-27
evening (`spikes/speaker-gate/bench/logs/final-table-2026-11-27.md`) and corrected that night against an independent
checker's list (kibo-59's message); per-cell lists run en chat, en menu, ko chat, ko menu.

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
| `confirmCheckout` needs `confirming`, a matching cart version, and a tap or a new user utterance 1.5 s after the review; `paid` from the kiosk's card action and nowhere else; production runs this rule | `docs/ADR.md` ADR-005; production state per `docs/plan/OPERATIONS.md` "Production state (11-27 01:40 KST)": traffic moved to `CONFIRM_TAP_ONLY=1` at 01:25 KST and the owner reversed it at 01:40, 15 minutes later ("that is the point", per kibo-59's message of 11-27); not checked against Cloud Run by kibo-fd |
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
| Benchmark 1,320 trials in 98 cells, frozen; talk, a rival order, a crowd (babble) or music, -15 to +5 dB | `spikes/speaker-gate/README.md` "The set (version 2…)" |
| Word layer (Gemini Flash transcribes; kept and leaked); order layer definition of right | `spikes/speaker-gate/README.md` "Scoring"; each `words-*.json` `transcriber.model` = `gemini-3.8-flash` |
| Baseline table (five rows), open en / ko: 5/6, 0/0, 0/0, 0/0, 0/0 | `live-open-summary.json` (`runsPerCell` 6), `right` in cells `alone`, `chat@-10`, `chat@0`, `order@0`, `babble@0`, `en/` and `ko/` (re-read 11-27; v1's music and voice-over rows cut for length: `music@0` 4/5, `song@0` 1/0) |
| Baseline table, perfect hold en / ko: 6/6, 6/6, 4/4, 4/4, 1/3 | `live-hold-oracle-summary.json`, same cells (re-read 11-27) |
| Pass line 20 runs | `docs/GOAL.md` section 5 "Adopt" |
| Perfect hold = script over the customer's speech (± 0.2 s) from the answer key | `spikes/speaker-gate/README.md` "Baselines through the same contract" |
| A perfect hold failed a third of the runs with one bystander as loud | `live-hold-oracle-summary.json` `chat@0`, `order@0`: 4 of 6 each, en and ko (16 of 24 right; four people at once is the separate row, 1 and 3) |
| Meaning filter is a Gemini Flash call on a transcript | `words-l3-flow-text-2026-11-26T15-07-06-590Z.json` (candidate `l3-flow-text`); `calls.jsonl` rows `kind: flow`, `model: gemini-3.8-flash`; settings in `spikes/speaker-gate/README.md` "L3, meaning" (thinking low, temperature 0, JSON) |
| Small talk as loud: leaked 71% to 1% (en), 82% to 0% (ko) | `words-open-2026-11-26T13-51-41-631Z.json` against `words-l3-flow-text-2026-11-26T15-07-06-590Z.json`, cell `chat@0`, en and ko, 12 trials each (all TTS customers); customer kept 95 → 95, 99 → 99 (not quoted) |
| Rival order as loud: 40% and 31% leaked | same two logs, `order@0` en and ko (open leaked 74%, 91%; customer kept 95% to 69% and 98% to 79%, not quoted) |
| Median 3.1 s as a separate call | `calls.jsonl`, `kind: flow`, `model: gemini-3.8-flash`, at ≤ 15:07:07Z (the full run): 990 calls, median 3,063 ms (p90 6,546) |
| A phone has no transcript to filter: with a bystander as loud, Live returned an input transcript in 1 of 24 runs | `live-open.jsonl` (v2 sha), field `heard` non-empty: `en/chat@0` 0 of 6, `ko/chat@0` 0 of 6, `en/order@0` 1 of 6, `ko/order@0` 0 of 6 (`en/alone` 6 of 6) |
| The judgement inside Live as instructions; a loudness gate ends the turn | `spikes/speaker-gate/candidates/l3-flow-live/instructions.txt`; `spikes/speaker-gate/candidates/l1-loud/README.md` (the gate's close ends the activity) |
| Flow sessions: a median 61.5 s, four turns with those texts, bystanders talking in turn throughout (six synthetic voices; small talk or same-menu talk); right = hero cart, review reached, no stray item (anything outside the customer's order) ever added | `spikes/speaker-gate/README.md` Stage 2 "Judge additions" (flow session paragraph); `bench/flowScoring.ts` `isRightFlow`; six voices: `refs-flow.json` `bystanders[].voice` (Aoede, Charon, Despina, Enceladus, Fenrir, Puck); median length: `logs/final-table-2026-11-27.md` section 5 (review reached = `confirming`, or `paying` where a spoken confirmation was allowed) |
| In a median session a bystander talks about 26 s while both the customer and KIBO are silent | `spikes/speaker-gate/bench/logs/final-table-2026-11-27.md` section 5 (kibo-fd scratch `alone.py`, not in git): from `refs-flow.json` speech spans and each row's KIBO audio events, median 26.1 s (p10 23.1, p90 28.9) over `flow-hold-oracle{,-r2,-r3}.jsonl` (n 104), 25.4 s over the pick's 80; session median 61.5 s, neighbour talking 50.8 s, 42.0 s of it while the customer is silent |
| First no-press stack, menu talk 10 dB quieter: 1 of 12 right against 11 under a perfect hold; stray items in 11 of 12 | kibo-fd `pool.mts` (scratch; the bench's own `flowScoring.ts`), 11-27: `flow-l1-loud+l3-flow-live.jsonl` `en/menu@-10` right 1, items 5; `ko/menu@-10` right 0, items 6; `flow-hold-oracle.jsonl` first 6 trials (`FIRST=6`) 5 and 6 |
| The gate followed the loudest recent talker; between turns a bystander is that talker | `spikes/speaker-gate/candidates/l1-loud/README.md` contract table, row "level" (default: loudest run of speech in the last 5 s, a lone talker never gated out; "fed a lone neighbour's sentences to Live as turns", 12.8 activity ends per session against hold-oracle's 4); `spikes/speaker-gate/README.md` Stage 2 "`l3-flow-live` in Live" |
| Three changes chosen in an offline replay (no API cost): first-turn anchor; no lowering after a question; hang-over 1.0 s instead of 0.7 | `spikes/speaker-gate/candidates/l1-loud/README.md` "The pick (11-27)" (`screen.ts`, 64 flow mixes and 72 single-sentence trials, `work/screen.json`); hang-over: the same README's settings table, row "hang-over" (0.7 s default, `PICK` 1.0 s; "0.7 s cut English sentences 7 to 8 times in 16 sessions; 1.0 s none"), `gate.ts` `DEFAULTS.hangMs` 700 and `PICK.hangMs` 1000; the first stack's 48 rows have no `gateParams` field (the gate's defaults; 0.7 s in its first committed version, `43fb078`, since the commit the stack ran at, `1abf404`, did not hold `gate.ts`), the pick's carry `hangMs: 1000` |
| Table: perfect hold 80 sessions, 64 right, 1 with an item outside the customer's order; anchored gate 80, 45, 12 (11 under menu talk; the en/chat one, f0022, is KIBO's own apple pie upsell); first no-press stack 24, 9, 11. Caption: the hold allowed a spoken confirmation, the gate a tap only; the last row one run of 6 recordings per cell | kibo-fd `pool.mts` (scratch; the bench's own `flowScoring.ts` and `scoring.ts`), 11-27, -10 dB cells in the order en chat, en menu, ko chat, ko menu: `flow-hold-oracle.jsonl`, `-r2`, `-r3` right 16, 17, 15, 16, items 0, 1, 0, 0 (a spoken confirmation allowed); `flow-l1-pick+l3-flow-live-taponly.jsonl`, `-r2`, `-r3` right 13, 6, 12, 14, items 1, 6, 0, 5 (`CONFIRM_TAP_ONLY=1`); `flow-l1-loud+l3-flow-live.jsonl` right 4, 1, 4, 0, items 0, 5, 0, 6. Also `logs/final-table-2026-11-27.md` section 1; f0022's item is `apple_pie` (`bystanderItems`, checked 11-27); the first stack's 24 are trials 1 to 6 of each -10 dB cell, run once |
| Each 80 is 8 recordings per cell played two or three times; not independent; the 95% ranges 45 to 67% (gate) and 70 to 87% (hold) are too narrow | `refs-flow.json` `cells` (8 trials per -10 dB cell); the runner skips trials already in a log, so repeats sit in `-r2` and `-r3`: trials 1 to 4 three times, 5 to 8 twice (`pool.mts` "trials run k times"); Wilson intervals from `bench/scoring.ts` `wilson` |
| Without a press 45 of 80 right against 64, stray items in 12 (11 under menu talk) against 1; on the turns each acted on (188 and 164 of 240) a median 1.3 s after the customer's last word against 1.1; on the order itself 1.5 against 1.2 | the same pooled logs, `flowScoring.ts` `turnActions` (the first matching tool call within 5 s of a turn's end): every turn, pick 1,303 ms (p90 2,009, n 188 of 240), hold 1,061 ms (p90 1,252, n 164 of 240); the order turn, pick 1,487 ms (n 74), hold 1,177 ms (n 80) (kibo-fd scratch `herodelay.mts`, 11-27; equal to the independent checker's figures) |
| Gate + ordinary instructions: stray items in 6 of 24; with the flow instructions 7 of 64 over every repeat on the same recordings; too few to call | `flow-l1-pick-taponly.jsonl` (ordinary instructions, first 6 trials per -10 dB cell, `CONFIRM_TAP_ONLY=1`): items 1, 3, 0, 2, right 12 of 24; `flow-l1-pick+l3-flow-live-taponly.jsonl`, same trials: items 2, right 15; the three pick logs on those trials (`FIRST=6`): items 0, 3, 0, 4 = 7 of 64, right 37 of 64 (kibo-fd `pool.mts`); Fisher two-sided p 0.17 for 6 of 24 against 7 of 64 (kibo-fd, 11-27), and the pick's first batch alone (2 of 24) is not quoted; run 2's en/chat item (f0049, `cheese_burger:qty3`) is a quantity misread, its other 5 are menu-talk items |
| Equal loudness under a perfect hold: orders right 11 of 24 with the flow instructions and 6 without (one run each); small talk 8 and 4 of 12, menu talk 3 and 2 | `flow-hold-oracle.jsonl` 0 dB cells, first 6 trials: right 2, 1, 2, 1, items 2, 5, 0, 1; `flow-hold-oracle+l3-flow-live.jsonl`: right 3, 1, 5, 2, items 1, 4, 0, 1 (both allow a spoken confirmation; `pool.mts`, `CELLS=…@0 FIRST=6`). Not "raised": one run each, and a rerun of the same recording flips about 30% of hold verdicts (the independent checker of 11-27, not re-derived by kibo-fd). Stray items in 5 and 6 of 12 menu sessions, not quoted |
| The anchored gate was not run on Live at equal loudness | the pick, X, Y and Z logs (`flow-l1-pick+l3-flow-live-taponly*.jsonl`, `flow-l1-near-*.jsonl`) hold -10 dB cells only; `candidates/l1-loud/README.md` "At 0 dB no variant does anything (bystander-only time open 95 to 99%)" |
| With the first gate a deeper bar scored worse on the word layer; a shallower one cuts more of the bystanders' speech offline but has not run on Live | Deeper: `candidates/l1-loud/README.md` settings table, `depthDb` row (dev-slice sweep on the word layer, rule first in `SWEEP.md` 11-26 23:17, gate defaults of that time, before the first-turn anchor: 6 dB scored 0.522, 9, 12 and 15 dB 0.499 to 0.502). Shallower: `screen.ts` replay of the 64 flow mixes with no reach-back and the rise rule, kibo-fd 11-27 (`logs/screen-near-rise-depth-d4-d6-2026-11-27.txt`, `.json` with each variant's settings; rerun at `4c868c2` and equal to the first run): neighbour-only time inside the segments at -10 dB, small talk 25, 14 and 11% and menu talk 19, 13 and 11% at depth 6, 5 and 4; the customer's speech inside the segments 100% in the flow cells and 97 to 100% in the words cells (at depth 4 one trial needs the fallback). No Live run at depth 4 or 5. The first-turn gate alone shows the same (`logs/screen-pick-depth-d3-d6-2026-11-27.txt`: small talk 40, 26, 21, 19% and menu talk 25, 24, 23, 22% at depth 6, 5, 4, 3). `logs/screen-rise-near-trim-d6-2026-11-27.txt` is the rise and trim screen at depth 6 (not quoted) |
| Holding back the first turn delayed the first reply to a median 3.4 s from 1.4, no gain in right or stray items; dropped | `flow-l1-near-trim+l3-flow-live-taponly.jsonl` (X) and `flow-l1-near-trim+l3-flow-sizes-taponly.jsonl` (Y): first reply median 3,385 and 3,371 ms against the pick's 1,458 on the same trials (1,403 over every repeat); right 13 and 14 of 24 against 15; items 2 and 3 against 2 (kibo-fd scratch `xy.mts`, `pool.mts`; `logs/final-table-2026-11-27.md` section 4); dropped by kibo-59 on 11-27 |
| No reach-back once anchored stays: "No, thanks" heard in 21 of 24 against 8, with nothing else mixed in 19 against 7; stray items 2, 3 and 7 of 24 in three batches against 7 of 64 for the anchored gate | `flow-l1-near-rise+l3-flow-live-taponly.jsonl` (Z, `reachBack: "near"`) against `flow-l1-pick+l3-flow-live-taponly.jsonl` on the same trials: Live's input transcript of that turn, up to KIBO's first output, holds the customer's answer (kibo-fd scratch `noheard.py`; "with nothing else mixed in" is its "customer only" class, the answer and at most 3 other characters: Z 19, the pick 7; Z's other 2 hold neighbour words too, and in f0003 only the second half of the Korean answer; X 19, Y 20; the pick 19 of 64 over every repeat); items X 0, 1, 0, 1, Y 0, 2, 0, 1, Z 0, 4, 1, 2 (`pool.mts`); `logs/final-table-2026-11-27.md` sections 4 and 7; kept in the field build per kibo-59 on 11-27 |
| A neighbour who talks first can set the customer's level; the rule changed so louder speech raises it (no result quoted) | `candidates/l1-loud/README.md` `anchorRise` (I-471) paragraph (the rise fires mid-turn and inside a capped turn); seen on the bench (f0012 at depth 5, kibo-fd) and the field build; kibo-59 on 11-27: the rerun with this rule did not reach payment (0 of 12, the row on the simulated neighbour below), so the body quotes no success number for it |
| Three open-source approaches fell short on the word layer and are not in the product | `spikes/speaker-gate/candidates.md` J (licences: GTCRN MIT, Silero VAD MIT, CAM++ Apache-2.0, VoxLock Apache-2.0; G and J tables); no `live-l0-*`, `live-l2-*` or `live-c-*` log; `CLAUDE.md` (Gemini for all AI features) |
| GTCRN did not help: music alone cost few words, and where words were lost it lost more | `words-open-2026-11-26T13-51-41-631Z.json` `en/music@0` kept 97 without it; `words-l0-gtcrn-2026-11-26T14-19-03-314Z.json` `en/chat@0` kept 95 → 78 |
| Voice gate: Silero VAD with CAM++ | `spikes/speaker-gate/candidates.md` J2 (1.0 s windows every 0.25 s against the customer's sample) |
| Voice gate kept 22% of the words in English short answers ("Yes.", "That's all."): 2 of 12 answers, "Yes." in none of 6 | `words-l2-campp-2026-11-26T14-49-34-842Z.json` `en/short`: `keptPct` 22 = 4 of 18 words (`rows[].kept` over `customerTotal`), `trialsKept` 2 of 12 (w0030 and w0727, both "That's all."), the six "Yes." trials 0 (texts from `refs.json`) |
| VoxLock passed a lone bystander at full level | `words-c-voxlock-…` `silent+chat@0`, `silent+order@0`, `silent+read@0`: en 100, 99, 88; ko 95, 89, 98 (VoxLock alone; with a VAD after it, `words-c-voxlock-vad-2026-11-26T16-17-41-752Z.json`, en 95, 99, 86; ko 86, 83, 91, not quoted); signal check `spikes/speaker-gate/candidates/c-voxlock/logs/check-lone-bystander-20261126.txt` (gain 1.06 to 1.08 on a lone non-target voice; the author's `voxlock` package gives the same) |
| First no-press stack, a spoken confirmation accepted: a `confirmCheckout` with no customer speech in the 6 s before confirmed the checkout in 3 of 48 sessions, two after the recording ended | `flow-l1-loud+l3-flow-live.jsonl` (48 rows, -10 and 0 dB), every `confirmCheckout` (all `confirmCheckout:ok`) against `refs-flow.json` turn ends: f0045 en chat@-10 at 61.2 s (recording 61.0 s), f0040 ko chat@0 at 63.6 s (62.8 s), f0006 ko menu@-10 at 62.0 s (62.2 s), each 11.8 to 12.9 s after the last customer turn. Not counted: f0004 ko chat@-10 at 39.5 s, 3.3 s after the customer's "No, thanks" (v3 counted it, making 4), and f0041 and f0036, 1.8 and 0.8 s after the pay turn (kibo-fd 11-27; the independent checker's count agrees) |
| The rule's fresh utterance is anyone's; the payment still needs the kiosk's card action; the AI cannot complete it | `docs/ADR.md` ADR-005; `spikes/speaker-gate/README.md` Stage 2 "Safety" (the runner sends tool calls through the app's own `runCommand` and `machine.ts` `isConfirmed`, so the bench's rule is the app's) |
| Later batches on a tap-only bench server: `confirmCheckout` with no customer speech in the 6 s before in 5 of 176 sessions, one after the recording ended; refused there; likely accepted under production's rule | `CONFIRM_TAP_ONLY=1` logs, field `refusedConfirms[].customerTurnJustEnded` false: the pick's three logs (80) f0032 ko/menu 60.0 s (Live heard one Korean syllable, "neun"); `flow-l1-pick-taponly.jsonl` (24) f0025 en/menu 62.0 s "Let's get" (after its recording's end, 61.6 s), f0063 ko/chat 32.8 s; X (24) none; Y (24) f0004 ko/chat 47.0 s (Live heard one Korean syllable, "gang"); Z (24) f0063 ko/chat 59.5 s (kibo-fd `pool.mts` and an inline check, 11-27). A floor: refused confirms whose transcript is only neighbour words but that came after a customer turn (pick f0002, f0013 twice; run 2 f0019) are not counted. "Likely accepted": production takes a fresh utterance 1.5 s after the review opens (ADR-005) |
| The phone build's guard: the whole utterance came through the gate as the customer's, and a Gemini Flash-Lite check, which refuses if it fails, finds a confirmation and nothing else | `feat/field-open` commit `d0fc98a` message (`heard.own` from the phone; Flash-Lite through the app's text client with its Vertex fallback; fails closed; its 3 s limit not quoted, since the build has moved since); `src/lib/voice/heard.ts` on that branch (an utterance is the customer's only if every stretch of it was); `src/lib/agent/confirmCheck.ts` (read with `git show`, not from the worktree) |
| A neighbour's one-syllable fragment that made Live try to confirm on the bench, refused 5 of 5; the gate's condition alone would not have done it; 21 test sentences run 5 times each with no wrong answer | branch `feat/field-open`, commit `71f3c51`: `evidence/confirm-check.json` (105 calls, `wrongLines` 0; the fragment is the last row, `got` false 5 of 5), fixture 21 in `scripts/confirm-check.ts`. Re-derived by kibo-59 from the file on 11-27. That the gate's condition alone would pass it is kibo-1b's reading of the bench log (`heard.own` was true for that turn), not a separate test |
| Alone in local Live sessions, the customer confirmed by voice 6 of 6 times, a median of about 1.6 s after the last word | branch `feat/field-open`, commit `71f3c51`: `evidence/open-mic-live/field-build.jsonl`, condition `alone`, 6 of 6 paid, last word to paying 1,581 to 1,743 ms, median 1,610 ms (README in the same folder; `read.py` prints it). Headless Chromium, synthetic voice, no phone. Re-derived by kibo-59 on 11-27 |
| With a simulated neighbour 10 dB quieter talking from the tap: payment reached in 1 of 12; after two changes to the level rule the right order reached payment in 0 of 24; KIBO answered the neighbour before the customer's first line in 24 of 24 | branch `feat/field-open`, commit `71f3c51`: `evidence/open-mic-live/field-build.jsonl` (conditions `chat` and `menu`, 1 of 12 paid), `neighbour-first-rise-at-close.jsonl` (right cart 0 of 12; 2 sessions paid on a wrong cart, which the body does not count as the right order) and `neighbour-first-rise-mid-turn.jsonl` (paid 0 of 12, right cart 1 of 12 not paid); `liveSpokeBefore` at least 1 in all 24 rerun rows. The customer's first line starts on a fixed clock at about 6.4 s in the reruns. Re-derived by kibo-59 with `read.py` on 11-27 |
| Built and measured on test sentences and local sessions, not yet in a loud place | the rows above; `docs/TESTING.md` "Field test in a loud place" has not run |
| Field test protocol (three arms, 10 orders each, 20 to 30 cm, no headset, small talk then menu talk, no retry); the no-press arm being built for it this week (closing section); the FIELD-TEST line | `docs/TESTING.md` "Field test in a loud place"; branch `feat/field-open` (worktree `fast-hello`, head `372b6c3` at this edit), `phases/HANDOFF.md` "Next build: the field candidate" |
| Tap to hello 3.5 to 6.0 s, median 3.8, 5 runs, production, 11-20, headless Chrome, fake microphone, not a phone | `mentoring/tap-to-hello-20261120.json` (`helloRangeMs` 3458 to 6028, `helloMedianMs` 3813; its `about`: "Headless Chrome on a laptop … with a fake mic, not a real phone"; folder not in git) |
| The phone plays the greeting at the tap, tells Live it was said, connects underneath | `.claude/worktrees/fast-hello/docs/ARCHITECTURE.md` "The first hello (11-26)" items (1) to (3) and "The voice" (clips kept only when Live's own transcript equals the line) |
| Tap to first sound median 3,569 ms (12 runs) to 27 ms (10 runs), local server, microphone already allowed; otherwise the clip plays once the person allows it | `.claude/worktrees/fast-hello/evidence/tap-to-hello-local-baseline.json` `firstSoundMs` median 3,568.5 (2,565 to 4,505, 12 of 12 ok); `…-final.json` 27 (21 to 526, 10 of 10 ok); recomputed from `runs` 11-27. Condition: `.claude/worktrees/fast-hello/docs/plan/NUMBERS.md` line 29 ("the microphone already allowed"; "never beside the 11-20 … reading … as if the same measure": the body gives them in separate paragraphs, labelled production and local server) and ARCHITECTURE "The first hello" item (2) (otherwise "the moment the person allows it") |
| Live ready median 2.2 s, short of the 2 s target | `…-final.json` `setupCompleteMs` median 2,198 (2,040 to 4,094); baseline 2,845; target in `docs/GOAL.md` "Hard targets (proposed)" |
| Branch, not production, not measured on a phone | `.claude/worktrees/fast-hello/docs/plan/NUMBERS.md` line 29 ("Not production and not a phone"); `phases/HANDOFF.md` "First hello done (branch `feat/fast-hello`, head `58be670` …, not merged)" |
| Status of each piece: production the open microphone as submitted; hold to talk a candidate; no-press with the anchored gate being built for a phone test this week; instant hello a branch | kibo-59's brief and correction of 11-27; `phases/HANDOFF.md` "FINALE PREP", "Next build", "First hello done"; `git worktree list` 11-27 (worktree `fast-hello` on branch `feat/field-open`) |
| Nothing replaced, no hardware; the same way of talking at the next kiosk | `docs/PRD.md` "Why the phone", "Why not something else" |
| No vendor or store partnerships; virtual payment; no real phone in a loud room yet | `docs/PRD.md` "How KIBO gets onto a kiosk", "Out of MVP scope"; `docs/GOAL.md` section 2 "Missing" |
| Before the finale: phone test, choose, freeze | `docs/GOAL.md` section 1 "Constraints" (12-02 freeze), "Plan of 11-26" |
| Links: demo, GitHub, video (3 minutes) | `phases/HANDOFF.md` "SUBMITTED" (video 3:01); `README.md` |
| LinkedIn: on transcripts, small talk removed, a same-menu neighbour not; with a bystander 10 dB quieter, 45 of 80 sessions (32 recordings, replayed) right without a press against 64 for a perfect press | as the body rows above; 32 recordings = 8 per -10 dB cell × 4 cells (`refs-flow.json` `cells`) |

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
  under hold); the refused voice confirms that followed the customer's own pay words; the first reply running over
  "fries" with the first turn held back (X 10 and Y 5 of 24, the pick 3); the early checkout after "No, thanks" (Z 15 of
  24, the pick 5); where each neighbour's item was added (kibo-fd 11-27: after the review opened in 3 of the near stacks'
  12 item sessions and none of the pick's 7, every add within 3.3 s of a customer turn); the guard's check time (0.7 to
  0.9 s).
- Cut on 11-27 evening for length or because the final table replaced it: the first no-press stack matching a perfect
  hold on small talk 10 dB quieter (8 of 12 each; at n=20 the anchored gate's small-talk cells are 13 and 12 of 20
  against 16 and 15); "so a few misses are the bench's"; the 3-second sample; the 86 to 89% opening after a question
  (`candidates/l1-loud/README.md` "The pick (11-27)"); the bystander's "yes" 100% to 4% and 92% to 10%, the spoken
  voice-over to 0%, the customer kept 95% to 69% and 98% to 79% under a rival order, the Korean one-word answer 44% to
  100% with the state, Flash-Lite about 0.8 s and 49% against 30% (all in the v2 rows, `git show e761a7c:docs/plan/BLOG.md`);
  GTCRN 95% to 78% under a talker, the voice gate's lone-bystander leaks (en 1 to 15%, ko 18 to 36%), 39% at equal
  loudness and its Korean weakness, VoxLock's 28% against 64% at Korean overlap, its 88 to 100% and its 1.4 s of compute
  per second; the single-sentence "Yes. Yes, that's right." 5 of 6; "a tap on the card always works"; in Problem 2,
  "a clip of Live's own voice" and the smaller instruction (1,089 against 32,315 characters) not shortening setup.
- Cut on 11-27 night for the checker's fixes and length: "A kiosk stands in a queue" (Problem 1's opening); "To see a
  flow"; "with the customer-anchored gate" (closing section); "The customer speaks on a fixed clock, sometimes over KIBO's
  reply"; stray items in 5 and 6 of 12 menu sessions at equal loudness; the count of test sentences and the
  transliteration "gang" (the fragment is described, not quoted); the field protocol repeated in the FIELD-TEST line,
  and "The no-press arm is being built into the app for that test this week" in "How we will know" (the closing section
  keeps it); "the heart of this post"; "on Gemini Live" in the second table's caption.
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

1. **Naming models that are not Gemini:** the body now names the three open-source approaches we tried (GTCRN, Silero VAD
   with CAM++, VoxLock) and says plainly that none is in the product, which uses Gemini for every AI feature. Keep the
   names, or describe them without names because Google AI usage is 40% of the score?
2. **First-hello numbers in public:** the branch's own `docs/plan/NUMBERS.md` says "no public surface until measured
   on the deployed service and a phone", and the body publishes the local-server result (3,569 ms to 27 ms) labelled
   as a branch, not production, not a phone. Publish it so, or cut Problem 2 to the production reading and the plan?
3. **The no-press confirm rule:** "The spoken confirmation" describes the phone build's guard (the whole utterance came
   through the gate as the customer's, and a Gemini Flash-Lite check finds a confirmation and nothing else), built on
   `feat/field-open` and measured on test sentences and local Live sessions (kibo-59's numbers of 11-27), not in a loud
   place. Publish it so, or say only that the bench found the weakness?
4. **The optional kiosk paragraph:** keep or drop, and if kept, is the railway machine deployed and what is it called?
5. **Demo link and the 2-second target:** the body leads with the submitted Cloud Run `/demo` URL and states the
   2-second target, which `docs/GOAL.md` marks as proposed. Both right to publish?
