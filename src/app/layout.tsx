import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, Space_Grotesk } from "next/font/google";
import "./globals.css";

const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  // No screen uses 500; each weight adds 94 @font-face rules to the CSS that blocks the first paint.
  // 600 is the phone's label weight (docs/UI_GUIDE.md "Phone design"); without it the browser would draw 700.
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  // With preload on, next/font preloaded 187 of the 282 Korean slices on every page (about 1.6 MB, even on pages with
  // no Korean), which delayed the largest image. Off, the browser fetches only the slices for text on screen.
  preload: false,
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  weight: ["500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KIBO",
  description: "Talk to your phone, and the kiosk orders for you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexKr.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
