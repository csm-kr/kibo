"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, claim, ping } from "@/lib/client/api";
import type { PhoneLocal } from "@/lib/phone/screen";
import { useSessionStream } from "./useSessionStream";

const PING_MS = 30_000;
const ACTIVE_MS = 30_000;
const RETRY_MS = 5_000;

export type ClaimError = NonNullable<PhoneLocal["claimError"]>;

// localStorage holds the device token per session, so the same phone reconnects after a reload or a screen lock
// (docs/SECURITY.md "Reliability"). `storage` events cover other tabs, `notify` covers this one.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function notify() {
  listeners.forEach((l) => l());
}
const noSubscribe = () => () => {};

/** The claim token from `#t=…`; null when there is none, undefined before hydration. */
function hashClaimToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("t");
}

/** Removes `#t=…` without a navigation, so the claim token is not left in the address bar or history. */
function dropFragment() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * The phone's side of /assistant?s=<id>#t=<claim>: reconnects with a stored device token, or claims with the
 * fragment's one-use token and removes it from the URL (docs/SECURITY.md "Identity and permissions"). Reads the
 * session through the stream and pings every 30 s, `active` when the user did something in the last 30 s.
 */
export function usePhoneSession(sessionId: string | null, opts: { holdClaim?: boolean } = {}) {
  const holdClaim = opts.holdClaim ?? false;
  const key = sessionId ? `kibo.phone.${sessionId}` : null;
  const deviceToken = useSyncExternalStore(
    subscribe,
    () => (key ? localStorage.getItem(key) : null),
    () => null,
  );
  const hashToken = useSyncExternalStore(noSubscribe, hashClaimToken, () => undefined);
  const [claimError, setClaimError] = useState<ClaimError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const claiming = useRef(false);
  const lastActive = useRef(0);
  const { session, state, paused, resume } = useSessionStream(deviceToken && sessionId ? sessionId : null);

  useEffect(() => {
    if (!key || !sessionId || claiming.current) return;
    const claimToken = hashClaimToken();
    if (!claimToken) return;
    // The same phone scanned the same QR again: it reconnects with its stored token; the claim token just goes.
    if (deviceToken) return dropFragment();
    // An in-app browser waits on P1: the link the user copies must still hold an unused claim token.
    if (holdClaim) return;
    claiming.current = true;
    claim({ sessionId, claimToken })
      .then((r) => {
        localStorage.setItem(key, r.deviceToken);
        notify();
        dropFragment();
        lastActive.current = Date.now();
      })
      .catch((e: unknown) => {
        const code = e instanceof ApiError ? e.code : "INTERNAL";
        if (code === "CONFLICT") setClaimError("taken");
        else if (code === "GONE" || code === "NOT_FOUND" || code === "UNAUTHORIZED" || code === "BAD_REQUEST") setClaimError("gone");
        else {
          // No answer or a rate limit: keep the fragment so a reload can still claim, and try again shortly.
          setTimeout(() => setRetryTick((n) => n + 1), RETRY_MS);
          return;
        }
        dropFragment();
      })
      .finally(() => {
        claiming.current = false;
      });
  }, [key, sessionId, deviceToken, retryTick, holdClaim]);

  const sendPing = useCallback(
    async (active: boolean) => {
      if (!key || !sessionId || !deviceToken) return;
      try {
        const r = await ping({ sessionId, token: deviceToken, active });
        setClockOffset(r.serverTime - Date.now());
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "INTERNAL";
        if (code === "UNAUTHORIZED") {
          // The kiosk issued a new QR ([Connect another phone]): this token is void; scanning again claims anew.
          localStorage.removeItem(key);
          notify();
          setClaimError("gone");
        } else if (code === "GONE" || code === "NOT_FOUND") {
          setClaimError("gone");
        }
        // Anything else: the stream shows the session; the next ping tries again.
      }
    },
    [key, sessionId, deviceToken],
  );

  useEffect(() => {
    if (!deviceToken) return;
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    window.addEventListener("pointerdown", onActivity, { capture: true });
    window.addEventListener("keydown", onActivity, { capture: true });
    // Right away too: it tells the kiosk the phone is back and measures the clock offset.
    void sendPing(Date.now() - lastActive.current < ACTIVE_MS);
    const timer = setInterval(() => void sendPing(Date.now() - lastActive.current < ACTIVE_MS), PING_MS);
    return () => {
      window.removeEventListener("pointerdown", onActivity, { capture: true });
      window.removeEventListener("keydown", onActivity, { capture: true });
      clearInterval(timer);
    };
  }, [deviceToken, sendPing]);

  // No stored token and no claim token in the URL (hashToken is undefined until hydration).
  const nothingToClaim = hashToken === null && !deviceToken;
  const error: ClaimError | null = claimError ?? (state === "gone" || nothingToClaim ? "gone" : null);

  return {
    deviceToken,
    session,
    streamState: state,
    paused,
    resume,
    claimError: error,
    clockOffset,
    /** A claim is waiting for `holdClaim` to end. */
    claimHeld: holdClaim && !!hashToken && !deviceToken && !error,
  };
}
