// Shared phone class strings (docs/UI_GUIDE.md): CSS px at 390x844 in rem, so the system font size applies.
// KIBO blue #3446D4 for primary actions and selection; ink #15171C; cream, panel and warning colors are shared.

export const FOCUS = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#15171C]";

/** Full width, >= 60px. */
export const PRIMARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-[18px] bg-[#3446D4] px-4 text-xl font-bold text-white active:bg-[#2735A8] disabled:opacity-60 ${FOCUS}`;

export const SECONDARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-[18px] border-2 border-[#15171C] bg-white px-4 text-xl font-bold text-[#15171C] active:bg-[#F3EEE4] disabled:opacity-60 ${FOCUS}`;

/** Small header and card controls, still >= 56px. */
export const SMALL = `flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-full border-2 border-[#15171C] bg-white px-3 text-base font-bold text-[#15171C] active:bg-[#F3EEE4] disabled:opacity-60 ${FOCUS}`;

/** Example sentences and choice buttons: KIBO blue edge on a light blue tint (the prototype's look, larger). */
export const CHIP = `min-h-14 rounded-[18px] border-2 border-[#3446D4] bg-[#EEF0FD] px-4 py-2 text-left text-base text-[#1F2A8A] active:bg-[#D6DBFA] disabled:opacity-60 ${FOCUS}`;

export const CARD = "rounded-[26px] border border-[#E2DACB] bg-white p-4";
