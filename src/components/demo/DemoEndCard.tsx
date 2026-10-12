"use client";

import Link from "next/link";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/assistant/styles";
import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";

// D3 (docs/UX.md Flow C5): next to the order number, a new demo order, the real two-device mode, the intro.

export function DemoEndCard(props: { locale: Locale; onTryAgain(): void; onIntro(): void }) {
  const { locale } = props;
  return (
    <section data-demo-end className={`${CARD} flex flex-col gap-4`}>
      <button type="button" onClick={props.onTryAgain} className={PRIMARY}>
        {pt("tryAgain", locale)}
      </button>
      <p className="text-base text-[#4B463F]">{pt("twoDeviceHint", locale)}</p>
      <Link href="/kiosk" className={SECONDARY}>
        {pt("twoDeviceOpen", locale)}
      </Link>
      <button
        type="button"
        onClick={props.onIntro}
        className={`min-h-14 rounded-[18px] text-base font-bold text-[#3446D4] underline underline-offset-4 ${FOCUS}`}
      >
        {pt("backToIntro", locale)}
      </button>
    </section>
  );
}
