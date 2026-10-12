import Image from "next/image";
import Link from "next/link";
import { FOCUS, PRIMARY } from "@/components/assistant/styles";

// Minimal judge-facing landing; a fuller one comes later.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16 text-[#15171C]">
      <Image src="/kibo-logo.svg" alt="KIBO" width={236} height={64} preload />
      <h1 className="font-display text-5xl leading-tight font-bold">
        <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
      </h1>
      <p className="text-xl text-[#33302B]">
        Your phone becomes the voice of any self-order kiosk: say your order, the kiosk fills itself, you confirm and pay.
      </p>
      <div className="flex flex-col gap-4">
        <Link href="/demo" className={`${PRIMARY} max-w-sm`}>
          Try the demo
        </Link>
        <Link
          href="/kiosk"
          className={`flex min-h-14 max-w-sm items-center text-xl font-bold text-[#3446D4] underline underline-offset-4 ${FOCUS}`}
        >
          Kiosk (two-device mode)
        </Link>
      </div>
    </main>
  );
}
