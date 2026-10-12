# Worked ads (Moments, 2026-10-12)

| folder | length | reference | verdict |
|---|---|---|---|
| `drums/` | 50 s | Apple "The new MacBook Air with M5" (`../../references/ads/drums.md`) | **user's pick: the default style** |
| `orch/` | 60 s | Google Photos "Best Picture" (`../../references/ads/orchestral.md`) | slow / emotional briefs |
| `violin/` | 40 s | Sony "Music Bridges Us" (`../../references/ads/violin.md`) | quiet / intimate briefs |

Each folder has `index.html` (composition with `window.__cues`), `score.py` (score synthesized from `cues.json`), and `PLAN.md` (reference, what was borrowed and why, timeline sheet).

These were built in a scratch workspace, so adjust paths when you copy one:
- `score.py` imports `audio.py` from `../lib`. In this skill it lives at `engine/audio.py`.
- Sample folders were `pm/samples/{vsco,sfx,piano}`. Fetch them again:
  - VSCO-2-CE (`github.com/sgossner/VSCO-2-CE`, CC0)
  - HyperFrames SFX (`heygen-com/hyperframes` → `skills/media-use/audio/assets/sfx`, Pixabay license)
  - Salamander piano (`tonejs.github.io/audio/salamander/`, CC-BY 3.0)
- `assets/` (app captures, demo photos) are not included. Capture them again with `references/aside-capture.md`.
