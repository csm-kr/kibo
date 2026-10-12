import { describe, expect, it } from "vitest";
import { newSession } from "@/lib/commands/session";
import type { CartLine, Session } from "@/types/session";
import { PAUSE_MS, playScenario, STEP_TIMEOUT_MS, type PlayerDeps, type PlayerState, type SendResult } from "./player";
import { scenariosFor, type Scenario } from "./scenarios";

const byId = (kioskId: string, id: string): Scenario => {
  const s = scenariosFor(kioskId).find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

function session(over: Partial<Session> = {}): Session {
  return { ...newSession({ sessionId: "s".repeat(16), kioskId: "malo", demo: true, now: 0 }), status: "ordering", ...over };
}

function line(over: Partial<CartLine>): CartLine {
  return { lineId: "l1", itemId: "cola", variant: "single", qty: 1, selections: {}, unitPrice: 1800, ...over };
}

/**
 * A fake world: a clock that sleep advances, a session the fake agent changes when a sentence is sent, and every
 * state the player reports.
 */
function world(start: Session, agent: (text: string, s: Session) => { session?: Session; result?: SendResult } | void) {
  let current: Session | null = start;
  let clock = 0;
  const sent: string[] = [];
  const states: PlayerState[] = [];
  const sleeps: number[] = [];
  const deps: PlayerDeps = {
    async send(text) {
      sent.push(text);
      const r = current ? agent(text, current) : undefined;
      if (r?.session) current = r.session;
      return r?.result ?? "ok";
    },
    session: () => current,
    onState: (s) => states.push(s),
    async sleep(ms) {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  };
  return { deps, sent, states, sleeps, set: (s: Session | null) => (current = s), clock: () => clock };
}

const phases = (states: PlayerState[]) => states.map((s) => s.phase);

const sunja = byId("malo", "sunja-lunch");
const sets = (side: string): CartLine[] => [
  line({ lineId: "a", itemId: "cheese_burger", variant: "set", selections: { side: [side], drink: ["zero_cola"] } }),
  line({ lineId: "b", itemId: "cheese_burger", variant: "set", selections: { side: [side], drink: ["cider"] } }),
];

/** The hero order going as planned: each sentence makes its step's change. */
function heroAgent(text: string, s: Session) {
  if (text === sunja.steps[0].say.en) return { session: { ...s, cart: sets("fries_m") } };
  if (text === sunja.steps[1].say.en) return { session: { ...s, cart: sets("fries_l") } };
  if (text === sunja.steps[2].say.en) return { session: { ...s, status: "confirming" as const } };
}

describe("playScenario", () => {
  it("goes sending → waiting → paused for each step and ends done at the confirm card", async () => {
    const w = world(session({ dineOption: "eat_in" }), heroAgent);
    await playScenario(sunja, "en", 0, w.deps).finished;
    expect(w.sent).toEqual(sunja.steps.map((s) => s.say.en));
    expect(phases(w.states)).toEqual(["sending", "waiting", "paused", "sending", "waiting", "paused", "sending", "waiting", "done"]);
    expect(w.states.slice(0, 3)).toEqual([
      { phase: "sending", step: 0 },
      { phase: "waiting", step: 0 },
      { phase: "paused", step: 1 },
    ]);
    // The 1.5 s pause between steps, so a viewer can watch the kiosk.
    expect(w.sleeps.filter((ms) => ms === PAUSE_MS)).toHaveLength(2);
  });

  it("sends in the chosen language", async () => {
    const halal = byId("malo", "halal");
    const w = world(session(), (text, s) =>
      text === halal.steps[0].say.ko ? { session: { ...s, staffCalled: { reasonCode: "unknown_info" as const, at: 0 } } } : undefined,
    );
    await playScenario(halal, "ko", 0, w.deps).finished;
    expect(w.sent).toEqual(["이거 할랄이에요?"]);
    expect(w.states.at(-1)).toEqual({ phase: "done" });
  });

  it("never sends after confirming, even with steps left", async () => {
    const w = world(session({ status: "confirming" }), () => undefined);
    await playScenario(sunja, "en", 0, w.deps).finished;
    expect(w.sent).toEqual([]);
    expect(w.states).toEqual([{ phase: "failed", step: 0, reason: "error" }]);
  });

  it("stops sending when a step moves the session past ordering before its check holds", async () => {
    // "Just pay for me" on the first sentence: the AI opened the review early. Nothing more is sent.
    const w = world(session({ dineOption: "eat_in" }), (text, s) => (text === sunja.steps[0].say.en ? { session: { ...s, status: "confirming" as const } } : undefined));
    await playScenario(sunja, "en", 0, w.deps).finished;
    expect(w.sent).toEqual([sunja.steps[0].say.en]);
    expect(w.states.at(-1)).toEqual({ phase: "failed", step: 0, reason: "timeout" });
  });

  it("sends at most one message per step and fails after 20 s without retrying", async () => {
    const w = world(session({ dineOption: "eat_in" }), () => undefined);
    await playScenario(sunja, "en", 0, w.deps).finished;
    expect(w.sent).toEqual([sunja.steps[0].say.en]);
    expect(w.states.at(-1)).toEqual({ phase: "failed", step: 0, reason: "timeout" });
    expect(w.clock()).toBeGreaterThanOrEqual(STEP_TIMEOUT_MS);
    expect(w.clock()).toBeLessThan(STEP_TIMEOUT_MS + 1000);
  });

  it("fails on a send error or the demo message limit, without a retry", async () => {
    for (const result of ["error", "limit"] as const) {
      const w = world(session(), () => ({ result }));
      await playScenario(sunja, "en", 0, w.deps).finished;
      expect(w.sent).toHaveLength(1);
      expect(w.states.at(-1)).toEqual({ phase: "failed", step: 0, reason: result });
    }
  });

  it("stop ends it at once, and nothing is sent afterwards", async () => {
    const w = world(session({ dineOption: "eat_in" }), heroAgent);
    let stop = () => {};
    const deps: PlayerDeps = {
      ...w.deps,
      onState: (s) => {
        w.states.push(s);
        if (s.phase === "paused") stop();
      },
    };
    const player = playScenario(sunja, "en", 0, deps);
    stop = player.stop;
    await player.finished;
    expect(w.sent).toEqual([sunja.steps[0].say.en]);
    expect(w.states.at(-1)).toEqual({ phase: "stopped", step: 1 });
  });

  it("skips steps already done, from the panel's count or by the session", async () => {
    // The judge typed the first sentence themselves: the player starts at step 2.
    const w = world(session({ dineOption: "eat_in", cart: sets("fries_m") }), heroAgent);
    await playScenario(sunja, "en", 1, w.deps).finished;
    expect(w.sent).toEqual([sunja.steps[1].say.en, sunja.steps[2].say.en]);

    const u = world(session({ dineOption: "eat_in", cart: sets("fries_m") }), heroAgent);
    await playScenario(sunja, "en", 0, u.deps).finished;
    expect(u.sent[0]).toBe(sunja.steps[1].say.en);
  });

  it("an undo scenario counts the empty cart only after the add", async () => {
    const undo = byId("malo", "undo");
    const w = world(session(), (text, s) => {
      if (text === undo.steps[0].say.en) return { session: { ...s, cart: [line({})] } };
      if (text === undo.steps[1].say.en) return { session: { ...s, cart: [] } };
    });
    await playScenario(undo, "en", 0, w.deps).finished;
    expect(w.sent).toEqual(undo.steps.map((s) => s.say.en));
    expect(w.states.at(-1)).toEqual({ phase: "done" });
  });

  it("fails without sending when there is no session", async () => {
    const w = world(session(), () => undefined);
    w.set(null);
    await playScenario(sunja, "en", 0, w.deps).finished;
    expect(w.sent).toEqual([]);
    expect(w.states).toEqual([{ phase: "failed", step: 0, reason: "error" }]);
  });
});
