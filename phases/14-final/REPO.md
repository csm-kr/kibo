# Repo audit before publishing (14-final:9)

Files that look third-party, pre-hackathon, or internal, with a recommendation each. **Nothing was removed in this step**; a person decides and runs the commands (the harness shell has no `git rm`). Hard rules this serves (`docs/plan/SUBMISSION.md`): fresh code only, no third-party IP, everything in English.

## Secret scan
`npm run scan:repo` (`scripts/scan-repo.ts`) on 10-14: **295 commits (every added line of `git log -p --all`, 444,261 lines of patch), every blob in history and every file git would publish: 0 findings** (Google API keys, OpenAI keys, private key blocks, service-account JSON, Azure-style 32-hex keys next to key/subscription, `.env` files, files over 10 MB). A planted fake key in an untracked file was caught (manual check, file removed). `.env` stays ignored; `.env.example` holds names only. `docs/plan/SUBMISSION.md` also asks for gitleaks over the history; it is not installed here, so it was not run.

## Recommend removing before the repo goes public

| Path | Why | How |
|---|---|---|
| `.claude/skills/motion-demo-video/` (22 tracked files, since `fc94594`, 10-12) | The team's video-editing tool, written for other products before KIBO: its examples and notes name "Moments" (photo-moments.app) and "Flowdeck", one example has Korean marketing copy. Reads as pre-hackathon code and third-party product material; the product does not use it (I-246) | `git rm -r --cached .claude/skills/motion-demo-video`, add `.claude/skills/motion-demo-video/` to `.gitignore` (the local copy stays for the video work) |
| `.claude/worktrees/agent-af2b661da01baf837`, `.claude/worktrees/learn-r3`, `.claude/worktrees/learn-r4` (gitlinks) | Pointers to local agent worktrees, committed by accident with broad staging (I-035). On GitHub they show as broken submodules | `git rm --cached .claude/worktrees/agent-af2b661da01baf837 .claude/worktrees/learn-r3 .claude/worktrees/learn-r4`, add `.claude/worktrees/` to `.gitignore` |

## Check the origin, then keep or remove

| Path | Question | Recommendation |
|---|---|---|
| `scripts/hooks/guard_bash.py`, `scripts/hooks/stop_check.sh`, `scripts/hooks/test_guard_bash.py` (first commit, 10-12) | Agent-session hooks. `.gitignore` already keeps the harness files adapted from github.com/jha0313/harness_framework out (no license, pre-hackathon). Were these hooks written for KIBO, or adapted from that framework? | Keep if written for KIBO (`docs/SECURITY.md` cites `guard_bash.py`); remove like `scripts/execute.py` if adapted |
| `spikes/kibo-learn/`, `spikes/blind-kiosk/` (written 10-11, first commit 10-12 15:06) | Fresh-code rule: the code must be written during the hackathon. These were written the day before the repo started (README "Development timeline"). **The contest's start date was not checked in this step** (no web access) | Keep if the contest's build period had started by 10-11 (check the dashboard); otherwise say so plainly in the README timeline. They are the origin of KIBO Learn, so removing them would hide how the learner grew |
| `docs/plan/STRATEGY.md`, `docs/plan/WIN_PLAN.md`, `docs/plan/judges/` | Internal planning: scoring tactics and our own mock-judge reports (critical of the project). Planning documents are allowed; whether to show them is a taste call | Keep `NUMBERS.md`, `SOURCES.md`, `OPERATIONS.md`, `SUBMISSION.md`, `DECK_FACTS.md`, `FOOTAGE.md`; the user decides on the other three |
| `phases/HANDOFF.md`, `phases/*/step*.md` | Harness step prompts and hand-off notes. The README explains them as the build plan | Keep (they show the build in order); remove `HANDOFF.md` if it reads as internal chatter |

## Keep (explained, ours, or generated)

| Path | Why it is fine |
|---|---|
| `design/prototype/` (`Main.dc.html`, `canvas.json`, `e2e_check.py`) | UI prototype made with Claude Design for KIBO on 10-11/10-12; reference only, not shipped. Still shows the old letter-tile mark (I-217); never use its screenshots |
| `design/menu/*.jpg`, `public/menu/`, `design/menu/generate_images.py` | Menu photos generated offline (Codex image generation; the script is the earlier Gemini image run). Design assets, credited in the README |
| `spikes/blind-kiosk/results/blind-sol*`, `spikes/kibo-learn/results/openai/`, `spikes/blind-kiosks/results/dev/openai-*` | OpenAI development runs, kept for transparency and labelled never-quoted (`spikes/README.md`); no OpenAI code in `src/` |
| `spikes/voice-compare/` | Offline speech-recognition comparison (10-13); other vendors measured for reference only, not in the product |
| `spikes/blind-kiosks/` (kiosks bk1–bk10, answer keys, graders, runs) | Synthetic kiosks built by separate AI agents for this project, fictional brands |
| `public/learned-kiosks/doughhouse/`, `public/learn/` | Our own pizza kiosk page and recorded learning runs of our synthetic kiosks |
| `e2e/fixtures/*.wav` | Gemini TTS voices made for the tests; no real person's voice |
| `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` | Instructions for the coding agents, written for KIBO, English |
| `package-lock.json` (6,865 of the first commit's 25,892 lines) | Generated by npm. Dependencies come from npm under their own licenses and are not vendored; fonts load through `next/font` and are not in the repo |

## Already out of the repo (`.gitignore`)
`plan.md` (Korean), `videos/` (renders, footage, a copy of the app with its own `.env`), `docs/ko/`, the adapted harness files (`scripts/execute.py`, `scripts/test_execute.py`, `.claude/commands/harness.md`, `.claude/commands/review.md`), `.harness-logs/`, QA screenshots, `.env*` except `.env.example`.

## Before publishing (a person)
1. Decide the rows above and run the `git rm --cached` commands; commit.
2. Confirm the contest start date against the timeline (I-246 notes, JUDGE_QA E2).
3. Optionally run gitleaks; re-run `npm run scan:repo` after the last commit.
4. Confirm `REPO_OWNER` in `src/lib/repo.ts` (`csm-kr`) matches the GitHub repo, then create it and push.
