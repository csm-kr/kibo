# Top 50 technical blog (draft for Medium)

Not injected into harness steps (lives under `docs/plan/`). Draft written 2026-11-26 for the organizer's Top 50 blog
(Medium, due Sat 2026-11-28 12:00 IST = 15:30 KST; then a LinkedIn share and the link with a team photo). The owner
publishes. Status words in the body are true as of 2026-11-26: production runs the submitted open-microphone flow, hold
to talk is a candidate revision, speaker-aware listening is an experiment. Re-read them if any of that changes before
publishing.

## 1. Title options

1. **Your language, the kiosk's language** (pick)
   Subtitle: How KIBO turns a phone into a voice remote for the self-order kiosk already on the counter, and what we
   measured when the room got loud.
2. **0 of 12: what a noisy queue did to our voice ordering**
   Subtitle: Building KIBO on Gemini Live, Cloud Run and Firestore, then testing it against the cocktail-party problem.
3. **The phone is the remote**
   Subtitle: Voice ordering on a kiosk that stays unchanged, a payment the AI cannot complete, and an open problem with
   numbers.

Why 1: it is the one message every other surface carries (deck page 06 "Your language. Its language."), and the
subtitle promises both halves of the post.

## 2. Publishable body

Paste notes (not for publication):
- Paste everything between `BODY START` and `BODY END`.
- Medium may not render pasted raw Markdown (not checked): if it does not, paste from a rendered preview of this file.
- Medium has no tables (as far as we know): paste the crowd table as a picture, or retype it as a list.
- Upload each picture from `docs/images/` where its `![…]` line stands; the italic line under it is the caption.
- Fill or delete every `[[RESULT: …]]` and decide on `[[OPTIONAL-KIOSK: …]]` (section 4) before publishing.

<!-- BODY START -->

# Your language, the kiosk's language

### How KIBO turns a phone into a voice remote for the self-order kiosk already on the counter, and what we measured when the room got loud

*By Team malo (Sungmin Cho, Ye Seul Ahn). A Top 50 story from the Google Cloud AI Builder Cup 2026.*

![A spoken order on the phone, and the Korean kiosk filling the same cart](docs/images/hero.webp)
*Talk to your phone. The kiosk already there takes the order.*

A traveller stands at a burger kiosk in Seoul. The screen is in Korean, a set needs a side and a drink, and a queue is forming behind her. She scans the kiosk's QR code with her phone and says, in English: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." Two lines appear in the kiosk's cart, each with its own options. She never touched the screen, and the kiosk never left Korean.

That is KIBO. Your language on the phone, the kiosk's language on the counter. The phone is the remote, and the kiosk stays unchanged.

This post covers how it works on Google Cloud, and then the hardest problem we have not solved: a kiosk stands in a loud place, and a microphone hears everybody.

## The problem we chose

Our challenge is Sustainability & Social Impact. Self-order kiosks leave many people out: older adults, people with low vision, and travellers who cannot read the screen. In Korea, 17.9% of people aged 65 and over say they can order or check in at a kiosk (KIHASA, 2024, self-reported).

By 2030, 1 in 6 people in the world will be 60 or over, and at least 2.2 billion people have a near or distance vision impairment (both WHO). An estimated 1.52 billion international tourist arrivals were recorded in 2025 (UN Tourism). None of these three is a kiosk figure.

## What we built

There is no app to install. You scan the kiosk's QR code, a web page opens, and you talk. The kiosk fills its own cart while you watch, and payment stays where it was: your card, at the kiosk.

![The demo after a spoken "yes": kiosk, phone and the list of Gemini tool calls](docs/images/voice-to-card.webp)
*The live demo, with every Gemini tool call and the server's check.*

On our fictional burger kiosk, the full demo order (two sets with large fries, through payment) takes 24 taps by touch in an automated run. By voice it took 3 sentences and 2 taps on the kiosk's card step, in one recorded take on production with a synthetic voice. Both sides are counted until the card is paid.

