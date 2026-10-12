---
name: motion-demo-video
description: Plan and build a motion-graphics product demo or ad video (kinetic typography + real product footage + a score synthesized to the cuts) as HTML/JS rendered frame-accurately to MP4 by our own engine, reference-driven. Default style is a drum-driven, hit-locked Apple-style edit. Use when making the KIBO hackathon demo video, a promo clip, or any app demo/teaser video.
---

# Motion demo video

Method distilled from "Opus 5.5로 미친 수준의 모션그래픽 만들기" (youtube.com/watch?v=O0NR110DmLk). In that video the model wrote the motion graphics itself as JavaScript, with no special skill. This skill adds only what the model cannot do alone: a planning discipline that made the difference, a transition grammar read frame by frame from the winning results (`references/youtube-analysis.md`), and a deterministic renderer (`engine/`) that turns the HTML into an MP4. `examples/moments-v2.html` is a full 36s composition that uses every technique below.

The biggest quality lever is **a reference video plus an explicit plan before any code**. The no-reference version came out flat: weak narrative, no build-up, "coded" sounding music.

## Default style: the hit-locked edit

Three Moments ads were made the same way: orchestral 60s, solo violin 40s, and Apple-style drums 50s. The user picked the **drum 50s** because "the music and the transitions match." Sync is in all three. It only becomes *audible* when the picture changes often and every change has a sound. Slow orchestral or rubato edits hide it. Start every demo or ad from this style unless the brief asks for something else. Template: `examples/ads/drums/` (`index.html`, `score.py`, `PLAN.md`). Reference: `references/ads/drums.md` (Apple "The new MacBook Air with M5").

**Grid and density**
- 100 BPM: 1 beat = 0.6 s = 18 frames at 30 fps, 1 bar = 2.4 s.
- About one visible event per beat: a cut, peel, punch-in, sticker pop, keystroke, or ring. Never go more than two beats without one, except in the planned breath and the stop.
- **Cuts land on downbeats. Word and sticker pops land on the offbeat (+0.15 s, the next 16th).** The offbeat volley then reads as a drum fill.
- **Peel volleys run on 8ths (0.3 s).** Screens or cards peel away like stickers to reveal the next. Use this for "many things become one", e.g. the auto-made Moments after an upload.
- Type cuts in on 0 frames, with no fades or blurs on text. Punch-ins take 1–3 frames (2 is typical). A whip is the only other move.

**Accent map**
- The biggest reveal sits on the biggest hit. The drop is the first real product screen. The strongest claim (price, "free", the key number) gets the loudest accent.
- One feature = 4 beats:
  1. The last keystroke lands on a hit.
  2. The result lands on the next hit.
  3. The accent ring (brand color) draws on the next hit.
  4. Punch into the proof.

**Arc (50 s)**
1. **0–4.2 s:** intro with no rhythm. Macro shots of real moments, foley, a low drone.
2. **4.2–4.8 s:** a breath (near silence). The hero dot appears.
3. **4.8 s drop:** hard cut to the first real UI. Full groove starts.
4. **Feature blocks**, each 4–8 beats. Copy lives *inside* the UI: stickers, notes, the search box, the comment box, titles. Use heavy 800–900 weight and 6 words or fewer.
5. **One quiet feature.** Low-pass the groove and drop the hats. The content stays quiet while the edit stays busy (three punch-ins).
6. **Build.** A collage floats out of frame over a brass riff. A riser ends 0.1 s before the stop.
7. **Stop:** the wordmark holds with no cuts. Kick out, then a fill.
8. **Re-entry hit** adds the URL or CTA.
9. **Last ~5 s:** silent end card.

**Score** (`examples/ads/drums/score.py`, built on `engine/audio.py`)
- A live-feel groove:
  - syncopated kick on 16ths, alternating pattern per bar
  - backbeat snare with ghost notes
  - 8th hats, 16th shaker, interlocking hand percussion
  - 2-bar bass ostinato
  - short brass stabs (VSCO trumpet and horn, short envelopes) on accents
- Humanize timing ±8 ms and velocity ±10%. A minor i–IV vamp (Dm7–G9) carries 50 s without fatigue.

**Verify**
- Every key cue (drop, last key, result, ring, stop, re-entry) has its onset within ±1 frame (33 ms) of its frame.
- When you read a reference, compare cut-to-onset matches against chance. A busy groove has an onset on 87% of random times.

Orchestral (`examples/ads/orch`) and solo violin (`examples/ads/violin`) remain for briefs that ask for slow or emotional. Even there, keep visible events on the strong beats.

## Hard constraints (hackathon submission)

