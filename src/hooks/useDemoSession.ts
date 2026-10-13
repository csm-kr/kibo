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
  deviceToken: string;
  claimUrl: string;
}

/**
 * The /demo session: `POST /api/session` with `demo: true` returns both tokens, so one page is the kiosk and the
 * phone (docs/ARCHITECTURE.md "Pages"). Kept in memory only: a reload goes back to the intro. Pings with the
 * device token every 30 s, so the kiosk half never shows "connection paused" and activity extends the session.
 */
export function useDemoSession(kioskId: string) {
  const [tokens, setTokens] = useState<DemoTokens | null>(null);
  const [error, setError] = useState<ScreenErrorCode | null>(null);
  const [starting, setStarting] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const busy = useRef(false);
  const lastActive = useRef(0);
  const { session, state } = useSessionStream(tokens?.sessionId ?? null);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    setError(null);
    try {
      const r = await createSession(kioskId, true);
      if (!r.deviceToken) throw new ApiError("INTERNAL", "");
      setTokens({ sessionId: r.sessionId, kioskToken: r.kioskToken, deviceToken: r.deviceToken, claimUrl: r.claimUrl });
      lastActive.current = Date.now();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "INTERNAL");
    } finally {
      busy.current = false;
      setStarting(false);
    }
  }, [kioskId]);

  useEffect(() => {
    if (!tokens) return;
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    async function send() {
      if (!tokens) return;
      try {
        const r = await ping({ sessionId: tokens.sessionId, token: tokens.deviceToken, active: Date.now() - lastActive.current < ACTIVE_MS });
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

  return {
    tokens,
    session,
    streamState: state,
    clockOffset,
    error,
    starting,
    start,
    /** Back to the intro; the old session just expires. */
    stop: () => setTokens(null),
  };
}
