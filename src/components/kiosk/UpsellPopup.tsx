"use client";

import { findItem } from "@/lib/adapters/catalog";
import { kt } from "@/lib/i18n/kiosk";
import { formatWon } from "@/lib/kiosk/menu";
import type { KioskData } from "@/types/menu";
import { ITEM_SIZES, KioskImage } from "./KioskImage";
import { ModalLayer } from "./ModalLayer";
import { CARD_SHADOW, FOCUS, SCRIM } from "./styles";

// K5: the dessert offer, once per order. The server picks the items (result.upsell) and marks the offer made.

export function UpsellPopup(props: { kiosk: KioskData; offerItemIds: string[]; onAdd(itemId: string): void; onClose(): void }) {
  const { kiosk } = props;
  const locale = kiosk.locale;
  const items = props.offerItemIds.flatMap((id) => findItem(kiosk, id) ?? []);
  return (
    <ModalLayer className={`${SCRIM} flex items-center justify-center p-12`}>
      <section
        role="dialog"
        aria-modal
        aria-labelledby="upsell-title"
        className="flex w-full flex-col gap-10 rounded-[48px] bg-(--k-bg) p-12"
      >
        <h2 id="upsell-title" className="k-text-56 text-center font-bold">
          {kt("upsellTitle", locale)}
        </h2>
        <div className="grid grid-cols-2 gap-8">
          {items.map((item) => (
            <button
              key={item.itemId}
              type="button"
              onClick={() => props.onAdd(item.itemId)}
              className={`flex flex-col overflow-hidden rounded-[32px] border-[6px] border-transparent bg-white text-left active:border-(--k-primary) ${CARD_SHADOW} ${FOCUS}`}
            >
              <span className="relative block h-68 w-full">
                <KioskImage src={item.image} sizes={ITEM_SIZES} />
              </span>
              <span className="k-text-48 block px-8 pt-6 font-bold">{item.name[locale]}</span>
              <span className="flex items-center justify-between gap-4 px-8 pt-2 pb-8">
                <span className="k-text-40 font-bold text-(--k-primary)">{formatWon(item.variants[0].price, locale)}</span>
                <span className="k-text-40 rounded-full bg-(--k-accent) px-8 py-3 font-bold text-[#1E1B18]">
                  {kt("upsellAdd", locale)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
        >
          {kt("upsellNo", locale)}
        </button>
      </section>
    </ModalLayer>
  );
}
