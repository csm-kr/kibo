# Speaker-gate Live bench, 11-27 (kibo-fd): final table for the blog

All Live rows: manifest-flow 026b37a7, CONFIRM_TAP_ONLY=1 unless noted, cells at the customer -20 dBFS with the
neighbour 10 dB quieter (-10) or as loud (0). Cell order in every list: en chat, en menu, ko chat, ko menu.
"Right" = hero cart + review reached (confirming, or paying where voice confirm was allowed) + no bystander item
(flowScoring.isRightFlow). Logs are under spikes/speaker-gate/bench/logs/.

## 1. The pick against a perfect press, n=20 per cell (-10 dB)
Repeats: 8 trials per cell, so 20 = trials 1-4 three times and 5-8 twice. Same audio, so not independent; the
Wilson intervals assume independence and are narrower than the truth.

| | pick (gate first-turn d6, flow instruction) | hold-oracle (perfect press, voice confirm allowed) |
|---|---|---|
| logs | flow-l1-pick+l3-flow-live-taponly{,-r2,-r3}.jsonl | flow-hold-oracle{,-r2,-r3}.jsonl |
| right | 13, 6, 12, 14 = 45/80 [0.45-0.67] | 16, 17, 15, 16 = 64/80 [0.70-0.87] |
| sessions with a bystander item | 1, 6, 0, 5 = 12/80 [0.09-0.24] | 0, 1, 0, 0 = 1/80 [0.00-0.07] |
| acted hero / fries | 20,17,20,17 / 18,14,20,18 | 20,20,20,20 / 19,19,18,19 |
| spurious replies per session | 0.6, 0.5, 1.4, 0.3 | 0.1, 0.1, 0.1, 0.0 |
| activity ends per session | 8.0, 5.7, 6.5, 5.4 | 4.0 each |
| delay, last word to own action | median 1,303 ms, p90 2,009 (n 188) | median 1,061, p90 1,252 (n 164) |
| refused voice confirms | 22 sessions: 16 after the customer's own pay words, 1 bystander (f0032 ko/menu, "는", no customer turn in 6 s), 5 unclear | n/a |
Hold's first 24 rows predate the sha fields. Pick: 15/24 in its first batch, 30/56 in the added rows.

## 2. Ablation: which part does the work (-10 dB, first 6 trials)
- Gate + ORDINARY instruction, flow-l1-pick-taponly.jsonl: right 4, 2, 5, 1 = 12/24 [0.31-0.69]; items 1, 3, 0, 2 = 6/24 [0.12-0.45].
- Gate + flow instruction, same trials: first batch 15/24, items 2/24; all repeats 37/64 [0.46-0.69], items 7/64 [0.05-0.21].

## 3. Ablation: equal loudness (0 dB), perfect press, first 6 trials, voice confirm allowed
- hold-oracle + flow instruction, flow-hold-oracle+l3-flow-live.jsonl: right 3, 1, 5, 2 = 11/24 [0.28-0.65]; items 1, 4, 0, 1 = 6/24.
- plain hold-oracle, flow-hold-oracle.jsonl first batch: right 2, 1, 2, 1 = 6/24 [0.12-0.45]; items 2, 5, 0, 1 = 8/24.

## 4. Leak fixes on Live (-10 dB, first 6 trials, paired against the pick's 15/24 and 2/24; pooled 37/64, 7/64)
| | X: near + trim | Y: near + trim + sizes line | Z: near + anchorRise (old rule), no trim |
|---|---|---|---|
| log | flow-l1-near-trim+l3-flow-live-taponly.jsonl | flow-l1-near-trim+l3-flow-sizes-taponly.jsonl | flow-l1-near-rise+l3-flow-live-taponly.jsonl |
| right | 3, 5, 2, 3 = 13/24 [0.35-0.72] | 4, 3, 3, 4 = 14/24 [0.39-0.76] | 5, 2, 2, 3 = 12/24 [0.31-0.69] |
| items | 0, 1, 0, 1 = 2/24 | 0, 2, 0, 1 = 3/24 | 0, 4, 1, 2 = 7/24 [0.15-0.49] |
| first reply, median / p90 | 3,385 / 4,092 ms | 3,371 / 4,123 ms | 1,340 / 1,737 ms |
| later turns, median / p90 | 996 / 1,622 | 1,127 / 1,589 | 1,005 / 1,588 |
| "No, thanks" heard as the customer's words | 19/24 | 20/24 | 21/24 |
| early checkout (after "No, thanks") | 16/24 | 18/24 | 15/24 |
| acted hero / fries | 23 / 17 | 23 / 18 | 23 / 20 |
| large-set carts | 2 | 1 | 1 |
Pick, same trials: first reply 1,458 / 2,009 (pooled 1,403 / 2,266); "No, thanks" heard 8/24 (19/64); early checkout
5/24 (16/64); hero / fries 22 / 22; large-set 3 (7/64).
Replay of gate.ts with each row's settings equals the logged segments 24/24 in X, Y, Z (Z against f0b80e9a, the
gate.ts it ran). Z's segments after the first turn equal X's in 24/24.

