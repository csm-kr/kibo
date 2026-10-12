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

export function resetLimits(): void {
  windows.clear();
}
