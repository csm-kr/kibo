"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SECONDARY } from "@/components/phone/ui";
import { useKioskSession } from "@/hooks/useKioskSession";
import { useNow } from "@/hooks/useNow";
import { useQrSrc } from "@/hooks/useQrSrc";
import { createBridge, type BridgeOutcome } from "@/lib/bridge/bridge";
import { pageFrame, pageSizeOf, replayCaption, tapMarks, type ReplayTap } from "@/lib/bridge/replayView";
import { sendCommand } from "@/lib/client/api";
import { kiboWorking } from "@/lib/kiosk/timers";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

// A learned kiosk page (KIBO Learn), shown unchanged in a same-origin iframe, with the bridge in this parent page
// driving iframe.contentDocument. The page is never modified or given scripts (docs/SECURITY.md "Learned kiosks").
// The page keeps the learner's width (or its own fixed size, bk9) but may be laid out shorter, so it can be drawn
// larger (pageFrame); each click
// the bridge makes is drawn as a numbered mark over it, a short pause per tap so a person can follow (14-final:3).

/** How long each replayed tap stays on screen before its click; not counted in the bridge's replay time. */
const TAP_PAUSE_MS = 350;

/** E2E only: a longer pause so a screenshot can catch a mark; read per tap, so a test can set it back. */
function tapPauseMs(): number {
  const v = (window as { __kiboTapPauseMs?: unknown }).__kiboTapPauseMs;
  return typeof v === "number" && v >= 0 ? v : TAP_PAUSE_MS;
}

/** What /learned/<kioskId> says the page is; a kiosk without a line here gets the general one. */
const INTRO: Record<string, { en: string; ko: string }> = {
  doughhouse: {
    en: "A pizza kiosk KIBO learned by itself (our development kiosk).",
    ko: "KIBO가 스스로 익힌 피자 키오스크예요 (저희 개발용 키오스크).",
  },
  bunsik: {
    en: "A bunsik shop kiosk KIBO learned by itself the first time it saw it (a blind test kiosk).",
    ko: "KIBO가 처음 보고 스스로 익힌 분식집 키오스크예요 (블라인드 시험용 키오스크).",
  },
};
const INTRO_DEFAULT = { en: "A kiosk KIBO learned by itself.", ko: "KIBO가 스스로 익힌 키오스크예요." };

/** Standalone /learned/<kioskId>: owns its session like /kiosk; /demo passes its own to LearnedKioskHost. */
export function LearnedKioskApp({ kiosk }: { kiosk: KioskData }) {
  const ks = useKioskSession(kiosk.kioskId);
  return (
    <LearnedKioskHost
      kiosk={kiosk}
      session={ks.session}
      kioskToken={ks.kioskToken}
      claimUrl={ks.claimUrl}
      pairCode={ks.pairCode}
      pairUrl={ks.pairUrl}
      clockOffset={ks.clockOffset}
    />
  );
}

