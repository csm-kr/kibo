import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RunFacts, runSources, Sources } from "@/components/learn/Fact";
import { CARD, FOCUS, ICON, QUIET, SECONDARY } from "@/components/phone/ui";
import { LEARN_ALL_ROUNDS, LEARN_HEADLINE, LEARN_HEADLINE_DETAIL } from "@/lib/learn/headline";
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
          <h1 className="font-display text-[32px] leading-tight font-bold">Watch KIBO learn a kiosk from its screens alone.</h1>
          <p>
            Gemini explores the kiosk&apos;s screens once and writes a skill: the menu and how to tap each item. The skill
            must pass at least 3 different self-test orders and a coverage audit, both without AI; after that, every order is replayed without AI.
          </p>
          <p className="text-base text-muted">
            Limits: web and webview kiosks only. All four kiosks are synthetic: three built by other AI agents for the
            test, one by the KIBO team. One run per kiosk, Gemini 3.8 Flash on 10-13 and 10-14. These are replays of recorded runs, not
            live.
          </p>
          {/* Word for word the headline in docs/plan/NUMBERS.md, with every never-seen kiosk one click away. */}
          <div className="flex flex-col gap-1 border-l-4 border-kibo pl-4">
            <p data-learn-headline className="font-semibold">
              {LEARN_HEADLINE}
            </p>
            <p className="text-base text-muted">{LEARN_HEADLINE_DETAIL}</p>
            <details data-learn-all-rounds className="text-base text-muted">
              <summary className={`${FOCUS} inline-flex min-h-14 cursor-pointer items-center font-semibold underline`}>
                Every never-seen kiosk so far
              </summary>
              <p>{LEARN_ALL_ROUNDS}</p>
            </details>
          </div>
        </header>
        <ul className="grid gap-6 lg:grid-cols-2">
          {LEARN_RUNS.map((run) => {
            const shot = run.data.turns[run.cover.n - 1];
            const { x, y, w, h } = run.cover.crop;
            return (
              <li key={run.data.runId} data-learn-run={run.data.runId} className={`${CARD} flex flex-col gap-4`}>
                {/* One sheet of the recorded screen at about its recorded size; the caption says what it is (R-013). */}
                <figure className="flex flex-col gap-2">
                  <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full overflow-hidden rounded-tile bg-[#141210] shadow-card">
                    <Image
                      src={`/learn/${run.data.runId}/${shot.image}`}
                      alt=""
                      width={shot.width}
                      height={shot.height}
                      unoptimized
                      loading="eager"
                      style={{ width: `${(shot.width / w) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}
                      className="absolute h-auto max-w-none"
                    />
                  </div>
                  <figcaption className="text-base text-muted">{run.cover.alt}.</figcaption>
                </figure>
                <h2 className="text-2xl font-bold">{run.title}</h2>
                <p className="text-base text-muted">{run.provenance}</p>
                <RunFacts run={run} />
                <Sources paths={runSources(run)} />
                <Link href={`/learn/${run.data.runId}`} className={`${SECONDARY} mt-auto`}>
                  Watch this run
                </Link>
              </li>
            );
          })}
        </ul>
        <OnRealKiosks />
      </div>
    </main>
  );
}

/** How the bridge reaches a kiosk outside this demo (JUDGE_QA B5). Ways, not partnerships: there are none. */
function OnRealKiosks() {
  return (
    <section data-learn-real aria-labelledby="learn-real" className={`${CARD} flex flex-col gap-4`}>
      <h2 id="learn-real" className="text-2xl font-bold">
        How KIBO gets onto a real kiosk
      </h2>
      <ul className="flex flex-col gap-3">
        <li>
          <span className="font-semibold">Kiosks that share their menu data:</span> a direct adapter reads the menu and
          sends orders, with no screen tapping at all. The burger shop and the airport rail machine in the demo work
          this way.
        </li>
        <li>
          <span className="font-semibold">Web kiosks with no integration:</span> the bridge is one small script in the
          kiosk&apos;s page. The kiosk vendor or the store can add it with one script tag, through an extension of the
          kiosk&apos;s browser, or by injecting it into the WebView of a kiosk app. It replays the learned skill and
          checks the kiosk&apos;s own total; it never taps payment.
        </li>
        <li>
          <span className="font-semibold">Native kiosk apps:</span> not yet; reading them through the operating
          system&apos;s accessibility interface is on the roadmap.
        </li>
      </ul>
      <p className="text-base text-muted">
        In this demo the learned kiosk page runs inside KIBO&apos;s own page, and the bridge drives it from there. KIBO
        has no kiosk vendor partnerships yet.
      </p>
    </section>
  );
}
