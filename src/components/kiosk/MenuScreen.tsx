"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { CommandReply } from "@/lib/client/api";
import { findItem, isAvailableNow } from "@/lib/adapters/catalog";
import type { CommandType } from "@/lib/commands/schemas";
import { aiSubtitle, kt, type KioskTextKey } from "@/lib/i18n/kiosk";
import { formatWon, lineLabel, tilePrice } from "@/lib/kiosk/menu";
import type { KioskData, Locale, MenuItem } from "@/types/menu";
import type { CartLine, ChangeKind, LineInput, Session } from "@/types/session";
import { CartBar } from "./CartBar";
import { Header } from "./KioskScreen";
import { ICON_SIZES, ITEM_SIZES, KioskImage } from "./KioskImage";
import { KioskToolbar } from "./KioskToolbar";
import { ModalLayer } from "./ModalLayer";
import { ProductSheet } from "./ProductSheet";
import { UpsellPopup } from "./UpsellPopup";
import { CARD_SHADOW, FOCUS, FOCUS_INSIDE, SCRIM } from "./styles";

// K3 menu with K4 sheet, K5 upsell and the AI-change highlight (docs/UX.md Flow A6–A7, Flow B). Canvas px.

const RING_MS = 2000;
const SUBTITLE_MS = 6000;
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
  pairCode?: string | null;
  pairUrl?: string | null;
  /** Server time minus local time; lastChange.at is server time. */
  clockOffset: number;
  send(type: CommandType, args: object): Promise<CommandReply | null>;
  onClaimUrl?(claimUrl: string, pairCode?: string): void;
  /** Standalone /kiosk: [처음으로], bottom left of the cart bar. */
  startOver?: ReactNode;
  /** The phone is waiting for the AI (KioskToolbar). */
  working?: boolean;
}) {
  const { kiosk, session, send } = props;
  const { locale, domain } = kiosk;
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);

  const [category, setCategory] = useState(session.screen.category ?? kiosk.categories[0].categoryId);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [upsell, setUpsell] = useState<string[] | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [recentTouch, setRecentTouch] = useState(false);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSeq = useRef(0);
  const rail = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  // A new lastChange starts the 2 s ring. The change present when the menu opened is replayed only if it is
  // under 2 s old: a phone's first add is what moves the kiosk from K2 to K3 (Flow A6), an old one is not news.
  const lc = session.lastChange;
  const changeKey = lc ? `${lc.at}:${lc.kind}:${lc.lineId}:${lc.source}` : null;
  const [seenKey, setSeenKey] = useState(() =>
    lc && Date.now() + props.clockOffset - lc.at < RING_MS ? null : changeKey,
  );
  const [flash, setFlash] = useState<Flash | null>(null);
  // KIBO's English line under an AI change on a Korean kiosk (judges, tourists). It stays longer than the 2 s ring:
  // a whole set with its options takes a few seconds to read.
  const [subtitle, setSubtitle] = useState<{ key: string; text: string } | null>(null);
  if (changeKey !== seenKey) {
    setSeenKey(changeKey);
    if (lc && changeKey) {
      const ai = lc.source === "voice" || lc.source === "text";
      const itemId = lc.kind === "undo" || lc.kind === "clear" ? null : (session.screen.itemId ?? null);
      const line = session.cart.find((l) => l.lineId === lc.lineId);
      const name = line ? lineLabel(kiosk, line, locale).title : itemId ? (findItem(kiosk, itemId)?.name[locale] ?? "") : "";
      const text = kt(AI_TEXT[lc.kind], locale, domain);
      let subtitle: string | null = null;
      if (ai && locale !== "en") {
        const en = line ? lineLabel(kiosk, line, "en") : null;
        const enName = en ? [en.title, en.detail].filter(Boolean).join(" · ") : itemId ? (findItem(kiosk, itemId)?.name.en ?? "") : "";
        subtitle = aiSubtitle(lc.kind, domain, enName);
      }
      setFlash({ key: changeKey, lineId: lc.lineId, itemId, status: ai ? (name ? `${text}: ${name}` : text) : null });
      if (subtitle) setSubtitle({ key: changeKey, text: subtitle });
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

  useEffect(() => {
    if (!subtitle) return;
    const t = setTimeout(() => setSubtitle(null), SUBTITLE_MS);
    return () => clearTimeout(t);
  }, [subtitle]);

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

  const shownPending = pending.filter((p) => p.version === null || session.cartVersion < p.version);
  const lines = [
    ...session.cart.map((line) => ({ line, pending: false })),
    ...shownPending.map((p) => ({ line: p.line, pending: true })),
  ];
  // Preview only; the server's total is the truth once the stream catches up.
  const total = session.total + shownPending.reduce((sum, p) => sum + p.line.unitPrice * p.line.qty, 0);
  const items = kiosk.items.filter((i) => i.category === category);
  const railMore = useMoreBelow(rail, kiosk.categories.length);
  const gridMore = useMoreBelow(grid, items.length);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onPointerDownCapture={onTouch}>
      <Header kiosk={kiosk} />
      <KioskToolbar
        kiosk={kiosk}
        session={session}
        claimUrl={props.claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl}
        send={send}
        onClaimUrl={props.onClaimUrl}
        status={flash?.status ?? null}
        subtitle={subtitle?.text ?? null}
        working={props.working}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Keyboard focus scrolls a control clear of the fade below and its own ring clear of the edges (#1 22). */}
        <nav ref={rail} aria-label={kt("categories", locale, domain)} className="flex w-65 flex-none scroll-pb-24 flex-col gap-2 overflow-y-auto bg-(--k-panel) py-4">
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
                } ${FOCUS_INSIDE}`}
              >
                <span className={`relative size-20 overflow-hidden rounded-full bg-white ${current ? "ring-4 ring-(--k-primary)" : ""}`}>
                  <KioskImage src={c.icon} sizes={ICON_SIZES} inset="p-3" />
                </span>
                <span className="k-text-40">{c.name[locale]}</span>
              </button>
            );
          })}
        </nav>

        <div ref={grid} className="min-h-0 flex-1 scroll-pt-4 scroll-pb-28 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-8">
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
        {/* A tile or category cut at the cart bar read as broken (#1 item 3): fade both columns out while they hold
            more below. Overlays beside the scroll areas, so they stay put and let taps through. */}
        {railMore && (
          <div aria-hidden data-menu-more="rail" className="pointer-events-none absolute bottom-0 left-0 h-24 w-65 bg-linear-to-b from-(--k-panel)/0 to-(--k-panel)" />
        )}
        {gridMore && (
          <div aria-hidden data-menu-more="grid" className="pointer-events-none absolute right-0 bottom-0 left-65 h-24 bg-linear-to-b from-(--k-bg)/0 to-(--k-bg)" />
        )}
      </div>

      <CartBar
        kiosk={kiosk}
        lines={lines}
        total={total}
        ringLineId={flash?.lineId ?? null}
        ringKey={flash?.key ?? null}
        onClear={() => setClearOpen(true)}
        onOrder={() => void send("requestCheckout", {})}
        startOver={props.startOver}
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

/**
 * An English name whose longest word would not fit the tile at 48px ("Cheeseburger", "Rechargeable") gets a smaller
 * size, so it wraps only between words (14-final:4): the canvas's lang="ko" rule lets a word that does not fit break
 * anywhere ("Cheeseburge / r"), which stays as the last resort under WCAG 1.4.12 spacing. About 0.6em per bold
 * Latin letter; at the tile's ~300px a 12-letter word gets ~42px, above the 40px kiosk minimum.
 */
function latinFit(name: string, locale: Locale): CSSProperties | undefined {
  if (locale === "ko") return undefined;
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  return longest > 10 ? { fontSize: `min(calc(48px * var(--k-fs, 1)), calc(100cqi / ${(longest * 0.6).toFixed(1)}))` } : undefined;
}

function ProductTile(props: { kiosk: KioskData; item: MenuItem; available: boolean; ring: boolean; onOpen(): void }) {
  const { item } = props;
  const { locale, domain } = props.kiosk;
  const blocked = item.soldOut ? kt("soldOut", locale, domain) : !props.available ? kt("notNow", locale) : null;
  return (
    <button
      type="button"
      disabled={blocked !== null}
      onClick={props.onOpen}
      className={`relative flex flex-col overflow-hidden rounded-[32px] bg-white text-left active:bg-(--k-primary-tint) ${
        props.ring ? "k-ring" : CARD_SHADOW
      } ${FOCUS}`}
    >
      <span className="relative block h-68 w-full flex-none">
        <KioskImage src={item.image} sizes={ITEM_SIZES} />
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
      {/* Name, then a large price; kcal sits quietly beside the price (14-final:2). */}
      <span className="flex flex-1 flex-col px-7 pt-5 pb-7 [container-type:inline-size]">
        <span className="k-text-48 font-bold" style={latinFit(item.name[locale], locale)}>
          {item.name[locale]}
        </span>
        {item.subtitle && <span className="k-text-40 text-[#4B463F]">{item.subtitle[locale]}</span>}
        <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-4 pt-3">
          <span className="k-text-56 font-display font-bold text-(--k-primary)">{formatWon(tilePrice(item), locale)}</span>
          {item.kcal !== null && (
            <span className="k-text-40 text-[#4B463F]">
              {item.kcal} {kt("kcal", locale)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ConfirmClear(props: { kiosk: KioskData; onCancel(): void; onConfirm(): void }) {
  const { locale, domain } = props.kiosk;
  return (
    <ModalLayer className={`${SCRIM} flex items-center justify-center p-12`}>
      <section role="alertdialog" aria-modal aria-labelledby="clear-title" className="flex w-full flex-col gap-10 rounded-[48px] bg-(--k-bg) p-12">
        <h2 id="clear-title" className="k-text-56 text-center font-bold">
          {kt("clearConfirm", locale, domain)}
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
    </ModalLayer>
  );
}

/** True while a scroll area holds more than it shows below (the cart bar's row does the same sideways). */
function useMoreBelow(el: RefObject<HTMLElement | null>, count: number): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const check = () => setMore(node.scrollHeight - node.scrollTop - node.clientHeight > 1);
    check();
    node.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(node);
    return () => {
      node.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [el, count]);
  return more;
}
