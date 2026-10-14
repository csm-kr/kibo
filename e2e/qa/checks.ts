import { appendFileSync, mkdirSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";

// UI QA checks (docs/UI_QA.md "Automating (Playwright)"). H = hard gate, T = KIBO target (logged only).
// Thresholds come from docs/UI_QA.md "KIBO numbers" and "Visual standard"; do not loosen them to pass.
// Functions passed to page.evaluate run in the browser, so each one is self-contained.

export interface Profile {
  /** Name in the report. */
  route: string;
  /** Element the checks scan (the kiosk canvas, or body on the phone). */
  root: string;
  /** Design width of the root in px when it is a scaled canvas; boxes are divided by the scale. */
  canvasWidth?: number;
  /** Smallest allowed font size (canvas px on the kiosk, CSS px on the phone). */
  minFont: number;
  /** Smallest allowed target side. */
  minTarget: number;
}

export const KIOSK: Profile = { route: "/kiosk", root: "[data-kiosk-canvas]", canvasWidth: 1080, minFont: 40, minTarget: 40 };
export const PHONE: Profile = { route: "/assistant", root: "body", minFont: 16, minTarget: 56 };
/** /demo: the intro, or the phone column of the split. The kiosk half is the scaled canvas, measured at full size by KIOSK. */
export const DEMO: Profile = { route: "/demo", root: "[data-demo-check]", minFont: 16, minTarget: 56 };
/** /demo: the D2 scenario guide column, judged by the phone numbers like the phone column next to it. */
export const DEMO_GUIDE: Profile = { route: "/demo", root: "[data-scenario-guide]", minFont: 16, minTarget: 56 };
/** /learned/<kiosk>: KIBO's corner widget only; the learned kiosk page in the iframe is not KIBO's UI and is shown unchanged. */
export const LEARNED: Profile = { route: "/learned", root: "[data-learned-widget]", minFont: 16, minTarget: 56 };
/** KIBO's pairing panel beside a landscape kiosk (/kiosk, /demo "Use my phone"): phone numbers, text >= 18px. */
export const PAIRING: Profile = { route: "/kiosk", root: "[data-pairing-panel]", minFont: 18, minTarget: 56 };
/** The root landing page `/`, judged by the phone numbers (a judge may open it on either device). */
export const HOME: Profile = { route: "/", root: "body", minFont: 16, minTarget: 56 };
/** /learn and the learn replay: KIBO's own pages, judged by the phone numbers like the landing page. */
export const LEARN: Profile = { route: "/learn", root: "main", minFont: 16, minTarget: 56 };

export interface Findings {
  h: string[];
  t: string[];
}

/** Gap between targets (NIA p.35, web.dev). */
const MIN_GAP = 8;
/** UI_QA "Spacing": 4/8 scale. */
const SPACING_SCALE = [0, 4, 8, 12, 16, 24, 32, 48, 64];
/** UI_QA "Motion": transitions and animations up to 500ms. */
const MAX_MOTION_MS = 500;
/** UI_GUIDE allows the 2 s AI highlight fade. */
const MOTION_ALLOW = [".k-ring"];
/** Status indicators whose reduced-motion behaviour is an H rule (UI_QA "Motion", WCAG 2.2.2). */
const MOTION_HARD = ["k-card-insert", "kibo-listen"];
/** Order numbers and similar display figures are not counted as text sizes (UI_QA "Type"). */
const DISPLAY_FONT = 100;
/** Entries kept per check in the report. */
const CAP = 12;

function capped(list: string[]): string[] {
  return list.length > CAP ? [...list.slice(0, CAP), `… +${list.length - CAP} more`] : list;
}

async function canvasScale(page: Page, p: Profile): Promise<number> {
  if (!p.canvasWidth) return 1;
  const width = await page.locator(p.root).evaluate((el) => el.getBoundingClientRect().width);
  return width / p.canvasWidth;
}

/** axe-core with the WCAG 2.0–2.2 A/AA tags and target-size on (H); contrast it cannot decide goes to a person (T). */
export async function axe(page: Page): Promise<Findings> {
  // From the npm package, never a CDN.
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(
      // The Next.js dev overlay is not part of the app.
      { exclude: [["nextjs-portal"]] },
      {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        rules: { "target-size": { enabled: true } },
      },
    );
    type Node = { target: string[]; any: { data?: { messageKey?: string } }[] };
    type Rule = { id: string; impact: string; help: string; nodes: Node[] };
    return {
      violations: (r.violations as Rule[]).map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.map((n) => n.target.join(" ")),
      })),
      contrast: (r.incomplete as Rule[])
        .filter((v) => v.id === "color-contrast")
        .flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} (${n.any[0]?.data?.messageKey ?? "unknown"})`)),
    };
  });
  return {
    h: result.violations.map(
      (v) => `axe ${v.id} (${v.impact}): ${v.help} — ${v.targets.slice(0, 3).join(", ")}${v.targets.length > 3 ? ` +${v.targets.length - 3}` : ""}`,
    ),
    t: result.contrast.length ? [`axe color-contrast incomplete, human review: ${capped(result.contrast).join(", ")}`] : [],
  };
}

/** Smallest font size (H), at most 4 sizes (T), body line height ≥ 1.5 (T). */
export async function fonts(page: Page, p: Profile): Promise<Findings> {
  const items = await page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return [];
    const out: { label: string; size: number; lineHeight: number; body: boolean }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? "").trim()) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      // Computed sizes ignore the canvas transform, so on the kiosk they are already canvas px.
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const lh = cs.lineHeight === "normal" ? 1.2 : parseFloat(cs.lineHeight) / size;
      out.push({
        label: `${el.tagName.toLowerCase()} "${(n.textContent ?? "").trim().slice(0, 24)}"`,
        size,
        lineHeight: Math.round(lh * 100) / 100,
        body: !el.closest("button, a, h1, h2, h3, h4, h5, h6, [role=timer]"),
      });
    }
    return out;
  }, p.root);

  const h = capped(items.filter((i) => i.size < p.minFont).map((i) => `font ${i.size}px < ${p.minFont}px: ${i.label}`));
  const t: string[] = [];
  const sizes = [...new Set(items.filter((i) => i.size < DISPLAY_FONT).map((i) => Math.round(i.size)))].sort((a, b) => a - b);
  if (sizes.length > 4) t.push(`${sizes.length} font sizes > 4: ${sizes.join("/")}px`);
  // Body text is the route's smallest step; larger sizes are headings, totals and labels.
  const tight = items.filter((i) => i.body && i.size < p.minFont * 1.25 && i.lineHeight < 1.5);
  if (tight.length) {
    const values = [...new Set(tight.map((i) => i.lineHeight))].join("/");
    t.push(`body line-height ${values} < 1.5 on ${tight.length} elements, e.g. ${tight.slice(0, 3).map((i) => i.label).join(", ")}`);
  }
  return { h, t };
}

/** Every visible, reachable control is at least the route's target size and 8px from its neighbours (H). */
export async function targets(page: Page, p: Profile): Promise<Findings> {
  const scale = await canvasScale(page, p);
  const boxes = await page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return [];
    const els = [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]")];
    return els.flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return [];
      // Only controls a finger can reach: not under a scrim, not scrolled out of view.
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !el.contains(hit)) return [];
      // A control half-scrolled out of a scroll area can only be touched where it shows; the gap check uses that part.
      // The size check below still uses the full box.
      const v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const c = a.getBoundingClientRect();
        v.left = Math.max(v.left, c.left);
        v.top = Math.max(v.top, c.top);
        v.right = Math.min(v.right, c.right);
        v.bottom = Math.min(v.bottom, c.bottom);
      }
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24);
      return [{ label: `${el.tagName.toLowerCase()} "${name}"`, left: r.left, top: r.top, right: r.right, bottom: r.bottom, v }];
    });
  }, p.root);

  const h: string[] = [];
  const small: string[] = [];
  for (const b of boxes) {
    const w = (b.right - b.left) / scale;
    const ht = (b.bottom - b.top) / scale;
    if (w < p.minTarget || ht < p.minTarget) small.push(`target ${Math.round(w)}×${Math.round(ht)} < ${p.minTarget}px: ${b.label}`);
  }
  h.push(...capped(small));
  const close: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].v;
      const b = boxes[j].v;
      const dx = Math.max(0, b.left - a.right, a.left - b.right);
      const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
      const gap = Math.max(dx, dy) / scale;
      // 0.01 px absorbs float error only.
      if (gap < MIN_GAP - 0.01) {
        close.push(`target gap ${Math.round(gap * 10) / 10}px < ${MIN_GAP}px: ${boxes[i].label} / ${boxes[j].label}`);
      }
    }
  }
  h.push(...capped(close));
  return { h, t: [] };
}

/** No horizontal scrolling at 320 CSS px (H, WCAG 1.4.10). Phone routes only: the kiosk is a fixed canvas. */
export async function reflow(page: Page): Promise<Findings> {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 320, height: before?.height ?? 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (before) await page.setViewportSize(before);
  return { h: overflow > 0 ? [`horizontal scroll at 320px: ${overflow}px too wide`] : [], t: [] };
}

/** With the WCAG 1.4.12 spacing injected, no text is cut off by an `overflow: hidden` box (H). */
export async function textSpacing(page: Page, p: Profile): Promise<Findings> {
  const clipped = await page.evaluate((rootSel) => {
    const style = document.createElement("style");
    style.textContent =
      "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }" +
      " p { margin-bottom: 2em !important; }";
    document.head.append(style);
    const out: string[] = [];
    const root = document.querySelector(rootSel);
    for (const el of root ? [root, ...root.querySelectorAll<HTMLElement>("*")] : []) {
      const cs = getComputedStyle(el);
      const text = (el.textContent ?? "").trim();
      if (!text || !el.checkVisibility()) continue;
      // Screen-reader-only text (a 1px clipped box) is hidden on purpose; the other checks skip it too.
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const hideX = cs.overflowX === "hidden" || cs.overflowX === "clip";
      const hideY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      // 1px absorbs subpixel rounding.
      const overX = hideX && el.scrollWidth > el.clientWidth + 1;
      const overY = hideY && el.scrollHeight > el.clientHeight + 1;
      if (overX || overY) {
        out.push(
          `text clipped (${overX ? `${el.scrollWidth}>${el.clientWidth} wide` : ""}${overX && overY ? ", " : ""}${overY ? `${el.scrollHeight}>${el.clientHeight} tall` : ""}): ${el.tagName.toLowerCase()} "${text.slice(0, 24)}"`,
        );
      }
    }
    style.remove();
    return out;
  }, p.root);
  return { h: capped(clipped), t: [] };
}

/**
 * No Latin word is broken across two lines ("Cheeseburge / r", 14-final:4) (H). Kiosk canvas only: Korean wraps by
 * its own rule there, and text that asks for `break-all` (a long host) is left out on purpose.
 */
export async function splitWords(page: Page, p: Profile): Promise<Findings> {
  const split = await page.evaluate((rootSel) => {
    const out: string[] = [];
    const root = document.querySelector(rootSel);
    if (!root) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !el.checkVisibility() || getComputedStyle(el).wordBreak === "break-all") continue;
      // A break after a hyphen ("late- / night") is a normal break point, so each part counts as its own word.
      for (const m of (node.textContent ?? "").matchAll(/[A-Za-z][A-Za-z'’]{2,}/g)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) out.push(`word split across lines: "${m[0]}"`);
      }
    }
    return out;
  }, p.root);
  return { h: capped(split), t: [] };
}

/** Tab through the controls: each focused one shows a ≥ 2px ring and is not hidden under other content (H). */
export async function focus(page: Page, p: Profile): Promise<Findings> {
  const h: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Tabbing scrolls containers (phone column, kiosk grid, scenario guide); the next state's screenshot inherited that
  // scroll and showed half-scrolled cards and a hidden highlighted tile (I-121). Restored at the end.
  await page.evaluate(() => {
    const w = window as unknown as { __qaScroll?: [Element, number, number][] };
    w.__qaScroll = [...document.querySelectorAll("*")]
      .filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0 || el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
      .map((el) => [el, el.scrollTop, el.scrollLeft]);
  });
  // Counted on the whole page: on /demo the kiosk half's controls come before the checked column in tab order.
  const max = Math.min(80, (await page.locator("button:not(:disabled), a[href], input").count()) + 4);
  let first: string | null = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate((rootSel) => {
      const el = document.activeElement as HTMLElement | null;
      const root = document.querySelector(rootSel);
      if (!el || el === document.body || !root?.contains(el)) return null;
      const cs = getComputedStyle(el);
      const ring =
        (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== "none" && cs.boxShadow !== "");
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24);
      const id = `${el.tagName.toLowerCase()} "${name}" @${Math.round(b.left)},${Math.round(b.top)}`;
      return { id, label: `${el.tagName.toLowerCase()} "${name}"`, ring, visible: Boolean(hit && el.contains(hit)) };
    }, p.root);
    if (!r) continue;
    if (r.id === first) break;
    first ??= r.id;
    if (!r.ring) h.push(`focus ring missing: ${r.label}`);
    if (!r.visible) h.push(`focus obscured: ${r.label}`);
  }
  // The ring left by this check showed up in the next state's screenshot (I-121).
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    const w = window as unknown as { __qaScroll?: [Element, number, number][] };
    for (const [el, top, left] of w.__qaScroll ?? []) el.scrollTo({ top, left, behavior: "instant" });
    delete w.__qaScroll;
  });
  return { h: capped(h), t: [] };
}

/** Motion ≤ 500ms except the highlight, spacing on the 4/8 scale (T). */
export async function tokens(page: Page, p: Profile): Promise<Findings> {
  const r = await page.evaluate(
    ({ rootSel, maxMs, allow, scale }) => {
      const root = document.querySelector(rootSel);
      const ms = (v: string) => Math.max(0, ...v.split(",").map((s) => (s.trim().endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000)));
      const motion: string[] = [];
      const spacing = new Map<number, string>();
      for (const el of root ? [...root.querySelectorAll<HTMLElement>("*")] : []) {
        if (!el.checkVisibility()) continue;
        // Screen-reader-only boxes use a -1px margin on purpose.
        const box = el.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) continue;
        const cs = getComputedStyle(el);
        const label = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`;
        if (!allow.some((sel) => el.matches(sel))) {
          const t = cs.transitionProperty !== "none" ? ms(cs.transitionDuration) : 0;
          const a = cs.animationName !== "none" ? ms(cs.animationDuration) : 0;
          if (t > maxMs || a > maxMs) motion.push(`${Math.max(t, a)}ms on ${label}`);
        }
        const values = [
          cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft,
          cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft,
        ];
        if (cs.display.includes("flex") || cs.display.includes("grid")) values.push(cs.rowGap, cs.columnGap);
        for (const v of values) {
          const px = Math.abs(parseFloat(v));
          if (Number.isFinite(px) && !scale.includes(Math.round(px)) && !spacing.has(Math.round(px))) spacing.set(Math.round(px), label);
        }
      }
      return { motion, spacing: [...spacing].sort((a, b) => a[0] - b[0]) };
    },
    { rootSel: p.root, maxMs: MAX_MOTION_MS, allow: MOTION_ALLOW, scale: SPACING_SCALE },
  );
  const t: string[] = [];
  if (r.motion.length) t.push(`motion > ${MAX_MOTION_MS}ms: ${capped(r.motion).join(", ")}`);
  if (r.spacing.length) t.push(`spacing off the 4/8 scale: ${capped(r.spacing.map(([px, el]) => `${px}px (${el})`)).join(", ")}`);
  return { h: [], t };
}

