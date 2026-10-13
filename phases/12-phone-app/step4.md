# Step 4: kiosk-pairing

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow A" A1–A3, "Flow C", "Screen map" K1 and D1–D3; USER_JOURNEY J3; UI_GUIDE (kiosk rules on the canvas; KIBO surfaces may use KIBO blue); ARCHITECTURE "Pages" (`/demo` creates a demo session holding both tokens).
- Code: `src/app/kiosk/page.tsx`, `src/components/kiosk/{KioskCanvas,KioskScreen,KioskToolbar}.tsx`, `src/hooks/useKioskSession.ts`, `src/app/demo/*`, `src/components/demo/*`, `src/lib/session/service.ts` (`createSession` with `demo`), `src/app/api/session/route.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
For the real demo the user wants **a laptop as the kiosk and a real phone (web app, camera, voice)**. Today `/kiosk` on a landscape laptop draws the portrait kiosk in the middle with empty sides, and `/demo` only offers the simulated phone panel.

## Task
1. **`/kiosk` on landscape screens (laptop as kiosk):** when the viewport is wider than tall, put a KIBO side panel next to the portrait kiosk canvas (the canvas itself is unchanged): a large QR of the current claim URL (≥ 320px on a 1440×900 screen), "Order by talking: scan with your phone camera, or open **<host>/app** and enter the code" with the 6-digit pairing code from step 3 in large digits, three short steps, the phone status ("Waiting for a phone" / "Phone connected" with the time / "Connection paused"), and after a phone connects a live, read-only view of what the phone is doing (status line: listening, cart count; no transcript text, nothing private). The panel is KIBO's (KIBO blue allowed), phone-like sizes (≥ 18px text at 1440×900). It updates when the QR is reissued. Portrait screens keep today's layout.
2. **`/demo` "Use your own phone" mode:** on D1 a secondary option "Use my phone instead" next to [Start]. It creates a demo-limited session that is **not** pre-claimed (server: `createSession({ demo: true, pairPhone: true })` returns `claimUrl` and the kiosk token but no device token; the demo limits still apply; tests first for the service change and route), shows the kiosk canvas large on the left and the pairing panel from item 1 on the right instead of the simulated phone; the judge scans with their phone and orders by voice; the compare card and scenario guide work as before when they make sense (the scenario guide's tappable chips are hidden in this mode, but "what to try" sentences stay as text). [Try again] makes a fresh pairable session.
3. Update ARCHITECTURE ("Pages", `POST /api/session` body) and UX (Flow C, screen map D1/D2 pairing state) in the same change (R-002).
4. QA: `/kiosk` at 1440×900 and 1920×1080 (waiting, connected), `/demo` pairing mode at 1440×900 (waiting, connected via an API claim).

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
2. Check: the side panel never shows the claim token as text (QR only), and a reissued QR replaces the old one at once.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not change the kiosk canvas rules (40px text on the canvas) or the portrait layout.
- Do not let a pairable demo session skip the demo limits.
- Break existing tests.
