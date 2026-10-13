"use client";

import { Bell, Globe } from "lucide-react";
import Image from "next/image";
import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { COMPACT, ICON } from "./ui";

// The phone app bar (docs/UI_GUIDE.md "Phone design"): one 64px row on every phone screen. The connection state is a
// dot and a word, so color is never the only signal; each control's visible word is part of its accessible name.

export type Connection = "connected" | "reconnecting";

export function AppBar(props: {
  brand: string;
  locale: Locale;
  connection: Connection;
  onLocaleChange(next: Locale): void;
  /** Left out once the order has ended (P7). */
  onStaff?: () => void;
  staffDisabled?: boolean;
}) {
  const { locale } = props;
  const other: Locale = locale === "ko" ? "en" : "ko";
  const online = props.connection === "connected";
  return (
    <header className="flex min-h-16 flex-none items-center gap-2 bg-white px-4 py-1 shadow-card">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* max-w-none: a percentage max-width lets the row count the logo as 0px wide (I-062). */}
        <Image src="/kibo-mark.svg" alt="KIBO" width={32} height={32} unoptimized className="size-8 max-w-none flex-none" />
        <div className="flex min-w-0 flex-col">
          <span className="text-base leading-normal font-bold [overflow-wrap:anywhere]">{props.brand}</span>
          <span role="status" className="flex items-center gap-2 text-base leading-normal text-muted">
            <span aria-hidden className={`size-2 flex-none rounded-full ${online ? "bg-online" : "bg-staff-ink"}`} />
            {pt(online ? "connected" : "barReconnecting", locale)}
          </span>
        </div>
      </div>
      {/* Named in the other language, so a reader of either can find it. The full name is shown, not "EN": a short
          code that is not a word of the accessible name fails WCAG 2.5.3 (label in name). */}
      <button
        type="button"
        lang={other}
        onClick={() => props.onLocaleChange(other)}
        className={`${COMPACT} text-ink active:bg-kibo-tint`}
      >
        <Globe {...ICON} />
        <span>{pt(other === "ko" ? "langKo" : "langEn", locale)}</span>
      </button>
      {props.onStaff && (
        <button
          type="button"
          aria-label={pt("callStaff", locale)}
          disabled={props.staffDisabled}
          onClick={props.onStaff}
          className={`${COMPACT} bg-staff-tint text-staff-ink active:bg-staff-tint-pressed disabled:opacity-60`}
        >
          <Bell {...ICON} />
          <span>{pt("staffShort", locale)}</span>
        </button>
      )}
    </header>
  );
}
