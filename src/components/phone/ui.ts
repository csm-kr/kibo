// Phone design class strings (docs/UI_GUIDE.md "Phone design"). Sizes are rem, so the system font size applies.
// No dark outlines: the only dark edge on the phone is the focus ring. One filled primary per screen (I-142).

export const FOCUS = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The same ring drawn inside the control, where its container clips what lies outside its edge (#1 22). */
export const FOCUS_INSIDE = "focus-visible:outline-[3px] focus-visible:-outline-offset-3 focus-visible:outline-ink";

/** Press feedback: 150ms ease-out color, and a slight shrink only when motion is welcome. */
export const PRESS = "transition-[background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.98]";

/** Filled KIBO blue, full width, >= 60px. */
export const PRIMARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-tile bg-kibo px-4 text-xl font-bold text-white active:bg-kibo-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`;

/** Tinted KIBO blue with blue text, no border, full width, >= 60px. */
export const SECONDARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-tile bg-kibo-tint px-4 text-xl font-semibold text-kibo active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`;

/** [Send] beside a text field: as wide as its word, >= 56px. */
export const PRIMARY_SMALL = `flex min-h-14 min-w-14 flex-none items-center justify-center rounded-tile bg-kibo px-4 text-xl font-bold text-white active:bg-kibo-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`;

/** The tinted [Send], where another filled button already leads the screen. */
export const SECONDARY_SMALL = `flex min-h-14 min-w-14 flex-none items-center justify-center rounded-tile bg-kibo-tint px-4 text-xl font-semibold text-kibo active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`;

/** Text button with an icon, >= 56px; a tint shows only while pressed. */
export const QUIET = `flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-full px-3 text-xl font-semibold text-kibo active:bg-kibo-tint disabled:text-muted disabled:opacity-60 ${PRESS} ${FOCUS}`;

const COMPACT_BOX = `flex min-h-14 min-w-14 flex-none flex-col items-center justify-center rounded-tile px-2 py-1 text-base leading-normal font-semibold ${PRESS}`;

/** App bar and dock side controls: icon over a 16px label, >= 56px. */
export const COMPACT = `${COMPACT_BOX} ${FOCUS}`;

/** COMPACT in the app bar, 4px under the phone's top edge, which clips: the ring is drawn inside (#1 22). */
export const COMPACT_BAR = `${COMPACT_BOX} ${FOCUS_INSIDE}`;

/** White card on cream: soft two-layer shadow, no border. */
export const CARD = "rounded-sheet bg-white p-4 shadow-card";

/** Icon size and stroke for every phone icon (lucide-react). */
export const ICON = { size: 24, strokeWidth: 2, "aria-hidden": true } as const;