/** With reduced motion, nothing animates longer than 500ms (T; H for the status indicators in MOTION_HARD). */
export async function reducedMotion(page: Page): Promise<Findings> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const running = await page.evaluate((maxMs) => {
    return document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .flatMap((a) => {
        const timing = a.effect?.getComputedTiming();
        const total = Number(timing?.activeDuration ?? 0);
        if (total <= maxMs) return [];
        const name = a instanceof CSSAnimation ? a.animationName : "transition";
        return [{ name, total: Number.isFinite(total) ? `${total}ms` : "infinite" }];
      });
  }, MAX_MOTION_MS);
  await page.emulateMedia({ reducedMotion: null });
  const line = (a: { name: string; total: string }) => `animation ${a.name} runs ${a.total} with reduced motion`;
  return {
    h: running.filter((a) => MOTION_HARD.includes(a.name)).map(line),
    t: running.filter((a) => !MOTION_HARD.includes(a.name)).map(line),
  };
}

/** The report folder from playwright.qa.config.ts; other configs must not run these specs. */
function qaOut(info: TestInfo): string {
  const out = info.config.metadata.qaOut;
  if (typeof out !== "string") throw new Error("UI QA specs run with `npm run qa:ui` (playwright.qa.config.ts)");
  mkdirSync(out, { recursive: true });
  return out;
}

