"use client";

import { ArrowLeft, CreditCard } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AssistantPanel, type SayFn } from "@/components/assistant/AssistantPanel";
import { ICON, PRESS, QUIET, SECONDARY } from "@/components/phone/ui";
import { KioskCanvas } from "@/components/kiosk/KioskCanvas";
import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { LearnedKioskHost } from "@/components/learned/LearnedKioskHost";
import { PairingPanel } from "@/components/pairing/PairingPanel";
import { PausedLayer } from "@/components/PausedLayer";
import { useDemoSession } from "@/hooks/useDemoSession";
import type { AgentAction } from "@/lib/agent/actions";
import { examplesFor } from "@/lib/agent/examples";
import { buildComparison, HERO_KIOSK } from "@/lib/demo/compare";
import { EDIT_PATH_TAPS, HUMAN_RUNS, TOUCH_RUN } from "@/lib/demo/evidence";
import { scenariosFor } from "@/lib/demo/scenarios";
import { kioskStep } from "@/lib/kiosk/pairing";
import { uiLocale, type SpeechLanguage } from "@/lib/i18n/languages";
import { pt } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import { ActionStrip } from "./ActionStrip";
import { CompareCard } from "./CompareCard";
import { DemoEndCard } from "./DemoEndCard";
import { DemoIntro } from "./DemoIntro";
import { environmentOf } from "./environments";
import { ScenarioGuide } from "./ScenarioGuide";

// /demo (docs/UX.md Flow C, screen map D1–D3): the real KioskScreen (or a learned kiosk page with the bridge) and
// AssistantPanel on one real session. Nothing is recorded or simulated beyond the card reader, and the stand-in goes
// through the kiosk's own path. "Use my phone instead" swaps the phone half for KIBO's pairing panel: the judge's own
// phone claims the same demo session (demo limits) by QR or code.

/** The server's per-order chat limit for demo sessions (docs/ARCHITECTURE.md "Limits and cost"). */
const DEMO_CHAT_LIMIT = 30;
/** Rows kept in "What the AI did". */
const MAX_ACTIONS = 50;
/** The judge laptop (docs/UI_QA.md 1440×900) and wider: room for a third column. */
const WIDE = "(min-width: 1440px)";
/** On the kiosk's dark frame an ink ring would not show; white keeps the focus visible (WCAG 2.4.7). */
const FOCUS_ON_DARK = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * This demo order's own counts for the D3 comparison card (docs/PRD.md "Demo scenario" step 8), from [Start] or
 * [Try again] to `paid`. Measured in this browser and never stored; `forId` binds them to the session they started.
 */
