"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/assistant/styles";
import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { DEMO_ENVIRONMENTS, demoHref } from "./environments";

// D3 (docs/UX.md Flow C5): next to the order number, a new demo order, the two other places, the real two-device
// mode, the intro. A learned kiosk ends at its review (the user pays on the kiosk itself), so its card says so.

export function DemoEndCard(props: {
  kioskId: string;
  locale: Locale;
  learned?: boolean;
  /** The touch-vs-talk card (MALO, after `paid`), above the next steps. */
  compare?: ReactNode;
  onTryAgain(): void;
  onIntro(): void;
}) {
  const { locale } = props;
  const others = (
    <nav aria-labelledby="demo-other-places" className="flex flex-col gap-2">
      <h2 id="demo-other-places" className="text-xl font-bold">
        {pt("tryAnotherPlace", locale)}
      </h2>
      {DEMO_ENVIRONMENTS.filter((e) => e.kioskId !== props.kioskId).map((e) => (
        <Link key={e.kioskId} href={demoHref(e.kioskId)} className={SECONDARY}>
          {e.place[locale]}
        </Link>
      ))}
    </nav>
  );
  if (props.learned) {
    return (
      <section data-demo-end className={`${CARD} flex flex-col gap-4`}>
        <p className="text-xl">{pt("learnedDemoEnd", locale)}</p>
        <button type="button" onClick={props.onTryAgain} className={PRIMARY}>
          {pt("tryAgain", locale)}
        </button>
        {others}
      </section>
    );
  }
  return (
    <>
      {props.compare}
      <section data-demo-end className={`${CARD} flex flex-col gap-4`}>
        <button type="button" onClick={props.onTryAgain} className={PRIMARY}>
          {pt("tryAgain", locale)}
        </button>
        {others}
        <p className="text-base text-[#4B463F]">{pt("twoDeviceHint", locale)}</p>
        <Link href={`/kiosk?k=${props.kioskId}`} className={SECONDARY}>
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
    </>
  );
}
