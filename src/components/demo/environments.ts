import type { Locale } from "@/types/menu";

// The places a judge can try on /demo (D1 cards, D3 "Try another place") and on the landing page. Each opens a
// working kiosk: two direct-adapter kiosks and one learned kiosk. Pictures are captures of the running app
// (`npm run shots:landing`, 800x600, the top of each kiosk screen).

export interface DemoEnvironment {
  kioskId: "malo" | "airport_rail" | "doughhouse";
  /** The kind of place, the card title. */
  place: Record<Locale, string>;
  /** For link text: "Try the burger shop". */
  short: string;
  /** Brand and how KIBO connects to it. */
  how: string;
  /** Who it is for, one sentence (docs/PRD.md personas). */
  persona: string;
  /** The kiosk half's caption on D2; short, the column is about 360px wide at 1280x720. */
  caption: string;
  image: string;
}

export const DEMO_ENVIRONMENTS: DemoEnvironment[] = [
  {
    kioskId: "malo",
    place: { en: "Burger shop", ko: "버거 가게" },
    short: "burger shop",
    how: "MALO BURGER · connected directly",
    persona: "Sunja (72) orders lunch in one sentence.",
    caption: "Burger shop kiosk (unchanged)",
    image: "/landing/place-malo.webp",
  },
  {
    kioskId: "airport_rail",
    place: { en: "Airport rail", ko: "공항 열차" },
    short: "airport rail",
    how: "SKYLINE AIRPORT RAIL · ticket machine",
    persona: "Mei, a visitor, buys tickets in English while the machine shows Korean.",
    caption: "Airport rail ticket machine (unchanged)",
    image: "/landing/place-airport_rail.webp",
  },
  {
    kioskId: "doughhouse",
    // One-line titles keep the three cards' lines level (I-123); "no integration" moves to the second line.
    place: { en: "Pizza shop", ko: "피자 가게" },
    short: "pizza shop",
    how: "Doughhouse · no integration, learned by KIBO Learn",
    persona: "KIBO learned this third-party screen once and replays orders without AI.",
    caption: "Pizza shop kiosk (learned by KIBO Learn)",
    image: "/landing/place-doughhouse.webp",
  },
];

export const DEFAULT_ENVIRONMENT = DEMO_ENVIRONMENTS[0];

export function demoHref(kioskId: string): string {
  return `/demo?k=${kioskId}`;
}

export function environmentOf(kioskId: string): DemoEnvironment {
  return DEMO_ENVIRONMENTS.find((e) => e.kioskId === kioskId) ?? DEFAULT_ENVIRONMENT;
}
