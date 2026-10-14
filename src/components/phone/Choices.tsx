"use client";

import Image from "next/image";
import { useId } from "react";
import { findItem } from "@/lib/adapters/catalog";
import { choiceLabel, choicePrice, choiceQuestion, declineLabel } from "@/lib/agent/choices";
import type { ChoiceRef } from "@/lib/commands/errors";
import type { KioskData, Locale } from "@/types/menu";
import type { Session } from "@/types/session";
import { FOCUS, PRESS } from "./ui";

// Choice buttons from session.pendingChoice (heuristic 6), in the phone design: white cards with a photo, so they read
// as answers, apart from the tinted "Try saying" suggestions. The question and labels come from fixed templates and
// menu data, never from model text.

function choicePhoto(k: KioskData, c: ChoiceRef): string | undefined {
  if (c.kind === "item") return findItem(k, c.id)?.image;
  if (c.kind === "dine" && (c.id === "eat_in" || c.id === "take_out")) return k.dineOptions?.[c.id].image;
  if (c.kind === "option") {
    for (const item of k.items) {
      for (const group of item.optionGroups) {
        const option = group.options.find((o) => o.optionId === c.id);
        if (option) return option.image;
      }
    }
  }
  return undefined;
}

export function Choices(props: {
  kiosk: KioskData;
  pending: NonNullable<Session["pendingChoice"]>;
  locale: Locale;
  disabled: boolean;
  onPick(choice: ChoiceRef, label: string): void;
  /** An offer (the dessert upsell) can be turned down with one tap; the label goes to the agent as the answer. */
  onDecline?: (label: string) => void;
}) {
  const { kiosk, pending, locale } = props;
  const titleId = useId();
  const choices = pending.choices
    .map((c) => ({ choice: c, label: choiceLabel(kiosk, c, locale), price: choicePrice(kiosk, c, locale), photo: choicePhoto(kiosk, c) }))
    .filter((c) => c.label);
  const decline = props.onDecline ? declineLabel(pending.templateId, locale) : null;
  if (choices.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-xl font-bold">
        {choiceQuestion(kiosk, pending, locale)}
      </h2>
      {/* One column: menu names like "Double cheeseburger" do not fit half a phone at 20px. */}
      <div className="flex flex-col gap-2">
        {choices.map(({ choice, label, price, photo }) => (
          <button
            key={`${choice.kind}:${choice.id}`}
            type="button"
            disabled={props.disabled}
            onClick={() => props.onPick(choice, label)}
            // [Call staff] looks like the header's staff button, apart from the answers.
            className={`flex min-h-15 items-center gap-3 rounded-tile px-3 py-2 text-left disabled:opacity-60 ${
              choice.kind === "staff" ? "bg-staff-tint text-staff-ink" : "bg-white shadow-card active:bg-kibo-tint"
            } ${PRESS} ${FOCUS}`}
          >
            {photo && <Image src={photo} alt="" width={48} height={48} className="size-12 flex-none rounded-[12px] bg-cream object-cover" />}
            {/* The tap sends only the name; the price is from menu data, like the kiosk tile's. */}
            <span className="min-w-0 text-xl">
              <span className="font-semibold">{label}</span>
              {price && <span className="text-muted tabular-nums"> · {price}</span>}
            </span>
          </button>
        ))}
        {decline && (
          <button
            type="button"
            data-choice-decline
            disabled={props.disabled}
            onClick={() => props.onDecline?.(decline)}
            className={`flex min-h-15 items-center justify-center rounded-tile bg-kibo-tint px-4 text-xl font-semibold text-kibo active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`}
          >
            {decline}
          </button>
        )}
      </div>
    </section>
  );
}
