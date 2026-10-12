"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/types/session";

export type StreamState = "connecting" | "open" | "gone" | "error";

interface Snapshot {
  /** The session id this snapshot belongs to, so a new id never shows the old session. */
  forId: string | null;
  session: Session | null;
  state: StreamState;
}

/** Reads the session through the server's SSE route (ADR-010). EventSource reconnects on its own. */
export function useSessionStream(sessionId: string | null): { session: Session | null; state: StreamState } {
  const [snap, setSnap] = useState<Snapshot>({ forId: null, session: null, state: "connecting" });

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/session/${encodeURIComponent(sessionId)}/events`);
    const keep = (prev: Snapshot) => (prev.forId === sessionId ? prev.session : null);
    es.onopen = () => setSnap((prev) => ({ forId: sessionId, session: keep(prev), state: "open" }));
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        setSnap({ forId: sessionId, session: JSON.parse(e.data) as Session, state: "open" });
      } catch {
        // A malformed frame is skipped; the next snapshot carries the full session again.
      }
    };
    es.addEventListener("gone", () => {
      es.close();
      setSnap({ forId: sessionId, session: null, state: "gone" });
    });
    es.onerror = () => {
      // CONNECTING means EventSource is retrying; CLOSED means it gave up (a non-stream reply).
      const state = es.readyState === EventSource.CLOSED ? "error" : "connecting";
      setSnap((prev) => ({ forId: sessionId, session: keep(prev), state }));
    };
    return () => es.close();
  }, [sessionId]);

  if (!sessionId || snap.forId !== sessionId) return { session: null, state: "connecting" };
  return { session: snap.session, state: snap.state };
}
