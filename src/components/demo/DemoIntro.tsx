"use client";

import Image from "next/image";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { DEMO_ENVIRONMENTS, demoHref } from "./environments";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.
// Three equal place cards pick the kiosk; the choice lives in the URL (`/demo?k=airport_rail`) so it can be linked,
// and [Start] opens the selected one. Cards and buttons follow the phone design: white cards with the soft shadow,
// tinted secondary buttons, no dark outlines (I-165, #1 6).

// [Start] makes this laptop the kiosk and the judge's own phone the assistant, as in a real store (C1a); the phone
// drawn beside the kiosk is the second choice, for a judge without a phone at hand.
const STEPS = ["Scan the QR on the kiosk with your phone.", "Say your order. The kiosk fills its own cart.", "Confirm on your phone, then pay on the kiosk."];

export function DemoIntro(props: {
  kioskId: string;
  starting: boolean;
  error: ScreenErrorCode | null;
  /** [Start]: this page is the kiosk; the judge's own phone claims the order by its QR or code. */
  onStartPhone(): void;
  /** "Try it on this screen": the kiosk and a phone drawn beside it, on one session. */
  onStart(): void;
}) {
  return (
    // Inside the /demo frame, whose top bar carries the KIBO mark and the place tabs.
    // py-4 and the gaps below keep D1 whole at 1280×720 under the top bar (#1 E).
    <main data-demo="intro" className="flex min-h-0 w-full flex-1 overflow-y-auto px-6 py-4 text-[#15171C]">
      <div data-demo-check className="m-auto grid w-full max-w-6xl items-start gap-12 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-6">
          {/* Said before anything else on a phone, not after [Start] (I-074). */}
          <div role="note" data-demo-narrow-note className="flex flex-col gap-3 rounded-[18px] bg-[#FFF1CC] p-4 text-[#7A2E0E] min-[900px]:hidden">
            <p className="text-xl font-bold">Open this on a laptop: it shows the kiosk, and your phone orders.</p>
            <p className="text-base">On this phone, try the real two-device mode: open the kiosk on a computer and scan its QR.</p>
            <a href={`/kiosk?k=${props.kioskId}`} className={SECONDARY}>
              Open the kiosk
            </a>
          </div>
          {/* Balanced, so no word is left alone on a line ("kiosk.", #1 6). */}
          <h1 className="font-display text-5xl leading-tight font-bold text-balance">
            <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
          </h1>
          <p className="text-xl text-[#33302B]">
            Say your order to your own phone, and the kiosk already in front of you fills its own cart. Only you
            confirm and pay.
          </p>
          <ol className={`${CARD} flex flex-col gap-4`}>
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-4 text-xl">
                <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-kibo text-xl font-bold text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-4">
          <nav aria-labelledby="demo-place-pick" className="flex flex-col gap-4">
            <h2 id="demo-place-pick" className="text-xl font-bold">
              Pick a place. The phone works the same in each.
            </h2>
            {/* Each card is a subgrid over the row's four tracks (picture, title, brand, who it is for), so a brand line
                that wraps moves every card's next line down with it and the descriptions start on one line (#1 6). */}
            <ul className="grid gap-4 sm:grid-cols-3">
              {DEMO_ENVIRONMENTS.map((env) => {
                const current = env.kioskId === props.kioskId;
                return (
                  <li key={env.kioskId} className="flex sm:row-span-4 sm:grid sm:grid-rows-subgrid sm:gap-2">
                    {/* Selected = a KIBO-blue ring and a check mark, never color alone. */}
                    <Link
                      href={demoHref(env.kioskId)}
                      replace
                      scroll={false}
                      data-place-card
                      aria-current={current ? "true" : undefined}
                      className={`${CARD} flex w-full flex-col gap-2 sm:row-span-4 sm:grid sm:grid-rows-subgrid ${current ? "ring-4 ring-kibo" : ""} ${FOCUS}`}
                    >
                      <span className="relative block">
                        <Image
                          src={env.image}
                          alt=""
                          width={800}
                          height={600}
                          sizes="320px"
                          className="aspect-[16/10] h-auto w-full rounded-[12px] border border-line object-cover object-top"
                        />
                        {current && (
                          <span
                            aria-hidden
                            className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-white shadow-card"
                          >
                            <CheckIcon />
                          </span>
                        )}
                      </span>
                      <span className="text-xl font-bold">{env.place.en}</span>
                      <span className="text-base font-bold text-[#33302B]">{env.how}</span>
                      <span data-place-persona className="text-base text-muted">
                        {env.persona}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* The recorded run that taught KIBO the pizza kiosk (/learn): a box of its own under the card row, outside
                the cards, because a link cannot hold a link (I-123, #1 6). */}
            <p className={`${CARD} flex flex-wrap items-center justify-between gap-x-4 py-1 text-base text-muted`}>
              The pizza shop has no integration.
              <Link
                href="/learn/doughhouse"
                className={`flex min-h-14 items-center rounded-tile font-semibold text-kibo underline underline-offset-4 ${FOCUS}`}
              >
                How KIBO learned the pizza kiosk
              </Link>
            </p>
          </nav>
          <div className="flex flex-col gap-2">
            {/* Together as wide as the card row above it, so they read as the row's actions (I-123). */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" data-demo-own-phone disabled={props.starting} onClick={props.onStartPhone} className={PRIMARY}>
                {props.starting ? "Starting…" : "Start"}
              </button>
              <button type="button" disabled={props.starting} onClick={props.onStart} className={SECONDARY}>
                <Monitor size={24} strokeWidth={2} aria-hidden />
                Try it on this screen
              </button>
            </div>
            <p className="text-base text-[#4B463F]">
              Screens in English and Korean; the AI talks in 9 languages (tested by typing). No phone at hand? Try it on
              this screen, with a phone beside the kiosk that you can type to.
            </p>
          </div>
          {props.error && (
            <p role="alert" className="rounded-tile bg-staff-tint px-4 py-3 text-xl text-staff-ink">
              {errorCopy(props.error, "en")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#3446D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
