import type { Locale } from "@/types/menu";

// The places a judge can try on /demo (D1 cards, D3 "Try another place") and on the landing page. Each opens a
// working kiosk: two direct-adapter kiosks and one learned kiosk. Pictures are captures of the running app
// (`npm run shots:landing`, 800x600, the top of each kiosk screen). A second learned kiosk has no D1 card (MORE_PLACES).

/** A /demo place: what the top bar, the kiosk column's caption and the D1 note say about it. */
export interface DemoPlace {
  kioskId: "malo" | "airport_rail" | "doughhouse" | "bunsik";
  /** The kind of place, the card title. */
  place: Record<Locale, string>;
  /** For link text: "Try the burger shop". */
  short: string;
  /** Brand and how KIBO connects to it. */
  how: string;
  /** Who it is for, one sentence (docs/PRD.md personas). */
  persona: string;
  /**
   * The kiosk column's caption on D2, "Kiosk · unchanged": what it is (bold) and a note (#1 E). `noteWide`: the note
   * shows from 1366px wide only, where the kiosk's step beside it still has room for two lines (#1 24).
   */
  caption: { name: string; note: string; noteWide?: boolean };
}

/** A D1 place card: a place with the capture of its kiosk. */
export interface DemoEnvironment extends DemoPlace {
  kioskId: "malo" | "airport_rail" | "doughhouse";
  image: string;
}

export const DEMO_ENVIRONMENTS: DemoEnvironment[] = [
  {
    kioskId: "malo",
    place: { en: "Burger shop", ko: "버거 가게" },
    short: "burger shop",
    how: "MALO BURGER · connected directly",
    persona: "Sunja (72) orders lunch in one sentence.",
    caption: { name: "Kiosk", note: "unchanged" },
    image: "/landing/place-malo.webp",
  },
  {
    kioskId: "airport_rail",
    place: { en: "Airport rail", ko: "공항 열차" },
    short: "airport rail",
    how: "SKYLINE AIRPORT RAIL · ticket machine",
    persona: "Mei, a visitor, buys tickets in English while the machine shows Korean.",
    caption: { name: "Ticket machine", note: "unchanged", noteWide: true },
    image: "/landing/place-airport_rail.webp",
  },
  {
    kioskId: "doughhouse",
    // One-line titles keep the three cards' lines level (I-123); "no integration" moves to the second line.
    place: { en: "Pizza shop", ko: "피자 가게" },
    short: "pizza shop",
    how: "Doughhouse · no integration, learned by KIBO Learn",
    persona: "Our development pizza kiosk: KIBO learned it once and replays orders without AI.",
    caption: { name: "Kiosk", note: "unchanged, learned by KIBO" },
    image: "/landing/place-doughhouse.webp",
  },
];

/**
 * Places with no D1 card (D1 keeps its three, I-405), reached from the top bar's tabs, /learn and their URL: the snack
 * bar kiosk KIBO learned blind in round 4 (bk9-bunsik, built by a separate agent and never seen before its run).
 */
export const MORE_PLACES: DemoPlace[] = [
  {
    kioskId: "bunsik",
    place: { en: "Snack bar", ko: "분식집" },
    short: "snack bar",
    how: "Boribyeol Bunsik · learned blind by KIBO Learn",
    persona: "Built by another AI agent; KIBO learned it the first time it saw it and replays orders without AI.",
    caption: { name: "Kiosk", note: "unchanged, learned by KIBO" },
  },
];

/** Every /demo place, in the top bar's order. */
export const ALL_PLACES: DemoPlace[] = [...DEMO_ENVIRONMENTS, ...MORE_PLACES];

export const DEFAULT_ENVIRONMENT = DEMO_ENVIRONMENTS[0];

export function demoHref(kioskId: string): string {
  return `/demo?k=${kioskId}`;
}

export function environmentOf(kioskId: string): DemoPlace {
  return ALL_PLACES.find((e) => e.kioskId === kioskId) ?? DEFAULT_ENVIRONMENT;
}
