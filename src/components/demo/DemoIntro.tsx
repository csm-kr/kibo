"use client";

import Image from "next/image";
import Link from "next/link";
import { FOCUS, PRIMARY } from "@/components/assistant/styles";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.
// Under [Start], a small choice of kiosk; it lives in the URL (`/demo?k=doughhouse`) so it can be linked.

const STEPS = [
  "Talk or type on the right.",
  "Watch the kiosk on the left move by itself.",
  "Confirm, then pay on the kiosk.",
];

const KIOSKS = [
  { kioskId: "malo", href: "/demo", name: "MALO BURGER", how: "connected directly" },
  { kioskId: "doughhouse", href: "/demo?k=doughhouse", name: "Doughhouse Pizza", how: "learned by KIBO Learn, no integration" },
];

export function DemoIntro(props: { kioskId: string; starting: boolean; error: ScreenErrorCode | null; onStart(): void }) {
  return (
    <main data-demo="intro" className="flex h-dvh w-full overflow-y-auto bg-[#FBF7EF] px-6 py-8 text-[#15171C]">
      <div data-demo-check className="m-auto flex w-full max-w-2xl flex-col gap-6">
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
        <div className="flex flex-col gap-2">
          <button type="button" disabled={props.starting} onClick={props.onStart} className={`${PRIMARY} max-w-sm`}>
            {props.starting ? "Starting…" : "Start"}
          </button>
          <p className="text-base text-[#4B463F]">Works in English and Korean. No microphone? Type instead.</p>
        </div>
        <nav aria-labelledby="demo-kiosk-pick" className="flex flex-col gap-2">
          <h2 id="demo-kiosk-pick" className="text-base font-bold text-[#33302B]">
            Kiosk
          </h2>
          <ul className="flex flex-col gap-2">
            {KIOSKS.map((k) => {
              const current = k.kioskId === props.kioskId;
              return (
                <li key={k.kioskId}>
                  {/* Selected = border and a check mark with the word, never color alone. */}
                  <Link
                    href={k.href}
                    replace
                    scroll={false}
                    aria-current={current ? "true" : undefined}
                    className={`flex min-h-14 items-center gap-3 rounded-[18px] border-2 bg-white px-4 py-2 text-base ${
                      current ? "border-[#3446D4]" : "border-[#E2DACB]"
                    } ${FOCUS}`}
                  >
                    <span aria-hidden className="flex size-6 flex-none items-center justify-center">
                      {current && <CheckIcon />}
                    </span>
                    <span>
                      <strong>{k.name}</strong> — {k.how}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {props.error && (
          <p role="alert" className="rounded-[18px] border-2 border-[#7A2E0E] bg-[#FFF1CC] px-4 py-3 text-xl text-[#7A2E0E]">
            {errorCopy(props.error, "en")}
          </p>
        )}
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
