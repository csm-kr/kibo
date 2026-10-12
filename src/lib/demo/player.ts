import type { Locale } from "@/types/menu";
import type { Session, SessionStatus } from "@/types/session";
import { scenarioProgress, type Scenario } from "./scenarios";

// "Play it for me" on /demo: sends each step's sentence through the same path as typing (the real agent), waits for
// the step's check on the live session, pauses so a viewer can watch the kiosk, then goes on. One message per step,
// no retries, and nothing is ever sent once the session is past ordering: the confirm and the card stay the judge's.

export type SendResult = "ok" | "error" | "limit";

export type PlayerState =
  | { phase: "idle" }
  | { phase: "sending" | "waiting" | "paused"; step: number }
  | { phase: "done" }
  | { phase: "stopped"; step: number }
  | { phase: "failed"; step: number; reason: "timeout" | SendResult };

export interface PlayerDeps {
  /** Sends one user message as if typed; resolves when the agent has answered. */
  send(text: string): Promise<SendResult>;
  /** The latest session from the stream. */
  session(): Session | null;
  onState(state: PlayerState): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** Counted from the agent's answer, not from the send: a slow /api/chat reply (p90 about 11 s) is not a failed step. */
export const STEP_TIMEOUT_MS = 20_000;
export const PAUSE_MS = 1_500;
const POLL_MS = 250;
/** A sentence is sent only in these states; from `confirming` on, the next move is the user's tap. */
const SENDABLE: SessionStatus[] = ["idle", "connected", "ordering"];

export function canSend(status: SessionStatus): boolean {
  return SENDABLE.includes(status);
}

/** Starts at `from` (the steps the panel already counts as done). */
export function playScenario(scenario: Scenario, locale: Locale, from: number, deps: PlayerDeps) {
  let stopped = false;
  let step = from;
  const set = (state: PlayerState) => {
    if (!stopped) deps.onState(state);
  };
  const doneFrom = (s: Session | null, i: number) => (s ? scenarioProgress(s, scenario, i).doneSteps : i);

  async function run() {
    for (;;) {
      const s = deps.session();
      step = doneFrom(s, step);
      if (step >= scenario.steps.length) return set({ phase: "done" });
      if (!s || !canSend(s.status)) return set({ phase: "failed", step, reason: "error" });

      set({ phase: "sending", step });
      const result = await deps.send(scenario.steps[step].say[locale]);
      if (stopped) return;
      if (result !== "ok") return set({ phase: "failed", step, reason: result });

      set({ phase: "waiting", step });
      const deadline = deps.now() + STEP_TIMEOUT_MS;
      while (doneFrom(deps.session(), step) <= step) {
        if (deps.now() >= deadline) return set({ phase: "failed", step, reason: "timeout" });
        await deps.sleep(POLL_MS);
        if (stopped) return;
      }
      step = doneFrom(deps.session(), step);
      if (step >= scenario.steps.length) return set({ phase: "done" });

      set({ phase: "paused", step });
      await deps.sleep(PAUSE_MS);
      if (stopped) return;
    }
  }

  return {
    finished: run(),
    stop() {
      if (stopped) return;
      deps.onState({ phase: "stopped", step });
      stopped = true;
    },
  };
}
