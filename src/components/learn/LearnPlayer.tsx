"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Circle, Maximize2, Minimize2, OctagonX, Pause, Play, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CARD, FOCUS, ICON, PRESS, PRIMARY, QUIET, SECONDARY } from "@/components/phone/ui";
import { formatWon } from "@/lib/kiosk/menu";
import type { LearnRun } from "@/lib/learn/runs";
import { gloss, glossAll } from "@/lib/learn/glossary";
import { buildTimeline, formatClock } from "@/lib/learn/timeline";
import { Fact, RunFacts, runSources, Sources } from "./Fact";

// The /learn/<runId> replay: one step per recorded turn of the learner's trace, the kiosk screenshot it took, the
// action in plain words, the counters it had written down and the milestones. Playback is not real time; the clock
// is. It starts by itself at 4× with a visible Pause, so a judge sees KIBO learn without pressing anything; stepping
// by hand pauses it. With reduced motion nothing advances by itself (docs/UI_QA.md "Motion"). Korean labels carry
// their English from the static glossary (src/lib/learn/glossary.ts).

/** One turn on screen at 1×. */
const STEP_MS = 1200;
const SPEEDS = [1, 4, 16] as const;

const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const SMALL_BASE = `flex min-h-14 min-w-14 flex-1 items-center justify-center gap-2 rounded-tile px-3 text-xl font-semibold disabled:opacity-60 ${PRESS} ${FOCUS}`;
const SMALL = `${SMALL_BASE} bg-kibo-tint text-kibo active:bg-kibo-tint-pressed`;
/** The chosen speed: deep blue text with a check on the tint (not a second filled button beside [Play]). */
const SMALL_ON = `${SMALL_BASE} bg-kibo-tint-pressed text-kibo-deep`;

