// Recomputes the flow-session table from the logs (no API call): right, paying without the review's tap, bystander
// items, each turn acted on by its own action (flowScoring.turnActions), and the delay to that action.
//   npx tsx spikes/speaker-gate/bench/flow-report.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./audio";
import { isRightFlow, turnActions, type FlowTurn } from "./flowScoring";
import { wilson } from "./scoring";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
const sha = sha256(readFileSync(join(BENCH, "manifest-flow.json")));
const refs = JSON.parse(readFileSync(join(BENCH, "refs-flow.json"), "utf8")) as { trials: Record<string, { customer: { turns: FlowTurn[] } }> };
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const STACKS = (process.argv[2] ?? "open,hold-oracle,l1-loud+l3-flow-live,l1-pick+l3-flow-live-taponly").split(",");
for (const stack of STACKS) {
  const rows = readFileSync(join(BENCH, "logs", `flow-${stack}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.manifestSha === sha && !r.error);
  console.log(`\n${stack} (logs/flow-${stack}.jsonl)`);
  const allDelays: number[] = [];
  for (const cell of ["en/chat@-10", "en/chat@0", "en/menu@-10", "en/menu@0", "ko/chat@-10", "ko/chat@0", "ko/menu@-10", "ko/menu@0"]) {
    const rs = rows.filter((r) => r.cell === cell);
    const right = rs.filter((r) => isRightFlow(r)).length;
    const paying = rs.filter((r) => r.status === "paying").length;
    const items = rs.filter((r) => r.bystanderItems.length).length;
    if (!rs.length) continue;
    const acted = { hero: 0, fries: 0, pay: 0 };
    const spurious = rs.reduce((a, r) => a + r.spurious, 0) / rs.length;
    const ends = rs.reduce((a, r) => a + r.ends, 0) / rs.length;
    const refused = rs.flatMap((r) => r.refusedConfirms ?? []);
    const refusedBys = refused.filter((x: { customerTurnJustEnded: boolean }) => !x.customerTurnJustEnded).length;
    for (const r of rs) {
      const a = turnActions(refs.trials[r.trial].customer.turns, r.events);
      for (const k of ["hero", "fries", "pay"] as const) if (a.acted[k]) acted[k]++;
      for (const v of Object.values(a.reactionMs)) if (v !== null) allDelays.push(v);
    }
    const ci = wilson(right, rs.length).map((x) => x.toFixed(2)).join("-");
    console.log(`${cell.padEnd(12)} n ${rs.length}  right ${right} [${ci}]  paying without tap ${paying}  bystander items ${items}  acted on: hero ${acted.hero} fries ${acted.fries} pay ${acted.pay}  spurious ${spurious.toFixed(1)}  ends ${ends.toFixed(1)}  refused voice confirms ${refused.length} (no customer turn in the 6 s before: ${refusedBys})`);
  }
  console.log(`delay, customer's last word to the turn's own action: median ${median(allDelays)} ms, p90 ${[...allDelays].sort((a, b) => a - b)[Math.floor(allDelays.length * 0.9)]} ms, n ${allDelays.length}`);
}
