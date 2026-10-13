"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StreamControl } from "@/lib/client/streamControl";
import type { Session } from "@/types/session";

/** `retrying`: the server refused the stream (a 429 or 503 reply) and it reopens after a wait (I-033). */
export type StreamState = "connecting" | "open" | "gone" | "retrying";

interface Snapshot {
  /** The session id this snapshot belongs to, so a new id never shows the old session. */
  forId: string | null;
  session: Session | null;
  state: StreamState;
}

/** E2E only: a shorter idle pause, set with `addInitScript` (a screen can only shorten its own). */
function idleMsOverride(): number | undefined {
  const v = (window as { __kiboStreamIdleMs?: unknown }).__kiboStreamIdleMs;
  return typeof v === "number" && v > 0 ? v : undefined;
}

/**
 * Reads the session through the server's SSE route (ADR-010). EventSource reconnects on its own. The stream closes
 * after 60 s in a hidden tab and reopens when it is visible; after 20 min with no session change and no input it
 * pauses (`paused`) until `resume()`, which the screen calls from its "Paused · Tap to continue" layer
 * (src/lib/client/streamControl.ts). Kiosk screens pass `idlePause: false` and never pause while visible (I-172).
 * A refused stream reopens after 3 s, 6 s, 12 s, … up to 30 s, and the state stays `retrying` until one opens.
 * The last session stays while closed; the first frame after reopening is a full snapshot.
 */
export function useSessionStream(
  sessionId: string | null,
  { idlePause = true }: { idlePause?: boolean } = {},
): {
  session: Session | null;
  state: StreamState;
  paused: boolean;
  resume: () => void;
} {
  const [snap, setSnap] = useState<Snapshot>({ forId: null, session: null, state: "connecting" });
  const [pausedFor, setPausedFor] = useState<string | null>(null);
  const control = useRef<StreamControl | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const keep = (prev: Snapshot) => (prev.forId === sessionId ? prev.session : null);
    let reopening = false;
    const retrying = (prev: Snapshot) => prev.forId === sessionId && prev.state === "retrying";
    const open = () => {
      // A reopened stream shows `connecting` (or still `retrying`) until it opens, with the last session kept.
      if (reopening)
        setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: retrying(prev) ? "retrying" : "connecting" }));
      reopening = true;
      const es = new EventSource(`/api/session/${encodeURIComponent(sessionId)}/events`);
      es.onopen = () => {
        ctl.opened();
        setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "open" }));
      };
      es.onmessage = (e: MessageEvent<string>) => {
        ctl.activity();
        try {
          setSnap({ forId: sessionId, session: JSON.parse(e.data) as Session, state: "open" });
        } catch {
          // A malformed frame is skipped; the next snapshot carries the full session again.
        }
      };
      es.addEventListener("gone", () => {
        ctl.stop();
        setSnap({ forId: sessionId, session: null, state: "gone" });
      });
      es.onerror = () => {
        // CONNECTING means EventSource is retrying on its own; CLOSED means it gave up on a non-stream reply (a 429
        // or 503), so the control reopens it after a wait (I-033).
        if (es.readyState !== EventSource.CLOSED) {
          setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "connecting" }));
          return;
        }
        ctl.failed();
        setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "retrying" }));
      };
      return es;
    };
    const ctl = new StreamControl({
      open,
      onPause: (p) => setPausedFor(p ? sessionId : null),
      idleMs: idleMsOverride(),
      idlePause,
    });
    control.current = ctl;
    const onVisibility = () => ctl.setHidden(document.visibilityState === "hidden");
    const onInput = () => ctl.activity();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onInput, { capture: true });
    window.addEventListener("keydown", onInput, { capture: true });
    ctl.start(document.visibilityState === "hidden");
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onInput, { capture: true });
      window.removeEventListener("keydown", onInput, { capture: true });
      ctl.stop();
      if (control.current === ctl) control.current = null;
    };
  }, [sessionId, idlePause]);

  const resume = useCallback(() => control.current?.resume(), []);
  const paused = sessionId !== null && pausedFor === sessionId;

  if (!sessionId || snap.forId !== sessionId) return { session: null, state: "connecting", paused, resume };
  return { session: snap.session, state: snap.state, paused, resume };
}
