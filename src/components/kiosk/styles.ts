// Shared kiosk class strings. Sizes are 1080x1920 canvas px (docs/UI_GUIDE.md).

export const FOCUS = "focus-visible:outline-[6px] focus-visible:outline-offset-4 focus-visible:outline-[#1E1B18]";

/** The same ring drawn inside, for a control as wide as the scroll area that clips it (the category rail, #1 22). */
export const FOCUS_INSIDE = "focus-visible:outline-[6px] focus-visible:-outline-offset-6 focus-visible:outline-[#1E1B18]";

/** Full-canvas scrim for sheets and pop-ups. */
export const SCRIM = "absolute inset-0 z-20 bg-[#1E1B18]/60";

/**
 * A white card lifted off the cream page by a soft two-layer shadow instead of a beige outline (14-final:2). Not on
 * an element while it shows the AI ring: `k-ring` is a box-shadow too.
 */
export const CARD_SHADOW = "shadow-[0_2px_6px_rgb(30_27_24/0.06),0_12px_32px_rgb(30_27_24/0.10)]";
