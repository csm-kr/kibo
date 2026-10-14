"use client";

import { useState } from "react";
import { vocabularyOf } from "@/lib/adapters/catalog";
import { MAX_QTY } from "@/lib/commands/cart";
import { kt, stepLabel, variantWord } from "@/lib/i18n/kiosk";
import { draftSelections, formatWon, sheetPrice, sheetSteps, type SheetDraft } from "@/lib/kiosk/menu";
import type { KioskData, Locale, MenuItem, MenuOption, Variant } from "@/types/menu";
import type { LineInput } from "@/types/session";
import { ITEM_SIZES, KioskImage } from "./KioskImage";
import { ModalLayer } from "./ModalLayer";
import { CARD_SHADOW, FOCUS, SCRIM } from "./styles";

// K4: set → side → drink → ingredients and quantity (docs/UX.md screen map). Canvas px.

function initialDraft(item: MenuItem): SheetDraft {
  const selections: Record<string, string[]> = {};
  for (const g of item.optionGroups) {
    if (g.defaultOptionIds.length > 0) selections[g.groupId] = [...g.defaultOptionIds];
  }
  return {
    itemId: item.itemId,
    // Real kiosks ask "Make it a set?" with nothing preselected.
    variant: item.variants.length === 1 ? item.variants[0].variant : null,
    qty: 1,
    selections,
  };
}

