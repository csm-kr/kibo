"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FOCUS_INSIDE, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { demoHref, offeredPlaces, type DemoPlace } from "./environments";

// The /demo frame around D1, D2 and D3 (docs/UI_GUIDE.md "/demo frame", issue #1 batch E): a light neutral canvas and
// a slim top bar with KIBO, "Live demo", the place tabs and a quiet "How it works". A place tab starts that place
// fresh, as D3's Try another place does; an order with lines that is not paid yet is asked about first (N5).

export function DemoFrame(props: {
  kioskId: string;
  /** The current order has lines and is not paid: leaving it clears it, so a place tab asks first. */
  askBeforeLeaving: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-demo-frame className={`flex h-dvh w-full flex-col overflow-hidden bg-[#EFEFEC] text-ink ${props.className ?? ""}`}>
      <TopBar kioskId={props.kioskId} askBeforeLeaving={props.askBeforeLeaving} />
      {props.children}
    </div>
  );
}

function TopBar({ kioskId, askBeforeLeaving }: { kioskId: string; askBeforeLeaving: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [leaving, setLeaving] = useState<DemoPlace | null>(null);
  // Modal, so the page under it is inert and Escape closes it; focus lands on the first button, the safe one.
  useEffect(() => {
    if (leaving && !dialog.current?.open) dialog.current?.showModal();
  }, [leaving]);

  return (
    <header
      data-demo-topbar
      className="mx-auto flex h-16 w-full max-w-[1600px] flex-none items-center justify-between gap-2 px-6 min-[900px]:grid min-[900px]:gap-4 min-[900px]:grid-cols-[1fr_auto_1fr]"
    >
      <div className="flex items-center gap-3">
        <Image src="/kibo-logo.svg" alt="KIBO" width={111} height={30} preload className="h-[30px] w-auto flex-none" />
        {/* Below 900px wide (the laptop note) the bar keeps only the mark and "How it works", so it fits 320px. */}
        <span aria-hidden className="h-6 w-px bg-[#D3D0C9] max-[899px]:hidden" />
        <span className="text-base font-semibold text-muted max-[899px]:hidden">Live demo</span>
      </div>
      {/* Below 900px wide /demo is the laptop note and D1's own place cards; three tabs would not fit. */}
      <nav aria-label="Places" className="max-[899px]:hidden">
        {/* The drawn track is 48px; each tab's target reaches 56px over its edges, 8px from the next one. */}
        <ul className="flex h-12 items-center gap-2 rounded-full bg-[#E3E2DE] px-1">
          {offeredPlaces(kioskId).map((env) => {
            const current = env.kioskId === kioskId;
            return (
              <li key={env.kioskId}>
                <Link
                  href={demoHref(env.kioskId)}
                  aria-current={current ? "page" : undefined}
                  onClick={(e) => {
                    if (current || !askBeforeLeaving) return;
                    e.preventDefault();
                    setLeaving(env);
                  }}
                  className={`group flex h-14 items-center rounded-full ${FOCUS_INSIDE}`}
                >
                  {/* Selected: a white pill with a shadow and bold ink text, never color alone. */}
                  <span
                    className={`flex h-10 items-center rounded-full px-4 text-base ${
                      current ? "bg-white font-bold text-ink shadow-card" : "font-semibold text-muted group-hover:text-ink"
                    }`}
                  >
                    {env.place.en}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link
        href="/#how"
        className={`flex min-h-14 items-center gap-2 justify-self-end rounded-full px-2 text-base font-semibold whitespace-nowrap text-kibo ${FOCUS_INSIDE}`}
      >
        <CircleHelp size={20} strokeWidth={2} aria-hidden />
        How it works
      </Link>
      <dialog
        ref={dialog}
        aria-labelledby="demo-leave-title"
        onClose={() => setLeaving(null)}
        className="m-auto w-[min(440px,calc(100vw-48px))] rounded-sheet bg-white p-6 text-ink shadow-card backdrop:bg-ink/40"
      >
        {leaving && (
          <div className="flex flex-col gap-4">
            <h2 id="demo-leave-title" className="text-2xl font-bold">
              Start over at {leaving.place.en}?
            </h2>
            <p className="text-xl">This order is cleared.</p>
            <button type="button" onClick={() => dialog.current?.close()} className={SECONDARY}>
              Keep this order
            </button>
            <button type="button" onClick={() => router.push(demoHref(leaving.kioskId))} className={PRIMARY}>
              Start over
            </button>
          </div>
        )}
      </dialog>
    </header>
  );
}
