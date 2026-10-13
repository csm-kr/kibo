import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RunFacts } from "@/components/learn/Fact";
import { CARD, ICON, QUIET, SECONDARY } from "@/components/phone/ui";
import { LEARN_RUNS } from "@/lib/learn/runs";

export const metadata: Metadata = { title: "KIBO Learn — watch it learn a kiosk" };

// /learn: the recorded KIBO Learn runs. Learning runs offline (a browser and Gemini, minutes per run), so the
// product replays real traces (public/learn/, `npm run learn:runs`), never a live or made-up run.

export default function LearnIndex() {
  return (
    <main className="w-full flex-1 bg-cream text-xl leading-normal text-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <Link href="/" className={`${QUIET} self-start`}>
          <ArrowLeft {...ICON} />
          KIBO
        </Link>
        <header className="flex flex-col gap-4">
          <h1 className="font-display text-[32px] leading-tight font-bold">Watch KIBO learn a kiosk it has never seen.</h1>
          <p>
            Gemini explores the kiosk&apos;s screens once and writes a skill: the menu and how to tap each item. The skill
            must pass self-tests and a coverage audit, both without AI; after that, every order is replayed without AI.
          </p>
          <p className="text-base text-muted">
            Limits: web and webview kiosks only. All three kiosks are synthetic: two built by other AI agents for the
            test, one by the KIBO team. One run per kiosk, Gemini on one day. These are replays of recorded runs, not
            live.
          </p>
        </header>
        <ul className="grid gap-6 lg:grid-cols-2">
          {LEARN_RUNS.map((run) => {
            const cover = run.data.turns[run.cover.n - 1];
            return (
              <li key={run.data.runId} data-learn-run={run.data.runId} className={`${CARD} flex flex-col gap-4`}>
                <Image
                  src={`/learn/${run.data.runId}/${cover.image}`}
                  alt={run.cover.alt}
                  width={cover.width}
                  height={cover.height}
                  unoptimized
                  loading="eager"
                  className="mx-auto h-auto max-h-80 w-auto rounded-tile"
                />
                <h2 className="text-2xl font-bold">{run.title}</h2>
                <p className="text-base text-muted">{run.provenance}</p>
                <RunFacts run={run} />
                <Link href={`/learn/${run.data.runId}`} className={`${SECONDARY} mt-auto`}>
                  Watch this run
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
