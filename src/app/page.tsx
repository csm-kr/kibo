import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FOCUS, PRIMARY, SECONDARY } from "@/components/assistant/styles";
import { DEMO_ENVIRONMENTS, demoHref } from "@/components/demo/environments";

// The root landing page: the first thing a judge sees after the video. Every picture is a capture of the running
// app (`npm run shots:landing`), and every number names its evidence file (docs/RULE.md R-001).

// "Any kiosk" would overclaim: KIBO covers web and webview kiosks (docs/PRD.md, docs/ISSUE.md I-076).
export const metadata: Metadata = {
  title: "KIBO — talk to the kiosk",
  description:
    "Say your order to your own phone; the self-order kiosk in front of you fills itself. No new hardware, no app to install.",
  openGraph: {
    title: "KIBO — talk to the kiosk",
    description: "Say your order to your own phone; the self-order kiosk in front of you fills itself.",
    images: [{ url: "/landing/demo.webp", width: 1280, height: 1168, alt: "The KIBO demo: a kiosk and a phone side by side" }],
  },
};

const H2 = "font-display text-[28px] leading-tight font-bold text-[#15171C]";
const CARD = "rounded-[18px] border border-[#E2DACB] bg-white p-6";
const EVIDENCE = "text-base text-[#4B463F]";

const PEOPLE = [
  {
    title: "Older first-time users",
    text: "Say the whole order in one sentence instead of hunting through screens. Undo and call staff are always one tap away.",
  },
  {
    title: "Visitors who can't read Korean",
    text: "Talk to your own phone in English. The Korean kiosk fills itself, and the phone shows English names and prices from the kiosk's menu.",
  },
  {
    title: "Low vision, or speaking is hard",
    text: "Large text and screen-reader labels on a phone you already know, spoken replies, and a full text-and-buttons mode.",
  },
];

const SAFETY = [
  "You approve every payment: by tapping the confirm card, or with a new “yes” after it appears.",
  "Card payment happens only on the kiosk itself.",
  "The server checks every AI action: the item, its options, the quantity and the order state.",
  "Names and prices come only from the kiosk’s own menu data, never from the AI.",
  "Questions the data can’t answer, such as halal, call staff instead of a guess.",
];

const SERVICES = [
  ["Cloud Run", "Runs the Next.js app and its API in asia-northeast3. Every change to an order is a command the server checks."],
  ["Firestore", "One session document per order, changed only in transactions and streamed to the phone and the kiosk."],
  ["Gemini Live", "The phone talks to it directly with a one-use token; the server pins the model, instructions and 9 tools."],
  ["Gemini Flash", "The text agent with the same tools, for typing and for when voice is unavailable."],
  ["Secret Manager", "Holds the Gemini API key, which never reaches a browser."],
];

