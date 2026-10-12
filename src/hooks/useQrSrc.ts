"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** SVG data URL of a QR for `url`; null until it is ready or when the url changes. */
export function useQrSrc(url: string | null): string | null {
  const [qr, setQr] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1E1B18", light: "#FFFFFF" } })
      .then((svg) => {
        if (live) setQr({ url, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return qr && qr.url === url ? qr.src : null;
}
