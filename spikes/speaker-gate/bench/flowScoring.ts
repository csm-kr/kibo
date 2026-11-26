// Scoring for the flow session (flow.ts). Pure; tests in flowScoring.test.ts.

export interface FlowTurn {
  kind: string;
  text: string;
  startMs: number;
  endMs: number;
}

/** Right = the hero cart, the review reached (confirming, or paying when the product let a voice confirm), and no
 *  bystander item ever added. */
export const isRightFlow = (r: { heroCart: boolean; status: string; bystanderItems: string[] }) =>
  r.heroCart && (r.status === "confirming" || r.status === "paying") && r.bystanderItems.length === 0;

/** Each turn's own action within 5 s of its end: the hero order an addToCart of cheese_burger, "both fries large" an
 *  updateCart, "I'll pay" a requestCheckout. A reply that a bystander caused cannot count for the customer.
 *  "No, thanks" has no action of its own and is left out. */
const ACTIONS: Record<string, (text: string) => boolean> = {
  hero: (x) => x.startsWith("addToCart") && x.includes('"cheese_burger"'),
  fries: (x) => x.startsWith("updateCart"),
  pay: (x) => x.startsWith("requestCheckout"),
};

export function turnActions(turns: FlowTurn[], events: { t: number; kind: string; text?: string }[]) {
  const acted: Record<string, boolean> = {};
  const reactionMs: Record<string, number | null> = {};
  for (const u of turns) {
    const is = ACTIONS[u.kind];
    if (!is) continue;
    const hit = events.filter((e) => e.kind === "tool" && e.t >= u.endMs && e.t <= u.endMs + 5000 && is(e.text ?? "")).sort((a, b) => a.t - b.t)[0];
    acted[u.kind] = !!hit;
    reactionMs[u.kind] = hit ? Math.round(hit.t - u.endMs) : null;
  }
  return { acted, reactionMs };
}
