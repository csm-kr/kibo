# Step 2: readme

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD, ARCHITECTURE (diagrams), ADR (all), SECURITY, TESTING "Evidence ledger", KIBO_LEARN; RULE R-001; ISSUE I-023 (harness tooling is local and not in the public repo).
- `docs/plan/SUBMISSION.md` (not in your prompt; read it): repo checklist, credits, what the judges need.
- Code layout: `src/`, `data/`, `e2e/`, `evals/`, `evidence/`, `spikes/`, `scripts/deploy.sh`, `package.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
`README.md` for judges and developers (English), plus small repo hygiene for going public later.

### `README.md`
1. Title, one-line pitch, a real screenshot (`public/landing/*`), links: live demo (`https://kibo-407514467119.asia-northeast3.run.app/demo`), video (placeholder line "Video: coming with the submission"), deck (placeholder).
2. **Try it in one minute:** open `/demo`, press Start, tap an example sentence or say it, watch the kiosk on the left, confirm, tap the card. Two-device mode: open `/kiosk` on a laptop and scan the QR with a phone.
3. **What it does** (PRD core features in short bullets) and **who it is for**.
4. **How it works:** the deployment and voice-order sequence diagrams from ARCHITECTURE (mermaid renders on GitHub), the state machine, and the "AI cannot pay" safety rules (ADR-005/006).
5. **Google Cloud and Gemini:** Gemini Live (`gemini-3.8-live`) through one-use ephemeral tokens with pinned model, instructions and tools; Gemini Flash (`gemini-3.8-flash`) function calling for text; the 9 tools; Firestore transactions as the single source of truth with server-side `onSnapshot` streamed over SSE; Cloud Run in `asia-northeast3` with min 1 / max 3 instances; Secret Manager; KIBO Learn with Gemini on Vertex AI (offline).
6. **Evidence:** a table copied from the TESTING ledger with only rows marked measured, each with its file path; a short honest "Known limits" list (web/webview kiosks only for KIBO Learn; learned kiosks support fewer edits; Korean and English only; virtual payment; numbers from automated runs are labelled as such).
7. **Run locally:** Node 24, `npm ci`, `.env` with `GEMINI_API_KEY` (never commit it), `npm run dev` (memory store by default), tests (`npm test`, `npm run test:e2e`, `npm run qa:ui`, `npm run eval:agent`), deploy (`sh scripts/deploy.sh`, needs gcloud and project access).
8. **Repository map:** one line per top-level folder.
9. **Credits:** ideas from browser-harness (browser-use), jev-browser, dev-browser and Aside reimplemented, no code copied (KIBO_LEARN "Where the ideas come from"); fonts (IBM Plex Sans KR, Space Grotesk, OFL); menu photos generated offline with image generation tools (ADR-008: Codex image generation, earlier Gemini image generation), fictional brands; "Harness tooling used during development is local and not part of the submission" (I-023).
10. **License:** state "All rights reserved" for now unless a `LICENSE` file already exists (the team decides the license before going public; log it in `docs/ISSUE.md` as a user decision, area `docs`, class `missing-license`).

### Repo hygiene
- Make sure `.gitignore` covers `.env*`, `videos/`, `qa-output/`, `test-results/`, `playwright-report/`, `.harness-logs/`, `phases/**/qa/*.png`, `phases/**/*-output.json`.
- Mark ISSUE I-023 fixed with the README line.
- `spikes/`: add `spikes/README.md` saying these are development experiments; OpenAI runs there were development aids only, published numbers come from Gemini runs (STRATEGY "Optics"), with the evidence paths.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check every number in README against the ledger and its file (R-001); no secret values; no OpenAI usage claimed for the product.
3. Update this step in `phases/5-ship/index.json` (completed + summary / error / blocked).

## Do not
- Do not invent numbers, users or partners.
- Do not include real brand names except as plain text where the docs already allow it (market description), and preferably not at all.
- Break existing tests.
