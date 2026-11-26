# Top 50 technical blog (draft v1 for Medium)

Not injected into harness steps (lives under `docs/plan/`). v0 was written 2026-11-26 evening; this is v1, reshaped the
same night to the owner's direction of 11-26 23:40 (two problems: hearing the customer without a press, by meaning
flow, and the first hello). For the organizer's Top 50 blog (Medium, due Sat 2026-11-28 12:00 IST = 15:30 KST; then a
LinkedIn share and the link with a team photo). The owner publishes.

Status words in the body are true as of 2026-11-26: production runs the submitted open-microphone flow, hold to talk is
a candidate revision that takes no traffic, listening without a press is an experiment in progress, and the faster
first hello is in progress on a branch with no result. Re-read them if any of that changes before publishing.

The body is publishable as it stands. Everything unmeasured is written as "being measured", "not measured" or
"expected, not measured". Later results go into one fenced block (section 4).

## 1. Title options

1. **Your language, the kiosk's language** (pick)
   Subtitle: A phone as the voice remote for the kiosk already on the counter, and what we measured so it hears only you,
   without a button.
2. **0 of 6: we built the judge before the fix**
   Subtitle: Voice ordering on Gemini Live, Cloud Run and Firestore, and a crowd benchmark that showed where a loud
   queue breaks it.
3. **The phone is the remote**
   Subtitle: Voice ordering on a kiosk that stays unchanged, a payment the AI cannot complete, and two open problems
   with numbers.

Why 1: it is the one message every other surface carries (deck page 06 "Your language. Its language."), and the
subtitle adds the new half: it should hear only you without a button.

## 2. Publishable body

Paste notes (not for publication):
- Paste everything between `BODY START` and `BODY END`.
- Medium may not render pasted raw Markdown (not checked): if it does not, paste from a rendered preview of this file.
- Medium has no tables (as far as we know): paste the baseline table as a picture, or retype it as a list.
- Upload each picture from `docs/images/` where its `![…]` line stands; its text is the picture's description and can
  serve as the caption.
- Two fenced blocks sit in the body (section 4). Before publishing, each is either deleted whole (both fence lines and
  what is between them) or kept with its two fence lines removed. The text around them reads correctly either way.
