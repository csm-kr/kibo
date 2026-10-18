"use client";

import Image from "next/image";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { DEMO_ENVIRONMENTS, demoHref } from "./environments";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.
// Four equal place cards, two by two, pick the kiosk; the choice lives in the URL (`/demo?k=airport_rail`) so it can
// be linked, and [Start] opens the selected one. Cards and buttons follow the phone design: white cards with the soft
// shadow, tinted secondary buttons, no dark outlines (I-165, #1 6).

/** The recorded runs (/learn) that taught KIBO the two learned places, each under its own card in the box below. */
const LEARN_LINKS = [
  { href: "/learn/doughhouse", text: "How KIBO learned the pizza kiosk" },
  { href: "/learn/bunsik", text: "How KIBO learned the bunsik shop kiosk" },
];

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
    // py-4 and the gaps below keep D1 whole at 1280×720 under the top bar (#1 E). The intro column is 360px, so the
    // four cards get two columns of about 400px, each wide enough for its brand line on two lines (I-414).
    <main data-demo="intro" className="flex min-h-0 w-full flex-1 overflow-y-auto px-6 py-4 text-[#15171C]">
      <div data-demo-check className="m-auto grid w-full max-w-7xl items-start gap-12 lg:grid-cols-[22.5rem_minmax(0,1fr)]">
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
            {/* Two by two. Each card is a subgrid over its row's two tracks (the picture beside the title and brand,
                then who it is for), so a brand line that wraps moves both cards' next line down with it and the
                descriptions of a row start on one line (#1 6). */}
            <ul className="grid gap-4 sm:grid-cols-2">
              {DEMO_ENVIRONMENTS.map((env) => {
                const current = env.kioskId === props.kioskId;
                return (
                  <li key={env.kioskId} className="flex sm:row-span-2 sm:grid sm:grid-rows-subgrid sm:gap-2">
                    {/* Selected = a KIBO-blue ring and a check mark, never color alone. The picture is 112px wide at
                        720px tall, where D1 just fits, and grows with the window's height to 160px (900px tall). */}
                    <Link
                      href={demoHref(env.kioskId)}
                      replace
                      scroll={false}
                      data-place-card
                      aria-current={current ? "true" : undefined}
                      className={`${CARD} grid w-full grid-cols-[7rem_minmax(0,1fr)] content-start gap-x-4 gap-y-2 sm:row-span-2 sm:grid-rows-subgrid lg:grid-cols-[clamp(7rem,calc((100dvh_-_720px)_*_0.6_+_7rem),10rem)_minmax(0,1fr)] ${current ? "ring-4 ring-kibo" : ""} ${FOCUS}`}
                    >
                      <Image
                        src={env.image}
                        alt=""
                        width={800}
                        height={600}
                        sizes="160px"
                        className="aspect-[4/3] h-auto w-full rounded-[12px] border border-line object-cover"
                      />
                      <span className="flex flex-col gap-2">
                        <span className="flex items-start justify-between gap-2 text-xl font-bold">
                          {env.place.en}
                          {current && <CheckIcon />}
                        </span>
                        <span className="text-base font-bold text-[#33302B]">{env.how}</span>
                      </span>
                      <span data-place-persona className="col-span-2 text-base text-muted">
                        {env.persona}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* The recorded runs that taught KIBO the two learned kiosks (/learn): a box of its own under the cards,
                outside them, because a link cannot hold a link (I-123, #1 6); each link under its own card. */}
            <p data-place-learned className={`${CARD} grid gap-x-12 py-1 text-base sm:grid-cols-2`}>
              {LEARN_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex min-h-14 items-center rounded-tile font-semibold text-kibo underline underline-offset-4 ${FOCUS}`}
                >
                  {l.text}
                </Link>
              ))}
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
