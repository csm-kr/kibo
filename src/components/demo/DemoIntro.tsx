"use client";

import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { FOCUS, PRIMARY, SECONDARY } from "@/components/assistant/styles";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { DEMO_ENVIRONMENTS, demoHref } from "./environments";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.
// Three equal place cards pick the kiosk; the choice lives in the URL (`/demo?k=airport_rail`) so it can be linked,
// and [Start] opens the selected one.

// The split (kiosk left, phone right) needs 900px; below that the steps cannot point left or right (14-final:1).
const STEPS = [
  { wide: "Talk or type on the right.", narrow: "Talk or type to the phone." },
  { wide: "Watch the kiosk on the left move by itself.", narrow: "Watch the kiosk move by itself." },
  { wide: "Confirm, then pay on the kiosk.", narrow: "Confirm, then pay on the kiosk." },
];

export function DemoIntro(props: {
  kioskId: string;
  starting: boolean;
  error: ScreenErrorCode | null;
  onStart(): void;
  /** "Use my phone instead": the kiosk and a pairing panel; the judge's own phone claims the order. */
  onStartPhone(): void;
}) {
  return (
    <main data-demo="intro" className="flex h-dvh w-full overflow-y-auto bg-[#FBF7EF] px-6 py-8 text-[#15171C]">
      <div data-demo-check className="m-auto grid w-full max-w-6xl items-start gap-12 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-6">
          <Image src="/kibo-logo.svg" alt="KIBO" width={177} height={48} preload />
          {/* Said before anything else on a phone, not after [Start] (I-074). */}
          <div role="note" data-demo-narrow-note className="flex flex-col gap-3 rounded-[18px] bg-[#FFF1CC] p-4 text-[#7A2E0E] min-[900px]:hidden">
            <p className="text-xl font-bold">Open this on a laptop to see the kiosk and the phone side by side.</p>
            <p className="text-base">On this phone, try the real two-device mode: open the kiosk on a computer and scan its QR.</p>
            <a href={`/kiosk?k=${props.kioskId}`} className={SECONDARY}>
              Open the kiosk
            </a>
          </div>
          <h1 className="font-display text-5xl leading-tight font-bold">
            <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
          </h1>
          <p className="text-xl text-[#33302B]">
            Your phone becomes the voice of an existing self-order kiosk: say your order, the kiosk fills itself, you
            confirm and pay.
          </p>
          <ol className="flex flex-col gap-4 rounded-[26px] border border-[#E2DACB] bg-white p-6">
            {STEPS.map((step, i) => (
              <li key={step.wide} className="flex items-center gap-4 text-xl">
                <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-[#3446D4] text-xl font-bold text-white">
                  {i + 1}
                </span>
                <span className="max-[899px]:hidden">{step.wide}</span>
                <span className="min-[900px]:hidden">{step.narrow}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-6">
          <nav aria-labelledby="demo-place-pick" className="flex flex-col gap-4">
            <h2 id="demo-place-pick" className="text-xl font-bold">
              Pick a place. The phone works the same in each.
            </h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              {DEMO_ENVIRONMENTS.map((env) => {
                const current = env.kioskId === props.kioskId;
                return (
                  <li key={env.kioskId} className="flex">
                    {/* Selected = a thicker border and a check mark, never color alone. */}
                    <Link
                      href={demoHref(env.kioskId)}
                      replace
                      scroll={false}
                      aria-current={current ? "true" : undefined}
                      className={`flex w-full flex-col gap-2 rounded-[18px] bg-white p-4 ${
                        current ? "border-4 border-[#3446D4]" : "border-4 border-[#E2DACB]"
                      } ${FOCUS}`}
                    >
                      <span className="relative block">
                        <Image
                          src={env.image}
                          alt=""
                          width={800}
                          height={600}
                          sizes="320px"
                          className="aspect-[4/3] h-auto w-full rounded-[12px] border border-[#E2DACB] object-cover object-top"
                        />
                        {current && (
                          <span
                            aria-hidden
                            className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full border-2 border-[#3446D4] bg-white"
                          >
                            <CheckIcon />
                          </span>
                        )}
                      </span>
                      <span className="text-xl font-bold">{env.place.en}</span>
                      <span className="text-base font-bold text-[#33302B]">{env.how}</span>
                      <span className="text-base text-[#4B463F]">{env.persona}</span>
                    </Link>
                  </li>
                );
              })}
              {/* The recorded run that taught KIBO the pizza kiosk (/learn): its own row under that card, so the three
                  cards stay level (I-123), and outside the card, because a link cannot hold a link. */}
              <li className="sm:col-start-3">
                <Link
                  href="/learn/doughhouse"
                  className={`flex min-h-14 items-center rounded-tile px-2 text-base font-semibold text-kibo underline underline-offset-4 ${FOCUS}`}
                >
                  How KIBO learned the pizza kiosk
                </Link>
              </li>
            </ul>
          </nav>
          <div className="flex flex-col gap-2">
            {/* Together as wide as the card row above it, so they read as the row's actions (I-123). */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={props.starting} onClick={props.onStart} className={PRIMARY}>
                {props.starting ? "Starting…" : "Start"}
              </button>
              <button type="button" data-demo-own-phone disabled={props.starting} onClick={props.onStartPhone} className={SECONDARY}>
                <Smartphone size={24} strokeWidth={2} aria-hidden />
                Use my phone instead
              </button>
            </div>
            <p className="text-base text-[#4B463F]">
              Works in English and Korean. No microphone? Type instead. With your own phone, scan the kiosk&apos;s QR and
              talk to it.
            </p>
          </div>
          {props.error && (
            <p role="alert" className="rounded-[18px] border-2 border-[#7A2E0E] bg-[#FFF1CC] px-4 py-3 text-xl text-[#7A2E0E]">
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