## 5. Session timeline (refs + Live logs)
Median session 61.5 s; neighbour talking 50.8 s; while the customer is silent 42.0 s; while both the customer and KIBO
are silent 26.1 s (p10 23.1, p90 28.9; hold-oracle n 104; pick n 80: 25.4 s).

## 6. Offline screen (gate.ts replay, no API): neighbour-only time Live receives (inside segments), -10 dB
pick d6: chat 40%, menu 25% (the open-frame column says 23%, 17%: it misses the reach-back). near + rise d6: 25%, 19%.

## 7. Z against kibo-59's criteria
1. First reply median under 1.8 s: 1,340 ms (p90 1,737). PASS.
2. "No, thanks" heard as the customer's words: 21/24 (19 the answer alone, 2 with other words), pick 8/24 paired and 19/64 pooled. PASS. Early checkout 15/24 (fact, not a gate).
3. Hero and fries acted no lower than the pick's paired 22 minus 2: hero 23 PASS; fries 20 PASS at exactly the limit.
4. Replay equal to the logged segments: 24/24 with f0b80e9a, the gate.ts Z ran. PASS. The new rise rule (9de83982) gives the same segments 24/24.
Not gating: right 12/24 (pick 15/24, 37/64); items 7/24 (pick 2/24, 7/64).
- Near stacks together: items 2 + 3 + 7 = 12/72, beside the pick's 7/64 on the same trials. Cause unknown.
- Z's segments after the first turn equal X's.
- Z's first reply over "fries": 2/24 (pick 3/24 paired, 8/64), against X 10/24 and Y 5/24.

## 8. Refused voice confirms with no customer turn in the 6 s before (bystander words only), first 6 trials
- pick: 1/64 (f0032 "는"), plus 2 unclear.
- run 2: f0063 and f0025.
- X: 0, plus 2 unclear.
- Y: 1 (f0004 "강", 47.0 s, review open since 38.0 s).
- Z: 1 (f0063 ko/chat, 59.5 s, "생겨 왔어.").
- Production's voice rule would likely have accepted these.

## 9. The new rise rule, offline (gate.ts 9de83982, d6)
- What moved:
  - menu@-10 open 17 → 16;
  - chat@0 ends 10.1 → 10.3;
  - menu@0 customer open 100 → 99, closes inside 4 → 5;
  - f0022 received 1.8 → 0.9 s.
- No anchor ends more than 3 dB above the customer's own level.
- d5, f0012: partly fixed. The neighbour still sets the anchor at 2.88 s, and its opening [0, 2920] still reaches Live as a turn. The rise lifts the anchor to -17.7 dB by about 5 s. The fries-turn sentence gets 2.3 s through (old rule 4.1, d6 0.9). Screen d5 menu@-10: 18 → 13%.
- The flow set has no neighbour louder than the customer, so it cannot show an anchor captured upward.

## 10. Three sentences the blog must not say
1. "The gate keeps the neighbour out", or anything saying the no-press stack matches pressing.
   - The pick is right in 45/80 against 64/80, with items in 12/80 against 1/80.
   - Even with near, Live receives 19-25% of the neighbour-only speech at -10 dB, and all of it at 0 dB.
2. "The leak fixes lowered bystander items on Live."
   - No gate fix has shown that on Live: near stacks 12/72 against the pick's 7/64.
   - near is cleared for hearing the customer's short answers ("No, thanks" heard 8/24 → 19-21/24) and, without the trim, for the first reply (1.34 s).
3. "No bystander's words confirmed a payment" or "voice confirm is safe with an open microphone".
   - Section 8 lists the confirms the tap-only server refused after neighbour speech only.
   - near opens the review earlier (15-18/24 right after "No, thanks").
Always with: n=20 per cell is 8 recordings replayed 2-3 times; the intervals are narrower than the truth.
