"use client";

import Image from "next/image";
import { useId } from "react";
import { findItem } from "@/lib/adapters/catalog";
import { choiceLabel, choiceQuestion } from "@/lib/agent/choices";
import type { ChoiceRef } from "@/lib/commands/errors";
import type { KioskData, Locale } from "@/types/menu";
import type { Session } from "@/types/session";
import { CHIP } from "./styles";

// Choice buttons from session.pendingChoice (heuristic 6). The question and labels come from fixed templates and
// menu data, never from model text.

function choicePhoto(k: KioskData, c: ChoiceRef): string | undefined {
  if (c.kind === "item") return findItem(k, c.id)?.image;
  if (c.kind === "dine" && (c.id === "eat_in" || c.id === "take_out")) return k.dineOptions[c.id].image;
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

export function ChoiceButtons(props: {
  kiosk: KioskData;
  pending: NonNullable<Session["pendingChoice"]>;
  locale: Locale;
  disabled: boolean;
  onPick(choice: ChoiceRef, label: string): void;
}) {
  const { kiosk, pending, locale } = props;
  const titleId = useId();
  const choices = pending.choices
    .map((c) => ({ choice: c, label: choiceLabel(kiosk, c, locale), photo: choicePhoto(kiosk, c) }))
    .filter((c) => c.label);
  if (choices.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-xl font-bold">
        {choiceQuestion(pending.templateId, locale)}
      </h2>
      {/* One column: menu names like "Double cheeseburger" do not fit half a phone at 20px. */}
      <div className="flex flex-col gap-2">
        {choices.map(({ choice, label, photo }) => (
          <button
            key={`${choice.kind}:${choice.id}`}
            type="button"
            disabled={props.disabled}
            onClick={() => props.onPick(choice, label)}
            className={`${CHIP} flex items-center gap-3 font-bold`}
          >
            {photo && <Image src={photo} alt="" width={48} height={48} className="size-12 flex-none rounded-[12px] object-cover" />}
            <span className="text-xl">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
