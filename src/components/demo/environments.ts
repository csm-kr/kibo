import type { Locale } from "@/types/menu";

// The places a judge can try on /demo (D1 cards, D3 "Try another place") and on the landing page. Each opens a
// working kiosk: two direct-adapter kiosks and two learned kiosks. Only the two direct ones are offered (owner 10-18:
// they are the most finished, voice and kiosk stay in step from the first word); a learned kiosk is still reached by
// its own link (/learn, the deck) and then shown as the selected place (I-426). Pictures are captures of the running
// app (`npm run shots:landing`, 800x600, the top of each kiosk's first menu screen).

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
  /** A kiosk KIBO Learn learned: not offered on D1, the top bar, D3 or the landing; open by its own link only. */
  learned?: true;
}

/** A D1 place card: a place with the capture of its kiosk. */
export interface DemoEnvironment extends DemoPlace {
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
    // One-line titles keep the cards' lines level (I-123); "no integration" moves to the second line.
    place: { en: "Pizza shop", ko: "피자 가게" },
    short: "pizza shop",
    how: "Doughhouse · no integration, learned by KIBO Learn",
    persona: "Our development pizza kiosk: KIBO learned it once and replays orders without AI.",
    caption: { name: "Kiosk", note: "unchanged, learned by KIBO" },
    image: "/landing/place-doughhouse.webp",
    learned: true,
  },
  {
    // The kiosk KIBO learned blind in round 4 (bk9-bunsik, built by a separate agent and never seen before its run).
    // A bunsik shop (분식집) sells tteokbokki, gimbap and ramyeon; the owner's word for it, not "snack bar" (I-414).
    kioskId: "bunsik",
    place: { en: "Bunsik shop", ko: "분식집" },
    short: "bunsik shop",
    how: "Boribyeol Bunsik · learned blind by KIBO Learn",
    persona: "Built by another AI agent; KIBO learned it the first time it saw it and replays orders without AI.",
    caption: { name: "Kiosk", note: "unchanged, learned by KIBO" },
    image: "/landing/place-bunsik.webp",
    learned: true,
  },
];

export const DEFAULT_ENVIRONMENT = DEMO_ENVIRONMENTS[0];

/** The places offered: the two direct kiosks, and a learned kiosk only while it is the selected one (I-426). */
export function offeredPlaces(kioskId?: string): DemoEnvironment[] {
  return DEMO_ENVIRONMENTS.filter((e) => !e.learned || e.kioskId === kioskId);
}

export function demoHref(kioskId: string): string {
  return `/demo?k=${kioskId}`;
}

export function environmentOf(kioskId: string): DemoPlace {
  return DEMO_ENVIRONMENTS.find((e) => e.kioskId === kioskId) ?? DEFAULT_ENVIRONMENT;
}
