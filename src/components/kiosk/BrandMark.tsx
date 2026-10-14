import type { KioskData } from "@/types/menu";

/**
 * The store's mark in the kiosk header: a cream speech bubble with a line drawing of what the store sells, in the
 * kiosk's own colour. Replaces a capital letter on a yellow tile, which for a burger kiosk could recall a real
 * chain's logo (14-final:2). Drawn here, so no kiosk needs a logo file; decorative, the wordmark sits beside it.
 */
export function BrandMark({ kiosk }: { kiosk: KioskData }) {
  return (
    <svg aria-hidden width="96" height="96" viewBox="0 0 48 48" className="flex-none">
      <path d="M8 4h32a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H20l-9 8v-8H8a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z" fill="var(--k-bg)" />
      <g fill="none" stroke="var(--k-primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {kiosk.domain === "ticket" ? (
          <>
            {/* A train seen from the front. */}
            <rect x="15" y="9" width="18" height="19" rx="5" />
            <path d="M15 19h18M20 24h.01M28 24h.01M19 13h10M19 31l-2 3M29 31l2 3" />
          </>
        ) : (
          <>
            {/* A burger: bun, lettuce, patty, bun. */}
            <path d="M12 18c0-5 5.5-8 12-8s12 3 12 8Z" />
            <path d="M12 22c2 1.6 4 1.6 6 0s4-1.6 6 0 4 1.6 6 0 4-1.6 6 0" />
            <rect x="12" y="25" width="24" height="3.5" rx="1.75" />
            <path d="M13 31.5h22a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3Z" />
          </>
        )}
      </g>
    </svg>
  );
}
