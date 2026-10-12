# Speech recognition for kiosk orders: offline comparison

Run on 2026-10-13 KST (2026-10-12 20:20 to 21:45 UTC) from the developer's laptop. One run per system. Synthetic speech only.

**Product rule:** KIBO uses Google/Gemini AI only. Rows marked † (OpenAI, Microsoft) are an **offline comparison, not used in the product**.

## Setup

- **Utterances:** 20 Korean and 10 English kiosk orders for the fictional MALO BURGER menu (`dataset.json`): menu names, counts, set / large set, edits ("감자튀김 둘 다 라지로 바꿔 주세요"), questions ("할랄이에요?") and short answers ("네", "결제할게요", "Yes."). Each lists its key terms (menu names, numbers, options) with accepted spellings.
- **Voices:** Gemini TTS `gemini-3.8-flash-tts`, prebuilt voices `Kore` (female, firm), `Puck` (male, upbeat) and `Gacrux` (mature) with the inline style tag `[slowly, elderly voice]` (about 2x slower, with pauses). Not real people, not recorded on a phone.
- **Audio:** 16 kHz mono 16-bit WAV, resampled from 24 kHz with a windowed-sinc filter, speech normalized to -20 dBFS, 0.3 s silence before and 1.0 s after. Noisy copy: pink noise plus quiet babble (3 other TTS utterances overlapped, 6 dB below the pink noise), scaled to **10 dB SNR** over the speech part. 30 × 3 voices × 2 = **180 clips**.
- **TTS fixes:** two slow-voice takes were wrong and were re-synthesized before the final runs, and the 9 affected clips (their own 4 clips plus 5 noisy clips that used them as babble) were re-run on every system: `ko15_gacrux_slow` spoke the style tag aloud ("Slowly, elderly voice…", 3 retries) and `ko08_gacrux_slow` said "성적을 내줄게요" instead of "결제할게요" (all 9 systems heard the same). The final check reports no clean clip that every system missed on the same term.

### Systems (exact ids)

