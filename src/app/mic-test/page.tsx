import type { Metadata, Viewport } from "next";
import { MicTest } from "./MicTest";

// Development check for real phones (docs/ARCHITECTURE.md "Pages"): not linked from the product, never indexed.
export const metadata: Metadata = { title: "KIBO mic test", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

export default function MicTestPage() {
  return (
    <main className="min-h-dvh w-full bg-[#FBF7EF] text-[#15171C]">
      <MicTest />
    </main>
  );
}
