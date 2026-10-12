"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQrSrc } from "@/hooks/useQrSrc";
import type { CommandReply } from "@/lib/client/api";
import { findItem, isAvailableNow } from "@/lib/adapters/catalog";
import type { CommandType } from "@/lib/commands/schemas";
import { kt, type KioskTextKey } from "@/lib/i18n/kiosk";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, MenuItem } from "@/types/menu";
import type { CartLine, ChangeKind, LineInput, Session } from "@/types/session";
import { CartBar } from "./CartBar";
import { Header } from "./KioskScreen";
import { ProductSheet } from "./ProductSheet";
import { UpsellPopup } from "./UpsellPopup";
import { FOCUS, SCRIM } from "./styles";

// K3 menu with K4 sheet, K5 upsell and the AI-change highlight (docs/UX.md Flow A6–A7, Flow B). Canvas px.

const RING_MS = 2000;
/** An AI change does not move the screen if someone touched the kiosk this recently. */
const TOUCH_HOLD_MS = 5000;

const AI_TEXT: Record<ChangeKind, KioskTextKey> = {
  add: "aiAdd",
  update: "aiUpdate",
  remove: "aiRemove",
  undo: "aiUndo",
  clear: "aiClear",
};

// Availability changes by the minute (breakfast hours), so a minute clock is enough.
function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

interface Flash {
  key: string;
  lineId: string | null;
  itemId: string | null;
  /** Status line text; null for touch changes, which get the ring only. */
  status: string | null;
}

interface Pending {
  id: string;
  line: CartLine;
  /** cartVersion of the accepted reply; the line stays until the stream reaches it. */
  version: number | null;
}

