// Scoring rules of the crowd benchmark judge. Pure functions; tests in scoring.test.ts.

export type Lang = "en" | "ko";

const EN_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const KO_NATIVE = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];

/** Words to compare. English: lower case, no punctuation, small digits as words. Korean: spacing is not reliable in
 *  transcripts, so one token per character with spaces and punctuation removed; a counted digit ("2개") becomes the
 *  native number the speaker said ("두개"). */
export function tokens(text: string, lang: Lang): string[] {
  const t = text.normalize("NFC").toLowerCase();
  if (lang === "ko") {
    const native = t.replace(/(\d+)\s*(개|잔|조각|세트|명|병)/g, (m, n: string, unit: string) => (Number(n) >= 1 && Number(n) <= 10 ? KO_NATIVE[Number(n)] + unit : m));
    return [...native.replace(/[^\p{L}\p{N}]/gu, "")];
  }
  return t
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) && Number(w) < EN_NUMBERS.length ? EN_NUMBERS[Number(w)] : w));
}

/** Indexes of `a` in one longest common subsequence of `a` and `b`. */
function lcsIndexes(a: string[], b: string[]): Set<number> {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      out.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export interface WordScore {
  customerTotal: number;
  kept: number;
  bystanderTotal: number;
  leaked: number;
  neither: number;
  transcriptTotal: number;
}

/** A transcript against the references. Customer words first, in order (longest common subsequence), so a word both
 *  people said goes to the customer; the transcript's other words are matched against all bystanders' words as a bag
 *  (several bystanders talk at once, so their order is not defined); what is left belongs to neither. */
export function wordScore(transcript: string, customer: string, bystanders: string[], lang: Lang): WordScore {
  const t = tokens(transcript, lang);
  const c = tokens(customer, lang);
  const kept = lcsIndexes(t, c);
  const bag = new Map<string, number>();
  let bystanderTotal = 0;
  for (const b of bystanders)
    for (const w of tokens(b, lang)) {
      bag.set(w, (bag.get(w) ?? 0) + 1);
      bystanderTotal++;
    }
  let leaked = 0;
  let neither = 0;
  t.forEach((w, i) => {
    if (kept.has(i)) return;
    const left = bag.get(w) ?? 0;
    if (left > 0) {
      bag.set(w, left - 1);
      leaked++;
    } else neither++;
  });
  return { customerTotal: c.length, kept: kept.size, bystanderTotal, leaked, neither, transcriptTotal: t.length };
}

const HERO_ITEM = "cheese_burger";
const HERO_QTY = 2;

/** What a bystander got into the order: any addToCart of an item other than the hero's (even if removed later), any
 *  other item in the final cart, and cheeseburgers beyond the hero's two. */
export function bystanderItemsAdded(tools: { name: string; args: Record<string, unknown> }[], cart: { itemId: string; qty: number }[]): string[] {
  const out = new Set<string>();
  for (const c of tools) if (c.name === "addToCart" && typeof c.args.itemId === "string" && c.args.itemId !== HERO_ITEM) out.add(c.args.itemId);
  for (const l of cart) if (l.itemId !== HERO_ITEM) out.add(l.itemId);
  const qty = cart.filter((l) => l.itemId === HERO_ITEM).reduce((n, l) => n + l.qty, 0);
  if (qty > HERO_QTY) out.add(`${HERO_ITEM}:qty${qty}`);
  return [...out];
}

/** spikes/crowd-voice/run.ts's "right": the AI did nothing before or while the customer spoke, reacted (audio or
 *  tool call) within 5 s of the customer's last word, and the cart holds the two cheeseburgers and nothing else.
 *  A candidate's latency moves the customer's speech later, so "while" ends latencyMs after the last word, and the
 *  reaction is counted from the last word as spoken, so the delay is in it. Times are ms on the mix's time base. */
export function isRight(r: { userStartMs: number; userEndMs: number; outputs: number[]; cart: { itemId: string; qty: number }[]; latencyMs: number }): { ok: boolean; reactionMs: number | null } {
  const before = r.outputs.filter((t) => t < r.userStartMs).length;
  const during = r.outputs.filter((t) => t >= r.userStartMs && t < r.userEndMs + r.latencyMs).length;
  const after = r.outputs.filter((t) => t >= r.userEndMs).sort((a, b) => a - b)[0];
  const reactionMs = after === undefined ? null : Math.round(after - r.userEndMs);
  const cheese = r.cart.filter((l) => l.itemId === HERO_ITEM).reduce((n, l) => n + l.qty, 0);
  const foreign = r.cart.some((l) => l.itemId !== HERO_ITEM);
  const ok = before === 0 && during === 0 && reactionMs !== null && reactionMs <= 5000 && cheese === HERO_QTY && !foreign;
  return { ok, reactionMs };
}

export type FrameAction = "send" | "end" | "skip";

/** What the judge does with each frame (starting at 0, frameMs apart) when a candidate gives gate segments: send it
 *  while a segment is open, send audioStreamEnd at the first frame after a segment closes (the hold machinery's
 *  release, like run.ts --ptt-end), send nothing otherwise. No segments: every frame is sent. */
export function frameActions(lengthMs: number, segments: [number, number][] | null, frameMs: number): FrameAction[] {
  const n = Math.floor(lengthMs / frameMs);
  const out: FrameAction[] = [];
  let open = false;
  for (let k = 0; k < n; k++) {
    const t = k * frameMs;
    if (!segments) {
      out.push("send");
      continue;
    }
    const inside = segments.some(([s, e]) => t >= s && t < e);
    if (inside) {
      out.push("send");
      open = true;
    } else if (open) {
      out.push("end");
      open = false;
    } else out.push("skip");
  }
  return out;
}

const MIN_RUNS = 20;

/** The adopt line (docs/GOAL.md "Speaker-aware listening"): at 0 dB overlap the order right in 18 or more of 20 and
 *  bystander items added in 1 or fewer; the customer alone no worse than today (at most one run fewer right than the
 *  "open" baseline on the same trials); added delay within the candidate's limit. Fewer than 20 runs, or a missing
 *  comparison, is not evaluable: never a scaled pass. */
export function adoptVerdict(x: {
  overlap0: { runs: number; right: number; withBystanderItems: number };
  aloneRight: number;
  todayAloneRight: number | null;
  addedDelayMs: number | null;
  maxDelayMs: number;
}): { verdict: "pass" | "fail" | "not evaluable"; reasons: string[] } {
  const { runs, right, withBystanderItems } = x.overlap0;
  if (runs < MIN_RUNS) return { verdict: "not evaluable", reasons: [`${runs} runs at 0 dB overlap; the line needs ${MIN_RUNS}`] };
  if (x.todayAloneRight === null) return { verdict: "not evaluable", reasons: ["no 'open' result for the customer alone at the same runs"] };
  if (x.addedDelayMs === null) return { verdict: "not evaluable", reasons: ["no reaction time to compare"] };
  const reasons: string[] = [];
  if (right < Math.ceil(0.9 * runs)) reasons.push(`right ${right} of ${runs} at 0 dB (needs ${Math.ceil(0.9 * runs)})`);
  if (withBystanderItems > Math.floor(runs / 20)) reasons.push(`bystander items in ${withBystanderItems} of ${runs} (allowed ${Math.floor(runs / 20)})`);
  if (x.aloneRight < x.todayAloneRight - 1) reasons.push(`customer alone right ${x.aloneRight}, today ${x.todayAloneRight}`);
  if (x.addedDelayMs > x.maxDelayMs) reasons.push(`added delay ${x.addedDelayMs} ms (limit ${x.maxDelayMs})`);
  return { verdict: reasons.length ? "fail" : "pass", reasons };
}

/** Wilson 95% interval of k successes in n runs, so that 5 of 6 is never read as better than 3 of 6. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** A stack of candidates (meta.input_from names the one whose output this one took): the delays add up, and the
 *  audio is the nearest out.wav up the chain (null: the mix). Refuses a cycle or a missing link. */
export function resolveChain(
  cand: string,
  get: (c: string) => { latency_ms: number; input_from?: string; hasAudio: boolean } | null,
): { latencyMs: number; audioFrom: string | null; chain: string[] } {
  const chain: string[] = [];
  let latencyMs = 0;
  let audioFrom: string | null = null;
  for (let c: string | undefined = cand; c !== undefined; ) {
    if (chain.includes(c)) throw new Error(`input_from makes a cycle: ${[...chain, c].join(" -> ")}`);
    const m = get(c);
    if (!m) throw new Error(`input_from names a missing candidate: ${c}`);
    chain.push(c);
    latencyMs += m.latency_ms;
    if (audioFrom === null && m.hasAudio) audioFrom = c;
    c = m.input_from;
  }
  return { latencyMs, audioFrom, chain };
}

/** run.ts's review scenario: a bystander's yes was accepted when the order left the review (`confirming`). */
export function yesAccepted(status: string): boolean {
  return status !== "confirming";
}
