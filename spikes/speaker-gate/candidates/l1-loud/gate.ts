// Loudness gate v2 (layer L1, spikes/speaker-gate/candidates.md F): keep the voice near the phone, drop what is too
// quiet, and never lock the customer out. Pure logic with no Node or browser API, so it can be lifted into the app's
// audio path as is: feed it each microphone frame (40 ms at 16 kHz in the app) with pushFrame(), or a level in dBFS
// and an optional speech flag with push(). Output: whether the gate is open after each frame, and the stretches when
// it was open (the hold machinery sends audio only inside them and audioStreamEnd at each close).
//
// Speech: by default the gate's own level test (a frame at least vadOverFloorDb over the room floor), no model. A
// voice detector's flag (Silero VAD on the bench) can be passed instead; that is a model that is not Gemini.
//
// What fixes the first gate's faults (spikes/crowd-voice/nearGate.ts, README "Limits"):
// - The level is the loudest talker of the last 5 s, learned only from runs of speech of at least 0.6 s (a bang or a
//   short burst never moves it; 75th percentile of the run's last 0.6 s). A quieter voice under a louder one never
//   pulls it down (v1: a bystander within 9 dB lowered the bar), and when nobody louder has talked for 5 s the
//   quieter talker sets it: a lone talker is never gated out, so a customer who speaks more quietly is heard again
//   (v1: never, without a restart). The trade: a quieter bystander talking alone is kept too.
// - An enrolment (warm start) sets the level only until the first run of speech in the live audio; when that run
//   sets a lower level, the gate opens back to where the run began (the app must hold that much audio back).
// - The room floor falls at once and rises slowly (WebRTC AGC2); the bar is never under floor + 6 dB.
// - After KIBO asks a question (asked()), the bar is 6 dB lower for 4 s, for a quiet short answer.
// - Opens on 2 near frames of the last 3, with a 0.2 s pre-roll (heldBack); closes 0.7 s after the last near frame,
//   or after 10 s open (the turn cap), and then opens again at once if the talk goes on.
// Depth 6 dB was chosen on the bench's development slice (SWEEP.md); the other values are design choices, not tuned.

export interface GateParams {
  /** Frame length in ms: 40 in the app, 32 for the bench's Silero windows. */
  frameMs: number;
  /** How far under the customer's learned speech level the bar sits. */
  depthDb: number;
  hangMs: number;
  preRollMs: number;
  /** Speech needed in one run before it teaches the level. */
  commitMs: number;
  /** The level is the loudest run of speech within this window. */
  anchorMs: number;
  minOverFloorDb: number;
  floorRiseDbPerS: number;
  /** The built-in speech test when no flag is given: this far over the room floor. */
  vadOverFloorDb: number;
  askDb: number;
  askMs: number;
  /** A turn open this long is ended (activity end) and the next starts at once: at 0 dB the talk never pauses. */
  maxTurnMs: number;
  /** Where the level comes from. "recent" (the default): the loudest run of speech in the last anchorMs; a lone talker
   *  is never gated out. "first-turn": the loudest 0.6 s of the first turn the gate opened for (the recent rule
   *  until then). "enrol": the enrolment's level (first-turn without one). In both anchored modes the level then
   *  moves only with speech the gate accepted that lies within learnWithinDb of it, at most learnDbPerChunk per
   *  0.6 s, both ways, and nothing decays: a customer far under it does not open the gate and needs the hold-to-talk
   *  fallback. (Without the "within" test a neighbour heard during a hang-over or an overlap pulled it down step by
   *  step: -17 to -29 dB in 30 s on a flow trial.) */
  anchor: "recent" | "first-turn" | "enrol";
  learnDbPerChunk: number;
  learnWithinDb: number;
  /** Where a turn that opens on a run already under way starts. "run" (the default): at the start of the run once it
   *  has taught a level, so a talker who just lowered the bar is not cut. "near": the same before the anchor is known,
   *  but once it is, at the first frame over the bar (minus the pre-roll), never earlier. kibo-59 11-27: with "run" an
   *  anchored turn pulled 1.5 to 3.4 s of a neighbour's sentence in front of the customer's words (f0003, f0008,
   *  f0012). */
  reachBack: "run" | "near";
  /** Anchored modes: when the first turn closes and sets the anchor, it is sent from its first frame within depthDb of
   *  that anchor (minus the pre-roll), so a quieter talker's lead-in is dropped (kibo-59 11-27: a neighbour opened the
   *  gate at about 1 s and stayed in the hero order's turn, f0020, f0024, f0062). The first turn's start is only known
   *  at its close, so the app must hold its audio until then and send it in a burst. A lone quiet talker is not
   *  trimmed: the anchor is their own level. */
  trimFirstTurn: boolean;
  /** Anchored modes: a run of speech more than learnWithinDb over the anchor, accepted in a turn, lifts the anchor to
   *  its level when that turn closes, unless the cap ended the turn or it began straight out of a capped one
   *  (kibo-59 11-27, I-471: whoever talked first in a turn of their own set the anchor, and a louder customer never
   *  moved it). Down it still learns only within learnWithinDb. The cost: a louder passer-by lifts it too, and the
   *  customer is then kept out until they press (the app's hint to hold the button). */
  anchorRise: boolean;
}

