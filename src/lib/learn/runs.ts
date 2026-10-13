import airportShop from "../../../public/learn/airport-shop/run.json";
import doughhouse from "../../../public/learn/doughhouse/run.json";
import themepark from "../../../public/learn/themepark/run.json";
import type { LearnRunData } from "./timeline";

// The recorded learning runs /learn replays (`npm run learn:runs` copies them from spikes/). The copy here says what
// each run is and what it is not, next to its numbers (docs/RULE.md R-001).

export interface LearnRun {
  data: LearnRunData;
  /** Card title. */
  title: string;
  /** In a sentence: "How KIBO learned the <phrase>". */
  phrase: string;
  /** Who built the kiosk and what the learner knew of it, one sentence. */
  provenance: string;
  /** /demo place for [Order on this kiosk]; null when the kiosk is not in the live demo. */
  demoKioskId: string | null;
  /** Shown instead of the order button when there is no demo place. */
  noDemoReason?: string;
  /** The recorded turn whose screenshot is the card picture, and what it shows. */
  cover: { n: number; alt: string };
}

export const LEARN_RUNS: LearnRun[] = [
  {
    data: themepark as LearnRunData,
    title: "Theme park ticket kiosk",
    phrase: "theme park ticket kiosk",
    provenance:
      "Built by a separate AI agent and added to the repo only after the learner fixes; never seen before this run. Its orders were checked against the kiosk's total and the cart drawer the grader opened afterwards.",
    demoKioskId: null,
    noDemoReason:
      "This kiosk was built for the test and is not in the live demo: its skill gets the total of discounted tickets wrong, and the live demo cannot order passenger counts on a learned kiosk yet.",
    cover: {
      n: 6,
      alt: "Turn 6: the theme park kiosk's aquarium ticket sheet with discount types and passenger steppers, one adult set by the learner, in Korean",
    },
  },
  {
    data: airportShop as LearnRunData,
    title: "Airport shop kiosk",
    phrase: "airport shop kiosk",
    provenance:
      "Built by a separate AI agent from a short brief; nobody working on the learner opened its app or answer key. The learner was improved after a first run on it, from that run's failure patterns, so this is not a first sighting.",
    demoKioskId: null,
    noDemoReason: "This kiosk was built for the test and is not in the live demo, so there is no order button here.",
    cover: { n: 29, alt: "Turn 29: the airport shop kiosk's Americano sheet, with two extra espresso shots set by the learner, in Korean" },
  },
  {
    data: doughhouse as LearnRunData,
    title: "Doughhouse pizza kiosk",
    phrase: "Doughhouse pizza kiosk",
    provenance:
      "Built by the KIBO team, and the learner was developed on it, so this is not a blind test. It is the learned kiosk in the live demo.",
    demoKioskId: "doughhouse",
    cover: { n: 13, alt: "Turn 13: the Doughhouse kiosk's margherita options (size, crust, toppings), in Korean" },
  },
];

export function learnRun(runId: string): LearnRun | undefined {
  return LEARN_RUNS.find((r) => r.data.runId === runId);
}
