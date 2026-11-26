# l1-loud bar-depth sweep: the rule, written before any result (2026-11-26 23:17)

- Dev slice (`dev-slice.txt`, 96 word trials): the first 4 trials in run order (bench/refs.json `cells`) of the cells
  that decide (chat and order at -15, -10, -5, 0; quiet-6, quiet-12, short, alone), English and Korean.
- Depths: 6, 9, 12, 15 dB, cold start (no enrolment), every other parameter at `gate.ts` DEFAULTS.
- Score per depth on the slice only: mean over trials with a customer of (customer words kept / customer words) minus
  mean over trials with bystanders of (bystander words leaked / bystander words), from the judge's word-layer log.
- Pick the highest score; a tie within 0.01 goes to 9 dB (the first gate's depth). Then fix it and score every word
  cell, cold and warm. The slice trials are also in the full scoring, so their cells are not a clean hold-out.
