"use client";

import Image from "next/image";
import { PRIMARY } from "@/components/assistant/styles";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";

// D1 (docs/UX.md Flow C1): one sentence, three steps, one [Start]. Nothing else competes (V1). English: judges.

const STEPS = [
  "Talk or type on the right.",
  "Watch the kiosk on the left move by itself.",
  "Confirm, then pay on the kiosk.",
];

export function DemoIntro(props: { starting: boolean; error: ScreenErrorCode | null; onStart(): void }) {
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
        {props.error && (
          <p role="alert" className="rounded-[18px] border-2 border-[#7A2E0E] bg-[#FFF1CC] px-4 py-3 text-xl text-[#7A2E0E]">
            {errorCopy(props.error, "en")}
          </p>
        )}
      </div>
    </main>
  );
}