- Length **≤ 2:50** (rules: strictly under 3:00). Verify with `ffprobe`.
- English on-screen text and captions.
- **Every feature shown must be real footage or real screenshots of the deployed app.** Motion graphics frame and explain it; they never fake a feature. Judges drop submissions with inadequate working-functionality demonstration.
- No third-party brands, logos, copyrighted music or images. Music must be licensed for public use.
- Upload as a **Public** YouTube video.

## Workflow

### 1. Context pack → `video/context/`

- What the product is, who it is for, the one-liner (from `plan.md`, the landing page, docs).
- Brand: colors, fonts, logo, read from the product's CSS/theme. The video should look like the product.
- **Real footage**: record each hero flow with Playwright (`page.video` or screenshots per step) or screen capture. 60fps if possible, clean demo data, no notifications. Convert clips to H.264 MP4 or WebM.
- **Login-only app?** Capture inside the real logged-in app with Aside, not the marketing page's animations. Screenshot once per keystroke for typing, loop screenshots for loading, and measure each UI target's rect in the same call. See `references/aside-capture.md`.
- Real accounts carry real faces and names. Say so to the user before the video leaves the machine.

### 2. Reference

- Pick 1–2 reference videos. For app demos browse keyframe.gallery. The style that won in the source video: ChatGPT Work's demo (text and product screens alternate, dynamic zoom in/out, music tension and release).
- Watch each reference with `/watch` (frames + transcript). If download fails (YouTube 403 is common), grab frames through Aside (`references/aside-capture.md`). Do not invent visuals from a transcript.
- Look at transitions at 0.25s per frame. For each chapter boundary, write down *what object carries the eye across it*. That list is what you borrow.
- If you have a folder of many references, hand over the whole folder and ask which ones fit **and why**.

### 3. Direction memo + timeline sheet → `video/PLAN.md` (get user approval before building)

Answer:
1. Which parts of the reference you borrow, and **why** each fits this product.
2. Video direction: story arc, pacing, type style.
3. **Hero object**: one element that travels through the whole video and carries every chapter change. Take it from the product itself (Flowdeck's NOW dot, Moments' orange period after every title). It must end as part of the logo.
4. **Persistent frame**: what stays fixed while scenes change (a bottom caption pill whose words change, a HUD with chapter `01 / 04`, timecode, BPM). This is what makes 8 scenes read as one piece.
5. **Accent payoff**: the moment the brand accent color first takes over (focus ring, color flood). Hold it back until then.
6. Music direction: where it builds, drops, resolves; instruments (see step 4).

Then a **timeline sheet**: `time | scene | on-screen text | footage/visual | camera | transition out | sound`.
- `camera`: the virtual camera target and zoom (e.g. `macro on search input → full screen`).
- `transition out`: name a technique from the vocabulary below plus the object that carries it (e.g. `shared element: first result photo → lightbox photo`). "fade" or "cut" is only valid where the rules below allow it.

### Craft rules (what separated the winning results in the source video)

- **Continuous transitions across chapters.** An object from one scene becomes the next (see the vocabulary below). **Never blink, flash, or cut to black between chapters.** This was the deciding factor in the first test: the losing showreel had beautiful scenes joined by blinks and fades.
- **Story continuity beats per-scene polish.** Each scene hands off to the next; the whole should feel like one shot.
- **Kinetic typography acts out the meaning.** "guess" jitters, "spin" rotates, "consistency" letters snap into alignment, "instantly" snaps in. Do this with intent, not decoration.
- **Purpose over art.** For demo and education videos, the viewer must get the point immediately. A clear and direct cut beats a beautiful and vague one.
- **Open with the viewer's own problem** (empathy words) before showing the product.
- **Alternate typography and product footage:** each claim in text is immediately *proven* by a product shot.
- **Zoom in** on the exact UI moment that matters, then zoom out for context.
- Music starts calm, **builds** to the payoff, and resolves on logo + CTA. Cut on beats.

### Transition vocabulary (pick one per chapter boundary)

