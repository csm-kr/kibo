# KIBO Learn changes

Changes to `learner.mjs`, `driver.mjs`, `runner.mjs` and `audit.mjs` after the end of phase 12, so blind-kiosk baselines and finals can say exactly which learner they ran (`spikes/blind-kiosks/PROTOCOL.md`).

## 10-13, 13-blind-kiosks:2: crash fix (I-185), part of the baseline
- **Nudge before the function responses.** After 60 turns without `testSkill`, every 20th turn adds "Stop exploring. Call records(), write the skill JSON from it, and call testSkill now." to the user turn that holds the function responses. It was appended after them, and Vertex AI refuses a user turn whose text part follows its function responses with HTTP 400 "Requests ending with a model turn are not supported." (checked 10-13 with one-off requests to `gemini-3.8-flash`: text after the responses 400; text before, a separate user turn, or the text inside a function response 200). It now comes first in the same turn; the words and the rule for when it fires are unchanged.
- **One retry on 429, 500 and 503** after 5 s; a 400 is not retried. A non-JSON error body no longer crashes the process; the loop ends with the status logged, as for any other API error.
- Test: `node --test spikes/kibo-learn/learner.test.mjs` runs the real learner loop against a fake Vertex (`fake_vertex.mjs`, a `--import` preload) and a fake `gcloud`, with no network; it needs Chrome, like `test_audit.mjs`.
- Exploration is unchanged: prompts, tools, the finish gate, the audit and the limits are the same as at the end of phase 12. The OpenAI loop (development only) is untouched.
