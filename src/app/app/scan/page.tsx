import type { Metadata, Viewport } from "next";
import { ScanApp } from "./ScanApp";

export const metadata: Metadata = { title: "KIBO" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF7EF" };

// /app/scan: the kiosk QR scanned inside the web app (the phone's own camera app works too). The only page whose
// Permissions-Policy allows the camera (next.config.ts).
export default function ScanPage() {
  return <ScanApp />;
}
