"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StreamControl } from "@/lib/client/streamControl";
import type { Session } from "@/types/session";

export type StreamState = "connecting" | "open" | "gone" | "error";

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
 * (src/lib/client/streamControl.ts). The last session stays while closed; the first frame after reopening is a
 * full snapshot.
 */
export function useSessionStream(sessionId: string | null): {
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
    const open = () => {
      // A reopened stream shows `connecting` until its first frame, with the last session kept meanwhile.
      if (reopening) setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "connecting" }));
      reopening = true;
      const es = new EventSource(`/api/session/${encodeURIComponent(sessionId)}/events`);
      es.onopen = () => setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "open" }));
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
        // CONNECTING means EventSource is retrying; CLOSED means it gave up (a non-stream reply).
        const state = es.readyState === EventSource.CLOSED ? "error" : "connecting";
        setSnap((prev) => ({ forId: sessionId, session: keep(prev), state }));
      };
      return es;
    };
    const ctl = new StreamControl({
      open,
      onPause: (p) => setPausedFor(p ? sessionId : null),
      idleMs: idleMsOverride(),
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
  }, [sessionId]);

  const resume = useCallback(() => control.current?.resume(), []);
  const paused = sessionId !== null && pausedFor === sessionId;

  if (!sessionId || snap.forId !== sessionId) return { session: null, state: "connecting", paused, resume };
  return { session: snap.session, state: snap.state, paused, resume };
}
