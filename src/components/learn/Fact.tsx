import type { LearnRun } from "@/lib/learn/runs";

// One number from a recorded run, a short note, and the repo file that holds it (docs/RULE.md R-001).

export function Fact({ value, detail, path }: { value: string; detail?: string; path: string }) {
  return (
    <p className="flex flex-col gap-1 border-l-4 border-kibo pl-4">
      <span className="font-semibold">{value}</span>
      {detail && <span className="text-base text-muted">{detail}</span>}
      <code className="text-base text-muted [overflow-wrap:anywhere]">{path}</code>
    </p>
  );
}

/** The run's headline numbers: time, catalog, orders without AI. */
export function RunFacts({ run }: { run: LearnRun }) {
  const { data } = run;
  const { grade } = data;
  const o = grade.orders;
  return (
    <>
      <Fact
        value={`${data.minutes.toFixed(1)} min, ${data.turnCount} turns`}
        detail={`${data.model}, ${data.inputTokens.toLocaleString("en-US")} input tokens`}
        path={data.sources.stats}
      />
      <Fact
        value={`${grade.itemsFound} of ${grade.itemsOf} items found, ${grade.pricesCorrect} prices right`}
        detail={run.demoKioskId ? "Compared with the reviewed skill the demo uses" : "Compared with the kiosk builder's answer key"}
        path={grade.itemsSource}
      />
      <Fact
        value={`Orders without AI: ${o.correct} correct, ${o.safeRefusal} refused, ${o.unsafe} unsafe, of ${o.total}`}
        detail={
          o.ruleViolationDetected > 0
            ? `Unseen orders; ${o.ruleViolationDetected} more order with a planted rule break was caught.`
            : o.linesChecked === 0
              ? "Unseen orders, judged by the kiosk's own total; the cart lines were not read."
              : "Unseen orders."
        }
        path={grade.ordersSource}
      />
    </>
  );
}