async function screenshot(page: Page, info: TestInfo, p: Profile, state: string) {
  const out = qaOut(info);
  const vp = page.viewportSize();
  const viewport = vp ? `${vp.width}x${vp.height}` : "unknown";
  await page.evaluate(() => document.fonts.ready);
  // Photos still loading came out blank in screenshots that feed the deck (I-138): wait for every image on screen.
  await page
    .waitForFunction(
      () =>
        [...document.images].every((img) => {
          const b = img.getBoundingClientRect();
          const onScreen = b.width > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth;
          return !onScreen || (img.complete && img.naturalWidth > 0);
        }),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {});
  await page.evaluate(() =>
    Promise.all([...document.images].filter((img) => img.complete && img.naturalWidth > 0).map((img) => img.decode().catch(() => {}))),
  );
  // A phone sheet still rising (200ms) came out half faded: let those finish. Not the kiosk's 2 s highlight, which
  // the AI-change states are meant to catch.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && (a.animationName === "kibo-sheet-in" || a.animationName === "kibo-fade-in"))
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const shot =`${out}/${p.route.replace(/\W/g, "") || "home"}-${state}-${viewport}.png`;
  await page.screenshot({ path: shot });
  return { out, viewport, shot };
}

/** Saves a screenshot of one state, runs every check and appends a line to ui-qa.jsonl. */
export async function qaState(
  page: Page,
  info: TestInfo,
  p: Profile,
  state: string,
  opts: { reflow?: boolean; afterShot?: () => Promise<void> } = {},
): Promise<Findings> {
  const { out, viewport, shot } = await screenshot(page, info, p, state);
  await opts.afterShot?.();

  const parts = [
    await axe(page),
    await fonts(page, p),
    await targets(page, p),
    await textSpacing(page, p),
    await tokens(page, p),
    await reducedMotion(page),
    ...(opts.reflow ? [await reflow(page)] : []),
    ...(p.canvasWidth ? [await splitWords(page, p)] : []),
    // Last: tabbing moves focus and may scroll.
    await focus(page, p),
  ];
  const findings = { h: parts.flatMap((x) => x.h), t: parts.flatMap((x) => x.t) };
  appendFileSync(
    `${out}/ui-qa.jsonl`,
    `${JSON.stringify({ route: p.route, state, viewport, h: findings.h, t: findings.t, shots: [shot] })}\n`,
  );
  return findings;
}

/** Records a screenshot with no checks (for example the scaled /demo size, where sizes are not measured). */
export async function qaShot(page: Page, info: TestInfo, p: Profile, state: string) {
  const { out, viewport, shot } = await screenshot(page, info, p, state);
  appendFileSync(
    `${out}/ui-qa.jsonl`,
    `${JSON.stringify({ route: p.route, state, viewport, h: [], t: [], shots: [shot], note: "screenshot only" })}\n`,
  );
}
