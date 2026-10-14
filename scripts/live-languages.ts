// Live language check (14-final:4): for each AI language on the phone's picker, opens one Gemini Live session with that
// language's inputAudioTranscription code, on the Gemini API key (the direct path) and on Vertex AI us-central1 (the
// relay path, ADR-012), sends one typed turn and records whether setup completed and which language the spoken
// reply's transcript is in (scripts/grounding.ts replyLanguage, no AI). Spoken input is not tested here.
// Writes evidence/live-languages.json: codes, flags and timings only, never the reply text.
// Run with `npm run voice:languages` (GEMINI_API_KEY from .env; gcloud application default credentials for Vertex).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { LANGUAGES, SPEECH_LANGUAGES, type SpeechLanguage } from "@/lib/i18n/languages";
import { replyLanguage } from "./grounding";

const MODEL = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live";
const VERTEX_LOCATION = process.env.VOICE_VERTEX_LOCATION || "us-central1";
const TIMEOUT_MS = 20_000;

type Path = "api" | "vertex";

function client(path: Path): GoogleGenAI {
  return path === "vertex"
    ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "kibo-2026", location: VERTEX_LOCATION })
    : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function one(ai: GoogleGenAI, language: SpeechLanguage) {
  const { english, liveCode } = LANGUAGES[language];
  const started = Date.now();
  let setup = false;
  let transcript = "";
  let closed: number | null = null;
  let session: { close(): void } | null = null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    ai.live
      .connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `Always reply in ${english}, in one short sentence.`,
          inputAudioTranscription: { languageCodes: [liveCode] },
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (m: LiveServerMessage) => {
            if (m.setupComplete) setup = true;
            transcript += m.serverContent?.outputTranscription?.text ?? "";
            if (m.serverContent?.turnComplete) finish();
          },
          onclose: (e: CloseEvent) => {
            closed = e.code;
            finish();
          },
          onerror: () => {},
        },
      })
      .then((s) => {
        session = s;
        s.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Hello, what can you help me with?" }] }], turnComplete: true });
      })
      .catch(() => finish());
  });
  (session as { close(): void } | null)?.close();
  const detected = transcript ? replyLanguage(transcript, getKiosk("malo")) : null;
  return { language, code: liveCode, setup, replied: transcript.length > 0, replyLanguage: detected, ms: Date.now() - started, ...(closed !== null ? { closeCode: closed } : {}) };
}

async function main() {
  const out: Record<Path, Awaited<ReturnType<typeof one>>[]> = { api: [], vertex: [] };
  for (const path of ["api", "vertex"] as const) {
    const ai = client(path);
    for (const language of SPEECH_LANGUAGES) {
      const r = await one(ai, language);
      out[path].push(r);
      console.log(`${path} ${r.code}: setup ${r.setup}, reply in ${r.replyLanguage ?? "?"}`);
    }
  }
  const file = join(process.cwd(), "evidence/live-languages.json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        model: MODEL,
        paths: { api: "Gemini API key (direct path)", vertex: `Vertex AI ${VERTEX_LOCATION} (relay path)` },
        method: "One Live session per language with inputAudioTranscription.languageCodes set; one typed turn; the reply transcript's language detected by scripts/grounding.ts replyLanguage. Spoken input not tested.",
        results: out,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Wrote evidence/live-languages.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("live languages crashed:", e instanceof Error ? e.name : typeof e);
  process.exit(1);
});
