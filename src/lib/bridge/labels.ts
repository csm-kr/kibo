// Tappable labels on a learned kiosk page (docs/KIBO_LEARN.md "How it finds things to tap"), ported from the
// learner's driver so a skill replays with the same names it was learned with. Browser code: it reads the page
// through the frame's own window and never writes to the page (no marker attributes).

const NATIVE = new Set(["BUTTON", "A", "INPUT", "LABEL"]);
const PRICE = /^[+\-]?[\d,]+\s*원$/;
const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT

export interface Clickable {
  el: HTMLElement;
  label: string;
}

function hasAncestorIn(el: Element, set: Set<Element>): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return true;
  return false;
}

/**
 * The name a person reads first: the most prominent text (largest font, bold wins ties) that has letters and is
 * not a price. Tiles mix emoji lines, "NEW" badges, names and prices. Icon-only controls fall back to
 * aria-label, title, value, then their first text line (the symbol itself).
 */
function labelOf(el: HTMLElement, doc: Document, win: Window): string {
  let label = "";
  let best = -1;
  const walker = doc.createTreeWalker(el, SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    const parent = n.parentElement;
    if (!parent || !/\p{L}/u.test(t) || PRICE.test(t) || !parent.getClientRects().length) continue;
    const ps = win.getComputedStyle(parent);
    const score = parseFloat(ps.fontSize) * (Number(ps.fontWeight) >= 600 ? 1.2 : 1);
    if (score > best) {
      best = score;
      label = t;
    }
  }
  // <li> and others have a numeric `value`; only a string value is a control's text.
  const raw = (el as { value?: unknown }).value;
  const value = typeof raw === "string" ? raw : "";
  const lines = (el.innerText || value).split("\n").map((l) => l.trim()).filter(Boolean);
  return label || el.getAttribute("aria-label") || el.getAttribute("title") || value || lines[0] || "";
}

/** Every visible clickable (cursor: pointer, an onclick, or a native control), outermost only, in page order. */
export function clickables(doc: Document): Clickable[] {
  const win = doc.defaultView;
  if (!win || !doc.body) return [];
  const out: Clickable[] = [];
  const labelled = new Set<Element>();
  for (const el of doc.body.querySelectorAll<HTMLElement>("*")) {
    const s = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.visibility === "hidden" || r.width === 0 || r.height === 0) continue;
    const clickable = s.cursor === "pointer" || el.onclick !== null || NATIVE.has(el.tagName);
    if (!clickable || hasAncestorIn(el, labelled)) continue;
    const label = labelOf(el, doc, win);
    if (!label) continue;
    labelled.add(el);
    out.push({ el, label });
  }
  return out;
}

/** The tappable labels on screen now, as the learner saw them. */
export function markClickables(doc: Document): string[] {
  return clickables(doc).map((c) => c.label);
}

/** Visible clickables whose label is exactly `label`, in page order. */
export function findByLabel(doc: Document, label: string): Element[] {
  return clickables(doc)
    .filter((c) => c.label === label)
    .map((c) => c.el);
}
