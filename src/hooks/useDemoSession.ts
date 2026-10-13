"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createSession, ping } from "@/lib/client/api";
import type { ScreenErrorCode } from "@/lib/i18n/errors";
import { useSessionStream } from "./useSessionStream";

const PING_MS = 30_000;
const ACTIVE_MS = 30_000;

interface DemoTokens {
  sessionId: string;
  kioskToken: string;
  /** Absent in "Use my phone" mode: the judge's own phone claims the session and holds its token. */
  deviceToken?: string;
  claimUrl: string;
  /** "Use my phone" mode only: the 6-digit code for /app. */
  pairCode: string | null;
  /** "Use my phone" mode only: the address shown beside the code. */
  pairUrl: string | null;
}

/**
 * The /demo session: `POST /api/session` with `demo: true` returns both tokens, so one page is the kiosk and the
 * phone (docs/ARCHITECTURE.md "Pages"). With `pairPhone` ("Use my phone") the page is only the kiosk and a real
 * phone claims the session by QR or code; the demo limits still apply. Kept in memory only: a reload goes back to
 * the intro. Pings every 30 s (with the device token, or the kiosk token when the phone is the judge's own), so
 * the kiosk half never shows "connection paused" for its own phone and activity extends the session.
 */
export function useDemoSession(kioskId: string) {
  const [tokens, setTokens] = useState<DemoTokens | null>(null);
  const [error, setError] = useState<ScreenErrorCode | null>(null);
  const [starting, setStarting] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const busy = useRef(false);
  const lastActive = useRef(0);
  const { session, state } = useSessionStream(tokens?.sessionId ?? null);

  const start = useCallback(
    async (pairPhone = false) => {
      if (busy.current) return;
      busy.current = true;
      setStarting(true);
      setError(null);
      try {
        const r = await createSession(kioskId, true, pairPhone);
        if (pairPhone ? !r.pairCode : !r.deviceToken) throw new ApiError("INTERNAL", "");
        setTokens({
          sessionId: r.sessionId,
          kioskToken: r.kioskToken,
          ...(r.deviceToken ? { deviceToken: r.deviceToken } : {}),
          claimUrl: r.claimUrl,
          pairCode: r.pairCode ?? null,
          pairUrl: r.pairUrl ?? null,
        });
        lastActive.current = Date.now();
      } catch (e) {
        setError(e instanceof ApiError ? e.code : "INTERNAL");
      } finally {
        busy.current = false;
        setStarting(false);
      }
    },
    [kioskId],
  );

  useEffect(() => {
    if (!tokens) return;
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    async function send() {
      if (!tokens) return;
      try {
        const r = await ping({
          sessionId: tokens.sessionId,
          token: tokens.deviceToken ?? tokens.kioskToken,
          active: Date.now() - lastActive.current < ACTIVE_MS,
        });
        setClockOffset(r.serverTime - Date.now());
      } catch {
        // The stream shows an expired session; the next ping tries again.
      }
    }
    window.addEventListener("pointerdown", onActivity, { capture: true });
    window.addEventListener("keydown", onActivity, { capture: true });
    void send();
    const timer = setInterval(() => void send(), PING_MS);
    return () => {
      window.removeEventListener("pointerdown", onActivity, { capture: true });
      window.removeEventListener("keydown", onActivity, { capture: true });
      clearInterval(timer);
    };
  }, [tokens]);

  /** "Use my phone": [Connect another phone] on the kiosk half issued a new QR and code. */
  const setClaimUrl = useCallback((claimUrl: string, pairCode?: string) => {
    setTokens((t) => (t ? { ...t, claimUrl, pairCode: pairCode ?? null } : t));
  }, []);

  return {
    tokens,
    session,
    streamState: state,
    clockOffset,
    error,
    starting,
    start,
    setClaimUrl,
    /** Back to the intro; the old session just expires. */
    stop: () => setTokens(null),
  };
}
