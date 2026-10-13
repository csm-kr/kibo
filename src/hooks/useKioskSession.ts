"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createSession, ping } from "@/lib/client/api";
import { useSessionStream } from "./useSessionStream";

const PING_MS = 30_000;
const ACTIVE_MS = 30_000;
const RETRY_MS = 10_000;

interface Stored {
  sessionId: string;
  kioskToken: string;
  claimUrl: string;
  /** The 6-digit code for /app; absent on records stored before pairing codes existed. */
  pairCode?: string;
}

function parseStored(raw: string | null): Stored | null {
  try {
    const v: unknown = JSON.parse(raw ?? "null");
    if (!v || typeof v !== "object") return null;
    const { sessionId, kioskToken, claimUrl, pairCode } = v as Record<string, unknown>;
    if (typeof sessionId !== "string" || typeof kioskToken !== "string" || typeof claimUrl !== "string") return null;
    return { sessionId, kioskToken, claimUrl, ...(typeof pairCode === "string" ? { pairCode } : {}) };
  } catch {
    return null;
  }
}

// localStorage is the source of truth; `storage` events cover other tabs, `notify` covers this one.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function writeStored(key: string, s: Stored) {
  localStorage.setItem(key, JSON.stringify(s));
  listeners.forEach((l) => l());
}

/**
 * Session for the standalone /kiosk. Resumes {sessionId, kioskToken, claimUrl, pairCode} from localStorage after a
 * reload unless the session is gone, expired or paid (docs/SECURITY.md "Reliability"); otherwise creates one.
 */
export function useKioskSession(kioskId: string) {
  const key = `kibo.kiosk.${kioskId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key),
    () => null,
  );
  const stored = useMemo(() => parseStored(raw), [raw]);
  const [clockOffset, setClockOffset] = useState(0);
  const { session, state } = useSessionStream(stored?.sessionId ?? null);

  const creating = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Lets the retry timer call the latest newSession without newSession referring to itself.
  const retry = useRef<() => void>(() => {});
  // The id read from storage at start; its first snapshot decides whether the session can be resumed.
  const resumedId = useRef<string | null>(null);
  const lastTouch = useRef(0);

  const newSession = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    clearTimeout(retryTimer.current);
    try {
      const r = await createSession(kioskId);
      writeStored(key, { sessionId: r.sessionId, kioskToken: r.kioskToken, claimUrl: r.claimUrl, pairCode: r.pairCode });
    } catch {
      // Rate limit or no connection: keep the attract screen up and try again shortly.
      retryTimer.current = setTimeout(() => retry.current(), RETRY_MS);
    } finally {
      creating.current = false;
    }
  }, [kioskId, key]);

  useEffect(() => {
    retry.current = () => void newSession();
  }, [newSession]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  useEffect(() => {
    // Read storage directly: during hydration `stored` is still the server value (null).
    const s = parseStored(localStorage.getItem(key));
    if (s) resumedId.current = s.sessionId;
    else void newSession();
  }, [key, newSession]);

  useEffect(() => {
    if (!stored) return;
    if (state === "gone" || session?.status === "expired") {
      void newSession();
      return;
    }
    if (session && session.sessionId === resumedId.current) {
      resumedId.current = null;
      if (session.status === "paid") void newSession();
    }
  }, [stored, state, session, newSession]);

  // 30 s heartbeat; `active` extends the session only if someone touched the kiosk in the last 30 s.
  useEffect(() => {
    if (!stored) return;
    const onTouch = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener("pointerdown", onTouch, { capture: true });
    const timer = setInterval(async () => {
      try {
        const r = await ping({
          sessionId: stored.sessionId,
          token: stored.kioskToken,
          active: Date.now() - lastTouch.current < ACTIVE_MS,
        });
        setClockOffset(r.serverTime - Date.now());
      } catch {
        // The stream reports gone or expired sessions; a missed ping needs nothing else.
      }
    }, PING_MS);
    return () => {
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      clearInterval(timer);
    };
  }, [stored]);

  const setClaimUrl = useCallback(
    (claimUrl: string, pairCode?: string) => {
      if (stored) writeStored(key, { ...stored, claimUrl, pairCode });
    },
    [stored, key],
  );

  return {
    sessionId: stored?.sessionId ?? null,
    kioskToken: stored?.kioskToken ?? null,
    claimUrl: stored?.claimUrl ?? null,
    pairCode: stored?.pairCode ?? null,
    session,
    streamState: state,
    clockOffset,
    newSession,
    setClaimUrl,
  };
}