export function ProductSheet(props: {
  kiosk: KioskData;
  item: MenuItem;
  onClose(): void;
  onAdd(input: Required<LineInput>, unitPrice: number): void;
}) {
  const { kiosk, item } = props;
  const { locale, domain } = kiosk;
  const [draft, setDraft] = useState(() => initialDraft(item));
  const [stepIndex, setStepIndex] = useState(0);

  const steps = sheetSteps(item, draft.variant, locale, domain);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = step.index === steps.length;
  const group = step.groupId ? item.optionGroups.find((g) => g.groupId === step.groupId) : undefined;
  const chosen = group ? (draft.selections[group.groupId] ?? []) : [];
  const canGoOn = step.kind === "variant" ? draft.variant !== null : group ? chosen.length >= group.min : true;
  const price = sheetPrice(kiosk, draft);
  // A group with discounts (passenger fares) shows each option's full price, so the adult fare is visible too (I-119).
  const basePrice = item.variants.find((v) => v.variant === (draft.variant ?? item.variants[0].variant))?.price ?? 0;
  const fullPrices = group?.options.some((o) => o.priceDelta < 0) ?? false;

  function pickVariant(variant: Variant) {
    setDraft((d) => ({ ...d, variant }));
  }

  function toggleOption(option: MenuOption) {
    if (!group) return;
    setDraft((d) => {
      const current = d.selections[group.groupId] ?? [];
      let next: string[];
      if (group.max === 1) next = [option.optionId];
      else if (current.includes(option.optionId)) next = current.filter((id) => id !== option.optionId);
      else if (current.length < group.max) next = [...current, option.optionId];
      else return d;
      return { ...d, selections: { ...d.selections, [group.groupId]: next } };
    });
  }

  function add() {
    const variant = draft.variant;
    if (!variant) return;
    const selections = draftSelections(item, variant, draft.selections);
    props.onAdd({ itemId: item.itemId, variant, qty: draft.qty, selections }, sheetPrice(kiosk, { ...draft, qty: 1 }));
  }

  const titleId = `sheet-${item.itemId}`;
  return (
    <ModalLayer className={SCRIM} onClick={props.onClose}>
      <section
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex max-h-[1640px] flex-col rounded-t-[48px] bg-(--k-bg)"
      >
        <div className="flex flex-none items-center gap-8 border-b-4 border-[#E2DACB] px-12 pt-12 pb-8">
          <span className="relative size-50 flex-none overflow-hidden rounded-[32px] bg-white">
            <KioskImage src={item.image} sizes={ITEM_SIZES} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="k-text-56 font-bold">
              {item.name[locale]}
            </h2>
            <p className="k-text-40 mt-2 font-bold text-(--k-primary-dark)">{stepLabel(step, locale)}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className={`k-text-40 min-h-22 flex-none self-start rounded-full bg-(--k-panel) px-8 font-bold ${FOCUS}`}
          >
            {kt("close", locale)}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-12 py-10">
          {step.kind === "variant" && (
            <>
              <p className="k-text-48 mb-8 font-bold">{kt("variantQuestion", locale)}</p>
              <div className="grid grid-cols-3 gap-6">
                {item.variants.map((v) => (
                  <Choice
                    key={v.variant}
                    selected={draft.variant === v.variant}
                    name={capitalized(variantWord(v.variant, locale))}
                    sub={formatWon(v.price, locale)}
                    locale={locale}
                    onPick={() => pickVariant(v.variant)}
                  />
                ))}
              </div>
            </>
          )}
          {group && (
            <>
              <p className="k-text-48 mb-8 font-bold">
                {group.name[locale]}
                <span className="k-text-40 ml-6 font-normal text-[#4B463F]">
                  {group.required
                    ? kt("chooseOne", locale)
                    : group.max > 1
                      ? `${group.max}${kt("chooseUpTo", locale)}`
                      : kt("optional", locale)}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-6">
                {group.options.map((o) => {
                  const selected = chosen.includes(o.optionId);
                  const full = group.max > 1 && !selected && chosen.length >= group.max;
                  return (
                    <Choice
                      key={o.optionId}
                      selected={selected}
                      disabled={o.soldOut || full}
                      soldOut={o.soldOut}
                      image={o.image}
                      name={o.name[locale]}
                      sub={fullPrices ? formatWon(basePrice + o.priceDelta, locale) : signedDelta(o.priceDelta, locale)}
                      locale={locale}
                      onPick={() => toggleOption(o)}
                    />
                  );
                })}
              </div>
            </>
          )}
          {isLast && (
            <div className={`mt-10 flex items-center justify-between rounded-[32px] bg-white p-8 ${CARD_SHADOW}`}>
              <span className="k-text-48 font-bold">{kt("quantity", locale, domain)}</span>
              <div className="flex items-center gap-8">
                <button
                  type="button"
                  aria-label={kt("less", locale)}
                  disabled={draft.qty <= 1}
                  onClick={() => setDraft((d) => ({ ...d, qty: d.qty - 1 }))}
                  className={`k-text-56 size-28 rounded-full border-4 border-[#1E1B18] bg-white font-bold disabled:border-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
                >
                  −
                </button>
                <span className="k-text-56 w-24 text-center font-display font-bold" aria-live="polite">
                  {draft.qty}
                </span>
                <button
                  type="button"
                  aria-label={kt("more", locale)}
                  disabled={draft.qty >= MAX_QTY}
                  onClick={() => setDraft((d) => ({ ...d, qty: d.qty + 1 }))}
                  className={`k-text-56 size-28 rounded-full border-4 border-[#1E1B18] bg-white font-bold disabled:border-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-6 border-t-4 border-[#E2DACB] bg-white px-12 py-10">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStepIndex((i) => i - 1)}
              className={`k-text-40 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white px-10 font-bold ${FOCUS}`}
            >
              {kt("back", locale)}
            </button>
          )}
          <span className="k-text-56 flex-1 text-right font-display font-bold text-(--k-primary)">{formatWon(price, locale)}</span>
          <button
            type="button"
            disabled={!canGoOn}
            onClick={isLast ? add : () => setStepIndex((i) => i + 1)}
            className={`k-text-48 min-h-32 min-w-80 rounded-full bg-(--k-accent) px-12 font-bold text-[#1E1B18] disabled:bg-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
          >
            {isLast ? vocabularyOf(kiosk).add[locale] : kt("next", locale)}
          </button>
        </div>
      </section>
    </ModalLayer>
  );
}

/** "+500원" for a surcharge, nothing when the price stays. */
function signedDelta(delta: number, locale: Locale): string | undefined {
  if (delta === 0) return undefined;
  return `${delta > 0 ? "+" : "−"}${formatWon(Math.abs(delta), locale)}`;
}

/** "Set" on the K4 button; line titles keep the lowercase word ("Cheeseburger set", I-120). Korean is unchanged. */
function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "어린이 (6–12세)": the bracketed range never breaks inside, `break-keep` allows a break after the dash (I-109). */
function KeepRange({ name }: { name: string }) {
  return name.split(/(\([^)]*\))/).map((part, i) => (i % 2 === 1 ? <span key={i} className="whitespace-nowrap">{part}</span> : part));
}

function Choice(props: {
  selected: boolean;
  disabled?: boolean;
  soldOut?: boolean;
  image?: string;
  name: string;
  sub?: string;
  locale: KioskData["locale"];
  onPick(): void;
}) {
  const { selected, image } = props;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={props.disabled}
      onClick={props.onPick}
      className={`relative flex min-h-50 flex-col overflow-hidden rounded-[32px] border-[6px] bg-white text-left disabled:opacity-60 ${
        selected ? "border-(--k-primary) shadow-[0_0_0_8px_var(--k-primary-tint)]" : `border-transparent ${CARD_SHADOW}`
      } ${FOCUS}`}
    >
      {image && (
        <span className="relative block h-50 w-full flex-none">
          <KioskImage src={image} sizes={ITEM_SIZES} />
        </span>
      )}
      <span className="k-text-40 block px-6 pt-4 font-bold">
        <KeepRange name={props.name} />
      </span>
      {props.sub && <span className="k-text-40 block px-6 text-(--k-primary-dark)">{props.sub}</span>}
      {props.soldOut && (
        <span className="k-text-40 mx-6 mt-2 self-start rounded-full bg-[#FFF1CC] px-4 font-bold text-[#7A2E0E]">
          {kt("soldOut", props.locale)}
        </span>
      )}
      <span className="pb-4" />
      {selected && (
        <span
          aria-hidden
          className="absolute top-4 right-4 flex size-18 items-center justify-center rounded-full bg-(--k-primary) text-white"
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      )}
    </button>
  );
}
