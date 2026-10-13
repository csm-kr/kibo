import { isIPv6 } from "node:net";
import { CommandError } from "@/lib/commands/errors";

// Fixed one-minute windows per IP, in memory per Cloud Run instance; with max-instances=3 the
// effective limit is up to 3x these values (ARCHITECTURE "Limits and cost").

const WINDOW_MS = 60_000;
const LIMITS = { api: 60, session: 10 } as const;
/** Above this many tracked keys, finished windows are dropped so memory stays bounded. */
const SWEEP_AT = 10_000;

const windows = new Map<string, { start: number; count: number }>();

/**
 * One client usually holds a whole IPv6 /64 and can rotate addresses inside it, so IPv6 is keyed by its first
 * four groups. IPv4 and IPv4-mapped IPv6 ("::ffff:1.2.3.4") stay per address.
 */
function clientKey(ip: string): string {
  if (!isIPv6(ip) || ip.includes(".")) return ip;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

export function checkIpLimit(ip: string, kind: keyof typeof LIMITS, now = Date.now()): void {
  if (windows.size > SWEEP_AT) {
    for (const [key, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(key);
  }
  const key = `${kind}:${clientKey(ip)}`;
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) windows.set(key, (w = { start: now, count: 0 }));
  w.count++;
  if (w.count > LIMITS[kind]) throw new CommandError("RATE_LIMITED", "Too many requests. Please wait a moment.");
}

/**
 * Per address and KST day (I-148): sessions are free, so without this one address could spend the whole day's global
 * voice and chat budgets. Per instance, like the windows above: one address gets at most 3x these across instances.
 */
const DAILY = { voice: 24, chat: 300 } as const;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const daily = new Map<string, number>();

function dailyKey(ip: string, kind: keyof typeof DAILY, now: number): string {
  return `${Math.floor((now + KST_OFFSET_MS) / DAY_MS)}:${kind}:${clientKey(ip)}`;
}

/** Takes one from the address's budget for today; false when it is used up. */
export function takeDailyBudget(ip: string, kind: keyof typeof DAILY, now = Date.now()): boolean {
  if (daily.size > SWEEP_AT) {
    const today = `${Math.floor((now + KST_OFFSET_MS) / DAY_MS)}:`;
    for (const key of daily.keys()) if (!key.startsWith(today)) daily.delete(key);
  }
  const key = dailyKey(ip, kind, now);
  const n = daily.get(key) ?? 0;
  if (n >= DAILY[kind]) return false;
  daily.set(key, n + 1);
  return true;
}

/** Gives one back when what it paid for was never delivered (a Live token the issuer failed to create, I-150). */
export function giveBackDailyBudget(ip: string, kind: keyof typeof DAILY, now = Date.now()): void {
  const key = dailyKey(ip, kind, now);
  const n = daily.get(key) ?? 0;
  if (n > 0) daily.set(key, n - 1);
}

/**
 * Open event streams per address (I-149). Each stream holds one Cloud Run request (80 per instance, 3 instances) for up
 * to the request timeout, so one address could otherwise hold every slot. A screen needs one stream; /demo two.
 */
const MAX_STREAMS = 10;
const streams = new Map<string, number>();

/** Counts one open stream for the address and returns the function that releases it; RATE_LIMITED over the cap. */
export function openStream(ip: string): () => void {
  const key = clientKey(ip);
  const n = streams.get(key) ?? 0;
  if (n >= MAX_STREAMS) throw new CommandError("RATE_LIMITED", "Too many open screens. Please close one and try again.");
  streams.set(key, n + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (streams.get(key) ?? 1) - 1;
    if (left > 0) streams.set(key, left);
    else streams.delete(key);
  };
}

export function resetLimits(): void {
  windows.clear();
  daily.clear();
  streams.clear();
}
