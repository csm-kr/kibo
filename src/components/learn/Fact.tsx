import type { LearnRun } from "@/lib/learn/runs";

// One number from a recorded run and a short note; the repo files that hold the numbers go in one grey footnote line
// under them (docs/RULE.md R-001), not in the body.

export function Fact({ value, detail }: { value: string; detail?: string }) {
  return (
    <p className="flex flex-col gap-1 border-l-4 border-kibo pl-4">
      <span className="font-semibold">{value}</span>
      {detail && <span className="text-base text-muted">{detail}</span>}
    </p>
  );
}

/** "Sources: a · b": the files behind the numbers above, small and grey. */
export function Sources({ paths }: { paths: string[] }) {
  return (
    <p data-learn-sources className="text-base text-muted [overflow-wrap:anywhere]">
      Sources: {[...new Set(paths)].join(" · ")}
    </p>
  );
}

/** The files behind RunFacts, in its order. */
export function runSources(run: LearnRun): string[] {
  return [run.data.sources.stats, run.data.grade.itemsSource, run.data.grade.ordersSource];
}

/** The run's headline numbers: time, catalog, orders without AI. */
export function RunFacts({ run }: { run: LearnRun }) {
  const { data } = run;
  const { grade } = data;
  const o = grade.orders;
  return (
    <>
      <Fact value={`${data.minutes.toFixed(1)} min, ${data.turnCount} turns`} detail={`${data.model}, ${data.inputTokens.toLocaleString("en-US")} input tokens`} />
      <Fact
        value={`${grade.itemsFound} of ${grade.itemsOf} items found, ${grade.pricesCorrect} prices right`}
        detail={
          // Doughhouse is ours, so its items are checked against our reviewed skill; a blind kiosk's against its builder's key.
          grade.itemsSource.includes("skills/") ? "Compared with the reviewed skill the demo uses" : "Compared with the kiosk builder's answer key"
        }
      />
      <Fact
        value={`Orders without AI: ${o.correct} correct, ${o.safeRefusal} refused, ${o.unsafe} unsafe, of ${o.total}`}
        detail={
          o.ruleViolationDetected > 0
            ? `Unseen orders; ${o.ruleViolationDetected} more order with a planted rule break was caught.`
            : o.linesChecked === 0
              ? "Unseen orders, judged by the kiosk's own total; the cart lines were not read."
              : `Unseen orders, judged by the kiosk's own total and its cart lines (item names).${
                  o.skillTotalDiffers
                    ? ` In ${o.skillTotalDiffers} of them the skill's own total differed from the kiosk's: the grader still counts their cart lines right, and in the app the bridge stops such an order and calls staff instead of showing a wrong price.`
                    : o.skillTotalDiffers === 0
                      ? " The skill's own total matched the kiosk's in every one."
                      : ""
                }`
        }
      />
    </>
  );
}