| technique | what happens | seen in |
|---|---|---|
| **Object becomes background** | the hero dot scales up until its color is the next scene's background | showreel 2:45, dot → orange field |
| **Object becomes UI** | the dot stretches into a real UI shape (focus ring, button, chip), then real footage fades in under it | Moments v2: period → search focus ring |
| **Shape morph** | a grid or object keeps its position and only changes shape (circle → square → star) | showreel grid |
| **Collapse → burst** | everything shrinks into one point, which explodes into particles that regroup as the next word | showreel 2:50 |
| **Gather / merge** | particles gather into a word; blobs merge into one sphere (metaball) | showreel 2:51, 2:55 |
| **Macro zoom continuity** | camera sits on the typed text, then pulls back to the whole screen without a cut | ChatGPT Work, Flowdeck input |
| **Push-in + dim** | camera dives into the one control that matters, focus ring draws, the rest dims | Flowdeck NOW button |
| **Shared element** | the same photo/card flies from a list into its detail view and back | Moments v2: result tile → lightbox → moment tile |
| **Dot match cut** | zoom into a small brand mark, swap it for a vector copy, grow it into a flood, shrink it onto the same mark on another screen | Moments v2: title period → flood → greeting period |
| **Color flood** | the background fills with the accent while the camera pulls out; use once, at the payoff | Flowdeck purple, kinetic-type green |
| **Fixed frame, swapped content** | the frame stays still; only what is inside it changes (light board → dark board, keyword → keyword) | Flowdeck ending, "People Ops. → Everyone." |
| **Motion-blur whip** | words or screens slide out sideways with blur while the next slides in | ChatGPT Work, showreel copy |

Hard cuts are allowed only (a) inside a montage of ≤0.3s shots, or (b) on a beat where the cut itself is the accent. In the default hit-locked style, most cuts are (b). What stays forbidden everywhere is blinks, flashes, cuts to black, and cuts off the grid. Crossfades are allowed only *under* a covering object (fade the screen in beneath the ring or flying photo), never as the transition itself.

Where to find the hero object: a dot or period in the logo, the brand accent on one UI element, a recurring control (a Save button that appears in every scene), the product's main card. If the product has nothing like this, a single colored dot still works, but say in the memo why it fits.

### Virtual camera over real screens

- Put every captured screen at its native pixel size (e.g. 2880×1800) inside one `#cam` layer. The camera is `{cx, cy, z}`: the screen point at stage center, and how many screen pixels span the 1920px stage width.
- Evaluate the camera **from time alone** (a list of moves, each starting where the previous ended) instead of stateful tweens, so any seek order renders the same frame. Interpolate `z` in log space so zooms feel even. See `camTo` / `camAt` in `examples/moments-v2.html`.
- A full-screen view of a 16:10 capture is `z ≈ 3240` for 2880px, which leaves a margin so the screen reads as a floating card.
- Macro zooms need a 2× capture. Past about 1.5× of the capture's own pixels text goes soft; that is where you swap to a vector copy (the dot match cut).
- Keep camera framing clear of the caption pill. If the target sits at the screen edge, let the camera go past the screen; the card edge and empty background are fine.

### Beat grid

- Choose the BPM before timing anything (100 BPM = 0.6s per beat). Put scene boundaries, word swaps, and landings on beats, and start each transition so it **lands** on the downbeat (start = beat − duration).
- Speed-up swaps (task words, titles) shorten their gaps by about 20% each step.
- When the music arrives, measure its real beat times and snap the constants to them.

### 4. Music and sound: compose to the timeline, not the other way round

A generated or licensed track has its own clock, so its hits only roughly meet the cuts. The default is to **synthesize the score from the composition's own cue list**, so every sound sits on the exact frame that caused it.

1. In `index.html`, register a cue next to every audible event with the same constants that drive the picture: `cue(t, 'key' | 'cam' | 'fly' | 'riser' | 'impact' | 'land' | ...)`. Camera moves can be emitted automatically from the camera list. Expose `window.__cues` and `window.__T`.
2. `node cues.mjs > cues.json` dumps them (needs `__ready`).
3. `python score.py cues.json score.wav --samples <dir>` (numpy) builds music and sound design on a 100 BPM grid. For the default style, start from `examples/ads/drums/score.py`. 100 BPM is 18 frames per beat at 30 fps, so beats never drift off frames. Arrange sections from `T` (intro → groove → quiet → riser → impact → resolve), and keep the hero object's own sound (a bell) for every dot moment. `engine/score.py` is the Moments v2 score. Its instruments, SFX placement, and mix are reusable. Its section map (`CHORDS`, `QUIET`, `CLIMAX`) reads Moments' `T` keys, so rewrite that part for each video.
4. Normalize to -16 LUFS, limit peaks to 0.84, and mux with `-c:v copy`. Picture does not re-render.

Sound-design rules (HyperFrames beat-direction, explainroo, OpenMontage):
- Place one-shots by their **loudest moment**, not their file start: `start = cue − peak_offset`.
- A whoosh peaks at the camera's top speed, which is the middle of an inOut move.
- A riser **ends** 0.15s before the hit. Leave one breath of silence, then impact, with the music ducked about 6 dB for 0.3s.
- Keep at most about 3 SFX per 0.5s (typing is the exception). Drop the drums in the quiet chapter, so the music acts out the copy.
- The ending chord lands on the frame where the hero object becomes part of the logo.

