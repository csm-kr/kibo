"use client";

import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useNow } from "@/hooks/useNow";
import { useQrSrc } from "@/hooks/useQrSrc";
import { localName } from "@/lib/adapters/catalog";
import { ApiError, sendCommand, type CommandReply } from "@/lib/client/api";
import type { ErrorDetail } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { kt, languageName } from "@/lib/i18n/kiosk";
import { formatWon, tilePrice } from "@/lib/kiosk/menu";
import { kioskScreen, screenLocale, startOverStep } from "@/lib/kiosk/screen";
import { kiboWorking } from "@/lib/kiosk/timers";
import type { KioskData, KioskLocale } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";
import { DemoCounter } from "./DemoCounter";
import { DoneScreen } from "./DoneScreen";
import { KioskBanners } from "./KioskBanners";
import { MenuScreen } from "./MenuScreen";
import { PairCode } from "./PairCode";
import { PaymentScreen } from "./PaymentScreen";
import { ReviewScreen } from "./ReviewScreen";
import { StartOver } from "./StartOver";
import { BrandMark } from "./BrandMark";
import { DINE_SIZES, KioskImage, preloadKioskImages } from "./KioskImage";
import { KioskToolbar } from "./KioskToolbar";
import { CARD_SHADOW, FOCUS } from "./styles";

// All sizes are 1080x1920 canvas px (docs/UI_GUIDE.md). Text uses the k-text-* utilities (>= 40px).

interface Props {
  kiosk: KioskData;
  session: Session | null;
  kioskToken: string | null;
  claimUrl: string | null;
  /** The 6-digit code for /app shown under the QR; /demo sessions have none. */
  pairCode?: string | null;
  /** What to open beside the code ("<host>/app" or the short SHORT_APP_URL host); absent on old stored sessions. */
  pairUrl?: string | null;
  /** `/kiosk?…&demo=1` only: the tap counter for the touch-vs-voice measurement. /demo leaves it off (I-135). */
  demo?: boolean;
  /** Server time minus local time, from ping; session times are server time. */
  clockOffset: number;
  /** Called when the session has ended or vanished; the owner decides how to get a new one. */
  onNewSession(): void;
  /**
   * [Connect another phone] issued a new QR; the owner stores it. /demo leaves it out, which hides the button:
   * a new QR would void the demo's own phone (I-066).
   */
  onClaimUrl?(claimUrl: string, pairCode?: string): void;
  /**
   * Standalone /kiosk only: [처음으로] on K2 and K3 ends the touch order with a new session (I-048). /demo leaves it
   * out, so the judge's session is never dropped.
   */
  onStartOver?(): void;
  /** /demo only: a "tap" event inserts the card on K7, the same path as the kiosk's own button (Flow C4). */
  cardTap?: EventTarget;
  /** /demo only: K8 keeps the order number instead of counting back to K1; the demo's end card moves on. */
  keepOrderNumber?: boolean;
  /** /demo only: K8 moved from the receipt question to the order number (#1 item 13). */
  onOrderNumber?(sessionId: string): void;
  /** The server refused this screen's session stream and it reconnects after a wait (I-033). */
  retrying?: boolean;
}

