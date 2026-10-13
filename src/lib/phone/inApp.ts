// In-app browsers (KakaoTalk, NAVER, Instagram, Facebook, LINE) often block the microphone (docs/UX.md
// "Accessibility"), so the phone suggests opening the link in Safari or Chrome.
// Instagram before Facebook: some Instagram builds also carry Facebook's FBAN/FBAV tokens.
const IN_APP: [name: string, pattern: RegExp][] = [
  ["KakaoTalk", /KAKAOTALK/i],
  ["NAVER", /NAVER\(inapp/i],
  ["Instagram", /Instagram/i],
  ["Facebook", /FBAN\/|FBAV\/|FB_IAB/i],
  ["LINE", /\bLine\//i],
];

// Most specific first: Samsung Internet and Edge also say "Chrome/", and every iOS browser says "Safari/".
const FAMILIES: [name: string, pattern: RegExp][] = [
  ["Samsung Internet", /SamsungBrowser\//],
  ["Edge", /EdgA?\/|EdgiOS\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];

/** The in-app browser's app name, or null for a normal browser. */
export function inAppName(userAgent: string): string | null {
  return IN_APP.find(([, re]) => re.test(userAgent))?.[0] ?? null;
}

export function isInAppBrowser(userAgent: string): boolean {
  return inAppName(userAgent) !== null;
}

export interface BrowserInfo {
  os: "iOS" | "Android" | "other";
  /** The browser engine's family as the user would name it; an in-app browser still reports its engine's. */
  family: string;
  inApp: string | null;
}

/** For /mic-test: which browser the team is testing in. */
export function browserInfo(userAgent: string): BrowserInfo {
  const os = /iPhone|iPad|iPod/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : "other";
  // iOS in-app browsers are bare WebKit views, without a "Safari/" token.
  const fallback = /AppleWebKit\//.test(userAgent) ? "WebKit" : "Other";
  const family = FAMILIES.find(([, re]) => re.test(userAgent))?.[0] ?? fallback;
  return { os, family, inApp: inAppName(userAgent) };
}
