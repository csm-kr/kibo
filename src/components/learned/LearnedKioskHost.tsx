"use client";

import { useEffect, useRef, useState } from "react";
import { PausedLayer } from "@/components/PausedLayer";
import { useKioskSession } from "@/hooks/useKioskSession";
import { kt } from "@/lib/i18n/kiosk";
import { useQrSrc } from "@/hooks/useQrSrc";
import { createBridge, type BridgeOutcome } from "@/lib/bridge/bridge";
import { sendCommand } from "@/lib/client/api";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

// A learned kiosk page (KIBO Learn), shown unchanged in a same-origin iframe, with the bridge in this parent page
// driving iframe.contentDocument. The page is never modified or given scripts (docs/SECURITY.md "Learned kiosks").

/** The learner's viewport, so the page lays out as it did while learning. */
const PAGE_W = 1080;
const PAGE_H = 1600;

/** Standalone /learned/<kioskId>: owns its session like /kiosk; /demo passes its own to LearnedKioskHost. */
export function LearnedKioskApp({ kiosk }: { kiosk: KioskData }) {
  const ks = useKioskSession(kiosk.kioskId);
  return (
    <>
      <LearnedKioskHost kiosk={kiosk} session={ks.session} kioskToken={ks.kioskToken} claimUrl={ks.claimUrl} />
      {/* The bridge reads commands from the stream too, so a paused page replays nothing until tapped. */}
      {ks.paused && <PausedLayer kiosk lines={[kt("streamPaused", "ko"), kt("streamPaused", "en")]} onResume={ks.resume} />}
    </>
  );
}

export function LearnedKioskHost(props: {
  kiosk: KioskData;
  session: Session | null;
  kioskToken: string | null;
  claimUrl: string | null;
  /**
   * /demo: the column has no letterbox, so the widget becomes a strip under the page instead of a card over its
   * tiles (I-101, R-006).
   */
  strip?: boolean;
}) {
  const { kiosk, session, kioskToken } = props;
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [doc, setDoc] = useState<Document | null>(null);
  const [outcome, setOutcome] = useState<BridgeOutcome | null>(null);
  // Kept in a ref, not memoized: a bridge rebuilt by accident would forget what it handled and replay it twice.
  const bridge = useRef<{ doc: Document; sessionId: string; kioskToken: string; value: ReturnType<typeof createBridge> } | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / PAGE_W, height / PAGE_H));
    });
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
      b = { doc, sessionId: session.sessionId, kioskToken, value: createBridge({ doc, kiosk, sessionId: session.sessionId, kioskToken, send: sendCommand }) };
      bridge.current = b;
    }
    void b.value.handle(pending, session).then((o) => {
      if (o) setOutcome(o);
    });
  }, [doc, session, kioskToken, kiosk]);

  const widget = <KiboWidget kiosk={kiosk} session={session} claimUrl={props.claimUrl} outcome={outcome} strip={props.strip ?? false} />;
  return (
    <div className="flex h-full w-full flex-col">
      <div ref={outer} className="relative min-h-0 w-full flex-1 overflow-hidden bg-[#141210]">
        <iframe
          ref={attach}
          src={kiosk.learned?.page}
          title={kiosk.brand.name.ko}
          data-learned-kiosk
          onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
          style={{
            width: PAGE_W,
            height: PAGE_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
            visibility: scale ? "visible" : "hidden",
          }}
          className="absolute top-1/2 left-1/2 origin-center border-0 bg-white"
        />
        {!props.strip && widget}
      </div>
      {props.strip && widget}
    </div>
  );
}

function status(kiosk: KioskData, s: Session): { ko: string; en: string } | null {
  if (s.pendingBridgeCommand) return { ko: "KIBO가 주문을 입력하고 있어요…", en: "KIBO is entering your order…" };
  if (!s.bridgeStatus) return null;
  if (!s.bridgeStatus.lastOk) return { ko: "화면을 확인해 주세요. 직원을 불렀어요.", en: "Please check the screen. Staff is on the way." };
  const change = s.lastChange;
  const line = change?.kind === "add" && change.at === s.bridgeStatus.at ? s.cart.find((l) => l.lineId === change.lineId) : null;
  const item = line ? kiosk.items.find((i) => i.itemId === line.itemId) : null;
  if (item) return { ko: `담았어요: ${item.name.ko}`, en: `Added: ${item.name.en}` };
  return { ko: "키오스크에 반영했어요", en: "Done on the kiosk" };
}

/** KIBO's own card, outside the kiosk page: QR, phone state, and what the bridge is doing. A corner card, or a strip. */
function KiboWidget(props: {
  kiosk: KioskData;
  session: Session | null;
  claimUrl: string | null;
  outcome: BridgeOutcome | null;
  strip: boolean;
}) {
  const { session, outcome } = props;
  const connected = session?.phoneConnectedAt != null;
  const src = useQrSrc(connected ? null : props.claimUrl);
  const line = session ? status(props.kiosk, session) : null;

  return (
    <aside
      data-learned-widget
      data-bridge-ok={session?.bridgeStatus ? String(session.bridgeStatus.lastOk) : ""}
      data-staff-called={session?.staffCalled?.reasonCode ?? ""}
      data-replay-command={outcome?.commandId ?? ""}
      data-replay-ok={outcome ? String(outcome.ok) : ""}
      data-replay-ms={outcome?.ms ?? ""}
      aria-label="KIBO"
      className={
        props.strip
          ? "grid flex-none grid-cols-[auto_1fr_1fr] items-start gap-4 bg-white p-4 text-[#15171C]"
          : "absolute top-4 right-4 flex w-72 flex-col gap-3 rounded-[18px] bg-white p-4 text-[#15171C] shadow-lg"
      }
    >
      <p className="text-base font-bold text-[#3446D4]">KIBO</p>
      {connected ? (
        <p className="text-lg font-bold">
          휴대폰 연결됨
          <span className="block text-base font-normal text-[#4B463F]">Phone connected</span>
        </p>
      ) : (
        <>
          <p className="text-lg font-bold">
            말로 주문하기
            <span className="block text-base font-normal text-[#4B463F]">Order by talking</span>
          </p>
          {src && props.claimUrl ? (
            // A data URL, so next/image would add nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt="주문용 QR 코드 · QR code to order"
              data-claim-url={props.claimUrl}
              width={240}
              height={240}
              className="size-60 self-center"
            />
          ) : (
            <span className="size-60 self-center rounded-[18px] bg-[#F3EEE4]" />
          )}
        </>
      )}
      <p aria-live="polite" className="min-h-6 text-base">
        {line && (
          <>
            {line.ko}
            <span className="block text-[#4B463F]">{line.en}</span>
          </>
        )}
      </p>
    </aside>
  );
}
