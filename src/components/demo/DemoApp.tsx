"use client";

import { ArrowLeft, CreditCard } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
import { demoKioskStep } from "@/lib/kiosk/pairing";
import { uiLocale, type SpeechLanguage } from "@/lib/i18n/languages";
import { pt } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import { ActionStrip } from "./ActionStrip";
import { Caption, COLUMN, COLUMN_HEAD, FOCUS_INSIDE } from "./column";
import { CompareCard } from "./CompareCard";
import { DemoEndCard } from "./DemoEndCard";
import { DemoFrame } from "./DemoFrame";
import { DemoIntro } from "./DemoIntro";
import { environmentOf } from "./environments";
import { ScenarioGuide, type SideTab } from "./ScenarioGuide";

// /demo (docs/UX.md Flow C, screen map D1–D3): the real KioskScreen (or a learned kiosk page with the bridge) and
// AssistantPanel on one real session. Nothing is recorded or simulated beyond the card reader, and the stand-in goes
// through the kiosk's own path. "Use my phone instead" swaps the phone half for KIBO's pairing panel: the judge's own
// phone claims the same demo session (demo limits) by QR or code.

/** The server's per-order chat limit for demo sessions (docs/ARCHITECTURE.md "Limits and cost"). */
const DEMO_CHAT_LIMIT = 30;
/** Rows kept in "What the AI did". */
const MAX_ACTIONS = 50;
/**
 * The guided kiosk's height: the screen less the top bar (64), the caption row (56), the page's bottom padding (16) and
 * the card stand-in's place under the kiosk (60), so its width, 9:16 of that, is known to the card stand-in too.
 */
