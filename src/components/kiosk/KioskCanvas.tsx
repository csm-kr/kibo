"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { KioskTheme, Locale } from "@/types/menu";

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

/**
 * The kiosk is designed on a fixed 1080x1920 canvas and scaled to fit its parent (docs/UI_GUIDE.md "Canvas"),
 * so every kiosk size in components is canvas px. The theme comes from the kiosk data, so other kiosks reuse
 * every component through the --k-* variables.
 */
export function KioskCanvas({ theme, locale, children }: { theme: KioskTheme; locale: Locale; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / CANVAS_W, height / CANVAS_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vars = {
    "--k-primary": theme.primary,
    "--k-primary-dark": theme.primaryDark,
    "--k-primary-tint": theme.primaryTint,
    "--k-accent": theme.accent,
    "--k-bg": theme.background,
    width: CANVAS_W,
    height: CANVAS_H,
    transform: `translate(-50%, -50%) scale(${scale})`,
    // Hidden until measured, so the first paint is not a full-size canvas.
    visibility: scale ? "visible" : "hidden",
  } as CSSProperties;

  return (
    <div ref={outer} className="relative h-full w-full overflow-hidden bg-[#141210]">
      <div
        data-kiosk-canvas
        lang={locale}
        style={vars}
        // break-keep: Korean otherwise wraps between any two syllables and strands a single "요" (I-044).
        className="absolute top-1/2 left-1/2 origin-center overflow-hidden bg-(--k-bg) font-sans break-keep text-[#1E1B18]"
      >
        {children}
      </div>
    </div>
  );
}
