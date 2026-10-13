"use client";

import { useState } from "react";
import type { CommandReply } from "@/lib/client/api";
import { findItem } from "@/lib/adapters/catalog";
import type { CommandType } from "@/lib/commands/schemas";
import { kt } from "@/lib/i18n/kiosk";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData } from "@/types/menu";
import type { CartLine, Session } from "@/types/session";
import { Header } from "./KioskScreen";
import { KioskImage } from "./KioskImage";
import { KioskToolbar } from "./KioskToolbar";
import { ModalLayer } from "./ModalLayer";
import { FOCUS, SCRIM } from "./styles";

// K6 order review (status `confirming`, docs/UX.md A8). A quantity change sends the session back to `ordering`
// on the server, and the screen follows the stream. Canvas px.

type Send = (type: CommandType, args: object, opts?: { cartVersion?: number }) => Promise<CommandReply | null>;

export function ReviewScreen(props: {
  kiosk: KioskData;
  session: Session;
  claimUrl: string | null;
  send: Send;
  onClaimUrl?(claimUrl: string): void;
}) {
  const { kiosk, session } = props;
  const { locale, domain } = kiosk;
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<CartLine | null>(null);

  /** One command at a time, so a double tap cannot send a second confirm. */
  async function run(type: CommandType, args: object, opts?: { cartVersion?: number }) {
    if (busy) return;
    setBusy(true);
    await props.send(type, args, opts);
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Header kiosk={kiosk} />
      <KioskToolbar kiosk={kiosk} session={session} claimUrl={props.claimUrl} send={props.send} onClaimUrl={props.onClaimUrl} />
      <h1 className="k-text-72 flex-none px-12 pt-12 pb-8 font-bold">{kt("reviewTitle", locale, domain)}</h1>

      <ul className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pb-8">
        {session.cart.map((line) => (
          <ReviewLine
            key={line.lineId}
            kiosk={kiosk}
            line={line}
            disabled={busy}
            onLess={() =>
              line.qty <= 1 ? setRemoving(line) : void run("updateCart", { lineId: line.lineId, changes: { qty: line.qty - 1 } })
            }
            onMore={() => void run("updateCart", { lineId: line.lineId, changes: { qty: line.qty + 1 } })}
          />
        ))}
      </ul>

      <section className="flex flex-none flex-col gap-8 border-t-4 border-[#E2DACB] bg-white px-12 py-10">
        {kiosk.dineOptions && (
          <div className="flex items-baseline justify-between gap-6">
            <span className="k-text-40 text-[#4B463F]">{kt("dineLabel", locale)}</span>
            <span className="k-text-48 font-bold">
              {session.dineOption ? kiosk.dineOptions[session.dineOption].name[locale] : kt("dineNotSet", locale)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-6">
          <span className="k-text-48 font-bold">{kt("total", locale)}</span>
          <span className="k-text-72 font-display font-bold text-(--k-primary)">{formatWon(session.total, locale)}</span>
        </div>
        <div className="flex gap-8">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("cancelCheckout", {})}
            className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white px-12 font-bold disabled:opacity-60 ${FOCUS}`}
          >
            {kt("pickMore", locale, domain)}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("confirmCheckout", {}, { cartVersion: session.cartVersion })}
            className={`k-text-56 min-h-32 flex-1 rounded-full bg-(--k-accent) font-bold text-[#1E1B18] disabled:opacity-60 ${FOCUS}`}
          >
            {kt("pay", locale)}
          </button>
        </div>
      </section>

      {removing && (
        <ModalLayer className={`${SCRIM} flex items-center justify-center p-12`}>
          <section role="alertdialog" aria-modal aria-labelledby="remove-title" className="flex w-full flex-col gap-10 rounded-[48px] bg-(--k-bg) p-12">
            <h2 id="remove-title" className="k-text-56 text-center font-bold">
              {kt("removeAsk", locale, domain)}
            </h2>
            <p className="k-text-48 text-center">{lineLabel(kiosk, removing, locale).title}</p>
            <div className="grid grid-cols-2 gap-8">
              <button
                type="button"
                onClick={() => setRemoving(null)}
                className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
              >
                {kt("cancel", locale)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoving(null);
                  void run("removeFromCart", { lineId: removing.lineId });
                }}
                className={`k-text-48 min-h-32 rounded-full bg-[#7A2E0E] font-bold text-white ${FOCUS}`}
              >
                {kt("removeYes", locale)}
              </button>
            </div>
          </section>
        </ModalLayer>
      )}
    </div>
  );
}

function ReviewLine(props: { kiosk: KioskData; line: CartLine; disabled: boolean; onLess(): void; onMore(): void }) {
  const { kiosk, line } = props;
  const { locale, domain } = kiosk;
  const item = findItem(kiosk, line.itemId);
  const label = lineLabel(kiosk, line, locale);
  return (
    <li className="flex flex-none gap-8 rounded-[32px] border-4 border-[#E2DACB] bg-white p-6">
      <span className="relative size-40 flex-none overflow-hidden rounded-[24px] bg-(--k-panel)">
        {item && <KioskImage src={item.image} sizes="160px" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p className="k-text-48 font-bold">{label.title}</p>
        {label.detail && <p className="k-text-40 text-[#4B463F]">{label.detail}</p>}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4" role="group" aria-label={kt("quantity", locale, domain)}>
            <button
              type="button"
              disabled={props.disabled}
              onClick={props.onLess}
              aria-label={kt("less", locale)}
              className={`k-text-56 flex size-24 items-center justify-center rounded-full border-4 border-[#1E1B18] bg-white font-bold disabled:opacity-60 ${FOCUS}`}
            >
              −
            </button>
            <span className="k-text-56 w-20 text-center font-display font-bold">{line.qty}</span>
            <button
              type="button"
              disabled={props.disabled || line.qty >= 10}
              onClick={props.onMore}
              aria-label={kt("more", locale)}
              className={`k-text-56 flex size-24 items-center justify-center rounded-full border-4 border-[#1E1B18] bg-white font-bold disabled:opacity-60 ${FOCUS}`}
            >
              +
            </button>
          </div>
          <span className="k-text-48 font-display font-bold">{formatWon(line.unitPrice * line.qty, locale)}</span>
        </div>
      </div>
    </li>
  );
}
