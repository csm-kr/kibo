import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CARD, FOCUS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { demoHref, offeredPlaces } from "@/components/demo/environments";
import { SESSION_TTL_MS } from "@/lib/commands/session";
import { LEARN_ALL_ROUNDS, LEARN_HEADLINE, LEARN_HEADLINE_DETAIL } from "@/lib/learn/headline";
import { repoLink } from "@/lib/repo";

// The root landing page: the first thing a judge sees after the video. Every picture is a capture of the running
// app (`npm run shots:landing`), and every number names its evidence file or its source (docs/RULE.md R-001):
// publishers stay visible, repo files sit in one small "Sources" disclosure per section.
// External facts come only from docs/plan/SOURCES.md (the S-ids in the comments below).

// "Any kiosk" would overclaim: KIBO covers web and webview kiosks (docs/PRD.md, docs/ISSUE.md I-076).
export const metadata: Metadata = {
  title: "KIBO — talk to the kiosk",
  description:
    "Say your order to your own phone, and the kiosk already in front of you fills its own cart. Only you can pay. No new hardware, no app to install.",
  openGraph: {
    title: "KIBO — talk to the kiosk",
    description: "Say your order to your own phone, and the kiosk already in front of you fills its own cart. Only you can pay.",
    images: [{ url: "/landing/demo.webp", width: 2048, height: 1869, alt: "The KIBO demo: a kiosk and a phone side by side" }],
  },
};

const H2 = "font-display text-[28px] leading-tight font-bold text-[#15171C]";
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

/** External facts about the problem, each with its source line (docs/plan/SOURCES.md). */
const PROBLEM = [
  {
    // S16
    value: "17.9%",
    text: "of Koreans aged 65 and over say they can order or check in at a kiosk; at 75 to 79 it is 8.3%.",
    source: "KIHASA, Health and Welfare Forum, 2024 (2023 Survey of Older Koreans, 10,078 people)",
    url: "https://www.kihasa.re.kr/api/kihasa/file/download?seq=28260",
  },
  {
    // S15: ownership is not ability, so it sits next to the 17.9%, never as "can use KIBO".
    value: "76.6%",
    text: "of Koreans aged 65 and over own a smartphone.",
    source: "Ministry of Health and Welfare, 2024 (2023 Survey of Older Koreans)",
    url: "https://mohw.go.kr/board.es?act=view&bid=0027&list_no=1483352&mid=a10503010100&nPage=1",
  },
  {
    // S11
    value: "206 of 233",
    text: "people who had trouble at a kiosk in the past year had given up an order midway.",
    source: "Korea Consumer Agency, 2022 (500 people, 100 per age band)",
    url: "https://clik.nanet.go.kr/clikr-collection/policyinfo/207/1037/2022/CLIKC6337614063940252_attach_1.pdf",
  },
  {
    // S23
    value: "18.9 million",
    text: "visitors came to Korea in 2025. Language was the lowest-rated part of their trip: 79.3% satisfied.",
    source: "Ministry of Culture, Sports and Tourism and KCTI, 2025 Foreign Visitor Survey, 2026",
    url: "https://know.tour.go.kr/stat/fReportsOfForeignerDis19Re.do",
  },
];

/**
 * The obvious alternatives and the closest prior art (docs/plan/SOURCES.md, section 8). Never "first" or "only":
 * each row says what KIBO does differently, nothing more.
 */
const ALTERNATIVES: { title: string; what: string; kibo: string; source?: { label: string; url: string } }[] = [
  {
    title: "Replace the kiosk with a barrier-free one",
    what: "New hardware at every kiosk. About 466 verified barrier-free kiosks had been sold by 2025.",
    kibo: "Works on the kiosk already there. Nothing is replaced.",
    source: {
      label: "Ministry of Health and Welfare estimate, 2025",
      url: "https://mohw.go.kr/board.es?act=view&bid=0027&list_no=1487151&mid=a10503000000",
    },
  },
  {
    title: "The shop's own app or QR ordering",
    what: "One app or page per shop, each with its own steps to learn.",
    kibo: "One phone and one way of talking for every kiosk, and the order fills the kiosk in front of you.",
  },
  {
    title: "A voice kiosk",
    what: "A microphone and voice software added to each kiosk. You speak out loud at the kiosk, in the languages it offers.",
    kibo: "Your own phone, in your own language. No new hardware on the kiosk.",
  },
  {
    title: "Point Gemini Live's camera at the kiosk",
    what: "It can read the screen and tell you what to tap, but you still tap every step yourself.",
    kibo: "The kiosk's own cart changes, through actions KIBO's server checks against the menu data.",
  },
  {
    title: "The phone as a remote touchpad",
    what: "You scan a QR and steer the kiosk from your phone, but you still go through every screen.",
    kibo: "You say the order; the steps happen for you.",
  },
  {
    title: "A phone call to a kiosk support server",
    what: "A Korean company registered a patent in March 2026 for a server that takes a kiosk QR scan and a phone call and turns the customer's speech into touch commands.",
    kibo: "The closest idea. KIBO adds: the AI can fill the cart but the server never lets it pay, and KIBO Learn learns a web kiosk once, then replays orders without AI and checks the kiosk's own total.",
    source: { label: "Electronic Times, 2026-03-18", url: "https://www.etnews.com/20260318000063" },
  },
];