interface Run {
  forId: string | null;
  /** The session open when this order was started ([Try again]); the counts bind to the next one. */
  after: string | null;
  startAt: number;
  sentences: number;
  phoneTaps: number;
  kioskTaps: number;
}
type Counted = "sentences" | "phoneTaps" | "kioskTaps";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function DemoApp({ kiosk }: { kiosk: KioskData }) {
  const demo = useDemoSession(kiosk.kioskId);
  // The phone half's AI language (14-final:4); its screens are Korean or English.
  const [language, setLanguage] = useState<SpeechLanguage>("en");
  const locale: Locale = uiLocale(language);
  // The card stand-in under the kiosk half sends "tap" here; the kiosk's K7 inserts the card when it hears it.
  const [cardTap] = useState(() => new EventTarget());
  // The phone half's larger text, for this page only (the judge's laptop is not the user's phone).
  const [largeText, setLargeText] = useState(false);
  // The phone half's own send, for the scenario guide's sentences.
  const sayRef = useRef<SayFn | null>(null);
  const onSay = useCallback((say: SayFn | null) => {
    sayRef.current = say;
  }, []);
  const send = useCallback<SayFn>((text) => sayRef.current?.(text) ?? Promise.resolve("error"), []);
  const learned = kiosk.kind === "learned";
  // What the AI did in this demo order; another session id means [Try again] started a new one.
  const [actions, setActions] = useState<{ sessionId: string; list: AgentAction[] }>({ sessionId: "", list: [] });

  // From 1440px wide the scenario column opens beside the phone and holds "What the AI did" (I-132, I-084).
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

  const [run, setRun] = useState<Run | null>(null);
  /** Every new demo order goes through here, so its counts start at zero. `ownPhone`: "Use my phone instead". */
  function startOrder(ownPhone: boolean) {
    setRun({ forId: null, after: demo.tokens?.sessionId ?? null, startAt: Date.now(), sentences: 0, phoneTaps: 0, kioskTaps: 0 });
    void demo.start(ownPhone);
  }
  // Counting stops at `paid`, so the end card's own buttons never add to it.
  const count = (key: Counted) => {
    if (demo.session?.status === "paid") return;
    setRun((r) => (r && r.forId !== null ? { ...r, [key]: r[key] + 1 } : r));
  };
  const countTap = (key: Counted) => (e: { target: EventTarget }) => {
    if (e.target instanceof Element && e.target.closest("button:not(:disabled)")) count(key);
  };

  if (!demo.tokens) {
    return (
      <DemoIntro
        kioskId={kiosk.kioskId}
        starting={demo.starting}
        error={demo.error}
        onStart={() => startOrder(false)}
        onStartPhone={() => startOrder(true)}
      />
    );
  }

  const { tokens, session } = demo;
  // "Use my phone instead": the page is only the kiosk; the judge's own phone holds the device token.
  const ownPhone = tokens.deviceToken === undefined;
  const tryAgain = () => startOrder(ownPhone);
  if (run && run.forId === null && run.after !== tokens.sessionId) setRun({ ...run, forId: tokens.sessionId });
  const thisRun = run?.forId === tokens.sessionId ? run : null;
  // The end is the server's paidAt in this browser's clock, so the seconds never grow while the card shows.
  // Not with the judge's own phone: its messages and taps happen on that phone, so this page cannot count them.
  const compare =
    !ownPhone && kiosk.kioskId === HERO_KIOSK && session?.status === "paid" && session.paidAt !== null && thisRun ? (
      <CompareCard
        kiosk={kiosk}
        locale={locale}
        comparison={buildComparison({
          live: {
            sentences: thisRun.sentences,
            phoneTaps: thisRun.phoneTaps,
            kioskTaps: thisRun.kioskTaps,
            seconds: Math.max(0, Math.round((session.paidAt - demo.clockOffset - thisRun.startAt) / 1000)),
          },
          cart: session.cart,
          automated: TOUCH_RUN,
          human: HUMAN_RUNS,
          editPathTaps: EDIT_PATH_TAPS,
        })}
      />
    ) : undefined;
  const beside = !ownPhone && wide && scenariosFor(kiosk.kioskId).length > 0;
  const step = session ? kioskStep(kiosk, session) : null;
  const actionStrip = (
    <ActionStrip
      // Moving between the columns remounts it, so it opens or folds for where it now is.
      key={beside ? "beside" : "under"}
      kiosk={kiosk}
      actions={actions.sessionId === tokens.sessionId ? actions.list : []}
      locale={locale}
      status={session?.status ?? null}
      beside={beside}
    />
  );
  const endCard = (
    <DemoEndCard kioskId={kiosk.kioskId} locale={locale} learned={learned} compare={compare} onTryAgain={tryAgain} onIntro={demo.stop} />
  );
  // Own phone: the pairing panel shows the end card when the phone half would (paid, ended, a learned kiosk's review).
  const ended =
    session !== null && (session.status === "paid" || session.status === "expired" || (learned && session.status === "confirming"));

  return (
    <>
      <NarrowNotice kioskId={kiosk.kioskId} />
      <main
        data-demo="split"
        data-demo-kiosk={kiosk.kioskId}
        data-demo-own-phone={ownPhone || undefined}
        className="flex h-dvh w-full justify-center gap-6 overflow-hidden bg-[#F3EEE4] p-4 text-[#15171C] max-[899px]:hidden"
      >
        {/* 72px = page padding 32 + caption 32 + gap 8, so the canvas (9:16, or the learned page's 1080:1600) fills the height. */}
        <section
          aria-labelledby="demo-kiosk-caption"
          className={`flex h-full flex-none flex-col gap-2 ${learned ? "w-[calc((100dvh-72px)*27/40)]" : "w-[calc((100dvh-72px)*9/16)]"}`}
        >
          <Caption id="demo-kiosk-caption" text={environmentOf(kiosk.kioskId).caption} />
          {/* The kiosk stays Korean; KIBO says its step in English (with the judge's own phone the pairing panel does). */}
          {!ownPhone && step && (
            <p data-kiosk-step aria-live="polite" className="flex-none rounded-tile bg-white px-3 py-2 text-base/normal font-semibold text-kibo-deep shadow-card">
              {step}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-hidden rounded-[18px]" onPointerDownCapture={countTap("kioskTaps")}>
            {learned ? (
              // Keyed by session: [Try again] reloads the kiosk page, so the new order never starts on the old cart.
              <LearnedKioskHost
                key={tokens.sessionId}
                kiosk={kiosk}
                session={session}
                kioskToken={tokens.kioskToken}
                claimUrl={tokens.claimUrl}
                clockOffset={demo.clockOffset}
                strip
              />
            ) : (
              <KioskCanvas theme={kiosk.theme} locale={kiosk.locale}>
                <KioskScreen
                  kiosk={kiosk}
                  session={session}
                  kioskToken={tokens.kioskToken}
                  claimUrl={tokens.claimUrl}
                  pairCode={tokens.pairCode}
                  pairUrl={tokens.pairUrl}
                  // No `demo` (the &demo=1 tap counter) and no onStartOver ([처음으로]): a new session would drop
                  // the judge's order (I-135, I-048). onClaimUrl ([Connect another phone]) only with the judge's own
                  // phone; with the phone half a new QR would void this page's own phone (I-066).
                  onClaimUrl={ownPhone ? demo.setClaimUrl : undefined}
                  clockOffset={demo.clockOffset}
                  // A send found the session gone or expired: start over. A paid order stays for the end card.
                  onNewSession={() => {
                    if (session?.status !== "paid") tryAgain();
                  }}
                  cardTap={cardTap}
                  keepOrderNumber
                  retrying={demo.streamState === "retrying"}
                />
              </KioskCanvas>
            )}
          </div>
          {/* The card reader stands in under the kiosk, drawn as part of its frame: only the kiosk takes payment, so
              the phone half has no button that pays (15-judge-fixes:2). It counts as a kiosk tap. With the judge's own
              phone, the kiosk's own K7 buttons are used, as before. */}
          {!ownPhone && !learned && session?.status === "paying" && (
            <div data-card-reader className="flex flex-none rounded-tile bg-[#141210] p-2" onPointerDownCapture={countTap("kioskTaps")}>
              <button
                type="button"
                onClick={() => cardTap.dispatchEvent(new Event("tap"))}
                style={{ backgroundColor: kiosk.theme.accent }}
                className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-tile px-4 text-xl font-bold text-[#1E1B18] ${PRESS} ${FOCUS_ON_DARK}`}
              >
                <CreditCard {...ICON} />
                Kiosk: insert card (demo)
              </button>
            </div>
          )}
        </section>
        {ownPhone ? (
          // A slim status column: the QR and code are on the kiosk half's own screen (14-final:1).
          <section aria-labelledby="demo-phone-caption" className="flex h-full w-[clamp(320px,26vw,440px)] flex-none flex-col gap-2">
            <Caption id="demo-phone-caption" text="Your own phone (KIBO)" />
            <div className="min-h-0 flex-1 overflow-hidden rounded-sheet shadow-card">
              <PairingPanel kiosk={kiosk} session={session} claimUrl={tokens.claimUrl} pairUrl={tokens.pairUrl} clockOffset={demo.clockOffset}>
                {ended ? (
                  endCard
                ) : (
                  <button type="button" onClick={demo.stop} className={`${QUIET} self-start`}>
                    <ArrowLeft {...ICON} />
                    Back to the start
                  </button>
                )}
              </PairingPanel>
            </div>
          </section>
        ) : (
          <section
            data-demo-check
            aria-labelledby="demo-phone-caption"
            className="flex h-full w-[clamp(400px,32vw,480px)] flex-none flex-col gap-2"
          >
            <Caption id="demo-phone-caption" text="Your phone (KIBO)" />
            {/* 480px: the phone header at 200% text needs about 450 (WCAG 1.4.4), so the action strip under it gives way first. */}
            <div
              className="min-h-[480px] flex-1 overflow-hidden rounded-sheet shadow-card"
              onPointerDownCapture={countTap("phoneTaps")}
            >
              <AssistantPanel
                key={tokens.sessionId}
                kiosk={kiosk}
                session={session}
                deviceToken={tokens.deviceToken ?? null}
                locale={locale}
                onLocaleChange={setLanguage}
                language={language}
                onLanguageChange={setLanguage}
                mode="demo"
                examples={examplesFor(kiosk.kioskId, locale, "demo")}
                largeText={largeText}
                onLargeTextChange={setLargeText}
                streamState={demo.streamState}
                clockOffset={demo.clockOffset}
                chatLimit={DEMO_CHAT_LIMIT}
                onTryAgain={tryAgain}
                endCard={endCard}
                onSay={onSay}
                onUserTurn={() => count("sentences")}
                onActions={(list) =>
                  setActions((prev) => ({
                    sessionId: tokens.sessionId,
                    list: [...(prev.sessionId === tokens.sessionId ? prev.list : []), ...list].slice(-MAX_ACTIONS),
                  }))
                }
              />
            </div>
            {!beside && actionStrip}
          </section>
        )}
        <ScenarioGuide
          kiosk={kiosk}
          session={session}
          sessionId={tokens.sessionId}
          locale={locale}
          // The judge's own phone: the sentences are to say there, so nothing here sends or plays.
          send={ownPhone ? undefined : send}
          starting={demo.starting}
          startFailed={demo.error !== null}
          onFresh={tryAgain}
          wide={wide}
          aside={beside ? actionStrip : undefined}
        />
      </main>
      {/* Outside the counted columns, so the tap that resumes is no kiosk or phone tap. A paid order keeps its end card. */}
      {demo.paused && session?.status !== "paid" && <PausedLayer lines={[pt("streamPaused", locale)]} onResume={demo.resume} />}
    </>
  );
}

/** Below 900px the split's fixed columns would both be cut off, so point to the real two-device mode (I-074). */
function NarrowNotice({ kioskId }: { kioskId: string }) {
  return (
    <main lang="en" className="hidden h-dvh w-full flex-col gap-4 overflow-y-auto bg-[#FBF7EF] p-6 text-[#15171C] max-[899px]:flex">
      <h1 className="text-2xl font-bold">Open this on a laptop</h1>
      <p className="text-xl">
        The demo shows the kiosk and the phone side by side, which needs a wider screen. On a phone, try the real
        two-device mode: open the kiosk on a computer and scan its QR.
      </p>
      <a href={`/kiosk?k=${kioskId}`} className={SECONDARY}>
        Open the kiosk
      </a>
    </main>
  );
}

function Caption({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="flex h-8 flex-none items-center text-base font-bold text-[#33302B]">
      {text}
    </h2>
  );
}