export function LearnedKioskHost(props: {
  kiosk: KioskData;
  session: Session | null;
  kioskToken: string | null;
  claimUrl: string | null;
  pairCode?: string | null;
  pairUrl?: string | null;
  clockOffset?: number;
  /**
   * /demo: the column is narrow, so KIBO's line is a strip under the page; otherwise a panel beside it with what the
   * page is, the QR and the code (I-101, R-006).
   */
  strip?: boolean;
  /**
   * /demo with the judge's own phone: the panel keeps only the QR and code and the replay line, because the caption
   * row above says what the page is and where to scan, so it fits beside the page at 1280×720. The page fills its box
   * there, so the dark fill is dropped: it showed as a hairline where the centred box starts on a fraction of a pixel
   * (as on the kiosk frame, #1 E).
   */
  compact?: boolean;
}) {
  const { kiosk, session, kioskToken } = props;
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [doc, setDoc] = useState<Document | null>(null);
  const [outcome, setOutcome] = useState<BridgeOutcome | null>(null);
  /** When the outcome arrived, in this browser's clock. */
  const [doneAt, setDoneAt] = useState(0);
  /** The command being replayed and the taps made so far, for the marks. */
  const [live, setLive] = useState<{ commandId: string; taps: ReplayTap[] } | null>(null);
  // Kept in a ref, not memoized: a bridge rebuilt by accident would forget what it handled and replay it twice.
  const bridge = useRef<{ doc: Document; sessionId: string; kioskToken: string; value: ReturnType<typeof createBridge> } | null>(null);
  const now = useNow();
  const frame = pageFrame(box.w, box.h, pageSizeOf(kiosk.learned ?? {}));

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The SSR'd iframe may finish loading before hydration attaches onLoad; later reloads come through onLoad.
  const attach = (el: HTMLIFrameElement | null) => {
    const d = el?.contentDocument;
    if (d && d.readyState === "complete" && d.location.href !== "about:blank") setDoc(d);
  };

  useEffect(() => {
    const pending = session?.pendingBridgeCommand;
    if (!doc || !session || !pending || !kioskToken) return;
    let b = bridge.current;
    // One bridge per page load and session; the bridge ignores a command it already handled, so new snapshots
    // of the same pending command are harmless.
    if (!b || b.doc !== doc || b.sessionId !== session.sessionId || b.kioskToken !== kioskToken) {
      const onTap = (commandId: string, tap: ReplayTap) => {
        setLive((prev) => ({ commandId, taps: prev?.commandId === commandId ? [...prev.taps, tap] : [tap] }));
        return new Promise<void>((r) => setTimeout(r, tapPauseMs()));
      };
      b = { doc, sessionId: session.sessionId, kioskToken, value: createBridge({ doc, kiosk, sessionId: session.sessionId, kioskToken, send: sendCommand, onTap }) };
      bridge.current = b;
    }
    void b.value.handle(pending, session).then((o) => {
      if (!o) return;
      setOutcome(o);
      setDoneAt(Date.now());
      // The last mark goes with the replay: what it pointed at (a sheet's button) is usually gone by now.
      setLive((l) => (l?.commandId === o.commandId ? null : l));
    });
  }, [doc, session, kioskToken, kiosk]);

  const offset = props.clockOffset ?? 0;
  // "Working…" hides only a result from before this AI turn; one that came in during it (the AI still writing its
  // reply after the replay) is the news.
  const working =
    session !== null && kiboWorking(session, now, offset) && !(outcome && doneAt + offset >= (session.phoneWorkingAt ?? Infinity));
  const caption = session ? replayCaption({ kiosk, session, result: outcome, working, live }) : null;
  // Only the latest click: the page has moved on from the earlier ones.
  const mark = live ? tapMarks(live.taps.slice(-1), frame)[0] : undefined;

  const widget = (
    <KiboWidget
      kiosk={kiosk}
      session={session}
      claimUrl={props.claimUrl}
      pairCode={props.pairCode ?? null}
      pairUrl={props.pairUrl ?? null}
      outcome={outcome}
      caption={caption}
      strip={props.strip ?? false}
      compact={props.compact ?? false}
    />
  );
  return (
    <div className={`flex h-full w-full ${props.strip ? "flex-col" : "flex-row"}`}>
      <div ref={outer} className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${props.compact ? "" : "bg-[#141210]"}`}>
        <iframe
          ref={attach}
          src={kiosk.learned?.page}
          title={kiosk.brand.name.ko}
          data-learned-kiosk
          data-page-scale={frame.scale.toFixed(3)}
          onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
          style={{
            width: frame.pageW,
            height: frame.pageH,
            transform: `translate(-50%, -50%) scale(${frame.scale})`,
            visibility: frame.scale ? "visible" : "hidden",
          }}
          className="absolute top-1/2 left-1/2 origin-center border-0 bg-white"
        />
        {mark && (
          // Drawn by KIBO over the page, never in it; the caption carries the same taps for screen readers.
          <span
            key={`${live?.commandId}:${mark.n}`}
            aria-hidden
            data-tap-mark={mark.n}
            data-tap-label={mark.label}
            style={{ left: mark.x, top: mark.y }}
            className="pointer-events-none absolute size-14 -translate-x-1/2 -translate-y-1/2"
          >
            <span className="kibo-tap absolute inset-0 rounded-full border-4 border-kibo" />
            <span className="font-display absolute inset-0 flex items-center justify-center rounded-full border-4 border-white bg-kibo text-2xl font-bold text-white shadow-card">
              {mark.n}
            </span>
          </span>
        )}
      </div>
      {widget}
    </div>
  );
}

/** KIBO's own part, outside the kiosk page: what the page is, the QR and code, the phone, and what the bridge did. */
function KiboWidget(props: {
  kiosk: KioskData;
  session: Session | null;
  claimUrl: string | null;
  pairCode: string | null;
  pairUrl: string | null;
  outcome: BridgeOutcome | null;
  caption: ReturnType<typeof replayCaption>;
  strip: boolean;
  compact: boolean;
}) {
  const { session, outcome, caption, strip, compact } = props;
  const connected = session?.phoneConnectedAt != null;
  const src = useQrSrc(connected || strip ? null : props.claimUrl);
  const intro = INTRO[props.kiosk.kioskId] ?? INTRO_DEFAULT;
  const address = props.pairUrl ?? (props.claimUrl ? `${new URL(props.claimUrl).host}/app` : null);

  const line = (
    <p
      aria-live="polite"
      data-replay-caption={caption?.tone ?? ""}
      className={`min-h-6 text-base break-words break-keep ${caption?.tone === "fail" ? "rounded-tile bg-staff-tint p-3 text-staff-ink" : ""}`}
    >
      {caption && (
        <>
          <span lang="en" className={caption.tone === "ok" ? "font-semibold" : ""}>
            {caption.en}
          </span>
          <span lang="ko" className="block text-muted">
            {caption.ko}
          </span>
        </>
      )}
    </p>
  );

  return (
    <aside
      data-learned-widget
      data-bridge-ok={session?.bridgeStatus ? String(session.bridgeStatus.lastOk) : ""}
      data-staff-called={session?.staffCalled?.reasonCode ?? ""}
      data-replay-command={outcome?.commandId ?? ""}
      data-replay-ok={outcome ? String(outcome.ok) : ""}
      data-replay-ms={outcome?.ms ?? ""}
      data-replay-taps={outcome?.taps.length ?? ""}
      aria-label="KIBO"
      className={
        strip
          ? "grid flex-none grid-cols-[auto_1fr] items-start gap-4 bg-white p-4 text-ink"
          : "flex w-[clamp(320px,28vw,440px)] flex-none flex-col gap-4 overflow-y-auto bg-cream p-6 text-ink"
      }
    >
      <p className="text-base font-bold text-kibo">KIBO</p>
      {strip ? (
        line
      ) : (
        <>
          {!compact && (
            <header className="flex flex-col gap-2">
              <h1 className="text-2xl leading-snug font-bold">{intro.en}</h1>
              <p className="text-base">Scan the QR or enter the code to order by talking.</p>
              <p lang="ko" className="text-base text-muted">
                {intro.ko} QR을 찍거나 번호를 넣고 말로 주문하세요.
              </p>
            </header>
          )}
          <section className="flex flex-col gap-3 rounded-sheet bg-white p-4 shadow-card">
            {connected ? (
              <p className="text-xl font-bold">
                Phone connected
                <span lang="ko" className="block text-base font-normal text-muted">
                  휴대폰 연결됨
                </span>
              </p>
            ) : (
              <>
                {src && props.claimUrl ? (
                  // A data URL, so next/image would add nothing.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt="주문용 QR 코드 · QR code to order"
                    data-claim-url={props.claimUrl}
                    width={208}
                    height={208}
                    className="size-52 self-center"
                  />
                ) : (
                  <span className="size-52 self-center rounded-tile bg-[#F3EEE4]" />
                )}
                {props.pairCode && address && (
                  // Centred under the centred QR, the address line balanced so "enter" never sits alone (qa 10-16).
                  <p className="flex flex-col items-center gap-1 text-center text-base">
                    <span className="text-balance">
                      Or open{" "}
                      {/* The short host stays whole; a long fallback host (no SHORT_APP_URL) may break anywhere. */}
                      <strong data-pair-url className={`${address.length <= 24 ? "whitespace-nowrap" : "break-all"} text-kibo-deep`}>
                        {address}
                      </strong>{" "}
                      and enter
                    </span>
                    <span aria-hidden data-pair-code={props.pairCode} className="font-display text-[32px] leading-tight font-bold tracking-wider tabular-nums">
                      {props.pairCode.slice(0, 3)} {props.pairCode.slice(3)}
                    </span>
                    {/* Read digit by digit, not as two numbers. */}
                    <span className="sr-only">{props.pairCode.split("").join(" ")}</span>
                  </p>
                )}
              </>
            )}
          </section>
          <section aria-label="What KIBO did on the kiosk" className="flex flex-col gap-2">
            {line}
          </section>
          {!compact && (
            <Link href="/learn" className={`${SECONDARY} mt-auto`}>
              Watch how KIBO learned it
            </Link>
          )}
        </>
      )}
    </aside>
  );
}