const SESSION_MINUTES = SESSION_TTL_MS / 60_000;

const SAFETY = [
  "You approve every payment: by tapping Yes, pay now, or with a new “yes” after your order shows.",
  "Card payment happens only on the kiosk itself.",
  "The server checks every AI action: the item, its options, the quantity and the order state.",
  "Names and prices come only from the kiosk’s own menu data, never from the AI.",
  "Questions the data can’t answer, such as halal, call staff instead of a guess.",
];

const SERVICES = [
  ["Cloud Run", "Runs the Next.js app and its API in asia-northeast3. Every change to an order is a command the server checks."],
  ["Firestore", "One session document per order, changed only in transactions and streamed to the phone and the kiosk."],
  ["Gemini Live", "The phone talks to it directly with a one-use token; the server pins the model, instructions and 11 tools."],
  ["Gemini Flash", "The text agent with the same tools, for typing and for when voice is unavailable."],
  ["Secret Manager", "Holds the Gemini API key, which never reaches a browser."],
];

const ACCESS = [
  "Large text: 20px body text on the phone, 40px and up on the kiosk",
  "Every phone button at least 56 pixels square",
  "Screen-reader labels, and cart changes announced when the AI voice is off",
  "Text and buttons when the microphone is unavailable",
  "Call staff always visible on the phone",
  "Screens in Korean and English, and 日本語 on the ticket machine; the AI also answers in Japanese, Chinese, Spanish, Vietnamese, French, Thai and Indonesian (tested by typing; Japanese also by speaking)",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-16 text-xl leading-normal text-[#33302B]">
      <section data-landing-section="hero" className="flex flex-col gap-6">
        <Image src="/kibo-logo.svg" alt="KIBO" width={236} height={64} preload />
        {/* Headline and actions share one row, so the picture of the product is the largest thing on the first screen (I-136). */}
        <div className="grid items-end gap-12 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-[40px] leading-tight font-bold text-balance text-[#15171C] lg:text-[56px]">
              <span className="block">Don&apos;t learn the kiosk.</span> <span className="block">Just talk.</span>
            </h1>
            <p>
              Say your order to your own phone, and the kiosk already in front of you fills its own cart. Only you can
              pay. No new hardware, no app to install.
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
          Open the live demo on a laptop: it shows the kiosk, and you order by scanning its QR with your phone. Without a
          phone at hand, “Try it on this screen” shows the phone beside the kiosk, as in this picture.
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

      <section data-landing-section="problem" aria-labelledby="problem" className="flex flex-col gap-6">
        <h2 id="problem" className={H2}>
          Why it matters
        </h2>
        <ul className="grid gap-6 lg:grid-cols-2">
          {PROBLEM.map((f) => (
            <li key={f.value} className="flex flex-col gap-1 border-l-4 border-[#3446D4] pl-4">
              <p>
                <span className="font-display text-[28px] leading-tight font-bold text-[#15171C]">{f.value}</span>{" "}
                {f.text}
              </p>
              <SourceLink label={f.source} url={f.url} />
            </li>
          ))}
        </ul>
        <article className={`${CARD} flex flex-col gap-2`}>
          <h3 className="font-bold text-[#15171C]">What Korean law asks of kiosk operators</h3>
          <p>
            Since 22 January 2026 the Digital Inclusion Act asks every kiosk operator to take one of five measures for
            people who find digital devices hard. One of them is a website or mobile app that assists kiosk use, as long
            as it gives equal access and use. Separately, the disability rules cover existing kiosks from 28 January
            2026, and small sites may use compatible assistive software. KIBO is built as that kind of app. It works on
            the kiosks already installed, and it does not by itself make a shop compliant.
          </p>
          <SourceLink
            label="Digital Inclusion Act Enforcement Decree, Art. 15 (2026)"
            url="https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EB%94%94%EC%A7%80%ED%84%B8%ED%8F%AC%EC%9A%A9%EB%B2%95%EC%8B%9C%ED%96%89%EB%A0%B9/%EC%A0%9C15%EC%A1%B0"
          />
          <SourceLink
            label="Disability Anti-Discrimination Act Enforcement Decree, Art. 10-2, amended 2025-11-18"
            url="https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=279851&type=HTML"
          />
        </article>
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
        {/* The two direct kiosks only (owner 10-18, I-426); the learned ones open from their own links. */}
        <p>The same phone, the same way of talking, two different places. Each one opens a working kiosk.</p>
        <ul className="grid gap-6 sm:grid-cols-2">
          {offeredPlaces().map((env) => (
            <li key={env.kioskId} className={`${CARD} flex flex-col gap-4`}>
              <Image
                src={env.image}
                alt={`The top of the ${env.short} kiosk screen, in Korean`}
                width={800}
                height={600}
                sizes="(min-width: 640px) 50vw, 100vw"
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

      <section data-landing-section="whynot" aria-labelledby="whynot" className="flex flex-col gap-6">
        <h2 id="whynot" className={H2}>
          Why not …?
        </h2>
        <ul className="grid gap-6 lg:grid-cols-2">
          {ALTERNATIVES.map((a) => (
            <li key={a.title} className={`${CARD} flex flex-col gap-2`}>
              <h3 className="font-bold text-[#15171C]">{a.title}</h3>
              <p>{a.what}</p>
              <p>
                <span className="font-bold text-[#15171C]">KIBO: </span>
                {a.kibo}
              </p>
              {a.source && <SourceLink label={a.source.label} url={a.source.url} />}
            </li>
          ))}
        </ul>
        <p>
          KIBO is not the first to connect a phone to a kiosk. What it brings together: your own phone and language, real
          changes to the kiosk&apos;s cart that the server checks, payment only by you, and kiosks learned once.
        </p>
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
              value="96 of 98 test cases passed"
              detail="text agent on gemini-3.8-flash (Gemini API, as in production), typed in Korean, English and 7 more languages; cases written by the KIBO team"
            />
            <Fact
              value="2.1 s median from end of speech to the kiosk highlight"
              detail="7 spoken orders (English, Korean) to gemini-3.8-live after 1 s of silence ends the turn, synthetic voice on a laptop, not yet on a real phone; 1.7 s through the Vertex AI relay (2 orders), run locally"
            />
          </article>
          <article className={`${CARD} flex flex-col gap-4`}>
            <h3 className="font-bold text-[#15171C]">KIBO Learn</h3>
            <p>
              For a kiosk with no integration, Gemini explores its screens once and writes a skill: the menu plus click
              recipes. Orders are then replayed without AI and checked against the kiosk&apos;s own total.
            </p>
            {/* The groups stay apart (docs/plan/NUMBERS.md): never-seen kiosks, the tuned test kiosks, our own kiosk.
                The headline is word for word the one in NUMBERS.md; every never-seen kiosk is one click away. */}
            <div className="flex flex-col gap-1 border-l-4 border-[#3446D4] pl-4">
              <p data-learn-headline className="font-bold text-[#15171C]">
                {LEARN_HEADLINE}
              </p>
              <p className={EVIDENCE}>{LEARN_HEADLINE_DETAIL}</p>
              <details data-learn-all-rounds className={EVIDENCE}>
                <summary className={`${FOCUS} inline-flex min-h-14 cursor-pointer items-center font-semibold underline`}>
                  Every never-seen kiosk so far
                </summary>
                <p>{LEARN_ALL_ROUNDS}</p>
              </details>
            </div>
            <Fact
              value="4 test kiosks: 134 of 134 items, 31 of 40 orders right"
              detail="built by other AI agents; 4 orders refused safely, 5 went wrong on one bakery kiosk (its pop-up blocked a tap); in 3 of the 31 the skill's own price differed from the kiosk's. The learner was improved using these kiosks' first runs, so this is not a blind result"
            />
            <Fact
              value="Our pizza kiosk: learned in 5.2 min, 4 of 4 unseen orders replayed without AI"
              detail="Doughhouse, the kiosk the learner was developed on, so not a blind test; a planted rule break was also caught"
            />
          </article>
        </div>
        <article className={`${CARD} flex flex-col gap-4`}>
          <h3 className="font-bold text-[#15171C]">How KIBO gets onto a kiosk</h3>
          <ul className="flex flex-col gap-3">
            <li>
              <span className="font-bold text-[#15171C]">Kiosks that share their menu data:</span> a direct adapter reads
              the menu and sends orders. The burger shop and the airport rail machine in the demo work this way.
            </li>
            <li>
              <span className="font-bold text-[#15171C]">Web kiosks with no integration:</span> one small script in the
              kiosk&apos;s page, added by the kiosk vendor or the store with a script tag, a kiosk-browser extension, or
              injection into a kiosk app&apos;s WebView.
            </li>
            <li>
              <span className="font-bold text-[#15171C]">Native kiosk apps:</span> on the roadmap, not built.
            </li>
          </ul>
          <p className={EVIDENCE}>No kiosk vendor or store has installed KIBO yet; there are no partnerships.</p>
        </article>
        <Sources
          paths={[
            "evals/results/2026-10-18T21-59.md",
            "evidence/voice-e2e.json",
            "evidence/voice-e2e-relay.json",
            "spikes/blind-kiosks/ROUND4.md",
            "spikes/blind-kiosks/ROUND3.md",
            "spikes/blind-kiosks/RESULTS.md",
            "spikes/blind-kiosks/results/dev/gemini-doughhouse-round3/holdout.log",
          ]}
        />
      </section>

      <section data-landing-section="cloud" aria-labelledby="cloud" className="flex flex-col gap-6">
        <h2 id="cloud" className={H2}>
          Built on Google Cloud
        </h2>
        <div
          role="region"
          aria-label="Architecture diagram, scrolls sideways on small screens"
          tabIndex={0}
          className={`${CARD} overflow-x-auto ${FOCUS}`}
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

      <section data-landing-section="trust" aria-labelledby="trust" className="flex flex-col gap-6">
        <h2 id="trust" className="sr-only">
          No smartphone, and privacy
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <article className={`${CARD} flex flex-col gap-2`}>
            <h3 className="font-bold text-[#15171C]">No smartphone?</h3>
            <p>
              KIBO is optional. The kiosk works exactly as before: by touch, with its large-text, lower-screen mode, and
              with staff as today. A phone without a camera app can type the kiosk&apos;s 6-digit code instead of
              scanning, and anyone who would rather not talk in a queue can type or tap.
            </p>
          </article>
          <article className={`${CARD} flex flex-col gap-2`}>
            <h3 className="font-bold text-[#15171C]">Your data</h3>
            <p>
              No account. KIBO keeps no audio, no conversation and no personal data; the order session ends after{" "}
              {SESSION_MINUTES} minutes without activity and is then deleted. Speech and text are processed by Google
              Gemini under Google&apos;s terms.
            </p>
          </article>
        </div>
        <Sources paths={["docs/SECURITY.md"]} note="How we checked what the server stores and logs" />
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

/** One measured number and what it was measured on; the file behind it is in its section's Sources. */
function Fact({ value, detail }: { value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 border-l-4 border-[#3446D4] pl-4">
      <p className="font-bold text-[#15171C]">{value}</p>
      <p className={EVIDENCE}>{detail}</p>
    </div>
  );
}

/** The repo files behind a section's numbers, closed by default, each a link to the public repo. */
function Sources({ paths, note }: { paths: string[]; note?: string }) {
  return (
    <details data-landing-sources className={EVIDENCE}>
      <summary className={`${FOCUS} inline-flex min-h-14 cursor-pointer items-center underline`}>
        Sources ({paths.length} {paths.length === 1 ? "file" : "files"})
      </summary>
      {note && <p>{note}:</p>}
      <ul className="flex flex-col">
        {paths.map((path) => (
          <li key={path}>
            <a href={repoLink(path)} className={`${FOCUS} inline-flex min-h-14 items-center font-mono underline [overflow-wrap:anywhere]`}>
              {path}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** "Source:" and a link to the publisher's own document, tall enough to tap (56px, docs/UI_QA.md). */
function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <p className={EVIDENCE}>
      Source:{" "}
      <a href={url} className={`${FOCUS} inline-flex min-h-14 items-center underline`}>
        {label}
      </a>
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
      {/* /app: the address people type or scan to; the order then runs on /assistant behind it. */}
      {box(24, 40, 184, 96, "Phone", ["/app"])}
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