export const DEFAULTS: GateParams = {
  frameMs: 40,
  depthDb: 6,
  hangMs: 700,
  preRollMs: 200,
  commitMs: 600,
  anchorMs: 5000,
  minOverFloorDb: 6,
  floorRiseDbPerS: 1,
  vadOverFloorDb: 10,
  askDb: 6,
  askMs: 4000,
  // Longer than any customer sentence on the bench (8.9 s) plus pre-roll and hang-over (0.9 s).
  maxTurnMs: 10000,
  anchor: "recent",
  learnDbPerChunk: 0.5,
  learnWithinDb: 3,
  reachBack: "run",
  trimFirstTurn: false,
  anchorRise: false,
};

/** The 11-27 pick from the offline screen (screen.ts; README "The pick"): the customer's level from the first turn,
 *  6 dB deep, no lowering after a question (it opened the gate on a lone -10 dB neighbour 86 to 89% of the time),
 *  1.0 s hang-over (no English sentence cut in two), 10 s cap, learning only within 3 dB. Use loudGate(PICK). */
export const PICK: Partial<GateParams> = { anchor: "first-turn", depthDb: 6, askDb: 0, hangMs: 1000 };

/** A frame's level in dBFS (samples in -1..1). */
export function frameDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(Math.max(s / Math.max(1, x.length), 1e-10));
}

function p75(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.75)];
}

