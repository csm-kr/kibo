// Reads the learned kiosk's own cart after a replay (docs/SECURITY.md "Learned kiosks": total and each line).
// The page text is third-party: it is parsed with the skill's patterns and compared, never shown or stored.

export interface KioskLine {
  name: string;
  options: string[];
  qty: number;
  price: number;
}

function pageText(doc: Document): string {
  return doc.body?.innerText ?? "";
}

function won(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** The kiosk's total (group 1 of `pattern`), or null when it is not on screen. */
export function readKioskTotal(doc: Document, pattern: string): number | null {
  const m = new RegExp(pattern).exec(pageText(doc));
  if (!m?.[1]) return null;
  const n = won(m[1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Each cart line on screen, cut to the matched part (no delete-button text). The pattern runs over the whole text
 * with `^` and `$` at each text line, so a kiosk that shows one cart line as a block of text lines can be read (bk9).
 */
export function readKioskLines(doc: Document, linePattern: string): string[] {
  return [...pageText(doc).matchAll(new RegExp(linePattern, "gm"))].map((m) => m[0].trim()).filter(Boolean);
}

/**
 * The skill's line pattern has groups 1 name, 2 options (optional), 3 quantity, 4 line price; the options are split by
 * the skill's separator (a comma by default) and empty parts dropped.
 */
export function parseKioskLine(line: string, linePattern: string, optionSeparator = ","): KioskLine | null {
  const m = new RegExp(linePattern).exec(line);
  if (!m) return null;
  const qty = Number(m[3]);
  const price = won(m[4] ?? "");
  if (!m[1] || !Number.isInteger(qty) || !Number.isInteger(price)) return null;
  const options = m[2]
    ? m[2]
        .split(new RegExp(optionSeparator))
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  return { name: m[1].trim(), options, qty, price };
}

function totals(lines: KioskLine[]): Map<string, { qty: number; price: number }> {
  const out = new Map<string, { qty: number; price: number }>();
  for (const l of lines) {
    const key = JSON.stringify([l.name, [...l.options].sort()]);
    const t = out.get(key) ?? { qty: 0, price: 0 };
    out.set(key, { qty: t.qty + l.qty, price: t.price + l.price });
  }
  return out;
}

/**
 * Same items with the same options, quantities and prices. Lines are compared as sums per item and options,
 * because the server merges a repeated item into one line while the kiosk may list it twice.
 */
export function sameLines(expected: KioskLine[], actual: KioskLine[]): boolean {
  const a = totals(expected);
  const b = totals(actual);
  if (a.size !== b.size) return false;
  for (const [key, t] of a) {
    const u = b.get(key);
    if (!u || u.qty !== t.qty || u.price !== t.price) return false;
  }
  return true;
}