const KIOSK_W = "w-[calc((100dvh-196px)*9/16)]";

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
  // The third column's tab. The first tool call of each order switches it to "What the AI did" once, so a judge sees
  // the AI's work without looking for it; a switch back sticks for that order (#1 E).
  const [side, setSide] = useState<{ tab: SideTab; switchedFor: string | null }>({ tab: "scenarios", switchedFor: null });

  const [run, setRun] = useState<Run | null>(null);
  // The session whose order number the kiosk shows (past its receipt question), for the English step line.
  const [numberFor, setNumberFor] = useState<string | null>(null);
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
      <DemoFrame kioskId={kiosk.kioskId} askBeforeLeaving={false}>
        <DemoIntro
          kioskId={kiosk.kioskId}
          starting={demo.starting}
          error={demo.error}
          onStart={() => startOrder(false)}
          onStartPhone={() => startOrder(true)}
        />
      </DemoFrame>
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
  const numberShown = session !== null && numberFor === session.sessionId;
  // The kiosk's step in English and the card stand-in under it: not with the judge's own phone (the pairing panel says
  // the step, and the kiosk's own K7 takes the card) nor on a learned kiosk (its page has its own strip).
  const guided = !ownPhone && !learned;
  const step = guided && session ? demoKioskStep(kiosk, session, numberShown) : null;
  const actionList = actions.sessionId === tokens.sessionId ? actions.list : [];
  const endCard = (
    <DemoEndCard kioskId={kiosk.kioskId} locale={locale} learned={learned} compare={compare} onTryAgain={tryAgain} onIntro={demo.stop} />
  );
  // Own phone: the pairing panel shows the end card when the phone half would (paid, ended, a learned kiosk's review).
  const ended =
    session !== null && (session.status === "paid" || session.status === "expired" || (learned && session.status === "confirming"));
  // A place tab would clear an order that has lines and is not paid yet, so it asks first (N5).
  const openOrder = session !== null && session.cart.length > 0 && session.status !== "paid" && session.status !== "expired";

  return (
    <>
      <NarrowNotice kioskId={kiosk.kioskId} />
      <DemoFrame kioskId={kiosk.kioskId} askBeforeLeaving={openOrder} className="max-[899px]:hidden">
        {/* Three white column cards on one top line under the top bar (#1 E). The kiosk column takes the width the
            phone and the third column leave, so the row spans the bar; the kiosk inside it is as tall as the column
            allows and keeps 9:16. The learned page has its own width (1080:1600 and its strip) and the third column
            takes the rest. */}
        <main
          data-demo="split"
          data-demo-kiosk={kiosk.kioskId}
          data-demo-own-phone={ownPhone || undefined}
          className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-6 pb-4 min-[1440px]:gap-5"
        >
          <section
            data-demo-column
            aria-labelledby="demo-kiosk-caption"
            className={`${COLUMN} ${learned ? "w-[calc((100dvh-136px)*27/40)] flex-none" : "min-w-0 flex-1"}`}
          >
            <div className={`${COLUMN_HEAD} justify-between`}>
              <Caption id="demo-kiosk-caption" n={1} {...environmentOf(kiosk.kioskId).caption} />
              {/* The kiosk stays Korean; KIBO says its step in English beside the caption, in two lines at most, so the
                  kiosk under the row keeps one size and place from D2 to D3 (#1 E, #1 item 19). break-keep: it quotes
                  Korean button labels, which would otherwise split mid-word (I-044). */}
              {step && (
                <p data-kiosk-step aria-live="polite" className="min-w-0 text-right text-base/5 font-semibold text-balance break-keep text-kibo-deep">
                  {step}
                </p>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center">
              <div
                className={`min-h-0 flex-1 overflow-hidden ${learned ? "w-full" : "aspect-[9/16] max-w-full"}`}
                onPointerDownCapture={countTap("kioskTaps")}
              >
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
                      onOrderNumber={setNumberFor}
                      retrying={demo.streamState === "retrying"}
                    />
                  </KioskCanvas>
                )}
              </div>
              {/* The card stand-in's place under the kiosk, kept at every step so the kiosk never moves (#1 item 19). At
                  payment it is the kiosk's card slot: the kiosk's dark frame with a button in its accent colour, as wide
                  as the kiosk and no taller than a target. Only the kiosk takes payment, so the phone half has no button
                  that pays (15-judge-fixes:2). It counts as a kiosk tap. With the judge's own phone, the kiosk's own K7
                  buttons are used, as before. */}
              {guided && (
                <div className={`flex h-15 max-w-full flex-none ${KIOSK_W}`}>
                  {session?.status === "paying" && (
                    <div
                      data-card-reader
                      className="flex w-full rounded-b-tile bg-[#141210] px-1 pb-1"
                      onPointerDownCapture={countTap("kioskTaps")}
                    >
                      <button
                        type="button"
                        onClick={() => cardTap.dispatchEvent(new Event("tap"))}
                        style={{ backgroundColor: kiosk.theme.accent }}
                        className={`flex h-14 w-full items-center justify-center gap-2 rounded-tile px-3 text-base font-bold text-[#1E1B18] ${PRESS} ${FOCUS_INSIDE}`}
                      >
                        <CreditCard {...ICON} />
                        Kiosk: insert card (demo)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
          {ownPhone ? (
            // A slim status column: the QR and code are on the kiosk half's own screen (14-final:1).
            <section data-demo-column aria-labelledby="demo-phone-caption" className={`${COLUMN} w-[clamp(320px,26vw,440px)] flex-none`}>
              <div className={COLUMN_HEAD}>
                <Caption id="demo-phone-caption" n={2} name="Your own phone" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <PairingPanel
                  kiosk={kiosk}
                  session={session}
                  claimUrl={tokens.claimUrl}
                  pairUrl={tokens.pairUrl}
                  clockOffset={demo.clockOffset}
                  numberShown={numberShown}
                >
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
              data-demo-column
              data-demo-check
              aria-labelledby="demo-phone-caption"
              className={`${COLUMN} w-[clamp(400px,32vw,480px)] flex-none`}
            >
              <div className={COLUMN_HEAD}>
                <Caption id="demo-phone-caption" n={2} name="Your phone" />
              </div>
              {/* 480px: the phone header at 200% text needs about 450 (WCAG 1.4.4). */}
              <div className="min-h-[480px] flex-1 overflow-hidden" onPointerDownCapture={countTap("phoneTaps")}>
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
                  onActions={(list) => {
                    setActions((prev) => ({
                      sessionId: tokens.sessionId,
                      list: [...(prev.sessionId === tokens.sessionId ? prev.list : []), ...list].slice(-MAX_ACTIONS),
                    }));
                    if (list.length > 0) {
                      setSide((t) => (t.switchedFor === tokens.sessionId ? t : { tab: "ai", switchedFor: tokens.sessionId }));
                    }
                  }}
                />
              </div>
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
            className={learned ? "min-w-80 flex-1" : "w-[clamp(320px,26vw,400px)] flex-none"}
            // The judge's own phone: its messages and the AI's tool calls happen on that phone, so there is nothing to list.
            ai={
              ownPhone
                ? undefined
                : {
                    panel: <ActionStrip kiosk={kiosk} actions={actionList} locale={locale} />,
                    count: actionList.length,
                    tab: side.tab,
                    onTab: (tab) => setSide((t) => ({ ...t, tab })),
                  }
            }
          />
        </main>
      </DemoFrame>
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