The AI talks and writes in nine languages (Korean, English, Japanese, Chinese (Simplified), Spanish, Vietnamese, French, Thai and Indonesian), each tested with a typed turn. Spoken input is tested in English, Korean and Japanese so far. A second demo place, a fictional airport rail ticket machine, can show its own screens in Japanese, and an English voice order fills them.

[[OPTIONAL-KIOSK: The newest example is a subway-style ticket machine. Its screen is in Japanese and the fare depends on the destination station. A visitor says one sentence in their own language, naming where they are going, and the machine selects the ticket.]]

## How it works

![Architecture: phone and kiosk, Cloud Run, Firestore, Gemini Live, Gemini Flash and Vertex AI](docs/images/architecture.webp)
*Phone and kiosk are untrusted. Every change goes through one endpoint on Cloud Run.*

The phone talks to Gemini Live directly, with an ephemeral token (a one-use, short-lived key) from our server that pins the model, the instructions and the tools. Gemini Live uses function calling: the model answers with a structured request to run one of 11 tools, such as `addToCart` or `requestCheckout`. The whole menu sits in the instructions, so an item is added in one call.

Every change, from the AI or from a finger on the kiosk, is one `POST /api/command`:

```json
{
  "sessionId": "<session id>",
  "commandId": "<liveSessionId>:<functionCallId>",
  "type": "addToCart",
  "source": "voice",
  "args": {
    "itemId": "cheese_burger",
    "variant": "set",
    "qty": 1,
    "selections": {
      "side": ["fries_m"],
      "drink": ["zero_cola"],
      "ingredients": ["no_pickles"]
    }
  }
}
```

Tool arguments come from a browser, so the server trusts none of them. It validates the body with zod (a schema library), matches the actor token to the phone or the kiosk, ignores a repeated `commandId`, and checks the order's state machine and the menu data. Prices never come from the arguments. The change is applied in a Firestore transaction, and both screens read the session through server-sent events (one long HTTP response that pushes each change).

The stack:

- **Gemini Live** for voice with function calling; **Gemini Flash** for the text agent with the same tools.
- **Vertex AI** for a voice relay and text fallback when the API key cannot serve, and for the offline learner below.
- **Cloud Run** (`asia-northeast3`) for the Next.js app, its API and the voice relay.
- **Firestore** for one session document per order; **Secret Manager** for the Gemini API key.

## The AI cannot pay

