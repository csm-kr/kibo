import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { allKioskIds, getKiosk } from "@/lib/adapters/catalog";
import { SESSION_ID } from "@/lib/commands/schemas";
import { AssistantApp } from "./AssistantApp";

export const metadata: Metadata = { title: "KIBO" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

// /assistant?s=<sessionId>#t=<claim>. The fragment never reaches the server; the client claims with it.
export default function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <Suspense>
        <AssistantRoute searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AssistantRoute({ searchParams }: Pick<PageProps<"/assistant">, "searchParams">) {
  const sp = await searchParams;
  const s = typeof sp.s === "string" && SESSION_ID.test(sp.s) ? sp.s : null;
  // The session names its kiosk; every kiosk the server knows is listed here.
  return <AssistantApp sessionId={s} kiosks={Object.fromEntries(allKioskIds().map((id) => [id, getKiosk(id)]))} />;
}
