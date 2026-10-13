import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LearnPlayer } from "@/components/learn/LearnPlayer";
import { SECONDARY } from "@/components/phone/ui";
import { learnRun } from "@/lib/learn/runs";

export const metadata: Metadata = { title: "KIBO Learn — replay" };

// /learn/<runId>: a replay of one recorded learning run. The params are read under Suspense, so the shell stays static.
export default function LearnRunPage({ params }: PageProps<"/learn/[runId]">) {
  return (
    <main className="w-full flex-1 bg-cream text-xl leading-normal text-ink">
      <Suspense>
        <LearnRunRoute params={params} />
      </Suspense>
    </main>
  );
}

async function LearnRunRoute({ params }: Pick<PageProps<"/learn/[runId]">, "params">) {
  const { runId } = await params;
  const run = learnRun(runId);
  if (!run) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-8">
        <h1 className="text-2xl font-bold">No recorded run with that name.</h1>
        <Link href="/learn" className={SECONDARY}>
          See the recorded runs
        </Link>
      </div>
    );
  }
  return <LearnPlayer run={run} />;
}