export function loudGate(params: Partial<GateParams> = {}) {
  const p = { ...DEFAULTS, ...params };
  const F = p.frameMs;
  const commit = Math.max(1, Math.round(p.commitMs / F));
  const hangFrames = Math.max(1, Math.round(p.hangMs / F));
  let k = 0;
  let floor: number | null = null;
  /** The enrolment's level, used until the live audio has a run of speech. */
  let seed: number | null = null;
  /** Committed runs of speech: their level and when they last spoke. */
  const runs: { level: number; at: number }[] = [];
  let level: number | null = null;
  let run: number[] = [];
  let runStart = 0;
  let prevChunk: number | null = null;
  let askedAt = -Infinity;
  const near: boolean[] = [];
  let open = false;
  let start = 0;
  let lastNearEnd = 0;
  let hang = 0;
  const closed: [number, number][] = [];
  let warm = false;
  /** Anchored modes: the customer's level once known, and the loudest chunk of the first turn while it lasts. */
  let anchored: number | null = null;
  let firstTurnMax: number | null = null;
  /** trimFirstTurn: every frame's level until the anchor is set (at most the first turn plus the quiet before it). */
  let early: number[] = [];
  /** anchorRise: the loudest run over the anchor's learning window in the open turn, and how many lifts so far. */
  let riseTo: number | null = null;
  let rises = 0;
  let capped = false;
  let fromCap = false;

  function closeTurn(seg: [number, number], byCap = false) {
    open = false;
    if (p.anchorRise && anchored !== null && riseTo !== null && !byCap && !fromCap) {
      anchored = riseTo;
      rises++;
    }
    riseTo = null;
    capped = byCap;
    if (p.anchor !== "recent" && anchored === null && firstTurnMax !== null) {
      anchored = firstTurnMax;
      if (p.trimFirstTurn) {
        const from = early.findIndex((e, i) => i * F >= seg[0] && e >= anchored! - p.depthDb);
        if (from >= 0) seg = [Math.max(seg[0], from * F - p.preRollMs), seg[1]];
      }
      early = [];
    }
    closed.push(seg);
  }

  /** Updates the floor and returns whether the frame is speech (the given flag, or the level test). */
  function track(e: number, flag: boolean | undefined, t: number): boolean {
    floor = floor === null || e < floor ? e : floor + Math.min(e - floor, (p.floorRiseDbPerS * F) / 1000);
    const speech = flag ?? e >= floor + p.vadOverFloorDb;
    if (speech && e >= floor + p.minOverFloorDb) {
      if (!run.length) {
        runStart = t;
        prevChunk = null;
      }
      run.push(e);
    } else run = [];
    // Every 0.6 s of a run is one entry; after the first, the lower of it and the chunk before, so a short loud
    // sound inside speech cannot raise the level either.
    if (run.length >= commit && run.length % commit === 0) {
      const chunk = p75(run.slice(-commit));
      const v = prevChunk === null ? chunk : Math.min(chunk, prevChunk);
      runs.push({ level: v, at: t });
      prevChunk = chunk;
      if (p.anchor !== "recent" && open) {
        if (anchored !== null) {
          if (Math.abs(v - anchored) <= p.learnWithinDb) anchored += Math.max(-p.learnDbPerChunk, Math.min(p.learnDbPerChunk, v - anchored));
          else if (v > anchored) riseTo = Math.max(riseTo ?? -Infinity, v);
        }
        else firstTurnMax = Math.max(firstTurnMax ?? -Infinity, v);
      }
    }
    while (runs.length && t - runs[0].at > p.anchorMs) runs.shift();
    level = anchored ?? (runs.length ? Math.max(...runs.map((r) => r.level)) : seed);
    return speech;
  }

  function bar(t: number): number {
    const minBar = floor! + p.minOverFloorDb;
    if (level === null) return minBar;
    const ask = t - askedAt < p.askMs ? p.askDb : 0;
    return Math.max(minBar, level - p.depthDb - ask);
  }

  function push(e: number, flag?: boolean): boolean {
    if (warm) {
      // The live audio starts after a warm start: its own clock and room floor, the learned level kept.
      warm = false;
      seed = runs.length ? Math.max(...runs.map((r) => r.level)) : null;
      if (p.anchor === "enrol") anchored = seed;
      runs.length = 0;
      k = 0;
      floor = null;
      run = [];
      early = [];
    }
    if (p.trimFirstTurn && anchored === null) early.push(e);
    const t = k * F;
    const speech = track(e, flag, t);
    const isNear = speech && e >= bar(t);
    near.push(isNear);
    if (near.length > 3) near.shift();
    if (isNear) lastNearEnd = t + F;
    if (!open && isNear && near.filter(Boolean).length >= 2) {
      open = true;
      const firstNear = t - F * (near.length - 1 - near.indexOf(true));
      const prevEnd = closed.length ? closed[closed.length - 1][1] : 0;
      // When a run's own level just lowered the bar, its earlier frames belong to the same talker: reach back.
      const reach = run.length >= commit && !(p.reachBack === "near" && anchored !== null);
      const from = reach ? Math.min(firstNear, runStart) : firstNear;
      start = Math.max(prevEnd, from - p.preRollMs, 0);
      fromCap = capped && start - prevEnd < p.hangMs;
      hang = hangFrames;
    } else if (open) {
      if (isNear) hang = hangFrames;
      else hang--;
      if (hang <= 0) closeTurn([start, lastNearEnd + p.hangMs]);
      // The cap: this frame closes the turn; the next near frame opens a new one from here.
      else if (t + F - start >= p.maxTurnMs) closeTurn([start, t + F], true);
    }
    k++;
    return open;
  }

  return {
    /** An enrolment (a warm start): learn the customer's level from it; nothing is sent. */
    learn(e: number, flag?: boolean) {
      warm = true;
      track(e, flag, k * F);
      k++;
    },
    /** One frame's level in dBFS (and a voice detector's flag, if any); returns whether the gate is open. */
    push,
    /** One microphone frame of samples; returns whether the gate is open. */
    pushFrame: (x: Float32Array, flag?: boolean) => push(frameDb(x), flag),
    /** KIBO just asked a question: accept a quieter voice for a few seconds. */
    asked() {
      askedAt = k * F;
    },
    level: () => level,
    /** Anchored modes: whether the customer's level is known (false until the first turn closes). */
    anchored: () => anchored !== null,
    /** anchorRise: how many times the anchor has been lifted. */
    rises: () => rises,
    closedSegments: () => [...closed],
    /** Closed segments and the open one up to now, in ms from the first frame. */
    segments: (): [number, number][] => (open ? [...closed, [start, Math.max(k * F, lastNearEnd + p.hangMs)]] : [...closed]),
  };
}