- Where the six topics the organizer asks for sit: problem ("The problem we chose"); solution and how it works ("What
  we built", "How it works"); stack and Google Cloud tools ("The stack" list); technical approach ("How it works", "The
  AI cannot pay", "Kiosks with no integration"); challenges and how we address them ("Challenge 1", "Challenge 2");
  potential impact ("What this could change, and what comes next").

<!-- BODY START -->

# Your language, the kiosk's language

### A phone as the voice remote for the kiosk already on the counter, and what we measured so it hears only you, without a button

*By Team malo (Sungmin Cho, Ye Seul Ahn). A Top 50 story from the Google Cloud AI Builder Cup 2026.*

![A spoken order on the phone, and the Korean kiosk filling the same cart](docs/images/hero.webp)

A traveller stands at a burger kiosk in Seoul. The screen is in Korean, a set needs a side and a drink, and a queue is forming behind her. She scans the kiosk's QR code with her phone and says, in English: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider." Two lines appear in the kiosk's cart, each with its own options. She never touched the screen, and the kiosk never left Korean.

That is KIBO. Your language on the phone, the kiosk's language on the counter. The phone is the remote, and the kiosk stays unchanged.

This post covers how it works on Google Cloud, and the two problems we are working on before the finale: hearing only you in a loud place, without a button, and a faster hello.

## The problem we chose

Our challenge is Sustainability & Social Impact. Self-order kiosks leave many people out: older adults, people with low vision, and travellers who cannot read the screen. In Korea, 17.9% of people aged 65 and over say they can order or check in at a kiosk (KIHASA, 2024, self-reported).

By 2030, 1 in 6 people in the world will be 60 or over, and at least 2.2 billion people have a near or distance vision impairment (both WHO). Neither is a kiosk figure.

## What we built

There is no app to install. You scan the kiosk's QR code, a web page opens, and you talk. The kiosk fills its own cart while you watch, and payment stays where it was: your card, at the kiosk.

![The demo after a spoken "yes": kiosk, phone and the list of Gemini tool calls](docs/images/voice-to-card.webp)

On our fictional burger kiosk, the full demo order (two sets with large fries, through payment) takes 24 taps by touch in an automated run. By voice it took 3 sentences and 2 taps on the kiosk's card step, in one recorded take on production with a synthetic voice.

The AI talks and writes in nine languages, each tested with a typed turn; spoken input is tested in English, Korean and Japanese so far. A second demo place, a fictional airport rail ticket machine, shows Japanese screens that an English voice order fills.

[[OPTIONAL-KIOSK START]]

The newest example is a subway-style ticket machine. Its screen is in Japanese and the fare depends on the destination station. A visitor says one sentence in their own language, naming where they are going, and the machine selects the ticket.

[[OPTIONAL-KIOSK END]]

## How it works

![Architecture: phone and kiosk, Cloud Run, Firestore, Gemini Live, Gemini Flash and Vertex AI](docs/images/architecture.webp)

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

The AI can open the confirm card, but it cannot complete a payment. The server accepts `confirmCheckout` when the order is in the `confirming` state, the cart version matches the card, and there is a tap on the card or a new user utterance at least 1.5 seconds after the review opened. The `paid` state comes from the kiosk's card action and nowhere else.

We tested the rule by attack: on a local production build, 37 of 37 forged commands were refused and 5 of 5 legitimate ones accepted. It also caught the model itself: in two of three voice cost runs, Gemini called `confirmCheckout` right after opening the review, and the server refused it.

## Kiosks with no integration

For a web kiosk that shares no menu data, KIBO Learn has Gemini on Vertex AI explore the kiosk's page once, offline, and write a skill (a catalog plus click recipes). Every later order is a replay with no AI, checked against the kiosk's own total. On two kiosks it had never seen, KIBO handled all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong (round 4, synthetic kiosks). The 2 handed to staff are orders where the skill's total differed from the kiosk's. Across all six never-seen kiosks so far, 3 of 60 orders were unsafe.

## Where it stands in quiet

![96 of 98 test cases passed; the kiosk moves 2.1 s after you stop talking; first audio 3.2 s](docs/images/results.webp)

The text agent passed 96 of 98 team-written cases. By voice, the kiosk highlights the new line a median 2,118 ms after the end of speech (7 of 8 runs, a synthetic voice on a laptop, not a real phone). The spoken reply starts at a median 3,172 ms, past our 2-second target.

## Challenge 1: hearing only you, without a button

A kiosk stands in a queue, and the finale on December 4 in Singapore is a live demo. Our goal is that you talk without pressing anything, and KIBO still tells you apart from the people around you.

**Where we started.** On November 22 we mixed synthetic bystander voices under the customer's order and sent the mix to the real Gemini Live. With bystanders 20 to 5 dB quieter than the customer, the open microphone, the flow in production today, got 0 of 12 English orders right. Our Live configuration ends a turn after one second of silence, and with people talking that second never comes.

Hold to talk (the phone sends the microphone while a button is held) got 22 of 24 English and Korean orders right with bystanders up to as loud as the customer, in a simulated hold. It is built and measured but not in production: it waits as a candidate that takes no traffic. It costs every customer a gesture, so it is our safety net.

Telling Gemini Live whose voice counts gave nothing: in hold-to-talk sessions with a bystander as loud as the customer, the order reached the payment step in 2 of 6 without the rule and 1 of 6 with it.

**The judge came before the fix.** We froze a benchmark so every idea is scored on the same set: 1,320 trials in 98 cells. Each trial is a digital mix around a customer: small talk, a rival order from the same menu, four people at once, or music, from 15 dB quieter than the customer to 5 dB louder. A candidate gets the mix and a 3-second sample of the customer.

Two layers score it. In the word layer, Gemini Flash transcribes what a candidate lets through, and we count the customer's words kept and the bystanders' words leaked (12 trials per cell). In the order layer, the real Gemini Live hears it, and a run is right when the AI waits for the customer to finish, reacts within 5 seconds, and the cart holds the two cheeseburger sets and nothing else.

Limits for every number below: in the order layer the customers are Gemini TTS (text-to-speech) voices; recorded read speech (LibriSpeech and Zeroth-Korean, CC BY 4.0) appears in the word layer and among the four talkers. It is a digital mix: no room, no phone microphone, no echo cancellation. The order layer has 6 runs per cell so far, which is a screen; our pass line needs 20.

| Around the customer | Open microphone, English | Open microphone, Korean | Perfect hold, English | Perfect hold, Korean |
|---|---|---|---|---|
| nobody | 5 | 6 | 6 | 6 |
| small talk, 10 dB quieter | 0 | 0 | 6 | 6 |
| small talk, as loud | 0 | 0 | 4 | 4 |
| a rival order, as loud | 0 | 0 | 4 | 4 |
| four people at once, as loud | 0 | 0 | 1 | 3 |
| instrumental music, as loud | 4 | 5 | 6 | 6 |
| voice-over on music, as loud | 1 | 0 | 6 | 5 |

*Orders right, of 6 runs per cell on Gemini Live.*

"Perfect hold" is an oracle: a script holds the button over the customer's speech, using the answer key. It is the ceiling for any press and any gate.

**1. The open microphone fails whenever anyone talks.** It got 0 of 6 in every cell with small talk, a rival order or four people, in both languages, even with the bystander 10 dB quieter. In that quieter cell the English transcript kept 100% of the customer's words and 52% of the bystander's.

**2. Even a perfect press is beaten by overlap.** A perfect hold was right in 6 of 6 with a bystander 10 dB quieter, 4 of 6 at equal loudness, and 1 and 3 of 6 with four people. Whoever talks during the customer's sentence is inside the held audio: at equal loudness 55% of the bystander's words came through (English, word layer).

**3. Music matters less than voices.** With instrumental music as loud as the customer, the open microphone was right in 4 and 5 of 6, against 5 and 6 with nobody around. A voice-over on the music brought it down to 1 and 0. That cell is a spoken stand-in for a song; real singing is not measured.

**4. A noise-removal library did not help, and it can hurt.** GTCRN, a small open-source speech enhancer, ran before the transcriber (English, word layer; not run on Live). The customer's words kept went from 97% to 98% under music as loud as the customer (91% to 96% under quieter music, 94% to 90% under louder), 73% to 72% under the voice-over, and 95% to 78% under a talker as loud as the customer.

The review has the same weakness: on the open microphone, a bystander's "Yes. Yes, that's right." moved the order to the payment step in 5 of 6 English runs and 1 of 6 Korean runs (nothing is paid until the card goes into the kiosk). In every mode we are building, the review needs a tap or a hold.

**What we are building because of it.** A stack of cheap layers, each scored alone and combined on the same judge.

- **Loudness.** A phone near the mouth hears its owner louder than the queue, so a gate drops what is much quieter, and its closing ends the turn. A first version, started from the customer's sample, cut the leak from a bystander 10 dB quieter from 52% to 15% of their words, changed nothing at equal loudness, and kept 3% of the words of a customer speaking 12 dB under their sample (English, word layer). That lock-out has to go, and ending the turn is not measured on Live yet.
- **Meaning flow, the main line.** The AI follows the flow of the order and keeps what fits: an answer to its last question, or the next part of this customer's order. We are building it as instructions inside Gemini Live, and as transcribe-then-filter, where a fast Gemini text call returns the words that continue the customer's flow. Both are being measured this week, and there is no result yet.
- **Voice, as a stretch.** A bystander ordering from the same menu at the same moment says words that fit the flow, so we expect meaning to miss them (expected, not measured). A first voice gate, an open model that scores whose voice a stretch is, shut during overlap and took the customer with it: at equal loudness it kept 39% of the customer's words and leaked 16% of the bystander's (English, word layer). Extraction, pulling one voice out of the mixture, is not measured yet. Neither model is Gemini, the product uses Gemini for every AI feature, and shipping one is undecided. A voiceprint would never be stored.

[[RESULT-BLOCK START]]

| Layer (orders right on Gemini Live) | Small talk, 10 dB quieter | Small talk, as loud | Same-menu talk, as loud | Added delay |
|---|---|---|---|---|
| Meaning flow inside Live | being measured | being measured | being measured | being measured |
| Loudness gate + meaning flow | being measured | being measured | being measured | being measured |
| Transcribe-then-filter | being measured | being measured | being measured | being measured |
| Voice extraction | being measured | being measured | being measured | being measured |

[[RESULT-BLOCK END]]

**How we will know.** The benchmark screens ideas, and a person with a real phone in a loud place decides. The written protocol has three arms in one sitting (production, hold to talk, no press), 10 orders per arm, the phone 20 to 30 cm away with no headset, and a second person beside the tester making small talk, then talking about the same menu. We report orders right with no retry, of 10. The no-press arm is still being built, and the test has not been run.

## Challenge 2: the first hello

From the tap on the microphone to KIBO's hello, production took 3.5 to 6.0 seconds, median 3.8 (5 runs on November 20, headless Chrome on a laptop with a fake microphone, not a phone). The 3,172 ms above is a different measure: the end of a sentence to the reply.

In those runs the ephemeral token arrived a median 0.9 seconds after the tap, Gemini Live finished its setup 2.1 seconds after that, and the hello began to play 0.6 seconds later.

Three changes are in progress on a branch: connect before the tap, send a smaller setup, and play a greeting at once. The target is a hello within 2 seconds and something heard within half a second of the tap. Nothing is measured yet.

## What this could change, and what comes next

A store that adopts KIBO keeps its kiosk: nothing is replaced and no hardware is added. The person in front of it keeps their phone, their language and their text size, and the same way of talking works at the next kiosk.

There are no vendor or store partnerships yet, payment in the demo is virtual, and a real phone in a real loud room is still ahead of us. Before the finale we finish the meaning-flow measurements, run that phone test, and freeze the build.

- Demo: https://kibo-407514467119.asia-northeast3.run.app/demo (short address: kibo-2026.web.app)
- Code: https://github.com/csm-kr/kibo
- Video (3 minutes): https://youtu.be/2jPeDGbLsQM

Your language, the kiosk's language, and a phone that hears only you without a button. We will report the loud-room numbers either way.

<!-- BODY END -->

## 3. LinkedIn post draft

Under 1,300 characters with the link placeholder. In LinkedIn, type `@` and pick the Google Cloud and Hack2skill
pages so the tags become real mentions.

```text
We are Team malo, one of the Top 50 teams in the Google Cloud AI Builder Cup 2026, and we have published the story of KIBO.

KIBO lets you order at a self-order kiosk by talking to your own phone, in your own language. Gemini Live turns each sentence into function calls, a Cloud Run server checks every call against the kiosk's own menu and applies it in a Firestore transaction, and the kiosk fills its own cart. The AI can open the confirm card, but it cannot complete a payment.

The post also covers what is not solved. We built a crowd benchmark before building a fix (synthetic voices, a digital mix, 6 runs per cell). Today's open microphone got 0 of 6 orders right whenever someone nearby was talking. A perfect press-to-talk got 4 of 6 with a bystander as loud as the customer. Now we are teaching KIBO to follow the meaning of your order and hear only you, without a button. Those results are still being measured, and the post says so.

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
| OPTIONAL-KIOSK | "What we built", after the languages paragraph | Keep the paragraph (fence lines removed) only if the subway-style ticket machine is in the deployed demo when the post goes out; otherwise delete the block. Check its wording against the real kiosk: screen language, how the fare is chosen, and that its name and look copy no real operator | No repo source on 11-26 (branch only, not deployed); written from the owner's brief; no number in it |
| RESULT-BLOCK | "Challenge 1", after the layer list (the "Voice, as a stretch" bullet) and before "How we will know" | Fill the cells from the benchmark's own output and remove the two fence lines, or delete the block. Left in with its fence lines removed, the cells say "being measured", which is true until a log exists | `spikes/speaker-gate/bench/logs/live-<stack>-summary.json`, cells `chat@-10`, `chat@0`, `order@0` (en and ko), `right` of `n`; added delay from the summary's `verdicts[].addedDelayMs` |

Filling the result block:
- Write each cell as "EN k of n, KO k of n" (never "k / k", which reads as a fraction), and add one italic line under
  the table, inside the fence, with the runs per cell and "synthetic voices, digital mix". Under 20 runs per cell, say
  "a screen", never "passed".
- Each fence has a blank line after its START line and before its END line so a preview renders the block cleanly.
- A row with no log is deleted, or its cells stay "being measured" (or become "not run" after the cut-off).
- When a result lands, also correct the sentence it replaces in the layer list: "Both are being measured this week, and
  there is no result yet" (meaning flow), "ending the turn is not measured on Live yet" (loudness), and "expected, not
  measured" (same-menu overlap). The LinkedIn post's sentence "Those results are still being measured" changes too.
- If the loudness gate is retuned before the cut-off, re-read `en/chat@-10`, `en/chat@0` and `en/quiet-12` in its newest
  word log and correct "52% to 15%", "changed nothing at equal loudness" and "3%"; the same for the voice gate's
  "39%" and "16%" (`en/chat@0`).

## 5. Facts ledger (not for publication)

Every number or capability claim in the body, in reading order, re-derived on 2026-11-26 from the file named. "Own
sum" means added from the cells of the named table. Bench logs live in `spikes/speaker-gate/bench/logs/`; every log
carries manifest sha `51967c1a…`. Word-layer figures are the logs' pooled `keptPct` and `leakedPct` per cell.

| Claim in the body | Source |
|---|---|
| Top 50; finale 2026-12-04 Singapore; a live demo | `docs/GOAL.md` section 1 and answer sheet rows A1 and "Finale format"; `phases/HANDOFF.md` "FINALE PREP" |
| Team malo: Sungmin Cho, Ye Seul Ahn; challenge Sustainability & Social Impact | `README.md` line 315; `phases/HANDOFF.md` "SUBMITTED" |
| Opening scene: Korean screen, English speech, two lines with different options | `docs/PRD.md` "Demo scenario" and "Killer scene"; the sentence word for word from `spikes/speaker-gate/bench/sources.ts` `HERO.en` |
| 17.9% of people 65+ say they can order or check in at a kiosk (KIHASA 2024, self-reported) | `docs/plan/SOURCES.md` S16 |
| 1 in 6 by 2030; at least 2.2 billion; neither a kiosk figure | `docs/plan/SOURCES.md` S44, S45 |
| No install; QR; the kiosk fills its own cart; pay by card at the kiosk | `docs/PRD.md` "Core features"; `README.md` "Try it in 60 seconds" |
| 24 taps by touch, automated run, the order with large fries, through payment | `docs/plan/NUMBERS.md` "Touch hero order" (`evidence/touch-hero-efficient.json`) |
| 3 sentences and 2 taps on the card step, one recorded take on production, synthetic voice | `docs/plan/NUMBERS.md` "Voice-only hero order (recorded take)" (`evidence/voice-only-hero.json`) |
| Nine AI languages, each tested with a typed turn; spoken input tested in English, Korean, Japanese | `docs/plan/NUMBERS.md` "Languages" (`evidence/live-languages.json`, 18/18; Japanese 3 recorded runs) |
| Airport rail ticket machine (fictional) with Japanese screens; an English voice order fills them | `docs/PRD.md` "Kiosks in the demo"; `docs/plan/DECK_FACTS.md` slot 5 (ticket machine row) |
| OPTIONAL-KIOSK paragraph | **No repo source** (the owner's brief of 11-26; `docs/GOAL.md` section 4: branch only, not deployed); no number in it |
| Direct Gemini Live; one-use ephemeral token; model, instructions and tools pinned | `docs/ADR.md` ADR-003; `README.md` "Built on Google Cloud" |
| 11 tools; whole menu in the instructions; an item added in one call | `docs/ARCHITECTURE.md` "Agent tools (11)"; `README.md` "Built on Google Cloud"; `docs/ADR.md` ADR-004 "Why" (its title still says 9 tools: I-447) |
| JSON excerpt | Envelope `sessionId`, `commandId`, `type`, `args`, `source: "voice"`: `src/lib/commands/schemas.ts` lines 19 to 25 and `docs/ARCHITECTURE.md` "Endpoints" row `POST /api/command` (line 322, with the `commandId` form); `addToCart` args `itemId`, `variant`, `qty`, `selections`: `schemas.ts` line 47. Ids in `data/kiosks/malo.json`: item `cheese_burger` (line 103), groups `side` (137), `drink` (196), `ingredients` (253), options `fries_m` (154), `zero_cola` (221), `no_pickles` (269). An illustration of one call, not a captured request |
| Server checks: zod, actor token, repeated `commandId`, state machine, catalog; prices from menu data; Firestore transaction | `docs/ARCHITECTURE.md` "`/api/command` processing order"; project `CLAUDE.md` rules |
| Server-sent events for both screens | `docs/ADR.md` ADR-010 |
| Stack list | `README.md` "Built on Google Cloud" table |
| The AI can open the confirm card but cannot complete a payment; `confirming`, cart version, tap or new utterance 1.5 s after the review; `paid` from the kiosk's card action | `docs/ADR.md` ADR-005 |
| 37 of 37 forged commands refused, 5 of 5 legitimate accepted, local production build | `docs/plan/NUMBERS.md` "Forged commands refused" (`evidence/forged-commands.json`) |
| In two of three voice cost runs the model called `confirmCheckout` right after the review and the server refused it | `docs/plan/NUMBERS.md` "Cost per hero order, voice" (`evidence/cost-per-order.json`) |
| KIBO Learn: Gemini on Vertex AI, once, offline; skill = catalog + click recipes; replay without AI; the kiosk's own total checked | `docs/ADR.md` ADR-007; `README.md` "Built on Google Cloud" |
| "On two kiosks it had never seen … (round 4, synthetic kiosks)." word for word; the 2 handed to staff are total mismatches (R-014) | `docs/plan/NUMBERS.md` "KIBO Learn, never-seen kiosks, latest learner (round 4)" |
| Across all six never-seen kiosks so far, 3 of 60 orders were unsafe | `docs/TESTING.md` evidence ledger, round 4 row ("All six never-seen kiosks (rounds 2–4): 32 correct / 15 refused / 3 unsafe / 10 not learned of 60"); the all-rounds disclosure NUMBERS.md asks for next to the headline |
| 96 of 98 team-written cases | `docs/plan/NUMBERS.md` "Text agent evaluation" |
| End of speech to kiosk highlight median 2,118 ms, 7 of 8 runs, synthetic voice on a laptop | `docs/plan/NUMBERS.md` "Voice hero order, end of speech → kiosk highlight" |
| Spoken reply at a median 3,172 ms, past the 2-second target | `docs/plan/NUMBERS.md` "Voice hero order, end of speech → first AI audio" |
| Goal: talk without pressing and still be told apart | `docs/GOAL.md` section 1 "How, stated by the owner (11-26 23:40)" |
| 11-22: synthetic bystanders mixed under the order, sent to the real Gemini Live | `spikes/crowd-voice/README.md` "Method" |
| 0 of 12 English orders with bystanders 20 to 5 dB quieter; the open microphone is production today | same file, table "Order, English, right of 3", Shipped column at -20, -15, -10, -5 dB (own sum, 4 cells × 3 runs); `phases/HANDOFF.md` "FINALE PREP" |
| Live ends a turn after one second of silence; with talk it never comes | `docs/ARCHITECTURE.md` "Recognition settings" (1,000 ms, our pinned setting); `spikes/crowd-voice/README.md` "How the shipped settings fail" |
| Hold to talk 22 of 24 across English and Korean up to 0 dB, simulated hold | same README, `--ptt` table at -15, -10, -5, 0 dB (own sum: English 3+3+2+2, Korean 3+3+3+3) |
| Hold to talk built and measured, a candidate that takes no traffic, not in production; costs a gesture; the safety net | `phases/HANDOFF.md` "FINALE PREP"; `docs/ADR.md` ADR-014 "Why"; `docs/GOAL.md` section 1 |
| "Whose voice counts": hold-to-talk sessions, bystander at 0 dB, the order reached `paying` in 2 of 6 without the rule and 1 of 6 with it | `spikes/crowd-voice/README.md` "'Only my voice' told to Gemini Live", 0 dB row (rule + sample: also 1 of 6, not quoted) |
| Benchmark: 1,320 trials in 98 cells, frozen | `spikes/speaker-gate/README.md` "The set (version 2…)" |
| Conditions: small talk, same-menu order, four at once, music; levels -15 to +5 dB | same file, cells table (`chat@L`, `order@L`, `babble`, `music`) |
| A candidate gets the mix and a 3-second sample of the customer | same file, "The set" second bullet; `spikes/speaker-gate/candidates/README.md` |
| Word layer: Gemini Flash transcribes; customer words kept, bystander words leaked; 12 trials per cell | same README "Scoring" (`gemini-3.8-flash`); each `words-*.json` (`transcriber`, `n: 12`) |
| Order layer: real Gemini Live; definition of "right" (waits, within 5 s, two cheeseburger sets and nothing else) | same README "Scoring", Live layer |
| Order-layer customers are Gemini TTS; read speech (LibriSpeech, Zeroth-Korean, CC BY 4.0) in the word layer and among the four talkers | same README "Voices and sources" and "Limits" |
| Digital mix: no room, phone microphone or echo cancellation | same README "Limits" |
| 6 runs per cell so far, a screen; the pass line needs 20 | `live-open-summary.json`, `live-hold-oracle-summary.json` (`runsPerCell: 6`, `verdicts`: "not evaluable"); `docs/GOAL.md` section 5 "Adopt" |
| Table, open microphone, en / ko: 5/6, 0/0, 0/0, 0/0, 0/0, 4/5, 1/0 | `live-open-summary.json`, `right` of `n: 6`: cells `alone`, `chat@-10`, `chat@0`, `order@0`, `babble@0`, `music@0`, `song@0`, each `en/` and `ko/` |
| Table, perfect hold, en / ko: 6/6, 6/6, 4/4, 4/4, 1/3, 6/6, 6/5 | `live-hold-oracle-summary.json`, same cells |
| Perfect hold = a script holds over the customer's speech (± 0.2 s in the file) from the answer key; the ceiling of any gate | `spikes/speaker-gate/README.md` "Baselines through the same contract" (`hold-oracle`) |
| Finding 1: 0 of 6 in every small talk, rival order and four-people cell, both languages, also at -10 dB | `live-open-summary.json`: `chat@-10`, `chat@0`, `order@-10`, `order@0`, `babble@0`, en and ko (ten cells). Not said of `song@0` (en 1 of 6) |
| Finding 1: 100% of the customer's words kept, 52% of the bystander's leaked | `words-open-2026-11-26T13-51-41-631Z.json`, cell `en/chat@-10`, n 12 |
| Finding 2: 6 of 6 at -10 dB, 4 of 6 at 0 dB, 1 and 3 of 6 with four people | `live-hold-oracle-summary.json`: `chat@-10` and `order@-10`; `chat@0` and `order@0`; `babble@0` en 1, ko 3 |
| Finding 2: 55% of the bystander's words came through a perfect hold | `words-hold-oracle-2026-11-26T13-56-32-346Z.json`, cell `en/chat@0`, n 12 (open on the same cell: 71%) |
| Finding 3: music 4 and 5 of 6 against 5 and 6 alone; voice-over 1 and 0 | `live-open-summary.json`: `music@0`, `alone`, `song@0`, en and ko |
| The song cell is a spoken stand-in; real singing not measured | `spikes/speaker-gate/README.md` "Song is a stand-in"; `docs/ISSUE.md` I-445 |
| Finding 4, GTCRN, customer words kept under music: 97% to 98% (as loud), 91% to 96% (quieter), 94% to 90% (louder) | `words-open-…json` against `words-l0-gtcrn-2026-11-26T14-19-03-314Z.json`: cells `en/music@0`, `en/music@-10`, `en/music@+5`, n 12 each |
| Finding 4: voice-over 73% to 72%; talker as loud 95% to 78% | same two logs: `en/song@0`; `en/chat@0` |
| GTCRN is a small open-source speech enhancer; word layer only, not run on Live | `spikes/speaker-gate/candidates.md` D1 (MIT, 48.2 K parameters); no `live-l0-*` log exists |
| Review: a bystander's yes moved the order to `paying` in 5 of 6 English and 1 of 6 Korean runs; nothing paid until the card | `live-open-summary.json`, `en/review-yes@0` and `ko/review-yes@0`, `yesAccepted`; `spikes/speaker-gate/README.md` "Validation", Review |
| The review needs a tap or a hold in every mode being built | `docs/ADR.md` ADR-014 "Decision"; `docs/SECURITY.md` "Speaker-aware listening"; `docs/TESTING.md` field test arm 3 (`CONFIRM_TAP_ONLY=1`) |
| A stack of cheap layers scored alone and combined | `docs/GOAL.md` "Plan of 11-26", "Rung chosen" |
| Loudness gate: drops what is much quieter; its closing ends the turn (design) | `spikes/speaker-gate/candidates/l1-loud/gate.ts` header; `docs/GOAL.md` "Main line since 11-26 23:40" |
| Loudness, started from the sample: leak 52% to 15% at -10 dB; no change at 0 dB (71% and 71%); 3% of a 12 dB quieter customer's words kept (open: 97%) | `words-open-…json` against `words-l1-loud-warm-2026-11-26T14-54-34-160Z.json` (the newest, the gate with its own level test and no model): `en/chat@-10`, `en/chat@0`, `en/quiet-12`, n 12 each. The version 24 minutes older, with a voice detector (`words-l1-loud-warm-2026-11-26T14-30-47-663Z.json`), gave 2% and 5%; the cold start left `en/chat@-10` at 52% in both. Untracked logs of a gate still being tuned: a first read |
| Voice gate: at equal loudness 39% of the customer's words kept, 16% of the bystander's leaked; it shuts during overlap | `words-l2-campp-2026-11-26T14-49-34-842Z.json`, cell `en/chat@0`, n 12 (open 95% / 71%, perfect hold 87% / 55%); `spikes/speaker-gate/candidates.md` J2 ("the gate shuts during overlap and takes the customer with it"; a speaker-verification model with a voice detector, tuned on a development slice that is not reported) |
| Ending the turn not measured on Live | no `live-l1-*` log exists; `phases/HANDOFF.md` line 16 (Live sessions on hold) |
| Meaning flow: two forms (instructions inside Live; a fast Gemini text call that returns the words continuing the flow); being measured, no result | `docs/GOAL.md` "Main line since 11-26 23:40"; `spikes/speaker-gate/candidates/l3-instr/instructions.txt` (text only, no log) |
| Same-menu talk at the same moment: meaning is expected to miss it (expected, not measured) | `docs/GOAL.md` "Rung chosen"; `candidates.md` section E "What meaning cannot filter" |
| Extraction not measured; neither model is Gemini; shipping undecided | no word or live log for `c-voxlock`; `candidates.md` sections B, C and I; `docs/GOAL.md` section 4 (reopened 11-25) |
| A voiceprint would never be stored | `docs/SECURITY.md` "Speaker-aware listening" |
| Field test: three arms, same phone and sitting; 10 orders per arm; 20 to 30 cm, no headset; second person, small talk then the same menu; right with no retry of 10 | `docs/TESTING.md` "Field test in a loud place" |
| The no-press arm is still being built; the test has not been run | `phases/HANDOFF.md` line 17 ("Next build (not started)"); `docs/GOAL.md` section 2 "Missing" |
| Tap to hello 3.5 to 6.0 s, median 3.8 s, 5 runs, production, 11-20, headless Chrome, fake microphone | `mentoring/tap-to-hello-20261120.json` (`helloRangeMs` 3458 to 6028, `helloMedianMs` 3813; folder not in git); `docs/GOAL.md` row B4 |
| Token median 0.9 s after the tap; Live setup median 2.1 s after it; hello 0.6 s later (medians of each part; the body does not add them) | same file: `tokenMedianMs` 920, `liveSetupMedianMs` 2134, `helloAfterReadyMedianMs` 566 |
| "The 3,172 ms above" is a different measure | `docs/plan/NUMBERS.md` "end of speech → first AI audio" (3,172 ms) |
| Three changes in progress on a branch; nothing measured | `docs/GOAL.md` "Order" item 3; `phases/HANDOFF.md` line 11; branch `feat/fast-hello` has no commit beyond its base |
| Target: hello within 2 s, something heard within 0.5 s of the tap | `docs/GOAL.md` "Hard targets (proposed)": proposed, not the owner's number |
| Nothing replaced, no hardware; same way of talking at the next kiosk; language and text size | `docs/PRD.md` "Why the phone", "Why not something else" |
| No vendor or store partnerships yet; virtual payment | `docs/PRD.md` "How KIBO gets onto a kiosk", "Out of MVP scope" |
| No real phone in a real loud room measured yet | `docs/GOAL.md` section 2 "Missing" |
| Finish the measurements, phone test, freeze before the finale | `docs/GOAL.md` section 1 "Constraints" (12-02 freeze), "Plan of 11-26" |
| Links: demo, GitHub, video (3 minutes) | `phases/HANDOFF.md` "SUBMITTED" (video 3:01); `README.md` |
| LinkedIn: 0 of 6 whenever someone nearby was talking; perfect hold 4 of 6 at equal loudness; 6 runs per cell | the two live summaries, as above |

Scorer note: `bench/score.ts` has uncommitted changes (a spend cap, a trial slice for sweeps, an instructions option,
call logging). The diff does not touch the transcriber prompt or the kept and leaked counting, so the baseline logs
(scored before it) and the library and loudness logs (scored after it) are comparable.

Left out on purpose, with the source if one is wanted back:
- The full breakdown across all six never-seen kiosks (32 correct, 15 refused, 3 unsafe, 10 not learned of 60; total
  differed in 6 of 35; `docs/TESTING.md` evidence ledger). v0 had it; the body keeps "3 of 60 orders were unsafe".
- Gemini Embedding 2 as a voice fingerprint (48 clips: nearest neighbour the same words in 48 of 48, the same voice in
  0 of 48; `spikes/speaker-gate/README.md` "Stage 0"). v0 had it; cut for length.
- The 1.52 billion tourist arrivals (SOURCES S46), the picture captions, and the owner's phone report that the first
  connection is slow (`docs/GOAL.md` row B3); cut for length.
- What Google's documentation offers for picking one speaker (`spikes/speaker-gate/candidates.md` section A: labels
  for recorded audio, none in live streaming per the guide, no setting that takes a voice sample). Cut for length, and
  section E notes a conflicting field in the API reference.
- The text path into Live (text-oracle: right 6 of 6 in both languages with the customer alone,
  `live-text-oracle-summary.json`) and the cost of a transcription call (plain Gemini Flash transcription median
  2,523 ms over 10 clips, `spikes/voice-compare/RESULTS.md`); the owner's point that filtering after transcribing pays
  the delay twice.
- The 11-22 table, the 10 of 15 review figure, the 1,399 ms and 1,158 ms reaction medians, the cosine means of the
  embedding test, the first loudness gate of 11-22 and the first-press fix (all in `spikes/crowd-voice/README.md` or
  `spikes/speaker-gate/README.md`).
- The loudness gate's cold start and Korean cells, GTCRN's leak figures and Korean cells, the voice gate's other cells
  (customer alone 86% kept in English; Korean 72% / 43% at equal loudness), and the word-layer figures of the other
  cells.
- Third-party numbers in `candidates.md` (the authors' own, not run by us), the names of the voice-gate and extraction
  models (not measured), revision names, cost per order and experiment spend, Korean law, the nine language names, and
  the 1,590 ms hold-to-talk highlight (not in `evidence/`).

## 6. Questions for the owner

1. **Public evidence:** `spikes/crowd-voice/` and `spikes/speaker-gate/` (benchmark, scorer, logs) are local only, so
   the body does not say where a reader can check the numbers. If you push them before Saturday, add one sentence after
   the limits paragraph: "The benchmark, its scorer and every log are in the repository under `spikes/speaker-gate`."
2. **Naming models that are not Gemini:** the body names GTCRN, the open-source library that did not help, and leaves
   the voice-gate model unnamed. Keep it so (a reader can repeat the library test), name both, or name neither because
   Google AI usage is 40% of the score?
3. **The loudness and voice-gate first reads:** both gates are one night old, and the loudness numbers already moved
   once while this draft was written (2% and 5% became 15% and 3%). Keep the sentences and refresh them from the newest
   logs at the cut-off, or cut them to the design only?
4. **The optional kiosk paragraph:** keep or drop, and if kept, is the machine deployed and what is it called?
5. **Demo link and targets:** the body leads with the submitted Cloud Run `/demo` URL and gives the short address
   beside it; and it states the first-hello target (2 seconds, something heard within half a second), which
   `docs/GOAL.md` marks as proposed. Are both right to publish?
