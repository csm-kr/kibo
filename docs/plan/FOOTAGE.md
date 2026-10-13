# Footage for the demo video

Screen recordings of the real app for the video (`docs/plan/SUBMISSION.md` "Video"). Motion graphics may frame and zoom these clips; they never replace a screen (`.claude/skills/motion-demo-video/SKILL.md`).

## Where it is
`videos/footage/<YYYY-MM-DD>/` (git-ignored, not in the repo):
- `<clip>.webm`: the recording, at the clip's CSS size (the phone video is only 390×844; Playwright records at 1× whatever the device scale).
- `<clip>--NN-<moment>.png`: a full-resolution screenshot at each key moment (the phone's at 2×, 780×1688, sharper than its video for stills and zooms).
- `manifest.json`: per clip the file, viewport, route, whether it used Gemini, attempts and errors, duration, and every key moment with its time in ms from the start of the recording (the clip's video starts when its page opens). Also the model ids and the date.

Typed messages go at about 12 characters a second, and each kiosk change is held about 1.5 s, so the edit has room to cut.

## Clips
| Clip | Shows | Gemini |
|---|---|---|
| `demo-hero-1920x1080` | `/demo?k=malo`: intro, [Start], eat here, the hero sentence typed, the kiosk fills, "Make both fries large.", "No thanks." (and "I'll pay." only if the model did not open the review on "No thanks"), the confirm card, [Yes, pay now], the card stand-in, order number and the Touch vs talk card | yes, `/api/chat` |
| `kiosk-touch-1080x1920` | `/kiosk?k=malo&demo=1`: the hero order by touch with the tap counter, the efficient path of `e2e/kiosk-touch-efficient.spec.ts` (large fries chosen while adding each set), to the order number; the script fails the clip unless the counter ends at 24 taps | no |
| `kiosk-mirror-1080x1920` | `/kiosk?k=malo` as a mirror: a phone claims the QR and its AI adds the hero lines and makes both fries large (AI highlight and "AI가 담았어요" status), review, payment by the kiosk's card, order number | no: the phone is API calls with the claimed device token and `source: "voice"` |
| `phone-390x844` | `/assistant` claimed from a kiosk session: the same order typed on the phone, confirm card, "Insert your card into the kiosk", order number | yes, `/api/chat` |
| `demo-airport-1920x1080` | `/demo?k=airport_rail`, scenario "Mei's tickets": two adult express tickets, a child ticket, "I'll pay.", then [Yes, pay now] and the card stand-in, to the reference number | yes |
| `demo-pizza-1920x1080` | `/demo?k=doughhouse`, scenario "Pizza on a kiosk KIBO learned": the bridge taps the learned pizza kiosk, then the review. It ends there: on a learned kiosk the user pays on the kiosk itself | yes |

## Before using a clip
- **Touch numbers.** Since the re-take of 10-13 (11-hardening:1, I-143), `kiosk-touch` follows the efficient path and its counter ends at **24 taps**, the number the `/demo` card, landing page and deck cite (`evidence/touch-hero-efficient.json`, `docs/TESTING.md`). Its seconds are Playwright pace with pauses for the viewer (17 s in this take), not a human timing: crop or blur the seconds, never quote them (R-001).
- **No voice.** Every clip is typed. The hero shot (0:35–1:25) needs a person speaking to a real phone (iOS Safari or Android Chrome) on the deployed app; **record that by hand**, with no notifications and no personal data on screen.
- Check `manifest.json`: a clip with `"ok": false` failed twice (its `errors` say where) and has no video.
- The AI's replies are not scripted, so wording differs between runs; read the screenshots before picking a take.
- **Take of 10-13, checked in 10-assets:2** (`phases/10-assets/qa/REPORT.md`). Skip: `demo-hero--03-dine` (menu photos not loaded yet, I-147), `demo-airport--06` to `--08` (the guide still says "Your turn: tap Yes, pay now" after paying, I-144), `demo-pizza--02` (still connecting), `demo-pizza--05`/`--06` (the AI asks "Would you like to pay now?" on a kiosk where the user pays at the kiosk, I-100). Care: `phone--03` and `--05` cut a line at the scroll edge; the learned pizza page is unreadable without a zoom (I-096). Each clip has its own order number (hero 290, touch 376 since the re-take, mirror 731, phone 746), so do not cut two clips together as one order. The script and app fixes for I-144, I-100 and I-147 (11-hardening:1) apply from the next take of those clips; only `kiosk-touch` was re-taken (`recordedAt` per clip in `manifest.json`).

## Re-record
```bash
npm run capture:footage                                   # local dev server, in-memory store, real Gemini
FOOTAGE_URL=https://<service-url> npm run capture:footage # the deployed app
npm run capture:footage -- kiosk-touch-1080x1920          # only the named clips; the rest of the day's take stays
```
Needs `GEMINI_API_KEY` in `.env` for the local run. A clip that fails is retried once; the failure is recorded in the manifest and the run continues. A full re-record on the same day deletes and replaces that day's folder; copy a take you want to keep first. Named clips replace only their own files and manifest entries. Each screenshot waits for the photos on screen to load (I-147).
