"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SayFn } from "@/components/assistant/AssistantPanel";
import { Check, ChevronDown, ChevronUp, List } from "lucide-react";
import { FOCUS, PRESS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { canSend, playScenario, type PlayerState } from "@/lib/demo/player";
import { scenarioProgress, scenariosFor, type Scenario } from "@/lib/demo/scenarios";
import { playStep, pt, type PhoneTextKey } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import type { Session } from "@/types/session";

// D2 scenario guide (docs/UX.md Flow C): an optional column, open by default from 1440px wide, that lists what to try on this kiosk.
// Choosing one starts a fresh order; each step's sentence is a chip that sends it as the user's message, and the check
// mark ticks from the live session. [Play it for me] sends the same sentences through the same path, one per step, and
// stops at the confirm card: nothing here confirms or pays. Surfaces follow the phone design (docs/UI_GUIDE.md "Phone
// design"): a cream column with white cards and soft shadows, tinted tags and sentence chips, no dark outlines.

/** A sentence to send: the phone's "Try saying" look at the guide's 16px. */
const SAY_CHIP = `min-h-14 rounded-tile bg-kibo-tint px-4 py-2 text-left text-base text-kibo-deep active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`;

const TAG_TEXT: Record<Scenario["tags"][number], PhoneTextKey> = {
  ordering: "tagOrdering",
  safety: "tagSafety",
  grounding: "tagGrounding",
  accessibility: "tagAccessibility",
  learned: "tagLearned",
};

interface Props {
  kiosk: KioskData;
  session: Session | null;
  sessionId: string;
  locale: Locale;
  /**
   * The phone half's send: the same path as typing. Absent in "Use my phone" mode, where the judge talks to their own
   * phone: the sentences stay as text to say, and nothing here sends or plays.
   */
  send?: SayFn;
  starting: boolean;
  startFailed: boolean;
  /** A fresh demo order, the same as [Try again]. */
  onFresh(): void;
  /** From 1440px wide: open at first (I-132), with "What the AI did" under it instead of under the phone (I-084). */
  wide: boolean;
  aside?: ReactNode;
}

export function ScenarioGuide(props: Props) {
  const { locale } = props;
  const scenarios = scenariosFor(props.kiosk.kioskId);
  // Mounted only after the demo order starts, so `wide` is the real width here.
  const [open, setOpen] = useState(props.wide);
  const [chosen, setChosen] = useState<{ id: string; from: string } | null>(null);
  const scenario = scenarios.find((s) => s.id === chosen?.id);

  function choose(s: Scenario) {
    // With the judge's own phone a fresh order would need a new scan, so the checklist follows the current one.
    if (!props.send) {
      setChosen({ id: s.id, from: "" });
      return;
    }
    // The session it was chosen in is left behind; the checklist waits for the fresh one.
    setChosen({ id: s.id, from: props.sessionId });
    props.onFresh();
  }

  let body;
  if (!scenario || !chosen) {
    body = (
      <>
        <p className="text-base text-muted">{pt(props.send ? "scenariosLead" : "scenariosLeadOwnPhone", locale)}</p>
        <ul className="flex flex-col gap-3">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                data-scenario={s.id}
                onClick={() => choose(s)}
                className={`flex w-full flex-col items-start gap-2 rounded-tile bg-white p-4 text-left shadow-card active:bg-kibo-tint ${PRESS} ${FOCUS}`}
              >
                <span className="text-xl font-bold">{s.title[locale]}</span>
                <span className="text-base font-semibold text-[#33302B]">{s.persona[locale]}</span>
                <span className="text-base text-muted">{s.goal[locale]}</span>
                <span className="flex flex-wrap gap-2">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded-full bg-kibo-tint px-2 text-base text-kibo-deep">
                      {pt(TAG_TEXT[t], locale)}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else {
    const stale = props.sessionId === chosen.from;
    body = (
      <>
        <button type="button" onClick={() => setChosen(null)} className={SECONDARY}>
          {pt("allScenarios", locale)}
        </button>
        <h3 className="text-xl font-bold">{scenario.title[locale]}</h3>
        <p className="text-base text-muted">{scenario.goal[locale]}</p>
        {stale ? (
          <p role="status" className="text-base font-semibold text-[#33302B]">
            {pt(props.starting || !props.startFailed ? "scenarioStarting" : "scenarioStartFailed", locale)}
          </p>
        ) : (
          // Keyed by session: [Try again] on the phone starts the checklist over with the new order.
          <Checklist key={props.sessionId} {...props} scenario={scenario} />
        )}
      </>
    );
  }

  if (scenarios.length === 0) return null;
  return (
    <section data-scenario-guide aria-label={pt("scenarios", locale)} className={`flex h-full flex-none flex-col gap-2 ${open || props.aside ? "w-80" : ""}`}>
      {/* A 32px caption row like the kiosk's and the phone's, so the three columns start on one line (design QA
          10-15, #1 4). The toggle's 56px target reaches 12px above and below the row; the drawn pill is 32px. */}
      <div className="flex h-8 flex-none items-center justify-end">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="demo-scenario-guide"
          onClick={() => setOpen(!open)}
          className={`group -my-3 flex h-14 min-w-14 items-center justify-center rounded-full ${PRESS} ${FOCUS}`}
        >
          <span className="flex h-8 items-center gap-2 rounded-full bg-white px-4 text-base font-semibold text-ink shadow-card transition-colors duration-150 ease-out group-active:bg-kibo-tint">
            <List size={20} strokeWidth={2} aria-hidden />
            {pt("scenarios", locale)}
            {open ? <ChevronUp size={20} strokeWidth={2} aria-hidden /> : <ChevronDown size={20} strokeWidth={2} aria-hidden />}
          </span>
        </button>
      </div>
      {open && (
        // The column's free height, but the cream panel is only as tall as its content and scrolls past it, so one
        // scenario card leaves no empty cream under it (design QA 10-15, #1 12).
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            id="demo-scenario-guide"
            lang={locale}
            className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-sheet bg-cream p-4 text-ink shadow-card"
          >
            {body}
          </div>
        </div>
      )}
      {props.aside}
    </section>
  );
}

function Checklist(props: Props & { scenario: Scenario }) {
  const { scenario, locale, send } = props;
  const learned = props.kiosk.kind === "learned";
  // The stream may still hold the previous order for a moment after a fresh one starts.
  const live = props.session?.sessionId === props.sessionId ? props.session : null;

  // Steps done so far; it only grows, because some checks stop holding once the order moves on (I-126).
  const [done, setDone] = useState(0);
  const reached = live ? scenarioProgress(live, scenario, done).doneSteps : done;
  if (reached !== done) setDone(reached);

  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
  });
  const [play, setPlay] = useState<PlayerState>({ phase: "idle" });
  const player = useRef<ReturnType<typeof playScenario> | null>(null);
  useEffect(() => () => player.current?.stop(), []);

  const playing = play.phase === "sending" || play.phase === "waiting" || play.phase === "paused";
  const finished = done >= scenario.steps.length;
  // The last tick can leave "Your turn" under the column's bottom edge (I-131): bring it into view once.
  const yourTurn = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (finished) yourTurn.current?.scrollIntoView({ block: "nearest" });
  }, [finished]);
  const sendable = live !== null && canSend(live.status);
  // Scenarios assume the dine option is set first (src/lib/demo/scenarios.ts); otherwise checkout would ask for it.
  const dineFirst = props.kiosk.dineOptions !== undefined && live !== null && live.dineOption === null;

  function start() {
    if (!send) return;
    player.current = playScenario(scenario, locale, done, {
      send,
      session: () => latest.current,
      onState: setPlay,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
  }

  let status: string | null = null;
  if (play.phase === "sending" || play.phase === "waiting") status = playStep(play.phase === "waiting", play.step + 1, scenario.steps.length, locale);
  else if (play.phase === "paused") status = pt("playPaused", locale);
  else if (play.phase === "stopped") status = pt("playStopped", locale);
  else if (play.phase === "failed") status = pt(play.reason === "limit" ? "playLimit" : "playFailed", locale);

  return (
    <>
      {!finished && dineFirst && <p className="rounded-tile bg-staff-tint px-4 py-3 text-base font-semibold text-staff-ink">{pt("scenarioDineFirst", locale)}</p>}
      {!finished &&
        send &&
        (playing ? (
          <button type="button" onClick={() => player.current?.stop()} className={SECONDARY}>
            {pt("stopPlaying", locale)}
          </button>
        ) : (
          <button type="button" disabled={!sendable || dineFirst} onClick={start} className={PRIMARY}>
            {pt("playForMe", locale)}
          </button>
        ))}
      <p role="status" className="text-base font-semibold text-[#33302B] empty:hidden">
        {status}
      </p>
      {!finished && <p className="text-base text-muted">{pt(send ? "scenarioSayHint" : "scenarioOwnPhoneHint", locale)}</p>}
      <ol className="flex flex-col gap-4">
        {scenario.steps.map((step, i) => {
          const ticked = i < done;
          return (
            <li key={i} data-scenario-step={i} data-done={ticked} className="flex gap-3">
              <span
                aria-hidden
                className={`flex size-8 flex-none items-center justify-center rounded-full text-base font-bold ${
                  ticked ? "bg-kibo text-white" : "bg-white text-kibo-deep shadow-card"
                }`}
              >
                {ticked ? <Check size={20} strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {send ? (
                  <button
                    type="button"
                    disabled={playing || !sendable}
                    onClick={() => void send(step.say[locale])}
                    className={SAY_CHIP}
                  >
                    {step.say[locale]}
                  </button>
                ) : (
                  <p data-scenario-say className="rounded-tile bg-white px-4 py-2 text-base text-ink shadow-card">
                    “{step.say[locale]}”
                  </p>
                )}
                <p className="text-base text-muted">{step.watch[locale]}</p>
                {ticked && <p className="text-base font-bold text-kibo-deep">{pt("stepDoneLabel", locale)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {finished && (
        <p ref={yourTurn} data-scenario-your-turn className="rounded-tile bg-kibo-tint px-4 py-3 text-xl text-kibo-deep">
          {/* After payment the "tap Yes, pay now" step is done, so the line points on instead (I-144). */}
          {live?.status === "paid" ? (
            pt("scenarioPaid", locale)
          ) : live?.status === "paying" ? (
            pt("yourTurnCard", locale)
          ) : learned ? (
            pt("yourTurnLearned", locale)
          ) : (
            <>
              {pt("yourTurnPre", locale)}
              <strong>{pt("payNow", locale)}</strong>
              {pt("yourTurnPost", locale)}
            </>
          )}
        </p>
      )}
    </>
  );
}