Samples: Salamander Grand Piano via `https://tonejs.github.io/audio/salamander/<C|Ds|Fs|A><2-7>.mp3` (CC-BY 3.0: credit it). SFX from HyperFrames `skills/media-use/audio/assets/sfx/` (Pixabay Content License: commercial use, no credit needed). Download them into their own folder. Without samples, `score.py` falls back to FM synth voices.

Orchestral, solo-instrument, or drum scores: use `engine/audio.py` (multi-sample `Sampler` with sustain looping, peak-aligned `OneShot`, `Mix` buses with convolution reverb and ducking, `master()`). Source samples: VSCO-2-CE (`github.com/sgossner/VSCO-2-CE`, CC0) for strings, brass, harp, glock, timpani, and orchestral percussion. **Most VSCO folders name middle C "C3", so pass `octave=1`. Solo violin and harp are labelled correctly.** Check new libraries with an f0 estimate before trusting the filenames. Three worked ads, each pairing a reference analysis with a score, live in `examples/ads/` and `references/ads/`:
- orchestral 60s (Google Photos "Best Picture")
- solo violin 40s (Sony "Music Bridges Us")
- Apple-style drums 50s (MacBook Air M5)

Measure the reference's music too, not only its picture. Aside can record a YouTube ad's audio with `captureStream()` → `MediaRecorder`; see `references/ads/*.md`. Then compare its cut times with its onsets and breaths against chance before copying a rule.

Alternative when a real track is required (Lyria, ElevenLabs Music, a licensed song): measure it with `engine/music-analyze.py` and snap the timeline constants to its beats. See `references/music.md` for Lyria specifics (fixed 32.77s clip, no clean ending). Name instruments and mood in the prompt: from a reference the model can read loudness and tempo, but not instruments.

### 5. Build with `engine/`

Scaffold once:

```bash
cp -R "<this skill dir>/engine" video/ && cd video && npm i
```

- Author `video/index.html`. It holds one fixed 1920×1080 `#stage`, and **all motion comes from ONE paused GSAP timeline**. The contract is in the template header: `window.__duration`, `window.__seek(t)`, `window.__ready`.
- **Never use CSS animations/transitions, `setTimeout`, or `requestAnimationFrame` for motion.** The renderer seeks time frame by frame, so wall-clock motion will not appear in the output.
- Footage: `<video src=... data-start="<sec>" muted preload="auto">`. The template's `__seek` syncs it. Screenshots work as `<img>`. Zooms are GSAP transforms on the footage layer.
- Keep timeline-sheet times as named constants at the top of the script, so retiming is a one-line edit.
- Start from `examples/moments-v2.html` when the video uses real screens. It has the camera (`camTo`/`camAt`/`toStage`), stepwise footage playback (`seq`), dot → ring morph, shared-element flight, dot flood, and a caption pill that resizes to its text. Build the timeline after `document.fonts.ready` so text slots can be measured for the hero dot.
- Preview: open `index.html` and call `__seek(t)` from the console, or render a short range: `node render.mjs index.html out/draft.mp4 --from 10 --to 16`.
- Render: `node render.mjs index.html out/demo.mp4 --fps 30 [--audio score.wav]`. It uses the installed Google Chrome, because the bundled Chromium cannot decode H.264. Override with `CHROME_PATH`.

### 6. Review loop

1. Render a draft, then extract frames at each timeline-sheet boundary: `ffmpeg -ss <t> -i out/draft.mp4 -frames:v 1 f_<t>.png`. Look at them: legibility at phone size, overlaps, empty frames.
2. `/watch out/draft.mp4` for pacing and transitions.
3. Check every claim has proof footage and no transition blinks. Extract frames at 0.1–0.2s steps across **every** chapter boundary and confirm the hero object is on screen in each one. Fix, then re-render.
4. Final: `ffprobe` duration ≤ 170s (hackathon), H.264 MP4, English captions (`.srt` or burned in), plus a 1280×720 thumbnail.

## KIBO default arc (starting point, adjust in step 3)

Cut it to the hit-locked arc above. Put the kiosk struggle in the no-rhythm intro, the breath before "Just talk.", and the drop on the first real phone screen. Make each feature a 4-beat block: one sentence, cart builds, change drink, confirm, pay, other language. Put the logo in the stop.

Problem (a person stuck at a complex kiosk, real touch flow footage) → "Don't learn the kiosk. Just talk." → split screen phone + kiosk: one sentence → cart builds itself live → change drink → confirm → card payment animation → same order in another language at a Korean-only kiosk → architecture (Gemini, Firestore, Cloud Run) → scale (hospital, airport, ticketing) → logo + CTA.
