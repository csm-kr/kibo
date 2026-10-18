import { formatWon } from "@/lib/kiosk/menu";
import type { KioskData, LearnedKiosk } from "@/types/menu";
import type { CartLine, PendingBridgeCommand, Session } from "@/types/session";

// What KIBO shows around a learned kiosk page while the bridge replays (14-final:3): how big the page can be drawn,
// a numbered mark at each click the bridge really made, and one line that says "done" only after the server checked
// the kiosk's own total. Pure, so the overlay never shows a step that did not happen.

/** The learner's viewport width; the page always lays out at this width, as it was learned. */
export const PAGE_W = 1080;
/** The learner's viewport height; the page is never laid out taller. */
export const MAX_PAGE_H = 1600;
/**
 * The shortest layout height. The page's cart bar and sheets are fixed to the viewport and its menu scrolls, so a
 * shorter page keeps every label; laid out shorter, it can be drawn larger (≥ 0.8× in a 900 px tall box).
 */
export const MIN_PAGE_H = 1120;

/** One click the bridge made: the target's label and its box in the page's own pixels, before the click. */
export interface ReplayTap {
  n: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A finished replay as this page saw it. */
export interface ReplayResult {
  commandId: string;
  change: PendingBridgeCommand;
  /** The session cart when the replay started, so a removal can be named. */
  cartBefore: CartLine[];
  taps: ReplayTap[];
  /** The bridge's own check: the kiosk's cart lines are what the change should give. */
  ok: boolean;
  /** The report reached the server. */
  reported: boolean;
  kioskTotal: number | null;
}

/** The page's layout width and the heights it may be laid out at. */
export interface PageSize {
  w: number;
  minH: number;
  maxH: number;
}

/** A page drawn at a fixed size keeps it (bk9's 720×1280, I-405); others take the learner's width and 1120–1600. */
export function pageSizeOf(learned: Pick<LearnedKiosk, "pageSize">): PageSize {
  const p = learned.pageSize;
  return p ? { w: p.width, minH: p.height, maxH: p.height } : { w: PAGE_W, minH: MIN_PAGE_H, maxH: MAX_PAGE_H };
}

export interface PageFrame {
  scale: number;
  pageW: number;
  pageH: number;
  /** Where the scaled page starts inside the box. */
  left: number;
  top: number;
}

/** The page's layout height and scale for a box: as large as fits, never wider than the box, centred. */
export function pageFrame(boxW: number, boxH: number, page: PageSize = pageSizeOf({})): PageFrame {
  if (boxW <= 0 || boxH <= 0) return { scale: 0, pageW: page.w, pageH: page.maxH, left: 0, top: 0 };
  const scale = Math.min(boxW / page.w, boxH / page.minH);
  const pageH = Math.min(page.maxH, Math.max(page.minH, boxH / scale));
  return { scale, pageW: page.w, pageH, left: (boxW - page.w * scale) / 2, top: (boxH - pageH * scale) / 2 };
}

export interface TapMark {
  n: number;
  label: string;
  /** Centre in the box's pixels. */
  x: number;
  y: number;
}

/** A mark per tap whose target was on the visible page; one scrolled out of view is left to the caption. */
export function tapMarks(
  taps: ReplayTap[],
  frame: Pick<PageFrame, "scale" | "left" | "top" | "pageH"> & Partial<Pick<PageFrame, "pageW">>,
): TapMark[] {
  const pageW = frame.pageW ?? PAGE_W;
  return taps
    .filter((t) => {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      return cx >= 0 && cx <= pageW && cy >= 0 && cy <= frame.pageH;
    })
    .map((t) => ({
      n: t.n,
      label: t.label,
      x: frame.left + (t.x + t.w / 2) * frame.scale,
      y: frame.top + (t.y + t.h / 2) * frame.scale,
    }));
}

/** The label as a person would say it: the price the kiosk prints after an option is dropped. */
export function tapLabel(label: string): string {
  return label.replace(/\s*\([+-]?[\d,]+원\)\s*$/, "").trim();
}

export interface Caption {
  ko: string;
  en: string;
  tone: "busy" | "checking" | "ok" | "fail";
}

const DINE = { eat_in: { ko: "매장", en: "Eat here." }, take_out: { ko: "포장", en: "Take out." } } as const;

function headline(kiosk: KioskData, r: ReplayResult): { ko: string; en: string } {
  const c = r.change;
  const name = (itemId: string | undefined) => kiosk.items.find((i) => i.itemId === itemId)?.name;
  if (c.type === "setDineOption") return DINE[c.args.option];
  if (c.type === "addToCart") {
    const n = name(c.args.itemId);
    return n ? { ko: `담았어요: ${n.ko}`, en: `Added: ${n.en}.` } : { ko: "담았어요", en: "Added." };
  }
  const n = name(r.cartBefore[c.lineIndex]?.itemId);
  return n ? { ko: `뺐어요: ${n.ko}`, en: `Removed: ${n.en}.` } : { ko: "뺐어요", en: "Removed." };
}

const FAIL = {
  ko: "키오스크 장바구니가 예상과 달라 담지 않았어요. 화면을 확인해 주세요. 직원을 불렀어요.",
  en: "The kiosk's cart did not match, so nothing was added. Please check the screen. Staff is on the way.",
};

/**
 * The one line under (or beside) the learned kiosk. "Done" needs the bridge's own line check, a delivered report and
 * the server's total check (session.bridgeStatus after the command left pendingBridgeCommand).
 */
export function replayCaption(input: {
  kiosk: KioskData;
  session: Session;
  result: ReplayResult | null;
  working: boolean;
  /** Taps made so far by the replay running now. */
  live?: { commandId: string; taps: ReplayTap[] } | null;
}): Caption | null {
  const { kiosk, session: s, result: r } = input;
  const pending = s.pendingBridgeCommand;
  if (pending && pending.commandId !== r?.commandId) {
    const now = input.live?.commandId === pending.commandId ? input.live.taps.at(-1) : undefined;
    const label = now && tapLabel(now.label);
    return {
      ko: `KIBO가 키오스크를 누르고 있어요…${now ? ` ${now.n}번째: ${label}` : ""}`,
      en: `KIBO is tapping the kiosk…${now ? ` tap ${now.n}: ${label}` : ""}`,
      tone: "busy",
    };
  }
  // The phone is waiting for the AI: an older result would read as done before anything happened (I-221).
  if (input.working && !s.pendingBridgeCommand) return { ko: "처리하고 있어요…", en: "KIBO is working…", tone: "busy" };
  if (!r) return s.bridgeStatus && !s.bridgeStatus.lastOk ? { ...FAIL, tone: "fail" } : null;

  const n = r.taps.length;
  const chain = r.taps.map((t) => tapLabel(t.label)).join(" → ");
  const tapped = { ko: `${n}번 눌렀어요`, en: `KIBO tapped ${chain} · ${n} ${n === 1 ? "tap" : "taps"}` };
  const head = headline(kiosk, r);
  if (!r.reported) {
    return { ko: `${tapped.ko} · 결과를 확인하지 못했어요. 화면을 확인해 주세요.`, en: `${tapped.en} · KIBO could not confirm this change. Please check the screen.`, tone: "fail" };
  }
  if (s.pendingBridgeCommand?.commandId === r.commandId || !s.bridgeStatus) {
    return { ko: `${tapped.ko} · 합계 확인 중…`, en: `${tapped.en} · checking the kiosk total…`, tone: "checking" };
  }
  if (!r.ok || !s.bridgeStatus.lastOk) return { ko: FAIL.ko, en: `${tapped.en} · ${FAIL.en}`, tone: "fail" };
  const total =
    r.kioskTotal === null
      ? { ko: "키오스크 장바구니 확인 ✓", en: "kiosk cart checked ✓" }
      : { ko: `키오스크 합계 ${formatWon(r.kioskTotal, "ko")} ✓ 일치`, en: `kiosk total ${formatWon(r.kioskTotal, "ko")} ✓ matches` };
  return { ko: `${head.ko} · ${tapped.ko} · ${total.ko}`, en: `${head.en} ${tapped.en} · ${total.en}`, tone: "ok" };
}
