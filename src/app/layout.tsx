import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, Space_Grotesk } from "next/font/google";
import "./globals.css";

const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
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
