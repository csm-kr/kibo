"use client";

import { useSyncExternalStore } from "react";

// A once-a-second local clock for countdowns and banners. The value is floored to the second, so React
// sees a stable snapshot between ticks; 0 on the server.

function subscribe(cb: () => void) {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
}
const secondNow = () => Math.floor(Date.now() / 1000) * 1000;

export function useNow(): number {
  return useSyncExternalStore(subscribe, secondNow, () => 0);
}
