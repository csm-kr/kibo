import type { Metadata } from "next";
import { Suspense } from "react";
import { getKiosk, isKioskId } from "@/lib/adapters/catalog";
import { KioskApp } from "./KioskApp";

export const metadata: Metadata = { title: "KIBO kiosk" };

// /kiosk?k=<kioskId>&demo=1. The search params are read under Suspense, so the shell stays static.
export default function KioskPage({ searchParams }: PageProps<"/kiosk">) {
  return (
    <main className="h-dvh w-full overflow-hidden bg-[#141210]">
      <Suspense>
        <KioskRoute searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function KioskRoute({ searchParams }: Pick<PageProps<"/kiosk">, "searchParams">) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "malo";
  if (!isKioskId(k)) {
    return (
      <p lang="ko" className="p-8 text-2xl text-white">
        키오스크를 찾을 수 없어요. · Kiosk not found.
      </p>
    );
  }
  return <KioskApp kiosk={getKiosk(k)} demo={sp.demo === "1"} />;
}
