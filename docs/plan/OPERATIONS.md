# Operations during judging and the finale

Not injected into harness steps (lives under `docs/plan/`).

## Judging period (2026-10-19 to 11-06)
- Cloud Run `min-instances=1` (no cold start) and `max-instances=3` (cost ceiling).
- Gemini per-minute quota checked and capped. **Early finding:** generating six images in parallel hit HTTP 429 right away on our project, so check Live and Flash quotas and request increases if needed; the app turns 429 into "try again" plus text mode.
- Budget alerts notify only; they never stop spending. Automatic billing shutdown is not used because it would take the demo down.
- Model ids in environment variables; the replacement for any preview model is chosen in advance.
- `/api/health` + Cloud Monitoring uptime check; alerts to both team members; `/learned/*` included.
- Judges use `/demo` on one laptop; [Try again] resets the state. The README explains use in one minute.
- Freeze deploys to `main` during judging.
- Check the payment card's expiry and limit.

## Cost notes
- 10/1–10/11: about KRW 10k net on Gemini, almost all from KIBO Learn experiments that resent the whole conversation every turn.
- Fixes: memory tool, last 4 screens only, per-run token cap, finish gate. Experiments now run on OpenAI development credits; published numbers are re-measured with Gemini.

## Finale (top 50 announced 11/07; Singapore 12/04)
- Mentorship weeks (11/10–12/01): apply first-round feedback.
- Live demo: the touch vs voice comparison on stage, with an offline backup video and a hotspot; do not rely on venue Wi-Fi.
- Consider extending KIBO Learn to native kiosk apps via OS accessibility APIs.
- Check entry requirements for Singapore after the result.

## Gemini quotas (read 10-13 from the Service Usage API for project `kibo-2026`, "paid tier" buckets)
| Model | Requests | Input tokens |
|---|---|---|
| `gemini-3.8-flash` (text agent) | 1,000 per minute; 10,000 per day | 2,000,000 per minute |
| `gemini-3.8-live` (voice) | no per-minute request cap listed (-1) | 150,000 per minute |
One text order is about 2–3 `generateContent` rounds of about 9k input tokens each (manual check 10-13, no saved log), so the app's own caps (3,000 chat messages per day, 200 voice sessions per day) stay under these limits. Re-read the limits before judging starts; the higher tier buckets apply only if the project is upgraded.
