"use client";

import { Pause } from "lucide-react";
import { useEffect, useRef } from "react";
import { FOCUS } from "@/components/phone/ui";
import { useInertBackground } from "@/hooks/useInertBackground";

/**
 * "Paused · Tap to continue" over the whole screen after 20 min with nothing happening, while the session stream is
 * closed (src/lib/client/streamControl.ts). One full-screen button: it takes the whole tap, so nothing under it is
 * pressed, and the rest of the page is inert while it shows. Phone and /demo only: kiosk screens never pause (I-172).
 */
export function PausedLayer({ lines, onResume }: { lines: string[]; onResume: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useInertBackground(ref);
  useEffect(() => ref.current?.focus(), []);
  return (
    <button
      ref={ref}
      type="button"
      data-stream-paused
      // `click`, not `pointerdown`: the layer stays until the whole tap is over, so its end never lands underneath.
      onClick={onResume}
      className={`kibo-fade-in fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-cream/95 px-8 text-center text-ink ${FOCUS} focus-visible:outline-offset-[-6px]`}
    >
      <span className="flex size-24 items-center justify-center rounded-full bg-kibo-tint text-kibo">
        <Pause size={40} strokeWidth={2} aria-hidden />
      </span>
      {lines.map((line, i) => (
        <span key={line} className={i === 0 ? "text-2xl font-bold break-keep" : "text-xl text-muted"}>
          {line}
        </span>
      ))}
    </button>
  );
}
