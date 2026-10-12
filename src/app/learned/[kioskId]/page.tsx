import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnedKioskApp } from "@/components/learned/LearnedKioskHost";
import { getKiosk, isKioskId } from "@/lib/adapters/catalog";

export const metadata: Metadata = { title: "KIBO learned kiosk" };

// /learned/<kioskId>: a learned kiosk page with the KIBO bridge. The params are read under Suspense, so the shell
// stays static.
export default function LearnedPage({ params }: PageProps<"/learned/[kioskId]">) {
  return (
    <main className="h-dvh w-full overflow-hidden bg-[#141210]">
      <Suspense>
        <LearnedRoute params={params} />
      </Suspense>
    </main>
  );
}

async function LearnedRoute({ params }: Pick<PageProps<"/learned/[kioskId]">, "params">) {
  const { kioskId } = await params;
  const kiosk = isKioskId(kioskId) ? getKiosk(kioskId) : null;
  if (!kiosk || kiosk.kind !== "learned") {
    return (
      <p lang="ko" className="p-8 text-2xl text-white">
        키오스크를 찾을 수 없어요. · Kiosk not found.
      </p>
    );
  }
  return <LearnedKioskApp kiosk={kiosk} />;
}