export function MenuScreen(props: {
  kiosk: KioskData;
  session: Session;
  claimUrl: string | null;
  send(type: CommandType, args: object): Promise<CommandReply | null>;
  onClaimUrl(claimUrl: string): void;
}) {
  const { kiosk, session, send } = props;
  const locale = kiosk.locale;
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);

  const [category, setCategory] = useState(session.screen.category ?? kiosk.categories[0].categoryId);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [upsell, setUpsell] = useState<string[] | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [recentTouch, setRecentTouch] = useState(false);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSeq = useRef(0);

  // A new lastChange starts the 2 s ring; the change present when the menu opened is not replayed.
  const lc = session.lastChange;
  const changeKey = lc ? `${lc.at}:${lc.kind}:${lc.lineId}:${lc.source}` : null;
  const [seenKey, setSeenKey] = useState(changeKey);
  const [flash, setFlash] = useState<Flash | null>(null);
  if (changeKey !== seenKey) {
    setSeenKey(changeKey);
    if (lc && changeKey) {
      const ai = lc.source === "voice" || lc.source === "text";
      const itemId = lc.kind === "undo" || lc.kind === "clear" ? null : (session.screen.itemId ?? null);
      const line = session.cart.find((l) => l.lineId === lc.lineId);
      const name = line ? lineLabel(kiosk, line, locale).title : itemId ? (findItem(kiosk, itemId)?.name[locale] ?? "") : "";
      const text = kt(AI_TEXT[lc.kind], locale);
      setFlash({ key: changeKey, lineId: lc.lineId, itemId, status: ai ? (name ? `${text}: ${name}` : text) : null });
      // Never move the screen under someone choosing (sheet open or a touch in the last 5 s).
      const target = session.screen.category;
      if (ai && target && !sheetItem && !recentTouch) setCategory(target);
    }
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), RING_MS);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => () => clearTimeout(touchTimer.current), []);

  function onTouch() {
    setRecentTouch(true);
    clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setRecentTouch(false), TOUCH_HOLD_MS);
  }

  /** Optimistic add: the line shows at once, the server decides, and a refusal rolls it back. */
  async function add(input: Required<LineInput>, unitPrice: number, offerUpsell: boolean) {
    const id = `pending_${++pendingSeq.current}`;
    const line: CartLine = { lineId: id, ...input, unitPrice };
    setPending((p) => [...p.filter((x) => x.version === null || session.cartVersion < x.version), { id, line, version: null }]);
    const reply = await send("addToCart", input);
    if (!reply) {
      setPending((p) => p.filter((x) => x.id !== id));
      return;
    }
    setPending((p) => p.map((x) => (x.id === id ? { ...x, version: reply.cartVersion } : x)));
    if (offerUpsell && reply.result?.upsell) setUpsell(reply.result.upsell.offerItemIds);
  }

  async function connectOtherPhone() {
    const reply = await send("reissueClaim", {});
    if (reply?.claimUrl) {
      props.onClaimUrl(reply.claimUrl);
      setQrOpen(true);
    }
  }

  const shownPending = pending.filter((p) => p.version === null || session.cartVersion < p.version);
  const lines = [
    ...session.cart.map((line) => ({ line, pending: false })),
    ...shownPending.map((p) => ({ line: p.line, pending: true })),
  ];
  // Preview only; the server's total is the truth once the stream catches up.
  const total = session.total + shownPending.reduce((sum, p) => sum + p.line.unitPrice * p.line.qty, 0);
  const items = kiosk.items.filter((i) => i.category === category);
  const phoneConnected = session.phoneConnectedAt !== null;

  return (
    <div className="relative flex h-full flex-col" onPointerDownCapture={onTouch}>
      <Header kiosk={kiosk} />
      <div className="flex h-28 flex-none items-center justify-between gap-6 bg-[#F3EEE4] px-12">
        {session.dineOption ? (
          <span className="k-text-40 rounded-full bg-(--k-primary) px-8 py-2 font-bold text-white">
            {kt(session.dineOption === "eat_in" ? "dineChip" : "takeOutChip", locale)}
          </span>
        ) : (
          <span />
        )}
        {phoneConnected ? (
          <div className="flex items-center gap-6">
            <span className="k-text-40 flex items-center gap-3 font-bold text-(--k-primary-dark)">
              <PhoneIcon />
              {kt("phoneConnectedShort", locale)}
            </span>
            <button
              type="button"
              onClick={() => void connectOtherPhone()}
              className={`k-text-40 min-h-22 rounded-full border-4 border-[#1E1B18] bg-white px-8 font-bold ${FOCUS}`}
            >
              {kt("connectOtherPhone", locale)}
            </button>
          </div>
        ) : (
          <SmallQrButton claimUrl={props.claimUrl} label={kt("openQr", locale)} onOpen={() => setQrOpen(true)} />
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        <nav aria-label={kt("categories", locale)} className="flex w-65 flex-none flex-col gap-2 overflow-y-auto bg-[#F3EEE4] py-4">
          {kiosk.categories.map((c) => {
            const current = c.categoryId === category;
            return (
              <button
                key={c.categoryId}
                type="button"
                aria-current={current || undefined}
                onClick={() => setCategory(c.categoryId)}
                className={`flex flex-none flex-col items-center gap-2 border-l-8 px-4 py-4 ${
                  current ? "border-(--k-primary) bg-white font-bold text-(--k-primary-dark)" : "border-transparent text-[#33302B]"
                } ${FOCUS}`}
              >
                <span className="relative size-20 overflow-hidden rounded-full bg-white">
                  <Image src={c.icon} alt="" fill sizes="80px" className="object-cover" />
                </span>
                <span className="k-text-40">{c.name[locale]}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-6">
            {items.map((item) => {
              const ring = flash?.itemId === item.itemId;
              return (
                <ProductTile
                  key={ring ? `${item.itemId}:${flash?.key}` : item.itemId}
                  kiosk={kiosk}
                  item={item}
                  available={isAvailableNow(item, now)}
                  ring={ring}
                  onOpen={() => setSheetItem(item)}
                />
              );
            })}
          </div>
        </div>

        <div aria-live="polite" className="pointer-events-none absolute inset-x-12 top-6 z-10 flex justify-center">
          {flash?.status && (
            <p className="k-text-48 rounded-full bg-(--k-primary-dark) px-12 py-4 font-bold text-white shadow-[0_8px_24px_rgba(30,27,24,0.25)]">
              {flash.status}
            </p>
          )}
        </div>
      </div>

      <CartBar
        kiosk={kiosk}
        lines={lines}
        total={total}
        ringLineId={flash?.lineId ?? null}
        ringKey={flash?.key ?? null}
        onClear={() => setClearOpen(true)}
        onOrder={() => void send("requestCheckout", {})}
      />

      {sheetItem && (
        <ProductSheet
          key={sheetItem.itemId}
          kiosk={kiosk}
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onAdd={(input, unitPrice) => {
            setSheetItem(null);
            void add(input, unitPrice, true);
          }}
        />
      )}
      {upsell && (
        <UpsellPopup
          kiosk={kiosk}
          offerItemIds={upsell}
          onClose={() => setUpsell(null)}
          onAdd={(itemId) => {
            setUpsell(null);
            const item = findItem(kiosk, itemId);
            if (item) void add({ itemId, variant: "single", qty: 1, selections: {} }, item.variants[0].price, false);
          }}
        />
      )}
      {qrOpen && <QrSheet kiosk={kiosk} claimUrl={props.claimUrl} onClose={() => setQrOpen(false)} />}
      {clearOpen && (
        <ConfirmClear
          kiosk={kiosk}
          onCancel={() => setClearOpen(false)}
          onConfirm={() => {
            setClearOpen(false);
            void send("clearCart", {});
          }}
        />
      )}
    </div>
  );
}

function ProductTile(props: { kiosk: KioskData; item: MenuItem; available: boolean; ring: boolean; onOpen(): void }) {
  const { item } = props;
  const locale = props.kiosk.locale;
  const blocked = item.soldOut ? kt("soldOut", locale) : !props.available ? kt("notNow", locale) : null;
  return (
    <button
      type="button"
      disabled={blocked !== null}
      onClick={props.onOpen}
      className={`relative flex flex-col overflow-hidden rounded-[32px] border-4 border-[#E2DACB] bg-white text-left active:border-(--k-primary) ${
        props.ring ? "k-ring" : ""
      } ${FOCUS}`}
    >
      <span className="relative block h-68 w-full flex-none">
        <Image src={item.image} alt="" fill sizes="380px" className="object-cover" />
        {blocked && (
          <span className="k-text-48 absolute inset-0 flex items-center justify-center bg-[#FFF1CC]/90 px-6 text-center font-bold text-[#7A2E0E]">
            {blocked}
          </span>
        )}
      </span>
      {item.badge && (
        <span
          className={`k-text-40 absolute top-4 left-4 rounded-full px-6 font-display font-bold ${
            item.badge === "best" ? "bg-(--k-accent) text-[#1E1B18]" : "bg-(--k-primary) text-white"
          }`}
        >
          {kt(item.badge === "best" ? "badgeBest" : "badgeNew", locale)}
        </span>
      )}
      <span className="flex flex-col px-6 pt-4 pb-6">
        <span className="k-text-40 font-bold">{item.name[locale]}</span>
        <span className="k-text-40 font-bold text-(--k-primary)">{formatWon(item.variants[0].price)}</span>
        <span className="k-text-40 text-[#4B463F]">
          {item.kcal} {kt("kcal", locale)}
        </span>
      </span>
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  );
}

/** Flow B: the small QR on the menu; tapping it shows the QR large. The cart is kept when a phone joins. */
function SmallQrButton(props: { claimUrl: string | null; label: string; onOpen(): void }) {
  const src = useQrSrc(props.claimUrl);
  return (
    <button
      type="button"
      onClick={props.onOpen}
      disabled={!props.claimUrl}
      className={`k-text-40 flex min-h-22 items-center gap-4 rounded-full border-4 border-(--k-primary) bg-white py-1 pr-8 pl-2 font-bold text-(--k-primary-dark) ${FOCUS}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={72} height={72} className="size-18 rounded-full" />
      ) : (
        <span className="size-18" />
      )}
      {props.label}
    </button>
  );
}

function QrSheet(props: { kiosk: KioskData; claimUrl: string | null; onClose(): void }) {
  const locale = props.kiosk.locale;
  const src = useQrSrc(props.claimUrl);
  return (
    <div className={`${SCRIM} flex items-center justify-center p-12`} onClick={props.onClose}>
      <section
        role="dialog"
        aria-modal
        aria-labelledby="qr-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col items-center gap-10 rounded-[48px] bg-(--k-bg) p-12 text-center"
      >
        <h2 id="qr-title" className="k-text-56 font-bold">
          {kt("qrSheetTitle", locale)}
        </h2>
        {src && props.claimUrl ? (
          // A data URL, so next/image would add nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={kt("qrAlt", locale)} data-claim-url={props.claimUrl} width={600} height={600} className="size-150" />
        ) : (
          <p className="k-text-40 flex size-150 items-center justify-center rounded-[32px] bg-[#F3EEE4] p-8 text-[#4B463F]">
            {kt("qrLoading", locale)}
          </p>
        )}
        <p className="k-text-40 text-[#4B463F]">{kt("qrSheetHint", locale)}</p>
        <button
          type="button"
          onClick={props.onClose}
          className={`k-text-48 min-h-32 w-full rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
        >
          {kt("close", locale)}
        </button>
      </section>
    </div>
  );
}

function ConfirmClear(props: { kiosk: KioskData; onCancel(): void; onConfirm(): void }) {
  const locale = props.kiosk.locale;
  return (
    <div className={`${SCRIM} flex items-center justify-center p-12`}>
      <section role="alertdialog" aria-modal aria-labelledby="clear-title" className="flex w-full flex-col gap-10 rounded-[48px] bg-(--k-bg) p-12">
        <h2 id="clear-title" className="k-text-56 text-center font-bold">
          {kt("clearConfirm", locale)}
        </h2>
        <div className="grid grid-cols-2 gap-8">
          <button
            type="button"
            onClick={props.onCancel}
            className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
          >
            {kt("cancel", locale)}
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className={`k-text-48 min-h-32 rounded-full bg-[#7A2E0E] font-bold text-white ${FOCUS}`}
          >
            {kt("clearYes", locale)}
          </button>
        </div>
      </section>
    </div>
  );
}