export function KioskScreen(props: Props) {
  const { session, kioskToken, claimUrl, demo = false, clockOffset, onNewSession, onClaimUrl } = props;
  const sessionId = session?.sessionId ?? null;
  // The language row on K1 picks the screen language for this order; a new session starts in the kiosk's default.
  // `at` is server time, to compare with a language asked for on the phone.
  const [lang, setLang] = useState<{ forId: string | null; locale: KioskLocale; at: number } | null>(null);
  // A choice made before the first session arrived belongs to that session.
  if (lang !== null && lang.forId === null && sessionId !== null) setLang({ ...lang, forId: sessionId });
  const tapped = lang !== null && (lang.forId === sessionId || lang.forId === null) ? lang : null;
  // The user can also ask on the phone ("키오스크도 영어로 바꿔줘", I-418); the later of the two wins.
  const locale = screenLocale(props.kiosk, session?.kioskLanguage, tapped);
  // Every screen reads kiosk.locale, so the kiosk passed down carries the chosen language.
  const kiosk = useMemo(
    () => (locale === props.kiosk.locale ? props.kiosk : { ...props.kiosk, locale }),
    [props.kiosk, locale],
  );
  // Keyed by session, so a new session starts without the previous one's touch start.
  const [touch, setTouch] = useState<{ forId: string | null; started: boolean }>({ forId: null, started: false });
  const [large, setLarge] = useState(false);
  const [error, setError] = useState<{ code: ScreenErrorCode; detail?: ErrorDetail } | null>(null);
  // Demo counters: taps on buttons after K1 and the time from the first of them, keyed by session.
  const [taps, setTaps] = useState<{ forId: string | null; count: number; startAt: number | null }>({
    forId: null,
    count: 0,
    startAt: null,
  });

  // While K1 waits, fetch every menu picture, so the menu and sheets never open on blank photos (14-final:2).
  // After a short delay, so the hero and the QR come first.
  const baseKiosk = props.kiosk;
  useEffect(() => {
    const t = setTimeout(() => preloadKioskImages(baseKiosk), 300);
    return () => clearTimeout(t);
  }, [baseKiosk]);

  const touchStarted = touch.forId === sessionId && touch.started;
  const screen = kioskScreen(session, { touchStarted }, kiosk);
  // "KIBO is working…" in the toolbar row while the phone waits for the AI, before anything moves (14-final:1).
  const now = useNow();
  const working = session !== null && kiboWorking(session, now, clockOffset);
  const startOverAt = props.onStartOver ? startOverStep(screen, session) : null;
  const startOver = startOverAt && props.onStartOver && (
    <StartOver key={sessionId} kiosk={kiosk} step={startOverAt} onStartOver={props.onStartOver} />
  );

  /** Sends a touch command; on failure shows the error copy and returns null. */
  async function send(type: CommandType, args: object, opts?: { cartVersion?: number }): Promise<CommandReply | null> {
    if (!session || !kioskToken) return null;
    try {
      const reply = await sendCommand({
        sessionId: session.sessionId,
        token: kioskToken,
        type,
        args,
        source: "touch",
        cartVersion: opts?.cartVersion,
      });
      setError(null);
      return reply;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "");
      if (err.code === "GONE" || err.code === "NOT_FOUND") onNewSession();
      setError({ code: err.code, detail: err.detail });
      return null;
    }
  }

  async function startTouch() {
    setTouch({ forId: sessionId, started: true });
    if (!(await send("startTouch", {}))) setTouch({ forId: sessionId, started: false });
  }

  const counted = taps.forId === sessionId ? taps : { count: 0, startAt: null };

  function countTap(e: PointerEvent) {
    // Counting stops at `paid`, so the receipt and countdown screens do not add to the comparison.
    if (!demo || screen === "attract" || screen === "done") return;
    if (!(e.target instanceof Element) || !e.target.closest("button:not(:disabled)")) return;
    setTaps({ forId: sessionId, count: counted.count + 1, startAt: counted.startAt ?? Date.now() });
  }

  const style = { "--k-fs": large ? 1.15 : 1 } as CSSProperties;

  return (
    <div
      className="relative flex h-full flex-col"
      style={style}
      lang={locale}
      data-screen={screen}
      data-demo={demo || undefined}
      onPointerDownCapture={countTap}
    >
      {props.retrying && (
        // Like the KX strips: in the flow at the top, so it pushes the screen down and covers nothing (R-006). One
        // short line, kept low so K1 still fits the canvas with WCAG 1.4.12 text spacing.
        <div
          role="status"
          data-stream-retrying
          className="k-text-40 flex-none border-b-4 border-[#7A2E0E] bg-[#FFF1CC] px-12 py-3 text-[#7A2E0E]"
        >
          {kt("streamRetrying", locale)}
        </div>
      )}
      {session && <KioskBanners kiosk={kiosk} session={session} kioskToken={kioskToken} clockOffset={clockOffset} />}
      {screen === "attract" ? (
        <Attract
          kiosk={kiosk}
          claimUrl={claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl}
          canStart={Boolean(session && kioskToken)}
          large={large}
          onLocale={(l: KioskLocale) => setLang({ forId: sessionId, locale: l, at: Date.now() + clockOffset })}
          onTouch={startTouch}
          onLarge={() => setLarge((v) => !v)}
        />
      ) : screen === "menu" && session ? (
        <MenuScreen
          kiosk={kiosk}
          session={session}
          claimUrl={claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl}
          clockOffset={clockOffset}
          send={send}
          onClaimUrl={onClaimUrl}
          startOver={startOver}
          working={working}
        />
      ) : screen === "review" && session ? (
        <ReviewScreen
          kiosk={kiosk}
          session={session}
          claimUrl={claimUrl}
          pairCode={props.pairCode}
          pairUrl={props.pairUrl}
          send={send}
          onClaimUrl={onClaimUrl}
          working={working}
        />
      ) : screen === "payment" && session ? (
        <PaymentScreen
          kiosk={kiosk}
          session={session}
          claimUrl={claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl}
          send={send}
          onClaimUrl={onClaimUrl}
          cardTap={props.cardTap}
        />
      ) : screen === "done" && session ? (
        <DoneScreen
          key={session.sessionId}
          kiosk={kiosk}
          session={session}
          clockOffset={clockOffset}
          keepNumber={props.keepOrderNumber ?? false}
          onNewSession={onNewSession}
          onNumberShown={props.onOrderNumber}
        />
      ) : (
        <>
          <Header kiosk={kiosk} />
          {/* The small QR on K2 too: a touch order can switch to the phone from every screen (Flow B, I-048). */}
          {session && (
            <KioskToolbar
              kiosk={kiosk}
              session={session}
              claimUrl={claimUrl}
              pairCode={props.pairCode}
              pairUrl={props.pairUrl}
              send={send}
              onClaimUrl={onClaimUrl}
              working={working}
            />
          )}
          <Dine
            kiosk={kiosk}
            phoneConnected={session?.phoneConnectedAt != null}
            onPick={(option: DineOption) => void send("setDineOption", { option })}
            startOver={startOver}
          />
        </>
      )}
      {demo && (
        <DemoCounter
          // DoneScreen, a sibling, is keyed by the bare session id.
          key={`counter:${sessionId}`}
          locale={locale}
          taps={counted.count}
          startAt={counted.startAt}
          paid={screen === "done"}
        />
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-x-12 bottom-12 z-40 flex items-center gap-8 rounded-[32px] border-4 border-[#7A2E0E] bg-[#FFF1CC] p-10 text-[#7A2E0E]"
        >
          {/* Error copy is Korean and English only; the ticket machine's Japanese screen shows the English. */}
          <p className="k-text-40 flex-1 font-bold">{errorCopy(error.code, locale === "ja" ? "en" : locale, error.detail)}</p>
          {error.detail?.templateId === "pick_dine" &&
            // [주문하기] without a dine option (a phone added items first): answer here, then order again (I-034).
            (["eat_in", "take_out"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={async () => {
                  if (await send("setDineOption", { option })) void send("requestCheckout", {});
                }}
                className={`k-text-40 min-h-22 rounded-full bg-(--k-primary) px-10 font-bold text-white ${FOCUS}`}
              >
                {kiosk.dineOptions && localName(kiosk.dineOptions[option].name, locale)}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setError(null)}
            className={`k-text-40 min-h-22 rounded-full bg-[#7A2E0E] px-10 font-bold text-white ${FOCUS}`}
          >
            {kt("close", locale)}
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ kiosk, children }: { kiosk: KioskData; children?: ReactNode }) {
  // The wordmark is the store's logo, so it keeps one spelling in every language.
  const wordmark = kiosk.brand.name.en;
  return (
    <header className="flex h-36 flex-none items-center gap-6 border-b-8 border-(--k-accent) bg-(--k-primary) px-12">
      <BrandMark kiosk={kiosk} />
      <span className="k-text-56 font-display font-bold tracking-wide text-(--k-bg)">{wordmark}</span>
      {children}
    </header>
  );
}

function Attract(props: {
  kiosk: KioskData;
  claimUrl: string | null;
  pairCode?: string | null;
  pairUrl?: string | null;
  canStart: boolean;
  large: boolean;
  onLocale(locale: KioskLocale): void;
  onTouch(): void;
  onLarge(): void;
}) {
  const { kiosk, claimUrl, canStart, large } = props;
  const { locale, domain } = kiosk;
  const qrSrc = useQrSrc(claimUrl);
  // The store's own offer on the hero: its NEW item, else its BEST one, with the tile's price. Menu data only.
  const promo =
    kiosk.items.find((i) => i.badge === "new" && !i.soldOut) ?? kiosk.items.find((i) => i.badge === "best" && !i.soldOut);

  return (
    <>
      <Header kiosk={kiosk} />
      {/* Scrolls rather than clips when larger text and WCAG 1.4.12 spacing make K1 taller than the canvas, after the
          hero has given way (three language buttons wrap the row below; 10-16 日本語). It never scrolls otherwise. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="relative min-h-0 flex-1 bg-(--k-primary-tint) [container-type:size]">
        {/* A pictogram hero keeps its bottom free for the offer below; a photo just runs under it. */}
        {kiosk.hero && <KioskImage src={kiosk.hero} sizes="1080px" inset={promo ? "px-12 pt-12 pb-36" : "p-12"} preload />}
        {promo && (
          // Only while the hero is tall enough to hold it (large text shrinks the hero), so it never covers the
          // tagline below.
          <p className={`absolute bottom-8 left-12 hidden items-center gap-6 rounded-full bg-white py-3 pr-10 pl-3 [@container(min-height:240px)]:flex ${CARD_SHADOW}`}>
            <span
              className={`k-text-40 rounded-full px-6 font-display font-bold ${
                promo.badge === "best" ? "bg-(--k-accent) text-[#1E1B18]" : "bg-(--k-primary) text-white"
              }`}
            >
              {kt(promo.badge === "best" ? "badgeBest" : "badgeNew", locale)}
            </span>
            <span className="k-text-40 font-bold">{localName(promo.name, locale)}</span>
            <span className="k-text-40 font-display font-bold text-(--k-primary)">{formatWon(tilePrice(promo), locale)}</span>
          </p>
        )}
      </div>
      <h1 className="k-text-72 flex-none px-16 pt-12 pb-10 font-bold text-(--k-primary-dark)">
        {localName(kiosk.brand.tagline, locale)}
      </h1>
      <div className="grid flex-none grid-cols-2 gap-8 px-12">
        <div className={`flex flex-col items-center gap-6 rounded-[32px] border-[6px] border-(--k-primary) bg-white p-8 text-center ${CARD_SHADOW}`}>
          <h2 className="k-text-48 font-bold text-(--k-primary)">{kt("talkTitle", locale, domain)}</h2>
          {qrSrc && claimUrl ? (
            // A data URL, so next/image would add nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} alt={kt("qrAlt", locale, domain)} data-claim-url={claimUrl} width={380} height={380} className="size-95" />
          ) : (
            <p className="k-text-40 flex size-95 items-center justify-center rounded-[24px] bg-(--k-panel) p-8 text-[#4B463F]">
              {kt("qrLoading", locale)}
            </p>
          )}
          <p className="k-text-40 text-[#4B463F]">{kt("talkHint", locale)}</p>
        </div>
        <button
          type="button"
          onClick={props.onTouch}
          disabled={!canStart}
          className={`flex flex-col items-center justify-center gap-6 rounded-[32px] bg-(--k-primary) p-8 text-center text-white active:bg-(--k-primary-dark) disabled:opacity-60 ${CARD_SHADOW} ${FOCUS}`}
        >
          <svg width="128" height="128" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10" />
            <path d="M12 10V4.5a1.5 1.5 0 0 1 3 0V11" />
            <path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.4-1.8L9 15" />
          </svg>
          <span className="k-text-48 font-bold">{kt("touchTitle", locale, domain)}</span>
          <span className="k-text-40 text-(--k-primary-tint)">{kt("touchHint", locale)}</span>
        </button>
      </div>
      <PairCode kiosk={kiosk} claimUrl={claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl} className={`mx-12 mt-8 flex-none ${CARD_SHADOW}`} />
      <div className="flex flex-none flex-wrap items-center justify-between gap-4 px-12 py-10">
        {kiosk.locales.length > 1 ? (
          // One segmented control: the chosen language is the dark half.
          <div role="group" aria-label={kt("language", locale)} className="flex gap-2 rounded-full border-4 border-[#1E1B18] bg-white p-1">
            {kiosk.locales.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={l === locale}
                onClick={() => props.onLocale(l)}
                // 72px inside the 4px frame and 4px padding: the row stays 88px tall like the button beside it.
                className={`k-text-40 min-h-18 rounded-full px-8 font-bold ${l === locale ? "bg-[#1E1B18] text-white" : "bg-white"} ${FOCUS}`}
              >
                {languageName(l)}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-pressed={large}
          onClick={props.onLarge}
          className={`k-text-40 min-h-22 rounded-full border-4 border-[#1E1B18] px-8 font-bold ${large ? "bg-[#1E1B18] text-white" : "bg-white"} ${FOCUS}`}
        >
          {kt("largeText", locale)}
        </button>
      </div>
      </div>
    </>
  );
}

function Dine(props: { kiosk: KioskData; phoneConnected: boolean; onPick(o: DineOption): void; startOver: ReactNode }) {
  const { kiosk, phoneConnected, onPick } = props;
  const locale = kiosk.locale;
  const options: DineOption[] = ["eat_in", "take_out"];
  const dine = kiosk.dineOptions;
  if (!dine) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-16 px-12 pt-16">
      <h1 className="k-text-72 flex-none text-center font-bold">{kt("dineQuestion", locale)}</h1>
      {/* The two photo cards take the free height, so the screen has no empty half (14-final:2). */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-10">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className={`flex max-h-[1040px] min-h-0 flex-col overflow-hidden rounded-[32px] bg-white active:bg-(--k-primary-tint) ${CARD_SHADOW} ${FOCUS}`}
          >
            <span className="relative block min-h-60 w-full flex-1">
              <KioskImage src={dine[o].image} sizes={DINE_SIZES} />
            </span>
            <span className="k-text-56 flex w-full flex-none items-center justify-center gap-4 px-6 py-10 font-bold">
              {localName(dine[o].name, locale)}
              <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden fill="none" stroke="var(--k-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </button>
        ))}
      </div>
      {phoneConnected && (
        <p role="status" className="k-text-40 flex items-center gap-8 rounded-[32px] bg-(--k-primary-tint) p-10 text-(--k-primary-dark)">
          <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="flex-none">
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18h3" />
          </svg>
          {kt("phoneConnected", locale)}
        </p>
      )}
      {props.startOver && <div className="mt-auto flex pb-12">{props.startOver}</div>}
    </div>
  );
}
