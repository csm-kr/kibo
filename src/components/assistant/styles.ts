// The pre-12-phone-app class strings, still used by the landing page, the /demo intro and /mic-test. The phone screens
// use src/components/phone/ui.ts (docs/UI_GUIDE.md "Phone design"). CSS px at 390x844 in rem.
// KIBO blue #3446D4 for primary actions and selection; ink #15171C; cream, panel and warning colors are shared.

export const FOCUS = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#15171C]";

/** Full width, >= 60px. */
export const PRIMARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-[18px] bg-[#3446D4] px-4 text-xl font-bold text-white active:bg-[#2735A8] disabled:opacity-60 ${FOCUS}`;

export const SECONDARY = `flex min-h-15 w-full items-center justify-center gap-2 rounded-[18px] border-2 border-[#15171C] bg-white px-4 text-xl font-bold text-[#15171C] active:bg-[#F3EEE4] disabled:opacity-60 ${FOCUS}`;
export const CARD = "rounded-[26px] border border-[#E2DACB] bg-white p-4";
