"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useQrSrc } from "@/hooks/useQrSrc";
import { ApiError, sendCommand, type CommandReply } from "@/lib/client/api";
import type { ErrorDetail } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import { errorCopy, type ScreenErrorCode } from "@/lib/i18n/errors";
import { kt, languageName } from "@/lib/i18n/kiosk";
import { kioskScreen } from "@/lib/kiosk/screen";
import type { KioskData, Locale } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";
import { DemoCounter } from "./DemoCounter";
import { DoneScreen } from "./DoneScreen";
import { KioskBanners } from "./KioskBanners";
import { MenuScreen } from "./MenuScreen";
import { PaymentScreen } from "./PaymentScreen";
import { ReviewScreen } from "./ReviewScreen";
import { KioskImage } from "./KioskImage";
import { FOCUS } from "./styles";

// All sizes are 1080x1920 canvas px (docs/UI_GUIDE.md). Text uses the k-text-* utilities (>= 40px).

interface Props {
  kiosk: KioskData;
  session: Session | null;
  kioskToken: string | null;
  claimUrl: string | null;
  demo: boolean;
  /** Server time minus local time, from ping; session times are server time. */
  clockOffset: number;
  /** Called when the session has ended or vanished; the owner decides how to get a new one. */
  onNewSession(): void;
  /** [Connect another phone] issued a new QR; the owner stores it. */
  onClaimUrl(claimUrl: string): void;
  /** /demo only: a "tap" event inserts the card on K7, the same path as the kiosk's own button (Flow C4). */
  cardTap?: EventTarget;
  /** /demo only: K8 keeps the order number instead of counting back to K1; the demo's end card moves on. */
  keepOrderNumber?: boolean;
}

export function KioskScreen(props: Props) {
  const { session, kioskToken, claimUrl, demo, clockOffset, onNewSession, onClaimUrl } = props;
  const sessionId = session?.sessionId ?? null;
  // The language row on K1 picks the screen language for this order; a new session starts in the kiosk's default.
  const [lang, setLang] = useState<{ forId: string | null; locale: Locale }>({ forId: null, locale: props.kiosk.locale });
  // A choice made before the first session arrived belongs to that session.
  if (lang.forId === null && sessionId !== null) setLang({ forId: sessionId, locale: lang.locale });
  const locale = lang.forId === sessionId || lang.forId === null ? lang.locale : props.kiosk.locale;
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

  const touchStarted = touch.forId === sessionId && touch.started;
  const screen = kioskScreen(session, { touchStarted }, kiosk);

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
      {screen === "attract" ? (
        <Attract
          kiosk={kiosk}
          claimUrl={claimUrl}
          canStart={Boolean(session && kioskToken)}
          large={large}
          onLocale={(l: Locale) => setLang({ forId: sessionId, locale: l })}
          onTouch={startTouch}
          onLarge={() => setLarge((v) => !v)}
        />
      ) : screen === "menu" && session ? (
        <MenuScreen
          kiosk={kiosk}
          session={session}
          claimUrl={claimUrl}
          clockOffset={clockOffset}
          send={send}
          onClaimUrl={onClaimUrl}
        />
      ) : screen === "review" && session ? (
        <ReviewScreen kiosk={kiosk} session={session} claimUrl={claimUrl} send={send} onClaimUrl={onClaimUrl} />
      ) : screen === "payment" && session ? (
        <PaymentScreen
          kiosk={kiosk}
          session={session}
          claimUrl={claimUrl}
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
        />
      ) : (
        <>
          <Header kiosk={kiosk} />
          <Dine
            kiosk={kiosk}
            phoneConnected={session?.phoneConnectedAt != null}
            onPick={(option: DineOption) => void send("setDineOption", { option })}
          />
        </>
      )}
      {session && <KioskBanners kiosk={kiosk} session={session} kioskToken={kioskToken} clockOffset={clockOffset} />}
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
          <p className="k-text-40 flex-1 font-bold">{errorCopy(error.code, locale, error.detail)}</p>
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
                {kiosk.dineOptions?.[option].name[locale]}
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
    <header className="flex h-36 flex-none items-center gap-6 bg-(--k-primary) px-12">
      <span
        aria-hidden
        className="flex size-22 items-center justify-center rounded-[24px] bg-(--k-accent) font-display text-[56px] font-bold text-[#1E1B18]"
      >
        {wordmark[0]}
      </span>
      <span className="k-text-56 font-display font-bold tracking-wide text-(--k-bg)">{wordmark}</span>
      {children}
    </header>
  );
}

function Attract(props: {
  kiosk: KioskData;
  claimUrl: string | null;
  canStart: boolean;
  large: boolean;
  onLocale(locale: Locale): void;
  onTouch(): void;
  onLarge(): void;
}) {
  const { kiosk, claimUrl, canStart, large } = props;
  const { locale, domain } = kiosk;
  const qrSrc = useQrSrc(claimUrl);

  return (
    <>
      <Header kiosk={kiosk} />
      <div className="relative min-h-0 flex-1 bg-(--k-primary-tint)">
        {kiosk.hero && <KioskImage src={kiosk.hero} sizes="1080px" inset="p-12" preload />}
      </div>
      <h1 className="k-text-72 flex-none px-16 pt-12 pb-10 font-bold text-(--k-primary-dark)">
        {kiosk.brand.tagline[locale]}
      </h1>
      <div className="grid flex-none grid-cols-2 gap-8 px-12">
        <div className="flex flex-col items-center gap-6 rounded-[32px] border-[6px] border-(--k-primary) bg-white p-8 text-center">
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
          className={`flex flex-col items-center justify-center gap-6 rounded-[32px] bg-(--k-primary) p-8 text-center text-white active:bg-(--k-primary-dark) disabled:opacity-60 ${FOCUS}`}
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
      <div className="flex flex-none flex-wrap items-center justify-between gap-4 px-12 py-10">
        {kiosk.locales.length > 1 ? (
          <div role="group" aria-label={kt("language", locale)} className="flex gap-4">
            {kiosk.locales.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={l === locale}
                onClick={() => props.onLocale(l)}
                className={`k-text-40 min-h-22 rounded-[24px] border-4 border-[#1E1B18] px-8 font-bold ${
                  l === locale ? "bg-[#1E1B18] text-white" : "bg-white"
                } ${FOCUS}`}
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
          className={`k-text-40 min-h-22 rounded-[24px] border-4 border-[#1E1B18] px-8 font-bold ${large ? "bg-[#1E1B18] text-white" : "bg-white"} ${FOCUS}`}
        >
          {kt("largeText", locale)}
        </button>
      </div>
    </>
  );
}

function Dine({ kiosk, phoneConnected, onPick }: { kiosk: KioskData; phoneConnected: boolean; onPick(o: DineOption): void }) {
  const locale = kiosk.locale;
  const options: DineOption[] = ["eat_in", "take_out"];
  const dine = kiosk.dineOptions;
  if (!dine) return null;
  return (
    <div className="flex flex-1 flex-col gap-16 px-12 pt-24">
      <h1 className="k-text-72 text-center font-bold">{kt("dineQuestion", locale)}</h1>
      <div className="grid grid-cols-2 gap-10">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className={`overflow-hidden rounded-[32px] border-[6px] border-[#1E1B18] bg-white active:bg-(--k-primary-tint) ${FOCUS}`}
          >
            <span className="relative block h-140">
              <Image src={dine[o].image} alt="" fill sizes="480px" className="object-cover" />
            </span>
            <span className="k-text-56 block px-6 py-10 font-bold">{dine[o].name[locale]}</span>
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
    </div>
  );
}