const ACCESS = [
  "Large text: 20px body text on the phone, 40px and up on the kiosk",
  "Every phone button at least 56 pixels square",
  "Screen-reader labels, and cart changes announced when the AI voice is off",
  "Text and buttons when the microphone is unavailable",
  "Call staff always visible on the phone",
  "Korean and English",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-16 text-xl leading-normal text-[#33302B]">
      <section data-landing-section="hero" className="flex flex-col gap-6">
        <Image src="/kibo-logo.svg" alt="KIBO" width={236} height={64} preload />
        {/* Headline and actions share one row, so the picture of the product is the largest thing on the first screen (I-136). */}
        <div className="grid items-end gap-12 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-[40px] leading-tight font-bold text-[#15171C] lg:text-[56px]">
              <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
            </h1>
            <p>
              Say your order to your own phone; the self-order kiosk in front of you fills itself. No new hardware, no
              app to install.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Link href="/demo" className={PRIMARY}>
              Try the live demo
            </Link>
            <Link href="/kiosk" className={SECONDARY}>
              Two-device mode
            </Link>
          </div>
        </div>
        <Image
          src="/landing/demo.webp"
          alt="The live demo: on the left the Korean kiosk with two cheeseburger sets the AI just added, highlighted; on the right the phone with the same order and total."
          width={1280}
          height={1168}
          sizes="(min-width: 1072px) 1024px, calc(100vw - 48px)"
          preload
          fetchPriority="high"
          className="mx-auto h-auto w-full max-w-5xl rounded-[18px] border border-[#E2DACB]"
        />
        <p className={EVIDENCE}>
          The live demo shows the kiosk and the phone side by side and works best on a laptop. Two-device mode opens the
          kiosk; scan its QR code with your phone.
        </p>
      </section>

      <section data-landing-section="people" aria-labelledby="people" className="flex flex-col gap-6">
        <h2 id="people" className={H2}>
          Who it is for
        </h2>
        <ul className="grid gap-6 lg:grid-cols-3">
          {PEOPLE.map((p) => (
            <li key={p.title} className={`${CARD} flex flex-col gap-2`}>
              <h3 className="font-bold text-[#15171C]">{p.title}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section data-landing-section="how" aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className={H2}>
          How it works
        </h2>
        <ol className="grid gap-6 lg:grid-cols-3">
          <Step n={1} title="Scan the QR" text="The kiosk shows a QR code. Your phone opens a web page; nothing to install.">
            <Shot src="kiosk-attract" alt="The kiosk's QR code for ordering by talking" width={540} height={810} />
          </Step>
          <Step n={2} title="Talk or type" text="Say the order. The kiosk moves by itself and highlights each change for 2 seconds.">
            <Shot src="phone-talk" alt="Phone with two cheeseburger sets in the order and the total" width={780} height={840} />
            <Shot
              src="kiosk-ai-highlight"
              alt="Kiosk menu with the added cheeseburger highlighted and the note that the AI added it"
              width={820}
              height={615}
            />
          </Step>
          <Step n={3} title="Confirm, then pay" text="Check the order on your phone and say yes or tap. Pay with your card at the kiosk.">
            <Shot src="phone-confirm" alt="Phone with the total and a Yes, pay now button" width={780} height={960} />
          </Step>
        </ol>
      </section>

      <section data-landing-section="places" aria-labelledby="places" className="flex flex-col gap-6">
        <h2 id="places" className={H2}>
          One phone, many kiosks
        </h2>
        <p>The same phone, the same way of talking, three different places. Each one opens a working kiosk.</p>
        <ul className="grid gap-6 lg:grid-cols-3">
          {DEMO_ENVIRONMENTS.map((env) => (
            <li key={env.kioskId} className={`${CARD} flex flex-col gap-4`}>
              <Image
                src={env.image}
                alt={`The top of the ${env.short} kiosk screen, in Korean`}
                width={800}
                height={600}
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="h-auto w-full rounded-[12px] border border-[#E2DACB]"
              />
              <h3 className="font-bold text-[#15171C]">{env.place.en}</h3>
              <p className="font-bold">{env.how}</p>
              <p>{env.persona}</p>
              <Link href={demoHref(env.kioskId)} className={`${SECONDARY} mt-auto`}>
                Try the {env.short}
              </Link>
            </li>
          ))}
        </ul>
        <p className={EVIDENCE}>On the roadmap, not built yet: hospitals, civil-service offices and cinemas.</p>
      </section>

      <section data-landing-section="safety" aria-labelledby="safety" className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 id="safety" className={H2}>
            Safe by design
          </h2>
          <p className="font-bold text-[#15171C]">The AI can fill the cart, but it cannot pay.</p>
        </div>
        <ul className="flex flex-col gap-4">
          {SAFETY.map((line) => (
            <li key={line} className="flex gap-3">
              <Check />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section data-landing-section="kiosks" aria-labelledby="kiosks" className="flex flex-col gap-6">
        <h2 id="kiosks" className={H2}>
          Works with kiosks that exist
        </h2>
        <p>Integration with existing systems, without replacing the kiosk. Two ways to connect a web or webview kiosk:</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <article className={`${CARD} flex flex-col gap-4`}>
            <h3 className="font-bold text-[#15171C]">Direct adapter</h3>
            <p>
              KIBO reads the kiosk&apos;s own menu, options and rules. Our MALO BURGER simulator has sets, required
              sides and drinks, removable ingredients and sold-out items.
            </p>
            <Fact
              value="32 of 32 test orders passed"
              detail="text agent on gemini-3.8-flash, Korean and English, cases written by the KIBO team"
              path="evals/results/2026-10-13T02-54.md"
            />
            <Fact
              value="1.1 s median from end of speech to the kiosk highlight"
              detail="6 spoken orders to gemini-3.8-live, synthetic voice on a laptop, not yet on a real phone"
              path="evidence/voice-e2e.json"
            />
          </article>
          <article className={`${CARD} flex flex-col gap-4`}>
            <h3 className="font-bold text-[#15171C]">KIBO Learn</h3>
            <p>
              For a kiosk with no integration, Gemini explores its screens once and writes a skill: the menu plus click
              recipes. Orders are then replayed without AI and checked against the kiosk&apos;s own total.
            </p>
            <Fact
              value="4 of 4 unseen orders replayed, 0.7 to 5.2 s each"
              detail="Doughhouse, a pizza kiosk we built"
              path="spikes/kibo-learn/results/holdout.run2.log"
            />
            <Fact
              value="40 of 40 items found on a café kiosk it had never seen"
              detail="example orders: 2 of 5 and 3 of 5 passed; the rest were refused before running"
              path="spikes/blind-kiosk/results/v3run1/grade.txt, spikes/blind-kiosk/results/holdout.log"
            />
            <Fact
              value="2 kiosks it had never seen: 56 of 56 items, 14 of 20 orders right"
              detail="built by other AI agents; 3 orders refused safely, 3 went wrong (take-out orders 100원 short); in 4 of the right ones the skill's own price differed from the kiosk's"
              path="spikes/blind-kiosks/RESULTS.md"
            />
            <Link href="/demo?k=doughhouse" className={SECONDARY}>
              Try the learned pizza kiosk
            </Link>
            <Link href="/learn" className={SECONDARY}>
              Watch KIBO learn a new kiosk
            </Link>
          </article>
        </div>
      </section>

      <section data-landing-section="cloud" aria-labelledby="cloud" className="flex flex-col gap-6">
        <h2 id="cloud" className={H2}>
          Built on Google Cloud
        </h2>
        <div
          role="region"
          aria-label="Architecture diagram, scrolls sideways on small screens"
          tabIndex={0}
          className={`overflow-x-auto rounded-[18px] border border-[#E2DACB] bg-white p-4 ${FOCUS}`}
        >
          <Architecture />
        </div>
        <dl className="grid gap-4 lg:grid-cols-2">
          {SERVICES.map(([name, text]) => (
            <div key={name} className="flex flex-col gap-1">
              <dt className="font-bold text-[#15171C]">{name}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section data-landing-section="access" aria-labelledby="access" className="flex flex-col gap-6">
        <h2 id="access" className={H2}>
          Accessibility
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {ACCESS.map((line) => (
            <li key={line} className="flex gap-3">
              <Check />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer data-landing-section="footer" className={`flex flex-col gap-2 border-t border-[#E2DACB] pt-6 ${EVIDENCE}`}>
        <p>
          MALO BURGER, SKYLINE AIRPORT RAIL, Doughhouse and Gureum Darak Coffee are fictional brands made for this
          demo. Menu photos are AI-generated.
        </p>
        <p>Team malo · Google Cloud AI Builder Cup 2026</p>
      </footer>
    </main>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="font-display flex size-12 flex-none items-center justify-center rounded-full bg-[#15171C] text-xl font-bold text-white"
        >
          {n}
        </span>
        <h3 className="font-bold text-[#15171C]">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
      </div>
      <p>{text}</p>
      <div className="mt-auto flex flex-col items-center gap-4">{children}</div>
    </li>
  );
}

/** One cropped region from public/landing/ (`npm run shots:landing`), as wide as its card. */
function Shot({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <Image
      src={`/landing/${src}.webp`}
      alt={alt}
      width={width}
      height={height}
      sizes="384px"
      className="h-auto w-full max-w-sm rounded-[18px] border border-[#E2DACB]"
    />
  );
}

/** One measured number, what it was measured on, and the file that holds it. */
function Fact({ value, detail, path }: { value: string; detail: string; path: string }) {
  return (
    <p className="flex flex-col gap-1 border-l-4 border-[#3446D4] pl-4">
      <span className="font-bold text-[#15171C]">{value}</span>
      <span className={EVIDENCE}>{detail}</span>
      <code className={`${EVIDENCE} [overflow-wrap:anywhere]`}>{path}</code>
    </p>
  );
}

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mt-1 size-6 flex-none" fill="none" stroke="#15171C" strokeWidth={2}>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mirrors docs/ARCHITECTURE.md "Deployment": solid = request, dashed = the server's stream back. */
function Architecture() {
  const box = (x: number, y: number, w: number, h: number, name: string, sub: string[], google = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={google ? "#EEF0FD" : "#FBF7EF"} stroke="#15171C" strokeWidth={2} />
      <text x={x + w / 2} y={sub.length ? y + 34 : y + h / 2 + 7} textAnchor="middle" fontSize={20} fontWeight={700} fill="#15171C">
        {name}
      </text>
      {sub.map((s, i) => (
        <text key={s} x={x + w / 2} y={y + 60 + i * 22} textAnchor="middle" fontSize={16} fill="#33302B">
          {s}
        </text>
      ))}
    </g>
  );
  const label = (x: number, y: number, text: string) => (
    <text x={x} y={y} textAnchor="middle" fontSize={16} fill="#33302B">
      {text}
    </text>
  );
  const line = { stroke: "#15171C", strokeWidth: 2, markerEnd: "url(#arch-arrow)" };
  const dashed = { ...line, strokeDasharray: "6 6" };
  return (
    <svg
      role="img"
      aria-labelledby="arch-title"
      viewBox="0 0 1000 424"
      // Never narrower than the viewBox: shrunk, the 16-unit labels render under the 16px minimum (docs/UI_QA.md).
      className="h-auto w-full min-w-[1000px]"
    >
      <title id="arch-title">
        Architecture: the phone talks to Gemini Live directly and sends commands to Cloud Run; the kiosk sends cart
        changes and card actions to Cloud Run; Cloud Run writes Firestore in transactions, streams each change back to
        the phone and the kiosk, issues pinned Live tokens, runs the Gemini Flash text agent and reads the API key from
        Secret Manager.
      </title>
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#15171C" />
        </marker>
      </defs>
      {box(24, 40, 184, 96, "Phone", ["/assistant"])}
      {box(24, 296, 184, 96, "Kiosk", ["/kiosk"])}
      {box(360, 104, 200, 256, "Cloud Run", ["Next.js app + API", "asia-northeast3"], true)}
      {box(800, 24, 176, 72, "Gemini Live", [], true)}
      {box(800, 128, 176, 72, "Gemini Flash", [], true)}
      {box(800, 232, 176, 72, "Firestore", [], true)}
      {box(800, 336, 176, 72, "Secret Manager", [], true)}

      <line x1={208} y1={60} x2={798} y2={60} {...line} />
      {label(500, 50, "voice, ephemeral token")}

      <line x1={208} y1={116} x2={358} y2={116} {...line} />
      {label(284, 106, "commands")}
      <line x1={360} y1={132} x2={210} y2={132} {...dashed} />
      {label(284, 154, "SSE")}

      <line x1={208} y1={316} x2={358} y2={316} {...line} />
      {label(284, 306, "cart, card")}
      <line x1={360} y1={332} x2={210} y2={332} {...dashed} />
      {label(284, 354, "SSE")}

      <line x1={560} y1={124} x2={798} y2={88} {...line} />
      {label(680, 128, "pinned token")}
      <line x1={560} y1={168} x2={798} y2={168} {...line} />
      {label(680, 160, "text agent")}
      <line x1={560} y1={256} x2={798} y2={256} {...line} />
      {label(680, 248, "transactions")}
      <line x1={798} y1={280} x2={562} y2={280} {...dashed} />
      {label(680, 302, "onSnapshot")}
      <line x1={560} y1={352} x2={798} y2={352} {...line} />
      {label(680, 344, "API key")}
    </svg>
  );
}
