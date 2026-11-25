# Speaker gate: the customer's voice only (ADR-014)

Plan, stages and adopt/stop criteria: `docs/GOAL.md` "Speaker gate". This folder holds the experiments.

## Stage 0, kill test (2026-11-25): Gemini Embedding 2 does not tell voices apart

Question: does `gemini-embedding-2` on audio encode who is speaking, or what was said? Six order sentences (three
English, three Korean) in eight Gemini TTS voices (`voices.ts`, 48 clips, 16 kHz WAV, speech only), one embedding
per clip (`embed-check.ts`), cosine between every pair.

| Pairs | Mean cosine |
|---|---|
| Same voice, different words | 0.623 |
| Different voices, same words | 0.925 |
| Different voices, different words | 0.622 |

- A clip's nearest neighbour was another voice saying the same words in 48 of 48, the same voice in 0 of 48.
- Same voice scores no higher than a different voice (0.623 against 0.622): the embedding carries the words and no
  sign of the speaker. AUC same voice against same words 0.008.
- One call took 942 ms (median, 48 calls, 4 at a time), 1,636 ms at most: too slow to gate live audio even if it
  worked.
- Verdict: not usable as a speaker embedding. A speaker gate needs a speaker-verification model (not Gemini), or
  Gemini doing the speaker attribution itself on the audio (stage 1, candidate A).

```
npx tsx --env-file=.env spikes/speaker-gate/voices.ts       # writes audio/tts (git-ignored)
npx tsx --env-file=.env spikes/speaker-gate/embed-check.ts  # writes logs/embed-check-*.json
```
