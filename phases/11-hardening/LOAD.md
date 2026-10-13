# Load check (11-hardening:3)

`npm run load:check` (`scripts/load-check.ts`), 10-13, one run. Local production build (`node .next/standalone/server.js`, as on Cloud Run) with `STORE=memory`, one process on an Apple M1 laptop, never the deployed service. Each simulated `/demo` user creates a demo session, holds the kiosk and phone SSE streams, pings from both, taps the dine option, orders the hero cart, makes both fries large, opens the review, confirms with a tap and pays with the stand-in; 13 requests per user. Numbers: `evidence/load-check.json`.

## Results
| Scenario | Paid | Command p50 / p90 | SSE delay p50 / max | Server RSS peak | Open handles after |
|---|---|---|---|---|---|
| 5 users, own addresses, 1 real `/api/chat` each | 5/5 | 5 / 19 ms | 0 / 1 ms | 130 MB | 2 (idle: 2) |
| 10 users, own addresses | 10/10 | 10 / 22 ms | 0 / 1 ms | 84 MB | 2 |
| 20 users, own addresses | 20/20 | 12 / 24 ms | 0 / 1 ms | 109 MB | 2 |
| 5 users, one shared address | 1/5 | 21 / 57 ms | 0 / 3 ms | 117 MB | 2 |
| 20 users, one shared address | 0/20 | 6 / 8 ms | 0 / 0 ms | 100 MB | 2 |

SSE delay is the time from a command's response to the stream event carrying its `commandId`; with the memory store the event is written before the response, so 0 ms. Firestore's `onSnapshot` latency is not in these numbers.

## What failed first
- **Own addresses: nothing in our server, up to 20 concurrent demos.** Every request returned 200, no event was missed, `/api/health` stayed 200, and the server went back to its idle 2 open handles after each scenario (no leaked streams, timers or sockets). After 20 users closed their streams, one of their addresses reopened 10 streams and the 11th got the polite 429, so `openStream` releases its places.
- **The slow part is Gemini.** The 5 parallel `/api/chat` messages all added the 2 hero lines, but took **25.4, 31.2, 33.3, 36.8 and 39.8 s**. The API key answered 402 (credits used up, I-104), so every call fell back to Vertex AI. The cause of the length (Vertex tail, I-105; parallel calls; first-use cache creation) is unverified from one run. Logged as I-157.
- **One shared address: the per-IP limits, and they fail politely.** 5 users behind one address: 4 of 5 demos stopped at `confirmCheckout` or `cardAction` with 429 "Too many requests. Please wait a moment.", because 5 × 13 requests pass the 60 a minute. 20 users: new sessions hit the 10 a minute first, then streams hit the 10 per address ("Too many open screens. Please close one and try again."), then the 60 a minute. Every refusal was JSON with a code and a plain message, no 500, no crash, health 200.

## Is the failure polite on screen?
The API answers are. Two screen effects are not: a 429 on the stream route closes `EventSource` for good, so that screen stops mirroring until a reload (I-033, open), and a 429 at confirm or pay leaves a judge with "Please wait a moment" at the most important moment of the demo.

## Recommendation
1. **Keep Cloud Run `--concurrency 80`, `max-instances 3`.** 20 demos hold 40 streams, half of one instance's 80; the server process stayed under 135 MB RSS. Not modelled here: Cloud Run's request cap itself and Firestore latency.
2. **Raise the per-IP request limit for requests with a valid actor token before judging (I-154).** One API-only demo order already uses 13 requests a minute, and the real `/demo` adds a ping every 30 s per screen and one command per voice tool call, so about 4 judges behind one office address use up 60 a minute. Keep 60 for anonymous requests and the 10 new sessions a minute. Not changed in this step: it is a design change to the limits (and the docs and tests that state them) and needs the request rate of one real `/demo` voice order, which this script does not measure.
3. **Fix I-033** (reopen the stream after a delay on `error`), so a 429 on the stream route recovers by itself.
4. **Top up the Gemini API key's credits (I-104) and re-run `npm run load:check`** to see whether the 25–40 s chat replies were the Vertex fallback or the parallel load.
