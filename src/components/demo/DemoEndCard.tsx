"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/phone/ui";
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
  // The phone column is short on a laptop, so the next steps are brought into view when the card appears; a judge
  // should never have to hunt for them (14-final:1). "nearest" moves nothing when they already show.
  const othersRef = useRef<HTMLElement>(null);
  useEffect(() => {
    othersRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const others = (
    <nav ref={othersRef} aria-labelledby="demo-other-places" className="flex scroll-mb-4 flex-col gap-2">
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
        <Link href={`/learn/${props.kioskId}`} className={SECONDARY}>
          {pt("howLearned", locale)}
        </Link>
        {others}
      </section>
    );
  }
  // [Try again] and the other places come right under the order number; the touch-vs-talk card and the rest follow.
  return (
    <>
      <section data-demo-end className={`${CARD} flex flex-col gap-4`}>
        <button type="button" onClick={props.onTryAgain} className={PRIMARY}>
          {pt("tryAgain", locale)}
        </button>
        {others}
      </section>
      {props.compare}
      <section className={`${CARD} flex flex-col gap-4`}>
        <p className="text-base text-muted">{pt("twoDeviceHint", locale)}</p>
        <Link href={`/kiosk?k=${props.kioskId}`} className={SECONDARY}>
          {pt("twoDeviceOpen", locale)}
        </Link>
        <button
          type="button"
          onClick={props.onIntro}
          className={`min-h-14 rounded-tile text-base font-semibold text-kibo underline underline-offset-4 ${FOCUS}`}
        >
          {pt("backToIntro", locale)}
        </button>
      </section>
    </>
  );
}
