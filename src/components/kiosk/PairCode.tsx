import { kt } from "@/lib/i18n/kiosk";
import type { KioskData } from "@/types/menu";

// Under the QR (K1 and the QR sheet): the short way in without a camera, "Or open <host>/app and enter 123 456".
// The host is the claim URL's, which the server builds from PUBLIC_ORIGIN in production. Canvas px.

export function PairCode(props: { kiosk: KioskData; claimUrl: string | null; pairCode?: string | null; className?: string }) {
  const { kiosk, claimUrl, pairCode } = props;
  if (!claimUrl || !pairCode) return null;
  const { locale } = kiosk;
  const host = new URL(claimUrl).host;
  return (
    <div className={`flex items-center justify-between gap-8 rounded-[32px] bg-white px-10 py-6 ${props.className ?? ""}`}>
      <p className="k-text-40 min-w-0 text-[#4B463F]">
        {kt("pairOpen", locale)}
        <br />
        <strong className="break-all text-(--k-primary-dark)">{host}/app</strong>
        <br />
        {kt("pairEnter", locale)}
      </p>
      <p className="flex flex-none flex-col items-end">
        <span className="k-text-40 text-[#4B463F]">{kt("pairCodeLabel", locale)}</span>
        <span aria-hidden data-pair-code={pairCode} className="k-text-72 font-display font-bold tracking-wider text-[#1E1B18] tabular-nums">
          {pairCode.slice(0, 3)} {pairCode.slice(3)}
        </span>
        {/* Read digit by digit, not as two numbers. */}
        <span className="sr-only">{pairCode.split("").join(" ")}</span>
      </p>
    </div>
  );
}
