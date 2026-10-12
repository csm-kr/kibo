## Summary (Korean)

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

## Summary (English)

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

## Korean key-term recall by voice (clean + noisy)

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

## Streaming detail (median ms after end of speech)

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

## Five worst Korean clips per system

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

## Batch round trip without load (10 clips, one request at a time)

| System | Median ms | Min ms | Max ms | Measured at (UTC) |
|---|---|---|---|---|
| gemini-flash-batch | 2523 | 1921 | 3258 | 2026-10-12T20:52 |
| chirp3 | 1944 | 1398 | 3377 | 2026-10-12T20:52 |
| chirp3-hints | 1669 | 1203 | 2498 | 2026-10-12T20:52 |
| openai-batch † | 758 | 629 | 1556 | 2026-10-12T20:52 |
| mai-transcribe-2 † | 6332 | 800 | 68223 | 2026-10-12T21:41 |
| mai-transcribe-2-hints † | 3546 | 472 | 30226 | 2026-10-12T21:39 |

## Clean clips where every system missed the same term

- none
