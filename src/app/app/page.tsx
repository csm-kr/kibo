import type { Metadata, Viewport } from "next";
import { AppHome } from "./AppHome";

export const metadata: Metadata = { title: "KIBO" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF7EF" };

// /app: the installed phone app's home (manifest start_url). Installing is optional; a kiosk's QR link opens
// /assistant directly in any browser.
export default function AppPage() {
  return <AppHome />;
}
