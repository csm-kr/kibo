# Step 6: short-url

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE (`POST /api/session`, `PUBLIC_ORIGIN`), UX (A2, P0), UI_GUIDE (kiosk pairing line), RULE R-002.
- Code from steps 3–4: `src/components/kiosk/PairCode.tsx`, the landscape `/kiosk` side panel and the `/demo` "use my phone" panel (step 4), `src/hooks/useKioskSession.ts`, `src/lib/http.ts` or wherever `publicOrigin` lives, `src/app/api/session/route.ts`, `scripts/deploy.sh` and `scripts/deploy.test.ts`; issue I-167 in `docs/ISSUE.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The user (10-13): "just tell people the web-app URL." In production the kiosk shows `kibo-407514467119.asia-northeast3.run.app/app` (45 characters): it wraps and nobody can type it (I-167). The orchestrator is setting up a short Google-hosted address that redirects to the Cloud Run service (Firebase Hosting `https://kibo-2026.web.app`, **live since 10-13 ~16:50 KST**, deployed by the orchestrator through the Hosting REST API (a glob `/:path**` rule did not match multi-segment paths such as `/app/scan`, so the second rule is a named-group regex): `/` → `<Cloud Run>/app`, other paths kept; the first matching redirect wins). The app must be able to **show** that short address without changing where QR codes point.

## Task
1. New optional runtime env `SHORT_APP_URL` (for example `kibo-2026.web.app`): a bare host, validated (lowercase hostname, no scheme, no path; anything else is ignored with one log line). Tests first for the validation.
2. Where the kiosk tells people what to open (the K1 pairing line, the QR sheet, the landscape side panel, the `/demo` "use my phone" panel): show `SHORT_APP_URL` when it is set, else today's `<host>/app`. The QR codes and claim URLs do **not** change (they keep `PUBLIC_ORIGIN`). Pass the value to the client the same way the pair code reaches it (e.g. a `pairUrl` field in the session create response), not as a build-time `NEXT_PUBLIC_` variable, so it can change without a rebuild.
3. `scripts/deploy.sh`: pass `SHORT_APP_URL` through when it is set in the deploying shell (keep it unset otherwise); update `scripts/deploy.test.ts`.
4. Add `firebase.json` with the hosting redirect config that the orchestrator deploys (`"hosting": { "public": "<an empty folder with a .gitkeep>", "redirects": [ { "source": "/", "destination": "https://kibo-407514467119.asia-northeast3.run.app/app", "type": 302 }, { "regex": "^/(?P<path>.+)$", "destination": "https://kibo-407514467119.asia-northeast3.run.app/:path", "type": 302 } ] }`), and document both in `docs/plan/OPERATIONS.md` and ARCHITECTURE (R-002). Do not deploy it.
5. Update I-167 (code side done; the short host goes live when the orchestrator deploys the redirect and sets `SHORT_APP_URL`).
6. QA screenshots of K1 and the landscape panel with `SHORT_APP_URL=kibo-2026.web.app` at 1080×1920 and 1440×900: the line fits on one line.

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
2. Check: QR contents and claim URLs are unchanged (assert in a test); no Firebase SDK or client config was added (hosting is only a redirect).
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not run `firebase` CLI commands or deploy anything (the orchestrator does that).
- Do not change the pairing code rules.
- Break existing tests.
