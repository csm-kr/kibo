import Image from "next/image";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Image src="/kibo-logo.svg" alt="KIBO" width={236} height={64} priority />
      <h1 className="text-3xl font-bold leading-tight">Talk to your phone. The kiosk orders for you.</h1>
      <p className="text-lg text-[#33302B]">
        KIBO lets anyone order at an existing self-order kiosk by speaking to their own phone, without replacing the kiosk.
      </p>
      <p className="text-base text-[#4B463F]">The kiosk simulator and the judge demo are coming next.</p>
    </main>
  );
}