export function LearnPlayer({ run }: { run: LearnRun }) {
  const { data } = run;
  const { steps, milestones } = useMemo(() => buildTimeline(data), [data]);
  const last = steps.length - 1;
  // A run that never used `record` (bk6) has all-zero counters; they would read as "found nothing".
  const noNotes = steps.every((s) => s.known.items === 0 && s.known.optionGroups === 0 && s.known.categories === 0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [large, setLarge] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);
  const running = playing && !reduced && index < last;

  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), STEP_MS / speed);
    return () => clearTimeout(id);
  }, [running, index, speed, last]);

  // The next few screenshots load ahead, so fast playback does not show half-loaded frames.
  useEffect(() => {
    for (const s of steps.slice(index + 1, index + 4)) new window.Image().src = `/learn/${data.runId}/${s.image}`;
  }, [index, steps, data.runId]);

  const step = steps[index];
  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };
  const togglePlay = () => {
    if (index >= last) setIndex(0);
    setPlaying(!running);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/learn" className={`${QUIET} self-start`}>
          <ArrowLeft {...ICON} />
          All runs
        </Link>
        <h1 className="font-display text-[32px] leading-tight font-bold">How KIBO learned the {run.phrase}</h1>
        <p className="text-base text-muted">
          {run.provenance} Recorded {data.startedAt.slice(0, 10)} with {data.model}.
        </p>
      </header>

      {/* On phones the action and the controls come first, so [Play] is on the first screen (I-199); from lg the
          picture is the left column. `large` shows the recorded screenshot at its own size (I-198). */}
      <section
        data-learn-player
        aria-label="Replay"
        className={`grid items-start gap-6 ${large ? "" : "lg:grid-cols-[auto_minmax(0,1fr)]"}`}
      >
        <div className={`flex min-w-0 flex-col gap-4 ${large ? "" : "lg:col-start-2 lg:row-start-1"}`}>
          <div className={`${CARD} flex flex-col gap-2`}>
            <p className="text-base font-semibold text-muted" data-learn-turn={step.n}>
              Turn {step.n} of {steps.length} · {formatClock(step.elapsedMs)} into the run
            </p>
            {/* Announced when stepping by hand; quiet while playing, a turn a second would drown a screen reader. */}
            <p
              data-learn-action
              aria-live={running ? "off" : "polite"}
              className={`flex items-start gap-2 rounded-tile text-xl font-semibold ${
                step.outcome === "refused" ? "bg-staff-tint p-3 text-staff-ink" : ""
              }`}
            >
              {step.outcome === "refused" && <OctagonX {...ICON} className="mt-1 flex-none" />}
              {step.outcome === "failed" && <TriangleAlert {...ICON} className="mt-1 flex-none" />}
              <span className="[overflow-wrap:anywhere]">{step.text}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={SMALL}>
                <ChevronLeft {...ICON} />
                Back
              </button>
              <button
                type="button"
                data-learn-play
                onClick={togglePlay}
                disabled={reduced}
                className={`${PRIMARY} min-h-14 flex-[2]`}
              >
                {running ? <Pause {...ICON} /> : <Play {...ICON} />}
                {running ? "Pause" : index >= last ? "Play again" : "Play"}
              </button>
              <button type="button" data-learn-next onClick={() => go(index + 1)} disabled={index === last} className={SMALL}>
                Next
                <ChevronRight {...ICON} />
              </button>
            </div>
            <div role="group" aria-label="Speed" className="flex items-center gap-3">
              <span className="text-base font-semibold text-muted">Speed</span>
              {SPEEDS.map((s) => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={speed === s ? SMALL_ON : SMALL}>
                  {speed === s && <Check {...ICON} />}
                  {s}×
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={last}
              value={index}
              onChange={(e) => go(Number(e.target.value))}
              aria-label="Turn"
              aria-valuetext={`Turn ${step.n} of ${steps.length}`}
              className={`h-14 w-full accent-kibo ${FOCUS}`}
            />
            <p className="text-base text-muted">
              {reduced
                ? "Your system asks for less motion, so the replay never moves by itself. Step with Back and Next."
                : `Not real time: each turn shows for ${STEP_MS / 1000} s at 1×. The clock above is the real time since the run started.`}
            </p>
          </div>
        </div>

        <figure
          className={
            large
              ? "mx-auto flex w-full max-w-[720px] flex-col gap-2"
              : "mx-auto flex w-full max-w-[calc(45dvh*0.675)] flex-col gap-2 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:w-[clamp(280px,calc((100dvh-280px)*0.675),480px)] lg:max-w-none"
          }
        >
          <Image
            src={`/learn/${data.runId}/${step.image}`}
            alt={`The kiosk screen after turn ${step.n}`}
            width={step.width}
            height={step.height}
            unoptimized
            preload
            className="h-auto w-full rounded-tile shadow-card"
          />
          <figcaption className="text-base text-muted">
            The kiosk as the learner saw it after this turn; what it did is written beside it.
          </figcaption>
          <button type="button" data-learn-zoom aria-pressed={large} onClick={() => setLarge(!large)} className={`${QUIET} self-start`}>
            {large ? <Minimize2 {...ICON} /> : <Maximize2 {...ICON} />}
            {large ? "Smaller picture" : "Larger picture"}
          </button>
        </figure>

        <div className={`flex min-w-0 flex-col gap-4 ${large ? "" : "lg:col-start-2 lg:row-start-2"}`}>
          <nav aria-labelledby="learn-milestones" className={`${CARD} flex flex-col gap-2`}>
            <h2 id="learn-milestones" className="text-xl font-bold">
              Milestones
            </h2>
            <ol className="flex flex-col gap-2">
              {milestones.map((m) => {
                const reached = index >= m.index;
                return (
                  <li key={m.kind}>
                    <button
                      type="button"
                      data-learn-milestone={m.kind}
                      onClick={() => go(m.index)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-tile px-3 text-left text-xl active:bg-kibo-tint ${PRESS} ${FOCUS}`}
                    >
                      {reached ? <Check {...ICON} className="flex-none text-kibo" /> : <Circle {...ICON} className="flex-none text-muted" />}
                      <span className={reached ? "font-semibold" : ""}>{m.label}</span>
                      <span className="ml-auto flex-none text-base text-muted">
                        turn {m.n}
                        <span className="sr-only">{reached ? ", reached" : ", not reached yet"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section aria-labelledby="learn-knows" className={`${CARD} flex flex-col gap-3`}>
            <h2 id="learn-knows" className="text-xl font-bold">
              What KIBO knows
            </h2>
            {noNotes ? (
              <p className="text-base" data-learn-no-notes>
                This run wrote no notes along the way: it put what it found straight into the skill it tested, shown at
                the last turn.
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["Items", step.known.items],
                      ["Option groups", step.known.optionGroups],
                      ["Categories", step.known.categories],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex flex-col">
                      <dt className="order-2 text-base text-muted">{label}</dt>
                      <dd className="font-display order-1 text-[32px] leading-tight font-bold tabular-nums" data-learn-count={label}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-base">
                  {step.latest ? (
                    <>
                      <span className="font-semibold">Latest written down (turn {step.latest.n}):</span>{" "}
                      {glossAll(step.latest.names).join(", ")}
                    </>
                  ) : (
                    "Nothing written down yet."
                  )}
                </p>
                <p className="text-base text-muted">What the learner had written down by this turn; the finished skill can hold more.</p>
                <Sources paths={[`${data.sources.trace}/turn-${step.n}.json`]} />
              </>
            )}
          </section>
        </div>
      </section>

      {index === last && <SkillSummary run={run} />}
    </div>
  );
}

function SkillSummary({ run }: { run: LearnRun }) {
  const { data } = run;
  const { catalog, categories } = data.skill;
  return (
    <section data-learn-skill aria-labelledby="learn-skill" className="flex flex-col gap-4">
      <h2 id="learn-skill" className="text-2xl font-bold">
        What it learned
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <RunFacts run={run} />
      </div>
      <Sources paths={runSources(run)} />
      <div className={`${CARD} flex flex-col gap-3`}>
        <p>
          <span className="font-semibold">{categories.length} categories:</span> {glossAll(categories).join(", ")}
        </p>
        {/* Shorter than the screen, so the focused region is always fully in view (WCAG 2.4.11); it scrolls inside. */}
        <div role="region" aria-label="The learned menu, scrolls" tabIndex={0} className={`max-h-[60dvh] overflow-auto rounded-tile ${FOCUS}`}>
          <table className="w-full min-w-[640px] border-collapse text-left text-base">
            <caption className="sr-only">Items, prices and options in the learned skill</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4">Item</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4 text-right">Price</th>
                <th scope="col" className="py-2">Options</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((item) => (
                <tr key={item.name} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-4 font-semibold">
                    {gloss(item.name)}
                    {item.soldOut && <span className="font-normal text-muted"> (sold out)</span>}
                  </th>
                  <td className="py-2 pr-4">{gloss(item.category)}</td>
                  {/* A ticket priced 0 takes its fare from an option (passenger type); ₩0 read as a bug (I-245). */}
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {item.price === 0 && item.groups.length ? "By option" : formatWon(item.price, "en")}
                  </td>
                  <td className="py-2">
                    {item.groups.length
                      ? item.groups.map((g) => `${gloss(g.name)}: ${glossAll(g.options).join(", ")}`).join(" · ")
                      : "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Fact value={`${catalog.length} items in the skill`} />
        <Sources paths={[data.sources.skill]} />
      </div>
      {run.demoKioskId ? (
        <Link href={`/demo?k=${run.demoKioskId}`} data-learn-order className={`${SECONDARY} sm:max-w-md`}>
          Order on this kiosk
        </Link>
      ) : (
        <p data-learn-no-order className="text-base text-muted">
          {run.noDemoReason}
        </p>
      )}
    </section>
  );
}
