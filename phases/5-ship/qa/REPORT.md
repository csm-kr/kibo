# Phase 5-ship QA report

Scope: the landing page `/` (all sections: hero, people, how, safety, kiosks, cloud, access, footer) at 1440×900, 1280×720, 390×844 and 320×700; `README.md` and `spikes/README.md` for content (G, I); deploy files. No other screen changed in this phase; the full `npm run qa:ui` run re-captured them with 0 H.

Commands run on 10-13 after the fixes: `npm run lint`, `npm run build`, `npm run test` (487 passed, 1 skipped), `python3 design/prototype/e2e_check.py` (42 pass), `npm run qa:ui` (13 passed, 0 H), `npm run test:e2e` (6 passed, 3 `@live` skipped: they need real Gemini).

## Angles
| Angle | Result | Notes and issues |
|---|---|---|
| A Numbers | pass (after fix) | The architecture SVG labels rendered at about 12px on phones while the check read 16px; fixed, re-checked on `home-landing-cloud-390x844.png` (I-090). Targets, focus, reflow 0 H at all four sizes |
| B Visual heuristics | pass | One focal point (the blue [Try the live demo]); sections follow one card style; captures are real app screens |
| C Flows | pass | Flow C entry: `/` → `/demo` and `/kiosk` links checked by `landing.qa.spec.ts`; the demo path itself by `demo.spec.ts` and `demo.qa.spec.ts` |
| D Journeys | pass, one open | J3 "Land": one sentence, a three-step guide, one primary button. Open: [Try the live demo] on a phone opens a split that does not fit (I-074, phase 9); the page says the demo works best on a laptop |
| E Nielsen 10 | pass | Plain words, no technical terms in the hero; the safety section says what the AI cannot do |
| F Accessibility | pass | axe 0 H; images have alt text; the diagram is a labelled, focusable scroll region with a `<title>` and a text list below it |
| G Content | pass (after fix) | No real brands; no OpenAI claim for the product (README names Codex only for offline design images; `spikes/README.md` marks OpenAI runs as dev aids); no legal-compliance claim. Every number on `/` and in the README names a file that exists and holds the value (eval 32/32, voice 1,084 ms, touch 41 taps, replay 4/4 at 0.7–5.2 s, café 40/40). One evidence path was ambiguous (I-093, fixed) |
| H First 20 seconds | pass | At 1440×900 and 1280×720 the first screen shows the logo, "Don't learn the kiosk. Just talk.", one sentence on what it does, [Try the live demo] and the demo capture; at 390×844 the buttons are above the fold |
| I Rules | pass, one open | R-001: README live-demo URL not yet verified (I-092, after the first deploy). R-002: no contract changed. R-003: `/` is in `e2e/qa/landing.qa.spec.ts`. R-004 (new, proposed) below |

## T misses on `/` (R-004)
- `axe color-contrast incomplete` on the SVG `<text>` (bgOverlap): human review, not a checker bug. Ink `#15171C` on `#EEF0FD`, `#FBF7EF` and white is about 16:1 or more; passes by eye on the screenshots.
- `spacing off the 4/8 scale` 73px and 106px (`div.mt-auto`) and 144px (`main.mx-auto`): auto margins, checker false positive (I-075).
- Other screens keep their known T misses: kiosk line height (I-041), kiosk 40px spacing (I-042), kiosk contrast review (I-043).

## Deploy review
| Item | Result | Evidence |
|---|---|---|
| Region flag | pass | `scripts/deploy.sh`: `--region asia-northeast3` on deploy and on `services describe`; OPERATIONS rollback commands also pass it |
| Secrets | pass | `GEMINI_API_KEY` only via `--set-secrets gemini-api-key:latest`; no key in a flag, env var list or file. Health logs record only the error name |
| `.env` out of the build context | pass | `.env` and `.env.*` in both `.gcloudignore` and `.dockerignore` |
| Other local files out of the build context | fixed | `.harness-logs/` (session logs), `.pytest_cache/`, `.DS_Store` added to both files (I-091) |
| Build needs only what is uploaded | pass | No file in `src/` imports from `scripts`, `e2e`, `evals`, `evidence`, `docs`, `design` or `spikes`; `npm run build` passes locally. The Cloud Build run is unverified (I-086) |
| Instances | pass | `--min-instances 1 --max-instances 3`, matching ADR-001, ARCHITECTURE and OPERATIONS |
| Runtime identity | pass | Dedicated `kibo-runtime` service account; the image runs as `USER node` |
| Public access | pass | `--allow-unauthenticated` is needed for judges and phones; actor tokens and limits protect the API (SECURITY) |
| Deep health route | pass | `/api/health?deep=1`: per-IP limit before any work; store probe with a never-issued id; `models.get` for both ids; 5 s timeout each; 60 s cache shared by concurrent callers; 200/503 with `ok`/`fail` only, no upstream text. Unverified on Cloud Run that `models.get` answers for `gemini-3.8-live` (I-086) |
| Open after the first deploy | open | Docker build and deep health on Cloud Run (I-086), `metadataBase` (I-087), README URL (I-092) |
