# Step 9: repo-ready

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE, ADR, SECURITY, RULE R-001.
- `README.md`, `docs/plan/SUBMISSION.md` ("Hard rules", "Repo checklist"), `docs/plan/NUMBERS.md`, `docs/plan/judges/JUDGE_QA.md` section E, `.gitignore`, `docs/assets/deck/architecture.svg`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judges open the README right after the live URL. The tech judge found a stale README ("in-app replay not built yet", diagram calls the bridge "planned", no `kibo-voice` relay), "All rights reserved", and a first commit of 25,892 lines that raises the fresh-code question.

## Task
1. **README for a judge:** first screen = one sentence, live `/demo` link, `kibo-2026.web.app` for phones, a 60-second "try it" for one laptop and for phone + laptop, the hero picture. Then: what Gemini does where (Live voice with function calling, direct on the Gemini API or through the `kibo-voice` relay to Vertex AI Live; Flash text agent with explicit cache; Vertex AI for KIBO Learn and text fallback; Firebase Hosting short address); what the server enforces (payment rule; the forged-command test); architecture picture updated with `kibo-voice`; results only from NUMBERS.md; KIBO Learn + `/learn` + how it gets onto a kiosk; known limits; run locally; credits; team. Remove stale lines.
2. **Development timeline** section: dates of the spikes (10-11), the repo start (10-12), phases and what each added, with the contest period, so the large first commit is explained.
3. `.env.example` (names + one-line comments; add `!.env.example` to `.gitignore`), `LICENSE` (MIT, "Copyright (c) 2026 Sungmin Cho and Ye Seul Ahn").
4. `scripts/scan-repo.ts` (`npm run scan:repo`): scans `git log -p --all` and the working tree for Google API keys, OpenAI keys, private key blocks, service-account JSON, Azure-style 32-hex keys next to key/subscription, `.env` files, files > 10 MB; prints commit, path and pattern name only, never the value; tests with fake values built at runtime. A real secret in history → set this step `blocked` with commit and path (a person rotates and decides on a history rewrite).
5. `phases/14-final/REPO.md`: files that look third-party or pre-hackathon, with keep/remove recommendations (remove nothing yourself).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run scan:repo
```

## Verify
1. README relative links exist; every number is in NUMBERS.md.
2. Update this step in `phases/14-final/index.json`.

## Do not
- Do not create the GitHub repo, add a remote or push.
- Do not rewrite git history.

## Orchestrator notes (10-14 10:00, from web research)
- Google Cloud DevRel's advice to hackathon entrants: judges check that the software does what the submission claims, so **link every claim in the README to where it lives** (file path and, after publishing, a permalink): the payment rule (`confirmCheckout` checks), the command endpoint, the state machine, the Gemini tool declarations, the voice relay, KIBO Learn's gate, each evidence file. Add a short "Where to check each claim" table.
- State the exact model ids and regions (`gemini-3.8-flash`, `gemini-3.8-live`; Cloud Run `asia-northeast3`; voice relay `us-central1`; Vertex AI for the learner) and say which Google services do what: Gemini (Live voice agent, text agent, kiosk learner), Cloud Run (app + voice relay), Firestore (sessions, transactions), Firebase Hosting (short address), Secret Manager, Cloud Build/Artifact Registry, Cloud Monitoring uptime check. The submission description must mention Firebase, Firestore, Cloud Run and Gemini (the form asks for exactly these).
- The architecture diagram in the README must match the code (judges check this); regenerate it if any box is not in the code.
- A "Run it yourself in 5 minutes" block (clone, `.env.example`, `npm ci`, `npm run dev`, open `/demo`) that a judge can follow.
