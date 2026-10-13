# Step 3: pairing

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: SECURITY "Identity and permissions" (claim token in the URL fragment, removed after claiming), UX "Flow A" A2–A3, "Accessibility" (in-app browsers), UI_GUIDE phone rules.
- Code: `src/app/app/*` (step 2), `src/hooks/usePhoneSession.ts` (claim from `#t=`), `src/lib/phone/inApp.ts`, `src/app/mic-test/*` and `src/lib/voice/micTest.ts` (permission handling patterns), `src/lib/http.ts` (`publicOrigin`), `src/app/api/session/route.ts` (claim URL format `/assistant?s=<id>#t=<claim>`).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Two ways to pair from the web app, both ending in talking. The user (10-13) asked for the simplest one first: **"just tell people the web-app URL"**, so a short code is the primary path and the in-app camera scanner is the second path (the phone's own camera app scanning the kiosk QR keeps working as today).

### A. Pairing code (primary; server + `/app`) — tests first
- `POST /api/session` also creates a **6-digit pairing code** for the session (random, unique among live codes, stored as `pairCodes/{code}` → `{ sessionId, claimTokenHash-equivalent secret, expiresAt }` server-only with the TTL policy on `expiresAt`; the in-memory store mirrors it). Return `pairCode` to the kiosk only. `reissueClaim` rotates the code too.
- `POST /api/session/pair { code }` → the same result as a claim (`{ sessionId, deviceToken, status }`, same `CONFLICT` "Someone else is using this kiosk." when already claimed, `GONE` when expired); wrong code → `NOT_FOUND` with a plain message ("That code doesn't match a kiosk. Check the number on the kiosk screen."). Rate-limit it per IP strictly (e.g. 10 attempts per minute) so guessing a 6-digit code is impractical, and delete the code once used.
- `/app` (step 2's home) gets a large numeric code field ("Enter the 6-digit code shown on the kiosk", `inputmode="numeric"`, autocomplete one-time-code, ≥ 56px, digits ≥ 32px) with [Connect]; on success it stores the device token exactly as the QR claim does and opens `/assistant?s=…` (no fragment needed), where the microphone hint and talking continue.
- The kiosk shows the short web-app address and the code wherever it shows the QR (K1 attract card and the small QR sheet): "Or open **<host>/app** and enter **123 456**" (≥ 40px on the canvas; the host comes from `publicOrigin`). Use the deterministic Cloud Run URL host in production.
- Update ARCHITECTURE (routes, `sessionSecrets`/new collection, limits), SECURITY (pairing code entropy, rate limit, single use, TTL) and the Firestore TTL note in OPERATIONS (the orchestrator will enable TTL on `pairCodes.expiresAt`) in the same change (R-002).

### B. In-app camera scanner (second path)
`/app/scan`: scan the kiosk's QR with the phone camera inside the web app, then continue straight into talking.
1. **Camera:** `getUserMedia({ video: { facingMode: { ideal: "environment" } } })` after a tap (never on page load), shown full width with a framing square and a plain line "Point at the QR on the kiosk". Before the browser prompt, a picture hint like the microphone hint ("Tap **Allow** to use the camera"). Denied or missing camera → a clear message plus "Open your camera app and scan the QR there" and a text field to paste a link. Stop the camera on leave and on success. Torch toggle only if the track supports it.
2. **Decoding:** use the browser's `BarcodeDetector` (format `qr_code`) when available, else `jsqr` (`npm install jsqr`, Apache-2.0) on frames drawn to a canvas at ~8 fps. Pure function `parseKioskQr(text, origin) → { sessionId, claimToken } | { error: "foreign" | "malformed" }` (**tests first**): accept only URLs whose origin equals the app's own origin and whose path is `/assistant` with a valid `s` (SESSION_ID rule) and a `#t=` token; anything else is refused with "This QR is not a KIBO kiosk." and never opened.
3. **Hand-off to voice:** on a valid code, vibrate briefly if supported, then navigate to `/assistant?s=…#t=…` (same tab), where the existing claim runs; because the scan was a user gesture flow, show the microphone hint next (P1) unless the mic permission is already granted, then the user taps once to talk. Settings from step 2 (language, AI voice, larger text) apply.
4. **In-app browsers:** if `inApp.ts` detects KakaoTalk/NAVER/Instagram/etc., show the existing "open in Safari or Chrome" banner on `/app` and `/app/scan` (cameras often fail there too).
5. Tests: unit for `parseKioskQr` (own origin ok, other origin, http vs https, missing token, extra params, very long input); E2E with Chromium fake camera is optional: if cheap, feed a generated QR image through `--use-file-for-fake-video-capture` (Y4M/MJPEG made by a `node` script from a QR of a real claim URL of the dev server) and assert the page navigates and claims; otherwise test the decode path by passing an image to the decoder in the page. QA: `/app/scan` states (hint, scanning, denied, foreign QR) at the phone sizes.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands.
2. Check: no frames or images leave the device; the camera stops after a scan; foreign QR codes are never opened.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not start the camera without a tap.
- Do not upload or store camera frames.
- Break existing tests.
