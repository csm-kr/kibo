"use client";

import { useState } from "react";
import { kt } from "@/lib/i18n/kiosk";
import type { KioskData } from "@/types/menu";
import { ModalLayer } from "./ModalLayer";
import { FOCUS, SCRIM } from "./styles";

// [처음으로] on the standalone kiosk's K2 and K3 (I-048). It ends the touch order the way K8 does (a new session
// and QR), never through a payment path. The dialog is absolute, so it covers the nearest positioned screen root.

export function StartOver(props: { kiosk: KioskData; step: "now" | "ask"; onStartOver(): void }) {
  const { locale, domain } = props.kiosk;
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => (props.step === "ask" ? setAsking(true) : props.onStartOver())}
        className={`k-text-40 min-h-32 flex-none rounded-full border-4 border-[#1E1B18] bg-white px-10 font-bold ${FOCUS}`}
      >
        {kt("startOver", locale)}
      </button>
      {asking && (
        <ModalLayer className={`${SCRIM} flex items-center justify-center p-12`}>
          <section role="alertdialog" aria-modal aria-labelledby="start-over-title" className="flex w-full flex-col gap-10 rounded-[48px] bg-(--k-bg) p-12">
            <h2 id="start-over-title" className="k-text-56 text-center font-bold">
              {kt("startOverAsk", locale, domain)}
            </h2>
            <div className="grid grid-cols-2 gap-8">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
              >
                {kt("keepOrdering", locale, domain)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  props.onStartOver();
                }}
                className={`k-text-48 min-h-32 rounded-full bg-[#7A2E0E] font-bold text-white ${FOCUS}`}
              >
                {kt("startOverYes", locale)}
              </button>
            </div>
          </section>
        </ModalLayer>
      )}
    </>
  );
}