| Row | System | How it ran |
|---|---|---|
| `gemini-live` | Gemini Live `gemini-3.8-live` | Gemini API (`@google/genai` 2.28.0), response modality AUDIO, instruction "You are a kiosk ordering assistant. Listen.", `inputAudioTranscription: {}` (the product's setting). Real-time stream, 40 ms chunks. |
| `gemini-live-lang` | same | + `inputAudioTranscription.languageCodes: ["ko-KR"]` or `["en-US"]` (the clip's language) |
| `gemini-live-vocab` | same | + `languageCodes` + `customVocabulary` (menu names) |
| `gemini-live-menu` | same | `inputAudioTranscription: {}`, menu names added to the system instruction (the product's instruction carries the whole menu) |
| `gemini-transcribe-live` | Gemini realtime transcription `gemini-3.5-transcribe-live` | Same streaming; needs response modality TEXT (AUDIO is rejected, close 1007) |
| `gemini-transcribe-live-lang` / `-vocab` | same | + `languageCodes` / + `languageCodes` + `customVocabulary` |
| `gemini-flash-batch` | `gemini-3.8-flash` `generateContent` | WAV inline, "Transcribe exactly. Output only the transcript.", default thinking |
| `chirp3` | Cloud Speech-to-Text v2 `chirp_3` | `recognize`, location `us`, recognizer `_`, `languageCodes` ko-KR / en-US. `asia-northeast1` answers 403 ("no longer generally available in region") and `global` has no `chirp_3`. |
| `chirp3-hints` | same | + inline phrase set of menu names, boost 10 |
| `openai-batch` † | OpenAI `gpt-transcribe` | `/v1/audio/transcriptions`. The key cannot list models (403, missing `api.model.read`); probing found `gpt-transcribe`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe(-2025-12-15)`, `gpt-4o-transcribe-diarize` working. `gpt-transcribe` is the newest (released 2026-07/08). |
| `openai-realtime` † | OpenAI `gpt-live-transcribe` | Realtime WebSocket `?intent=transcription`, session type `transcription`, PCM 24 kHz. This model has no server VAD, so the client commits after the clip (speech + 1 s silence). |
| `mai-transcribe-2` † | Microsoft `MAI-Transcribe-2` | Fast transcription REST, `api-version=2025-10-15`, East US resource, `enhancedMode`, locale ko / en |
| `mai-transcribe-2-hints` † | same | + `phraseList.phrases` = menu names |
| `mai-voicelive` † | `mai-transcribe-2` via Azure Voice Live | WebSocket `api-version=2026-04-10`, session model `gpt-4.1-mini` (`gpt-realtime` and `gpt-realtime-mini` are "not supported in this region"), `input_audio_transcription.model = mai-transcribe-2`, server VAD with `create_response: false` |

Hints (all "-hints", "-vocab", "-menu" rows) come from `data/kiosks/malo.json` item and option names plus 세트, 라지세트, 단품, 포장, 매장, 결제, 취소, 라지 (and English equivalents). Nothing is copied from the test sentences; 할랄 is not a hint.

### Metrics

- **Korean CER / English WER**, corpus level (total edits / total reference length). Korean ignores spaces and punctuation and maps 하나 / 한 개 / 1개, 두 개 / 2개 and so on to one form. A failed clip counts as an empty transcript.
- **Key-term recall** (the main kiosk metric): share of required terms found, with listed spellings (제로콜라 / 제로 콜라, 코울슬로 / 콜슬로, 해시브라운 / 해쉬브라운 / 헤시브라운; the last two were added after a first look at the results and apply to every system). "All-terms clips" = clips with every term right.
- **Latency.** Streaming: end of speech (measured on the clean clip) → last transcript piece. Batch: request round trip. Batch rows ran with several requests in parallel, which inflates their round trip a lot (Gemini Flash 10.7 s vs 2.5 s alone), so the unloaded sample table is the fair batch number. Streaming and batch latency are not comparable.
- **Failures:** error or empty transcript.

## Main findings

1. **Gemini Live hears Korean menu names well, but not perfectly.** As shipped (`inputAudioTranscription: {}`), Korean key-term recall is 96.6% clean and 93.7% noisy; transcripts arrive about 1.15 s after the end of speech, the fastest streaming result here.
2. **One setting fixes the worst errors: `languageCodes`.** Without it, Live returned *no transcript at all* for 5 of 6 "네" clips, turned "I'll pay now" into "opinión" / "appena", a noisy "할랄이에요?" into "¿Qué?", and in noise heard 매콤 치킨버거 as "베이컨 치킨 버거" (twice), which is a *different item on the same menu*. With `languageCodes` set to the session language, every one of those was right except 할랄 (Korean recall 97.1% / 95.4%, English 100%), at the same latency.
3. **On `gemini-3.8-live`, `customVocabulary` and menu names in the system instruction change nothing in the transcript**: all 180 transcripts were identical to the run without them (`gemini-live-lang` = `gemini-live-vocab`, `gemini-live-menu` = `gemini-live`). The input transcription is a separate recognizer; it does not see the instruction. Whether the model's own understanding (its tool calls) improves with the menu was not measured here.
4. **`gemini-3.5-transcribe-live` does use `customVocabulary`**: recall rises from 96.6% / 93.1% (97.7% / 93.7% with `languageCodes` alone) to 98.9% / 97.7%, the best Google streaming result. But it rewrites toward the vocabulary entries: "치킨너겟 하나" became "치킨너겟 6조각 하나", "매콤 윙은" became "매콤 윙 4조각은", "라지" became "L". Words that were never said, including counts, are a risk for an ordering app. Vocabulary should list spoken forms (치킨너겟, 매콤 윙), not display names with counts.
5. **The most accurate Google option is Chirp 3 with phrase hints** (Korean CER 0.8% / 1.2%, recall 98.3% / 98.3%; its only misses were the 6 할랄 clips), but it is batch only (median 1.7 s per call alone).
6. **With `languageCodes`, the remaining Live misses are a few words**: 매콤 윙 (매콤밍, 매콤 우잉, 내 고향), 해시브라운 (헤이즐넛, 헤이즐브라운) and 초코 선데 (선대). 할랄 was missed by every system most of the time (0 to 4 of 6 clips; usually written as the pronunciation 할라리에요 or as 할 날이에요), so it says more about the word and the TTS than about Gemini.
7. **Short answers are slow to close.** For "네" and "Is this halal?" the server's end-of-speech detection sometimes waited 3.5 to 8.9 s (median stays ~1.15 s). Both Gemini streaming models share this.

### Where a non-Google system was better (offline comparison only)

- **Microsoft MAI-Transcribe-2 (batch)** was the strongest Korean recognizer without hints: CER 1.3% / 2.0% and recall 98.9% / 97.1%, better than Chirp 3 without hints (1.5% / 2.7%, 97.1% / 96.0%) and about equal to Chirp 3 with hints. With its phrase list it had the lowest clean Korean CER (0.6%). But its round trip was slow and erratic during this run: one request at a time, median 6.3 s (0.8 to 68 s), or 3.5 s with the phrase list (0.5 to 30 s); under our parallel load, medians of 43 to 145 s. Through Voice Live (streaming) 14 of 180 clips failed with "MAI Transcribe recognition timed out after 30.0s", and noisy Korean recall fell to 82.8%. As measured, it is not usable for a live kiosk conversation.
- **OpenAI `gpt-transcribe`** had the fastest batch round trip (about 0.76 s alone) but was less accurate on Korean than every Google row (recall 93.7% / 91.4%). **`gpt-live-transcribe`** was weak on noisy Korean (recall 83.9%, only MAI via Voice Live was lower) and on the slow voice (78.4%).
- No non-Google streaming option beat Gemini Live on Korean accuracy or latency.

<!-- tables:start -->
### Summary (Korean)

CER = character error rate over all clips (total edits / total reference characters, after removing spaces and punctuation; lower is better). Key-term recall = share of required menu names, numbers and options found (higher is better). All-terms = share of clips with every key term right. Latency: streaming = end of speech → final transcript; batch = request round trip (not comparable). † = offline comparison, not used in the product.

| System | Kind | CER clean | CER noisy | Key-term recall clean | Key-term recall noisy | All-terms clips (both) | Median latency ms (clean / noisy) | Failures |
|---|---|---|---|---|---|---|---|---|
| gemini-live | stream | 1.7% | 3.7% | 96.6% | 93.7% | 85.8% | 1144 / 1161 | 5/120 |
| gemini-live-lang | stream | 1.6% | 2.5% | 97.1% | 95.4% | 89.2% | 1142 / 1149 | 0/120 |
| gemini-live-vocab | stream | 1.6% | 2.5% | 97.1% | 95.4% | 89.2% | 1138 / 1154 | 0/120 |
| gemini-live-menu | stream | 1.7% | 3.7% | 96.6% | 93.7% | 85.8% | 1138 / 1148 | 5/120 |
| gemini-transcribe-live | stream | 2.8% | 4.9% | 96.6% | 93.1% | 85.0% | 1300 / 1308 | 0/120 |
| gemini-transcribe-live-lang | stream | 1.5% | 3.7% | 97.7% | 93.7% | 87.5% | 1291 / 1300 | 0/120 |
| gemini-transcribe-live-vocab | stream | 3.6% | 4.0% | 98.9% | 97.7% | 95.0% | 1281 / 1292 | 0/120 |
| gemini-flash-batch | batch | 1.3% | 3.4% | 98.3% | 97.1% | 93.3% | 10666 / 10641 | 0/120 |
| chirp3 | batch | 1.5% | 2.7% | 97.1% | 96.0% | 90.0% | 7473 / 7753 | 0/120 |
| chirp3-hints | batch | 0.8% | 1.2% | 98.3% | 98.3% | 95.0% | 8381 / 8623 | 0/120 |
| openai-batch † | batch | 3.5% | 4.9% | 93.7% | 91.4% | 79.2% | 3359 / 3324 | 2/120 |
| openai-realtime † | stream | 3.2% | 12.5% | 94.3% | 83.9% | 72.5% | 1923 / 1910 | 0/120 |
| mai-transcribe-2 † | batch | 1.3% | 2.0% | 98.9% | 97.1% | 94.2% | 43244 / 52041 | 0/120 |
| mai-transcribe-2-hints † | batch | 0.6% | 2.2% | 98.9% | 98.3% | 95.8% | 103488 / 108509 | 0/120 |
| mai-voicelive † | stream | 6.6% | 14.9% | 93.7% | 82.8% | 85.8% | 2142 / 2546 | 11/120 |

### Summary (English)

WER = word error rate over all clips (total word edits / total reference words, lowercase, no punctuation).

| System | Kind | WER clean | WER noisy | Key-term recall clean | Key-term recall noisy | All-terms clips (both) | Median latency ms (clean / noisy) | Failures |
|---|---|---|---|---|---|---|---|---|
| gemini-live | stream | 1.7% | 2.2% | 98.8% | 97.5% | 95.0% | 1222 / 1176 | 0/60 |
| gemini-live-lang | stream | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 1220 / 1175 | 0/60 |
| gemini-live-vocab | stream | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 1216 / 1173 | 0/60 |
| gemini-live-menu | stream | 1.7% | 2.2% | 98.8% | 97.5% | 95.0% | 1220 / 1175 | 0/60 |
| gemini-transcribe-live | stream | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 1362 / 1304 | 0/60 |
| gemini-transcribe-live-lang | stream | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 1356 / 1310 | 0/60 |
| gemini-transcribe-live-vocab | stream | 0.6% | 0.6% | 98.8% | 100.0% | 98.3% | 1351 / 1316 | 0/60 |
| gemini-flash-batch | batch | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 9877 / 9897 | 0/60 |
| chirp3 | batch | 0.6% | 0.0% | 100.0% | 100.0% | 100.0% | 6754 / 6771 | 0/60 |
| chirp3-hints | batch | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 7518 / 7618 | 0/60 |
| openai-batch † | batch | 1.1% | 0.6% | 98.8% | 98.8% | 96.7% | 3001 / 3018 | 0/60 |
| openai-realtime † | stream | 0.0% | 1.7% | 100.0% | 97.5% | 96.7% | 1890 / 1893 | 0/60 |
| mai-transcribe-2 † | batch | 0.0% | 0.0% | 100.0% | 100.0% | 100.0% | 73423 / 73391 | 0/60 |
| mai-transcribe-2-hints † | batch | 0.0% | 0.6% | 100.0% | 98.8% | 98.3% | 138067 / 144617 | 0/60 |
| mai-voicelive † | stream | 10.0% | 3.3% | 90.1% | 96.3% | 95.0% | 2145 / 2388 | 3/60 |

### Korean key-term recall by voice (clean + noisy)

| System | kore | puck | gacrux_slow |
|---|---|---|---|
| gemini-live | 96.6% | 95.7% | 93.1% |
| gemini-live-lang | 97.4% | 95.7% | 95.7% |
| gemini-live-vocab | 97.4% | 95.7% | 95.7% |
| gemini-live-menu | 96.6% | 95.7% | 93.1% |
| gemini-transcribe-live | 96.6% | 96.6% | 91.4% |
| gemini-transcribe-live-lang | 96.6% | 96.6% | 94.0% |
| gemini-transcribe-live-vocab | 99.1% | 98.3% | 97.4% |
| gemini-flash-batch | 98.3% | 98.3% | 96.6% |
| chirp3 | 96.6% | 97.4% | 95.7% |
| chirp3-hints | 98.3% | 98.3% | 98.3% |
| openai-batch † | 95.7% | 91.4% | 90.5% |
| openai-realtime † | 94.8% | 94.0% | 78.4% |
| mai-transcribe-2 † | 98.3% | 98.3% | 97.4% |
| mai-transcribe-2-hints † | 98.3% | 99.1% | 98.3% |
| mai-voicelive † | 91.4% | 84.5% | 88.8% |

### Streaming detail (median ms after end of speech)

| System | Final transcript | First model output | Last partial (delta) |
|---|---|---|---|
| gemini-live | 1167 | 1175 | – |
| gemini-live-lang | 1160 | 1170 | – |
| gemini-live-vocab | 1162 | 1171 | – |
| gemini-live-menu | 1158 | 1173 | – |
| gemini-transcribe-live | 1309 | – | – |
| gemini-transcribe-live-lang | 1304 | – | – |
| gemini-transcribe-live-vocab | 1297 | – | – |
| openai-realtime † | 1906 | – | 981 |
| mai-voicelive † | 2230 | – | – |

### Five worst Korean clips per system

Sorted by key-term recall, then CER.

#### gemini-live

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_noisy | 네. | me | 200.0% | 네 |
| ko06_kore_noisy | 할랄이에요? | ¿Qué? | 100.0% | 할랄 |
| ko07_kore_clean | 네. | (failed: empty) | 100.0% | 네 |
| ko07_kore_noisy | 네. | (failed: empty) | 100.0% | 네 |
| ko07_puck_clean | 네. | (failed: empty) | 100.0% | 네 |

#### gemini-live-lang

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_puck_noisy | 할랄이에요? | 플라리에요? | 60.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 뭐 할 날이에요? | 40.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할라리에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요. | 20.0% | 할랄 |
| ko06_gacrux_slow_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### gemini-live-vocab

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_puck_noisy | 할랄이에요? | 플라리에요? | 60.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 뭐 할 날이에요? | 40.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할라리에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요. | 20.0% | 할랄 |
| ko06_gacrux_slow_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### gemini-live-menu

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_noisy | 네. | me | 200.0% | 네 |
| ko06_kore_noisy | 할랄이에요? | ¿Qué? | 100.0% | 할랄 |
| ko07_kore_noisy | 네. | (failed: empty) | 100.0% | 네 |
| ko07_kore_clean | 네. | (failed: empty) | 100.0% | 네 |
| ko07_puck_clean | 네. | (failed: empty) | 100.0% | 네 |

#### gemini-transcribe-live

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_noisy | 네. | मैं | 300.0% | 네 |
| ko06_puck_noisy | 할랄이에요? | 플라리에요? | 60.0% | 할랄 |
| ko06_gacrux_slow_clean | 할랄이에요? | 할라리에요? | 40.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할라기에요? | 40.0% | 할랄 |
| ko17_gacrux_slow_noisy | 매콤 윙은 많이 매워요? | 내 콤미는 많이 매워요. | 33.3% | 매콤윙 |

#### gemini-transcribe-live-lang

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_puck_noisy | 할랄이에요? | 플라리에요? | 60.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 헐라기에요? | 60.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 한날이에요? | 40.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 한 날이에요? | 40.0% | 할랄 |
| ko17_gacrux_slow_noisy | 매콤 윙은 많이 매워요? | 내 곰님은 많이 매워요. | 33.3% | 매콤윙 |

#### gemini-transcribe-live-vocab

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_noisy | 네. | 매장. | 200.0% | 네 |
| ko06_puck_noisy | 할랄이에요? | 콜라예요? | 80.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 콜라예요? | 80.0% | 할랄 |
| ko13_kore_clean | 새우버거 세 개 포장이요. | 새우버거 세게 포장이요. | 20.0% | 세개 |
| ko13_puck_clean | 새우버거 세 개 포장이요. | 새우버거 세게 포장이요. | 20.0% | 세개 |

#### gemini-flash-batch

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_noisy | 네. | Man, come on. | 900.0% | 네 |
| ko07_gacrux_slow_clean | 네. | Meh | 300.0% | 네 |
| ko06_gacrux_slow_noisy | 할랄이에요? | हल्ला दिए हो? | 200.0% | 할랄 |
| ko06_puck_clean | 할랄이에요? | 흐려요? | 80.0% | 할랄 |
| ko06_puck_noisy | 할랄이에요? | 클라리네요? | 80.0% | 할랄 |

#### chirp3

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_gacrux_slow_noisy | 할랄이에요? | 할라기예요? | 60.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 한날이에요? | 40.0% | 할랄 |
| ko06_puck_noisy | 할랄이에요? | 칼날이에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_puck_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### chirp3-hints

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_kore_noisy | 할랄이에요? | 한라리예요? | 80.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할라기예요? | 60.0% | 할랄 |
| ko06_puck_noisy | 할랄이에요? | 칼날이에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_puck_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### openai-batch †

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_puck_clean | 네. | ね。 | 100.0% | 네 |
| ko07_puck_noisy | 네. | ね。 | 100.0% | 네 |
| ko07_gacrux_slow_clean | 네. | (failed: empty) | 100.0% | 네 |
| ko07_gacrux_slow_noisy | 네. | (failed: empty) | 100.0% | 네 |
| ko06_kore_clean | 할랄이에요? | 한라리예요? | 80.0% | 할랄 |

#### openai-realtime †

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko07_gacrux_slow_clean | 네. | Nee, | 300.0% | 네 |
| ko07_puck_noisy | 네. | ねえ | 200.0% | 네 |
| ko07_gacrux_slow_noisy | 네. | Mẹ | 200.0% | 네 |
| ko07_puck_clean | 네. | ね。 | 100.0% | 네 |
| ko06_puck_noisy | 할랄이에요? | 플라리에요? | 60.0% | 할랄 |

#### mai-transcribe-2 †

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_puck_noisy | 할랄이에요? | 칼날이에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_gacrux_slow_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### mai-transcribe-2-hints †

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko06_puck_noisy | 할랄이에요? | 칼날이에요? | 40.0% | 할랄 |
| ko06_kore_clean | 할랄이에요? | 할 날이에요. | 20.0% | 할랄 |
| ko06_kore_noisy | 할랄이에요? | 할 날이에요. | 20.0% | 할랄 |
| ko06_gacrux_slow_clean | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |
| ko06_gacrux_slow_noisy | 할랄이에요? | 할 날이에요? | 20.0% | 할랄 |

#### mai-voicelive †

| Clip | Reference | Transcript | CER | Missed terms |
|---|---|---|---|---|
| ko01_puck_clean | 치즈버거 세트 두 개요. 하나는 피클 빼고 제로콜라, 하나는 사이다로 주세요. | (failed: transcription failed {"message":"MAI Transcribe recognition ) | 100.0% | 치즈버거, 세트, 두개, 피클빼, 제로콜라, 사이다 |
| ko01_gacrux_slow_noisy | 치즈버거 세트 두 개요. 하나는 피클 빼고 제로콜라, 하나는 사이다로 주세요. | (failed: transcription failed {"message":"MAI Transcribe recognition ) | 100.0% | 치즈버거, 세트, 두개, 피클빼, 제로콜라, 사이다 |
| ko07_gacrux_slow_noisy | 네. | (failed: empty) | 100.0% | 네 |
| ko08_puck_noisy | 결제할게요. | (failed: transcription failed {"message":"MAI Transcribe recognition ) | 100.0% | 결제 |
| ko10_puck_noisy | 매콤 치킨버거 세트, 음료는 사이다로요. | (failed: transcription failed {"message":"MAI Transcribe recognition ) | 100.0% | 매콤치킨버거, 세트, 사이다 |

### Batch round trip without load (10 clips, one request at a time)

| System | Median ms | Min ms | Max ms | Measured at (UTC) |
|---|---|---|---|---|
| gemini-flash-batch | 2523 | 1921 | 3258 | 2026-10-12T20:52 |
| chirp3 | 1944 | 1398 | 3377 | 2026-10-12T20:52 |
| chirp3-hints | 1669 | 1203 | 2498 | 2026-10-12T20:52 |
| openai-batch † | 758 | 629 | 1556 | 2026-10-12T20:52 |
| mai-transcribe-2 † | 6332 | 800 | 68223 | 2026-10-12T21:41 |
| mai-transcribe-2-hints † | 3546 | 472 | 30226 | 2026-10-12T21:39 |

### Clean clips where every system missed the same term

- none

<!-- tables:end -->

## Caveats

- **Synthetic speech.** Three Gemini TTS voices, not real people, not real phones, no room echo, no accents, no real children or elderly speakers (the slow "elderly" voice is a TTS style). TTS takes can be mispronounced (two were, and were replaced). The noise is synthetic pink noise plus TTS babble. Real kiosk audio will be harder.
- **The TTS and the Gemini recognizers are from the same vendor**, which may favor Gemini; Chirp 3, OpenAI and Microsoft hear speech they were not built alongside.
- **One run.** Gemini Live transcripts were identical across the configurations that did not change them, which suggests they are deterministic, but other systems vary run to run; small differences (one or two clips) are noise.
- **Streaming vs batch** latencies are different things. Batch rows ran in parallel; use the unloaded table. MAI latency also swung widely during this run: 0.5 s to 30 s alone with the phrase list, and up to 213 s (296 s with the phrase list) for a single short clip under our parallel load.
- **Streaming end-of-speech rules differ:** Gemini and Voice Live use server VAD; OpenAI `gpt-live-transcribe` has none, so the client committed 1 s after speech (its latency includes that second; about 0.85 s after commit).
- **Transcript ≠ understanding.** For Gemini Live the input transcript is a side channel shown on the phone. The model acts on the audio itself, so a wrong transcript does not prove a wrong tool call (and vice versa). Tool-call accuracy from audio was not measured.
- Key-term matching is strict string matching with listed spellings; a fuzzy matcher in the app would accept some misses (for example 할라리에요).

## What this means for KIBO

- **Is Gemini Live's Korean menu-name recognition good enough?** For the transcript shown on the phone, it is close: about 97% of key terms on clean audio and 95% in noise once `languageCodes` is set. It is not good enough to treat as ground truth. Without `languageCodes` it swapped a menu item for another real item in noise (매콤 → 베이컨), and with it it still heard 해시브라운 as 헤이즐넛 once: exactly the errors the confirm card must catch. The product's safety rule (the AI cannot pay; the user confirms the card) stays essential.
- **Best Google-only improvement, in order:**
  1. Set `inputAudioTranscription.languageCodes` from the session locale (`ko-KR` / `en-US`) in `src/lib/agent/live.ts`. Free, no latency cost, and in this test it removed every dropped "네", every wrong-language transcript and both 매콤 → 베이컨 swaps. (Untested here: passing both languages for users who switch.)
  2. Do not rely on `customVocabulary` or instruction text to fix the Live transcript; they had no effect on `gemini-3.8-live`.
  3. If the displayed transcript must be more accurate, a parallel `gemini-3.5-transcribe-live` stream with `languageCodes` + spoken-form vocabulary was the best streaming Google option (98.9% / 97.7%), at the cost of a second audio stream and the insertion risk above.
  4. As a check before the confirm card, Chirp 3 with phrase hints on the last utterance was the most accurate Google recognizer (98.3% in both conditions), about 1.7 s per call; it fits as a background cross-check, not as the live path.
- **Next measurements:** tool-call accuracy from audio (does Live order the right item even when the transcript is wrong), real voices on a real phone, and end-of-speech tuning (`realtimeInputConfig.automaticActivityDetection`) for slow short answers like "네".
