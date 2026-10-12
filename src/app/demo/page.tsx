import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";
import { getKiosk } from "@/lib/adapters/catalog";

export const metadata: Metadata = { title: "KIBO demo" };

// /demo: judge mode, kiosk and phone side by side on one laptop screen (docs/UX.md Flow C).
export default function DemoPage() {
  return <DemoApp kiosk={getKiosk("malo")} />;
}
