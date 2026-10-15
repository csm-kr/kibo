"use client";

import { useEffect, useRef, useState } from "react";

// The last child of a scroll area in /demo's scenario column (the guide, "What the AI did"): while more content is
// below, a 32px fade lies on the bottom edge, so a line cut there reads as "more below", not as broken (design QA
// 10-15, #1 2). A sticky overlay, not a CSS mask, which would clip focus rings too; it never takes a tap, and the
// area's `scroll-pb-8` scrolls keyboard focus clear of it. Its negative top margin cancels its height and the
// area's gap, so it takes no room; sticky offsets count from inside the area's padding, so `bottom` is minus it.

/** `className`: `bottom` and side margins out to the area's edges, the top margin for its gap, the colour it fades to. */
export function ScrollFade({ className }: { className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const area = ref.current?.parentElement;
    if (!area) return;
    const update = () => setMore(area.scrollHeight - area.scrollTop - area.clientHeight > 1);
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
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      data-scroll-fade
      className={`pointer-events-none sticky h-8 flex-none bg-linear-to-b from-transparent ${more ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
