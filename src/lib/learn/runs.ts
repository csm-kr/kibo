import airportShop from "../../../public/learn/airport-shop/run.json";
import bunsik from "../../../public/learn/bunsik/run.json";
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
  /**
   * The recorded turn whose screenshot is the card picture, what it shows, and the part of it shown (screenshot
   * pixels, after `scripts/learn-trim.ts` cut the recording's dark frame off): a whole kiosk shrunk to a card was
   * unreadable (I-198), one sheet at about its recorded size is not.
   */
  cover: { n: number; alt: string; crop: { x: number; y: number; w: number; h: number } };
}

export const LEARN_RUNS: LearnRun[] = [
  {
    data: bunsik as LearnRunData,
    title: "Snack bar kiosk",
    phrase: "snack bar kiosk",
    provenance:
      "Built by a separate AI agent from a short brief and never seen before this run: the learner was frozen first (round 4) and learned it once, in 9.6 min. Its orders were checked against the kiosk's total and cart afterwards. Its skill, reviewed by a person, is a learned kiosk in the live demo too.",
    demoKioskId: "bunsik",
    cover: {
      n: 3,
      alt: "Turn 3: the snack bar kiosk's tteokbokki sheet with a required spice level and toppings, in Korean",
      crop: { x: 20, y: 158, w: 440, h: 540 },
    },
  },
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
      crop: { x: 0, y: 310, w: 480, h: 544 },
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
    cover: {
      n: 29,
      alt: "Turn 29: the airport shop kiosk's Americano sheet, with two extra espresso shots set by the learner, in Korean",
      crop: { x: 0, y: 718, w: 414, h: 349 },
    },
  },
  {
    data: doughhouse as LearnRunData,
    title: "Doughhouse pizza kiosk",
    phrase: "Doughhouse pizza kiosk",
    provenance:
      "Built by the KIBO team, and the learner was developed on it, so this is not a blind test. It is a learned kiosk in the live demo. Recorded on 10-13, before the kiosk's look was restyled on 10-14, so the pictures show the plain page it learned; its labels did not change. This is the traced run of an earlier learner; the newest run on this kiosk (5.2 min) kept no trace.",
    demoKioskId: "doughhouse",
    cover: {
      n: 13,
      alt: "Turn 13: the Doughhouse kiosk's margherita options (size, crust, toppings), in Korean, as it looked on 10-13",
      crop: { x: 140, y: 100, w: 445, h: 255 },
    },
  },
];

export function learnRun(runId: string): LearnRun | undefined {
  return LEARN_RUNS.find((r) => r.data.runId === runId);
}
