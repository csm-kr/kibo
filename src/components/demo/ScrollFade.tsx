"use client";

import { useEffect, useRef, useState } from "react";

// The last child of a scroll area in /demo's scenario column (the guide, "What the AI did"): while more content is
// below, a 32px fade lies on the bottom edge, so a line cut there reads as "more below", not as broken (design QA
// 10-15, #1 2). A sticky overlay, not a CSS mask, which would clip focus rings too; it never takes a tap, and the
// area's `scroll-pb-8` scrolls keyboard focus clear of it. Its negative top margin cancels its height and the
// area's gap, so it takes no room; sticky offsets count from inside the area's padding, so `bottom` is minus it.
// `edge="top"`: the first child instead, the same 32px fade on the top edge while content is above (#1 32), over the
// content (`z-10`, still under the phone's sheets and layers); its negative bottom margin cancels its height and gap.

/**
 * `className`: `bottom` (or `top`) and side margins out to the area's edges, the margin for its gap, the colour it fades
 * to. `edge`: which edge it lies on.
 */
export function ScrollFade({ className, edge = "bottom" }: { className: string; edge?: "top" | "bottom" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const area = ref.current?.parentElement;
    if (!area) return;
    // Content below the edge, not just the area's own bottom padding: when only padding is hidden, nothing is cut, and
    // the fade could not reach the edge (it sticks there only once content passes it), so it would lie over whole
    // lines above it (#1 E: the /demo phone at 1920×1080 with an empty cart, 2px of its 24px padding).
    // At the top the same holds for the area's top padding: the fade reaches the edge only once that is scrolled away.
    const update = () =>
      setMore(
        edge === "top"
          ? area.scrollTop > parseFloat(getComputedStyle(area).paddingTop) + 1
          : area.scrollHeight - area.scrollTop - area.clientHeight > parseFloat(getComputedStyle(area).paddingBottom) + 1,
      );
    update();
    area.addEventListener("scroll", update, { passive: true });
    // The area changes size with the window, and its content with new rows, ticks and status lines.
    const size = new ResizeObserver(update);
    size.observe(area);
    const content = new MutationObserver(update);
    content.observe(area, { childList: true, subtree: true, characterData: true });
    return () => {
      area.removeEventListener("scroll", update);
      size.disconnect();
      content.disconnect();
    };
  }, [edge]);
  return (
    <div
      ref={ref}
      aria-hidden
      data-scroll-fade={edge === "bottom" ? true : undefined}
      data-scroll-fade-top={edge === "top" ? true : undefined}
      className={`pointer-events-none sticky h-8 flex-none from-transparent ${edge === "top" ? "z-10 bg-linear-to-t" : "bg-linear-to-b"} ${more ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
