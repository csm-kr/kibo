"use client";

import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { FOCUS, PRESS } from "./ui";

/** A full-width row: the setting's name, then the switch with its state in words (/app settings, the app bar sheet). */
export function SettingSwitch(props: { label: string; on: boolean; locale: Locale; onChange(on: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-tile text-left text-xl font-semibold active:bg-kibo-tint ${PRESS} ${FOCUS}`}
    >
      <span>{props.label}</span>
      <span className="flex flex-none items-center gap-2">
        <span aria-hidden className="text-base font-normal text-muted">
          {pt(props.on ? "settingOn" : "settingOff", props.locale)}
        </span>
        <span
          aria-hidden
          className={`flex h-8 w-14 items-center rounded-full p-1 ${props.on ? "justify-end bg-kibo" : "justify-start bg-field"}`}
        >
          <span className="size-6 rounded-full bg-white" />
        </span>
      </span>
    </button>
  );
}
