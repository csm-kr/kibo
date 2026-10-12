import { CommandError } from "@/lib/commands/errors";

// Fixed one-minute windows per IP, in memory per Cloud Run instance; with max-instances=3 the
// effective limit is up to 3x these values (ARCHITECTURE "Limits and cost").

const WINDOW_MS = 60_000;
const LIMITS = { api: 60, session: 10 } as const;
/** Above this many tracked keys, finished windows are dropped so memory stays bounded. */
const SWEEP_AT = 10_000;

const windows = new Map<string, { start: number; count: number }>();

export function checkIpLimit(ip: string, kind: keyof typeof LIMITS, now = Date.now()): void {
  if (windows.size > SWEEP_AT) {
    for (const [key, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(key);
  }
  const key = `${kind}:${ip}`;
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) windows.set(key, (w = { start: now, count: 0 }));
  w.count++;
  if (w.count > LIMITS[kind]) throw new CommandError("RATE_LIMITED", "Too many requests. Please wait a moment.");
}

export function resetLimits(): void {
  windows.clear();
}
