import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoApp } from "@/components/demo/DemoApp";
import { getKiosk } from "@/lib/adapters/catalog";

export const metadata: Metadata = { title: "KIBO demo" };

/** The kiosks a judge can pick on D1; the choice is in the URL (`/demo?k=doughhouse`) so it can be linked. */
const DEMO_KIOSKS = ["malo", "doughhouse"] as const;

// /demo: judge mode, kiosk and phone side by side on one laptop screen (docs/UX.md Flow C). The search params are
// read under Suspense, so the shell stays static.
export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  return (
    <Suspense>
      <DemoRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function DemoRoute({ searchParams }: Pick<PageProps<"/demo">, "searchParams">) {
  const sp = await searchParams;
  const k = DEMO_KIOSKS.find((id) => id === sp.k) ?? "malo";
  // Keyed by kiosk, so switching kiosks starts from the intro with nothing carried over.
  return <DemoApp key={k} kiosk={getKiosk(k)} />;
}
