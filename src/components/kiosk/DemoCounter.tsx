"use client";

import { useState } from "react";
import { useNow } from "@/hooks/useNow";
import { demoCounterText } from "@/lib/i18n/kiosk";
import type { Locale } from "@/types/menu";

// `&demo=1` only (docs/UX.md heuristic 8): taps and seconds for the touch-vs-voice comparison (docs/TESTING.md).
// The values freeze at `paid`; data-taps and data-seconds are what the E2E test reads.

export function DemoCounter(props: { locale: Locale; taps: number; startAt: number | null; paid: boolean }) {
  const now = useNow();
  const [endAt, setEndAt] = useState<number | null>(null);
  if (props.paid && props.startAt !== null && endAt === null) setEndAt(now);

  const seconds = props.startAt === null ? 0 : Math.max(0, Math.round(((endAt ?? now) - props.startAt) / 1000));
  return (
    <p
      data-demo-counter
      data-taps={props.taps}
      data-seconds={seconds}
      className="k-text-40 pointer-events-none absolute top-8 right-8 z-40 rounded-full bg-[#1E1B18] px-8 py-2 font-display font-bold text-white"
    >
      {demoCounterText(props.taps, seconds, props.locale)}
    </p>
  );
}
