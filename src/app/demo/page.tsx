import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoApp } from "@/components/demo/DemoApp";
import { DEFAULT_ENVIRONMENT, DEMO_ENVIRONMENTS } from "@/components/demo/environments";
import { getKiosk } from "@/lib/adapters/catalog";

export const metadata: Metadata = { title: "KIBO demo" };

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
  // The place a judge picked on D1 is in the URL (`/demo?k=airport_rail`), so it can be linked.
  const k = (DEMO_ENVIRONMENTS.find((e) => e.kioskId === sp.k) ?? DEFAULT_ENVIRONMENT).kioskId;
  // Keyed by kiosk, so switching kiosks starts from the intro with nothing carried over.
  return <DemoApp key={k} kiosk={getKiosk(k)} />;
}