![The order states: the AI may open the confirm card; your tap or a new "yes" confirms; the kiosk's card action pays](docs/images/safety.webp)
*The payment rule is enforced on the server.*

The AI can open the confirm card, but it cannot complete a payment. The server accepts `confirmCheckout` when the order is in the `confirming` state, the cart version matches the card, and there is a tap on the card or a new user utterance at least 1.5 seconds after the review opened. The `paid` state comes from the kiosk's card action and nowhere else.

We tested the rule by attack: on a local production build, 37 of 37 forged commands were refused and 5 of 5 legitimate ones were accepted. The rule also caught the model itself. In two of three voice cost runs, Gemini called `confirmCheckout` right after opening the review, and the server refused it.

## Kiosks with no integration

For a web kiosk that shares no menu data, KIBO Learn has Gemini on Vertex AI explore the kiosk's page once, offline, and write a skill (a catalog plus click recipes) that must pass its own test orders and a coverage audit. Every later order is a replay with no AI, checked against the kiosk's own total.

On two kiosks it had never seen, KIBO handled all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong (round 4, synthetic kiosks). The 2 handed to staff are orders where the skill's total differed from the kiosk's. Across all six never-seen kiosks so far, 60 orders gave 32 correct, 15 refused, 3 unsafe and 10 not learned, and the skill's total differed in 6 of the 35 that reached one.

## Where it stands in quiet

![96 of 98 test cases passed; the kiosk moves 2.1 s after you stop talking; first audio 3.2 s](docs/images/results.webp)
*Measured in quiet, with team-written cases.*

The text agent passed 96 of 98 team-written cases. By voice, the kiosk highlights the new line a median 2,118 ms after the end of speech (7 of 8 runs, a synthetic voice on a laptop, not a real phone). The spoken reply starts at a median 3,172 ms. Our target was 2 seconds, and we missed it.

## Then we made the room loud

A kiosk stands in a queue, and the finale on December 4 in Singapore is a live demo. On November 22 we measured the cocktail-party problem: several voices reach one microphone, and the listener has to follow one of them.

**The setup.** Bystanders are Gemini TTS (text-to-speech) voices saying small talk and a rival order from the same menu. A test script plays the phone's part: it mixes them digitally with the customer's order and sends the mix in real time to the real Gemini Live. A run is right when the AI did nothing until the customer finished, then reacted within 5 seconds, and the cart holds the two cheeseburger sets and nothing else. Levels are relative to the customer: at 0 dB a bystander is as loud as the customer, and negative numbers are quieter.

Every number below comes from synthetic voices in a digital mix, three runs per cell unless we say otherwise. No room, no phone microphone, no echo cancellation.

| Bystanders vs. customer | Open microphone (today's flow) | Hold to talk (simulated hold) |
|---|---|---|
| none | 3 of 3 | not run |
| -25 dB | 1 | not run |
| -20 dB | 0 | not run |
| -15 dB | 0 | 3 |
| -10 dB | 0 | 3 |
| -5 dB | 0 | 2 |
| 0 dB | not run | 2 |

*English orders right, of 3 runs per cell.*

**The open microphone failed.** This is the flow in production today. From bystanders 20 dB quieter up to 5 dB quieter, 0 of 12 English orders came out right. Our Live configuration ends a turn after one second of silence, and with people talking it never hears one. The transcript mixes the bystanders' words into the customer's, and the AI adds the bystander's spicy chicken burger to the cart.

The review was worse. With the confirm card open and the customer silent, a bystander's "Yes. Yes, that's right." moved the order to the `paying` state in 10 of 15 runs across five loudness levels. Nothing is paid at that point, because the card still has to go into the kiosk, but no stranger should be able to take that step.

**Hold to talk works, up to a point.** The phone sends the microphone while a button is held and nothing otherwise. The script simulates the hold, from 0.2 seconds before the customer's speech to 0.2 seconds after it. Across English and Korean, 22 of 24 orders were right with bystanders up to as loud as the customer, and the AI reacted a median 1,399 ms after the last word, against 1,158 ms for the open microphone in quiet (a person's timing is not in these numbers). With bystanders louder than the customer it fell to 3 of 12, and a longer order of five holds reached `paying` in 1 of 3 sessions at 0 dB. A bystander who talks during a hold is still heard.

Hold to talk is built and waits on a candidate revision that takes no traffic; it is not in production. It also asks every customer to learn a gesture, and KIBO exists to remove things to learn.

**Asking Gemini to follow one voice gave no gain.** We told Gemini Live that the closest, clearest voice is the one that orders, and in a second variant played it a clean sentence in the customer's voice. With a bystander as loud as the customer during every hold, the order reached `paying` in 2 of 6 sessions with no rule, 1 of 6 with the rule, and 1 of 6 with the rule and the sample. An instruction checks no voice.

**Gemini Embedding 2 hears the words, not the voice.** An embedding is a vector of numbers that summarises a clip. If one person's clips sat close together, the phone could gate on that. We embedded 48 clips, six order sentences in eight TTS voices. Mean cosine similarity (1 means two clips point the same way) was 0.623 for one voice saying different words and 0.925 for different voices saying the same words. A clip's nearest neighbour was another voice saying the same words in 48 of 48 cases, and the same voice in 0 of 48.

## The experiment running now

These results split the problem in two. One part is turns: bystanders who talk between the customer's sentences keep the turn open. A gate that passes the customer's stretches fixes that, and a perfect hold is its ceiling. The other part is overlap: a bystander talks at the same moment as the customer, and no gate removes that. It takes extraction (a model that pulls one enrolled voice out of the mixture) or a model that can say which words belong to whom.

The judge comes before the candidates. Benchmark v2 adds real recorded voices from public read speech, in English and Korean, and enrols the customer from 3 seconds of speech. Its conditions include overlap at +5, 0 and -5 dB, four bystanders at once, and music under the customer. It scores the words that get through and the order itself on real Gemini Live, 20 runs per cell, next to three baselines: today's open microphone, a perfect hold, and the customer's clean audio.

Three candidates run on it:

- **A, Gemini alone.** Gemini Flash hears the customer's sample and the mixture and writes the customer's words for Live.
- **B, a gate.** A small speaker-verification model (it scores whether two clips are the same voice) presses and releases the hold for the customer.
- **C, extraction.** A target-speaker extraction model cleans the audio before Live hears it.

We wrote the pass line before any run. At 0 dB overlap, the order is right in 18 or more of 20 runs and bystander items are added in at most 1. The customer alone does no worse than today. The added delay stays within 0.5 seconds for B and C and 1.5 seconds for A.

Results at 0 dB overlap, orders right of 20:

- Open microphone: [[RESULT: baseline `open`, live layer, cells en/sir0 and ko/sir0: orders right of 20 each, and runs with bystander items added]]
- Perfect hold: [[RESULT: baseline `hold-oracle`, live layer, cells en/sir0 and ko/sir0: orders right of 20 each, and runs with bystander items added]]
- Clean customer audio: [[RESULT: baseline `customer-oracle`, live layer, cells en/sir0 and ko/sir0: orders right of 20 each]]
- Candidate A: [[RESULT: candidate A, live layer, en/sir0 and ko/sir0: orders right of 20, runs with bystander items added, median added delay in ms]]
- Candidate B: [[RESULT: candidate B, live layer, en/sir0 and ko/sir0: orders right of 20, runs with bystander items added, median added delay in ms]]
- Candidate C: [[RESULT: candidate C, live layer, en/sir0 and ko/sir0: orders right of 20, runs with bystander items added, median added delay in ms]]

Several voices and music: [[RESULT: best candidate against baseline `open`, live layer, cells `babble` and `music`, en and ko: orders right of 20]]

Words: [[RESULT: word layer, cell sir0, best candidate against baseline `open`: share of customer words kept and count of bystander words leaked, with the number of trials]]

[[RESULT: verdict in one or two sentences: which candidate met the pass line on which cells, or that none did; say again that these are recorded and synthetic voices in a digital mix, not a phone in a room]]

The next step was also written in advance. A candidate that clears the line goes into the app behind a setting, for a phone test in a loud place with a teammate talking over the customer. If none does, hold to talk goes on stage. B and C use models that are not Gemini, and the product uses Gemini for every AI feature, so shipping one is a decision we have not made. In every mode the review still needs a tap or a hold, and a voiceprint would never be stored.

## What this could change, and what comes next

A store that adopts KIBO keeps its kiosk: nothing is replaced and no hardware is added. The person in front of it keeps their phone, their language and their text size, and the same way of talking works at the next kiosk.

There are no vendor or store partnerships yet, payment in the demo is virtual, and a real phone in a real loud room is still ahead of us. Before the finale we finish the benchmark, run that phone test, and freeze the build.

- Demo: https://kibo-407514467119.asia-northeast3.run.app/demo (short address: kibo-2026.web.app)
- Code: https://github.com/csm-kr/kibo
- Video (3 minutes): https://youtu.be/2jPeDGbLsQM

Your language, the kiosk's language. We will report the loud-room numbers either way.

<!-- BODY END -->

## 3. LinkedIn post draft

Under 1,300 characters with the link placeholders. In LinkedIn, type `@` and pick the Google Cloud and Hack2skill
pages so the tags become real mentions.

```text
We are Team malo, one of the Top 50 teams in the Google Cloud AI Builder Cup 2026, and we have published the story of KIBO.

KIBO lets you order at a self-order kiosk by talking to your own phone, in your own language. Gemini Live turns each sentence into function calls, a Cloud Run server checks every call against the kiosk's own menu and applies it in a Firestore transaction, and the kiosk fills its own cart. The AI can open the confirm card, but it cannot complete a payment.

The post also covers what went wrong. With bystanders talking near the phone, our open microphone got 0 of 12 test orders right (synthetic voices, digital mix). Telling Gemini Live to follow one voice gave no gain. Hold to talk, a tested candidate that is not in production yet, works with bystanders up to as loud as the customer. Now we are testing speaker-aware listening on a crowd benchmark, and the numbers are in the post.

Read: <Medium link>
Try: https://kibo-407514467119.asia-northeast3.run.app/demo
Code: https://github.com/csm-kr/kibo

@Google Cloud @Hack2skill
#Top50Stories #Hack2skill #AIBuilderCup #GoogleCloud
```

## 4. Open slots

Every slot in the body, in order. A `[[RESULT]]` is filled from the benchmark's own output
(`spikes/speaker-gate/bench/score.ts`, logs `spikes/speaker-gate/logs/live-<candidate>.jsonl`), never from memory. If a
number does not exist by Saturday, delete the line and say in the verdict that the cell was not run.

| # | Slot | What goes in | From |
|---|---|---|---|
| 1 | `[[OPTIONAL-KIOSK: …]]` ("What we built") | Keep the paragraph (without the brackets) only if the subway-style ticket machine is in the deployed demo when the post goes out; otherwise delete it. Check its wording against the real kiosk: screen language, how the fare is chosen, and that its name and look copy no real operator | No repo source on 11-26; written from the owner's brief |
| 2 | `[[RESULT: baseline open …]]` | Orders right of 20 at en/sir0 and ko/sir0; runs with bystander items added | live layer, candidate `open` |
| 3 | `[[RESULT: baseline hold-oracle …]]` | Same two cells and measures | live layer, candidate `hold-oracle` |
| 4 | `[[RESULT: baseline customer-oracle …]]` | Orders right of 20 at en/sir0 and ko/sir0 | live layer, candidate `customer-oracle` |
| 5 | `[[RESULT: candidate A …]]` | Orders right of 20, runs with bystander items added, median added delay (ms) | live layer, method A, en/sir0 and ko/sir0 |
| 6 | `[[RESULT: candidate B …]]` | Same | live layer, method B |
| 7 | `[[RESULT: candidate C …]]` | Same | live layer, method C |
| 8 | `[[RESULT: best candidate against baseline open, babble and music …]]` | Orders right of 20 in `babble` and `music`, en and ko | live layer |
| 9 | `[[RESULT: word layer, cell sir0 …]]` | Share of customer words kept, bystander words leaked, number of trials | word layer (`gemini-3.8-flash` transcriber pinned in `score.ts`) |
| 10 | `[[RESULT: verdict …]]` | One or two sentences: who met the pass line, or that none did | `adoptVerdict` output and `docs/GOAL.md` section 5 |

If a candidate is not run at all, delete its bullet and its line in "Three candidates run on it", and change "Three" to
the real count. If the benchmark's conditions or baselines change before it is frozen, correct the paragraph that
starts "The judge comes before the candidates" (it was written from files still in progress on 11-26).

## 5. Facts ledger (not for publication)

Every number or capability claim in the body, in reading order. "Own sum" means added from the cells of the named table.

| Claim in the body | Source |
|---|---|
| Top 50; finale 2026-12-04 Singapore; a live demo | `docs/GOAL.md` section 1 and answer sheet rows A1 and "Finale format"; `phases/HANDOFF.md` lines 7, 9 |
| Team malo: Sungmin Cho, Ye Seul Ahn; challenge Sustainability & Social Impact | `README.md` line 315; `docs/plan/SUBMISSION.md` "Hard rules", "Form" |
| Opening scene: Korean screen, English speech, two lines with different options | `docs/PRD.md` "Demo scenario" step 4 and "Killer scene"; the sentence word for word from `spikes/speaker-gate/bench/sources.ts` `HERO.en` |
| A set needs a side and a drink | `docs/PRD.md` "Covering real kiosk complexity" |
| 1 in 6 by 2030; at least 2.2 billion; estimated 1.52 billion arrivals in 2025; "none a kiosk statistic" | `docs/plan/SOURCES.md` S44, S45, S46; `README.md` "Why it matters" |
| 17.9% of people 65+ say they can order or check in at a kiosk (KIHASA 2024, self-reported) | `docs/plan/SOURCES.md` S16 |
| No install; QR; the kiosk fills its own cart; pay by card at the kiosk | `docs/PRD.md` "Core features"; `README.md` "How it works" |
| 24 taps by touch, automated run, the order with large fries, counted until the card is paid | `docs/plan/NUMBERS.md` "Touch hero order" (`evidence/touch-hero-efficient.json`); `docs/plan/DECK_FACTS.md` slot 12 ("Touch vs talk": the same order as the talk side, with large fries) |
| 3 sentences and 2 taps, one recorded take on production, synthetic voice, counted until the card is paid | `docs/plan/NUMBERS.md` "Voice-only hero order (recorded take)" |
| Nine AI languages, each tested with a typed turn | `docs/plan/NUMBERS.md` "Languages" (`evidence/live-languages.json`, 18/18) |
| Spoken input tested in English, Korean, Japanese; six others not tested by speech | `docs/plan/NUMBERS.md` "Languages" |
| Airport rail ticket machine (fictional) with Japanese screens; an English voice order fills them | `docs/plan/DECK_FACTS.md` slot 5 (ticket machine row), slot 7; `docs/PRD.md` "Kiosks in the demo" |
| `[[OPTIONAL-KIOSK]]` paragraph | **No repo source** (the owner's brief of 11-26 only); no number in it |
| Direct Gemini Live; one-use ephemeral token; model, instructions and tools pinned | `docs/ADR.md` ADR-003; `docs/plan/DECK_FACTS.md` slot 8 |
| 11 tools; whole menu in the instructions; an item added in one call | `docs/ARCHITECTURE.md` "Agent tools (11)"; `docs/ADR.md` ADR-004 "Why" |
| JSON excerpt: envelope fields and the `commandId` form | `docs/ARCHITECTURE.md` "Endpoints", `POST /api/command`; `src/lib/commands/schemas.ts` lines 10 to 47 |
| JSON excerpt: `cheese_burger`, `set`, `side`/`fries_m`, `drink`/`zero_cola`, `ingredients`/`no_pickles` | `data/kiosks/malo.json` (item at line 103; groups at lines 137, 196, 253). An illustration of one call, not a captured request (`fries_m` is an `optionId` at line 154) |
| Server checks: zod, actor token, repeated `commandId`, state machine, catalog; prices from menu data; Firestore transaction | `docs/ARCHITECTURE.md` "`/api/command` processing order" steps 1 to 8 |
| Server-sent events for both screens | `docs/ADR.md` ADR-010 |
| Stack list (Gemini Live, Gemini Flash, Vertex AI relay, fallback and learner, Cloud Run `asia-northeast3`, Firestore, Secret Manager) | `README.md` "Built on Google Cloud", "Google Cloud services" |
| The AI can open the confirm card but cannot complete a payment; `confirming`, cart version, tap or new utterance 1.5 s after the review; `paid` from the kiosk's card action | `docs/ADR.md` ADR-005; `README.md` "What the server enforces" |
| 37 of 37 forged commands refused, 5 of 5 legitimate accepted, local production build | `docs/plan/NUMBERS.md` "Forged commands refused" |
| In two of three voice cost runs the model called `confirmCheckout` right after the review and the server refused it | `docs/plan/NUMBERS.md` "Cost per hero order, voice" (`evidence/cost-per-order.json` `voice.runs`) |
| KIBO Learn: Gemini on Vertex AI, once, offline; skill = catalog + click recipes; self-test orders and a coverage audit; replay without AI; the kiosk's own total checked | `docs/ADR.md` ADR-007; `docs/KIBO_LEARN.md` "Learning loop"; `README.md` "KIBO Learn" |
| "On two kiosks it had never seen … (round 4, synthetic kiosks)." word for word; the 2 handed to staff are total mismatches | `docs/plan/NUMBERS.md` "KIBO Learn, never-seen kiosks, latest learner (round 4)" (R-014) |
| Six kiosks, 60 orders: 32 correct, 15 refused, 3 unsafe, 10 not learned; total differed in 6 of 35; earlier rounds rougher | `docs/plan/NUMBERS.md` "KIBO Learn, every never-seen kiosk so far" (per-round counts in the same row) |
| 96 of 98 team-written cases | `docs/plan/NUMBERS.md` "Text agent evaluation" |
| End of speech to kiosk highlight median 2,118 ms, 7 of 8 runs, synthetic voice on a laptop, not a real phone | `docs/plan/NUMBERS.md` "Voice hero order, end of speech → kiosk highlight" |
| Spoken reply at a median 3,172 ms; target 2 s missed | `docs/plan/NUMBERS.md` "Voice hero order, end of speech → first AI audio" |
| Picture `results.webp` shows 96 of 98, 2.1 s, 3.2 s | `README.md` line 69 (its alt text) |
| Measured 11-22; Gemini TTS bystanders; small talk and a rival order; a script (`run.ts`) mixes and sends as the phone does; real Gemini Live in real time; definition of "right" (reaction within 5 s); meaning of level | `spikes/crowd-voice/README.md` "Method" |
| Synthetic voices, digital mix, 3 runs per cell; no room, phone microphone or echo cancellation | `spikes/crowd-voice/README.md` "Limits" |
| Table, open microphone column (3, 1, 0, 0, 0, 0) | `spikes/crowd-voice/README.md` "Results", table "Order, English, right of 3" (Shipped) |
| Table, hold to talk column (3, 3, 2, 2); the hold simulated from 0.2 s before to 0.2 s after the customer's speech | same file, hold-to-talk paragraph and table (`--ptt`), English column |
| 0 of 12 English orders from -20 to -5 dB | own sum of the Shipped column (4 cells × 3 runs) |
| Turn never ends without 1 s of silence; transcript mixes words; bystander's spicy chicken burger added | same file, "How the shipped settings fail"; 1,000 ms end of speech: `docs/ARCHITECTURE.md` "Recognition settings" |
| A bystander's "Yes. Yes, that's right." moved the order to `paying` in 10 of 15 (five levels, -20 to 0 dB, 3 runs each); nothing paid until the card | same file, "Review" in Method and its table (own sum 1+2+3+2+2); `docs/GOAL.md` row B2 |
| Hold to talk 22 of 24 across English and Korean up to 0 dB | own sum of the `--ptt` table (English 3+3+2+2, Korean 3+3+3+3) |
| 1,399 ms (hold, 22 runs) against 1,158 ms (open microphone, quiet, 7 runs); a person's timing not in these numbers | same file, "End of the user's speech to the AI's first reaction" |
| Bystanders louder than the customer: 3 of 12 | same file, `--ptt-end` at +5 and +10 dB (English 0, 0; Korean 2, 1); `docs/ARCHITECTURE.md` "Hold to talk" |
| Five holds reached `paying` in 1 of 3 sessions at 0 dB | same file, `multi.ts` table, row "0 dB, Gemini API"; `docs/GOAL.md` row A2 |
| Hold to talk built, on a candidate at 0% traffic, not in production; production is the open-microphone flow | `phases/HANDOFF.md` lines 11, 12 |
| Hold costs a gesture | `docs/ADR.md` ADR-014 "Why" |
| "Only my voice": rule, rule + sample; at 0 dB `paying` 2, 1, 1 of 6; an instruction, not verification | `spikes/crowd-voice/README.md` "'Only my voice' told to Gemini Live" |
| Gemini Embedding 2: 48 clips, six sentences, eight TTS voices; 0.623 and 0.925; 48 of 48 and 0 of 48 | `spikes/speaker-gate/README.md` |
| Two parts (turns, overlap); a gate's ceiling is hold; overlap needs extraction or attribution | `docs/GOAL.md` section 5 "Two problems, two tools" |
| Benchmark v2: real recorded voices (public read speech, English and Korean); enrolment from 3 s; overlap at +5, 0, -5 dB; word measures; real Gemini Live, 20 runs per cell; several bystanders and music | `docs/GOAL.md` section 5 stage 1 |
| "Four bystanders at once" | `spikes/speaker-gate/bench/build.ts` (`babble`: "Four people at once"); **untracked, in progress on 11-26: re-check before publishing** |
| Three baselines: open microphone, perfect hold (ceiling of any gate), the customer's clean audio | `spikes/speaker-gate/bench/baselines.ts` header; **untracked, in progress** |
| Candidates A, B, C described by kind | `docs/GOAL.md` section 5 stage 2 |
| Pass line: 18 or more of 20 at 0 dB, bystander items in at most 1, alone no worse, delay 0.5 s (B, C) and 1.5 s (A) | `docs/GOAL.md` section 5 "Adopt" |
| If a candidate clears it: behind a setting, phone test in a loud place with a teammate talking over; else hold to talk on stage | `docs/GOAL.md` section 5 stage 3 and "Stop" |
| B and C are not Gemini; Gemini for every AI feature; not decided | `docs/GOAL.md` section 4 (reopened 11-25) and stage 3; project `CLAUDE.md` |
| Review needs a tap or a hold in every mode; a voiceprint is never stored | `docs/SECURITY.md` "Speaker-aware listening"; `docs/ADR.md` ADR-014 |
| Nothing replaced, no hardware; same way of talking at the next kiosk; language and text size | `docs/PRD.md` "Why the phone", "Why not something else" |
| No vendor or store partnerships yet; virtual payment | `docs/PRD.md` "How KIBO gets onto a kiosk", "Out of MVP scope"; `README.md` "Known limits" |
| No real phone in a real loud room measured yet | `docs/GOAL.md` section 2 "Missing" |
| Finish the benchmark, phone test, freeze before the finale | `docs/GOAL.md` section 1 "Constraints" (12-02 freeze), section 5 stage 3 |
| Links: demo, GitHub, video (3 minutes) | `phases/HANDOFF.md` "SUBMITTED"; `README.md` lines 9, 87 |

Left out on purpose: third-party numbers in `spikes/speaker-gate/candidates.md` (the authors' own, not run by us), the
names of non-Gemini candidate models, revision names, cost per order, Korean law, the loudness gate (helped only down
to bystanders 15 dB quieter, and lost the customer's own quiet "yes"), the first-press fix (four times real time), the 2,523 ms Gemini Flash transcription round trip, and the 1,590 ms hold-to-talk highlight (it includes 0.7 s
before the release and is not in `evidence/`).

## 6. Questions for the owner

1. **The team photo:** does one exist with both members? The organizer's form needs it with the Medium link.
2. **Public evidence:** `spikes/crowd-voice/` and `spikes/speaker-gate/` are on local branches only (HANDOFF: nothing
   pushed), so the body does not say "the logs are in the repo". Push them before Saturday so a judge can check, or
   leave it as it is?
3. **Naming non-Gemini models:** candidates B and C are described by kind only. Name the models if one of them wins, or
   keep them unnamed because Google AI usage is 40% of the score?
4. **The optional kiosk paragraph:** keep or drop, and if kept, what is the machine called and is it deployed?
5. **Demo link:** the body uses the submitted Cloud Run `/demo` URL with the short address beside it. The README's top
   line links `kibo-2026.web.app/demo` instead. Which should the blog lead with?
