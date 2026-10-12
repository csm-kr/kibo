# Step 4: demo-mode

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow C" (C1–C5), "Screen map" D1–D3; USER_JOURNEY J3 (a judge on `/demo`, about 3 minutes, often without a mic); UI_QA angle H ("First 20 seconds") and `/demo` viewports (1440×900, 1280×720, 1920×1080); ARCHITECTURE "Pages" (`/demo` creates a session with `demo: true` and holds both tokens), "Limits and cost" (`/demo` 30 messages); PRD "Demo scenario", "Must keep".
- Code: `src/components/kiosk/KioskScreen.tsx`, `src/components/kiosk/KioskCanvas.tsx`, `src/components/assistant/AssistantPanel.tsx`, `src/hooks/*`, `src/lib/client/api.ts`, `src/app/kiosk/page.tsx`, `src/app/assistant/page.tsx`, `e2e/qa/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
`/demo`: judge mode with the kiosk and the assistant side by side on one laptop screen. This is the URL submitted to the contest (`/demo` on Cloud Run), so the first 20 seconds decide whether a judge understands KIBO.

### `src/app/demo/page.tsx` and `src/components/demo/*`
- **D1 intro:** KIBO logo, the one-line pitch "Don't learn the kiosk. Just talk.", one sentence ("Your phone becomes the voice of any self-order kiosk: say your order, the kiosk fills itself, you confirm and pay."), a numbered 3-step guide: ① talk or type on the right ② watch the kiosk on the left move by itself ③ confirm, then pay on the kiosk. One primary [Start] (KIBO blue). A small line: "Works in English and Korean. No microphone? Type instead." Nothing else competes (V1).
- **D2 split:** creates a session with `demo: true` (`POST /api/session`; it returns the kiosk and device tokens). Left: `KioskScreen` inside `KioskCanvas` scaled to the full available height, with `demo` counters on. Right: `AssistantPanel` (`mode: "demo"`, English by default, examples in English: "One cheeseburger set with zero cola", "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.", "Make both fries large", "Is this halal?", "I'll pay"). Between or above them a thin caption bar that names the two halves: "Kiosk (unchanged, Korean only)" and "Your phone (KIBO)". The kiosk half takes kiosk taps too (touch and talk mix, Flow B).
- **Card stand-in (C4):** on payment, the assistant's [Tap the card on the kiosk] triggers the kiosk half's simulated card insert (the same path as the kiosk's own button, with the demo's kiosk token).
- **D3 end:** after `paid`, an end card next to the order number: [Try again] (new demo session, clears the conversation), [Open two-device mode] (link to `/kiosk` with a sentence: scan the QR with a phone), and a link back to D1.
- **Text first, voice later:** in this phase the assistant is text and buttons only; the next phase adds the mic and must fall back to text automatically (C3).
- Limits: the demo session's chat limit is 30 messages; when reached, show "Demo limit reached for this order. [Try again]".
- Layout for 1440×900 (main), 1280×720 and 1920×1080: no page scroll; the kiosk keeps its 9:16 canvas; the assistant column 400–480px wide; phone typography rules apply to the assistant column. Respect `prefers-reduced-motion`.

### Root page `/`
Replace the placeholder with a minimal judge-facing landing: pitch, one sentence, primary [Try the demo] → `/demo`, secondary links "Kiosk (two-device mode)" → `/kiosk`. (A fuller landing comes in a later phase.)

### UI QA and E2E
- `e2e/qa/demo.qa.spec.ts`: D1, D2 (empty; after an API-sent order with the AI highlight; confirm card open; payment; done) at 1440×900, 1280×720, 1920×1080.
- `e2e/demo.spec.ts` (no model calls): D1 → [Start] → D2 shows both halves; an order sent through the API with the demo's device token appears on both halves; [Yes, pay now] → kiosk payment → stand-in card → order number on both → [Try again] gives a new empty session.
- A `@live` test that types "One cheeseburger set with zero cola" and expects a cart line, **skipped unless `E2E_LIVE=1`** (real Gemini; run it once by hand if the key works: `npm run test:e2e:live` script that sets the variable).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; run `npm run test:e2e:live` once and report pass/fail in the summary (do not block on it).
2. Look at the D1 and D2 screenshots at 1440×900 as a cold judge: in 20 seconds, is it clear what to do and where the kiosk moves? Fix what is not.
3. Update this step in `phases/3-assistant/index.json` (completed + summary / error / blocked).

## Do not
- Do not fake anything: the kiosk half is the real `KioskScreen` driven by the real session; no recorded video inside the app (J3 "Is this safe and real?").
- Do not let the demo bypass the confirm card or the kiosk card action.
- Do not show demo counters outside demo mode.
- Break existing tests.
