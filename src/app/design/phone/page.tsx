import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getKiosk } from "@/lib/adapters/catalog";
import { PhonePreview } from "./PhonePreview";

// The phone design components (docs/UI_GUIDE.md "Phone design") in isolation with sample data, so later steps and
// `npm run qa:ui` can screenshot them. Development only: production answers 404.
export const metadata: Metadata = { title: "KIBO phone design", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

export default function PhoneDesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PhonePreview kiosk={getKiosk("malo")} />;
}
