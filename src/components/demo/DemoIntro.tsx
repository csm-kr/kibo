"use client";

import Image from "next/image";
import Link from "next/link";
import { FOCUS, PRIMARY } from "@/components/assistant/styles";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { DEMO_ENVIRONMENTS, demoHref } from "./environments";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.
// Three equal place cards pick the kiosk; the choice lives in the URL (`/demo?k=airport_rail`) so it can be linked,
// and [Start] opens the selected one.

const STEPS = [
  "Talk or type on the right.",
  "Watch the kiosk on the left move by itself.",
  "Confirm, then pay on the kiosk.",
];

export function DemoIntro(props: { kioskId: string; starting: boolean; error: ScreenErrorCode | null; onStart(): void }) {
  return (
    <main data-demo="intro" className="flex h-dvh w-full overflow-y-auto bg-[#FBF7EF] px-6 py-8 text-[#15171C]">
      <div data-demo-check className="m-auto grid w-full max-w-6xl items-start gap-12 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-6">
          <Image src="/kibo-logo.svg" alt="KIBO" width={177} height={48} preload />
          <h1 className="font-display text-5xl leading-tight font-bold">
            <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
          </h1>
          <p className="text-xl text-[#33302B]">
            Your phone becomes the voice of an existing self-order kiosk: say your order, the kiosk fills itself, you
            confirm and pay.
          </p>
          <ol className="flex flex-col gap-4 rounded-[26px] border border-[#E2DACB] bg-white p-6">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-4 text-xl">
                <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-[#3446D4] text-xl font-bold text-white">
                  {i + 1}
                </span>
                {step}
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
                          unoptimized
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
            </ul>
          </nav>
          <div className="flex flex-col gap-2">
            {/* As wide as the card row above it, so it reads as the row's action (I-123). */}
            <button type="button" disabled={props.starting} onClick={props.onStart} className={PRIMARY}>
              {props.starting ? "Starting…" : "Start"}
            </button>
            <p className="text-base text-[#4B463F]">Works in English and Korean. No microphone? Type instead.</p>
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
