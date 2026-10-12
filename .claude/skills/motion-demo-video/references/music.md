# Music from a real track (Lyria and others): generate, measure, fit

Default is composing to the cue list (SKILL.md step 4). Use this only when a real track is required.

## Generate with Lyria (Vertex AI)

```bash
curl -s -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/<PROJECT>/locations/us-central1/publishers/google/models/lyria-002:predict" \
  -d '{"instances":[{"prompt":"...","negative_prompt":"vocals, singing, abrupt ending","seed":11}],"parameters":{}}' -o resp.json
# predictions[0].bytesBase64Encoded -> WAV, 48 kHz, always 32.77s
```

- Each call returns **one 32.77s clip**, whatever the video length. `sample_count: 3` still returned one clip; use separate calls with different `seed` values to get candidates.
- Write the arc into the prompt: "opens sparse solo piano ... builds ... climax ... resolves on a sustained chord". Lyria follows the arc loosely. It ignores timestamps and usually does **not** end cleanly: the clip stops mid-phrase.
- Generate 3 candidates and choose by measurement, not by the prompt.

## Measure (no listening needed)

`.venv/bin/python engine/music-analyze.py clip.wav` (needs numpy) prints loudness per second, an estimated BPM with the first-beat phase, and the 12 strongest onsets (moments where a new note or hit starts).

Pick the clip whose loudness curve matches the video's arc (quiet open, rise into the payoff, peak at the accent moment). Then find one **offset** that lines its strongest onsets up with the video's big events. Moments v2: delaying the music 0.4s put the hits at 12.6s (photo flight), 23.0s (color flood), and 31.0s (logo).

## Fit the length and ending

- Too short or no ending: on a beat near the end, crossfade into the clip's own quiet opening bars (same key and sound), then fade out. Moments v2 joined at 32.8s, exactly when the CTA appears.
- Then run `loudnorm=I=-16:TP=-1.5`, then `alimiter=limit=0.84`. loudnorm alone still left peaks at 1.0.
- Mux without re-rendering: `ffmpeg -i video.mp4 -i score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out.mp4`.
- Check the result: per-second loudness, the join (no gap longer than about 0.2s), the last 0.5s near -40 dB, and peak below 0.9.
