"use client";

import { Bell, ChevronRight, Link2, Mic, Smartphone } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ScrollFade } from "@/components/demo/ScrollFade";
import { ModalLayer } from "@/components/kiosk/ModalLayer";
import { AppBar } from "@/components/phone/AppBar";
import { ConfirmBar, ConfirmCard, DoneCard, PayCard } from "@/components/phone/Checkout";
import { Choices } from "@/components/phone/Choices";
import { keepInView, LastMessage, Messages, StatusChip } from "@/components/phone/Conversation";
import { Dock, TypingSheet, voiceActive } from "@/components/phone/Dock";
import { AiLanguageProvider } from "@/components/phone/language";
import { OrderCard } from "@/components/phone/OrderCard";
import { Suggestions } from "@/components/phone/Suggestions";
import { CARD, FOCUS, ICON, PRESS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { useChat, errorText } from "@/hooks/useChat";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { useNow } from "@/hooks/useNow";
import type { AgentAction } from "@/lib/agent/actions";
import type { StreamState } from "@/hooks/useSessionStream";
import { ping, sendCommand } from "@/lib/client/api";
import type { ChoiceRef } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import type { SendResult } from "@/lib/demo/player";
import { learnedUndoLine } from "@/lib/commands/undo";
import { cartAnnouncement, itemCount, learnedPayHint, phoneSecondsLeft, pt, voiceSecondsLeft } from "@/lib/i18n/phone";
import { followSpeaker } from "@/lib/i18n/heard";
import { lt, uiLocale, type SpeechLanguage } from "@/lib/i18n/languages";
import { formatWon } from "@/lib/kiosk/menu";
import { kioskPickedCard } from "@/lib/kiosk/payment";
import { idleWarning, staffBannerVisible } from "@/lib/kiosk/timers";
import { bridgeNotice, phoneScreen, type BridgeNotice, type PhoneLocal, type PhoneScreenId } from "@/lib/phone/screen";
import { LARGE_TEXT_SCALE } from "@/lib/phone/settings";
import type { KioskData, Locale, LocalizedName } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";

// The phone screen (docs/UX.md P1–P7, PX), shared by /assistant and /demo, in the phone design (docs/UI_GUIDE.md
// "Phone design"): voice (Gemini Live) with text as the fallback. Phone buttons send `source: "button"` only from real
// taps: the server trusts it as a tap (docs/SECURITY.md). The microphone starts only from a tap.

/** P1 is shown once per browser (docs/UX.md A3). */
const MIC_HINT_KEY = "kibo.phone.micHintSeen";
/** Screens that show no messages: P1 and what comes before it. */
const ENTRY_SCREENS = new Set<PhoneScreenId>(["connecting", "inapp", "mic"]);
const noSubscribe = () => () => {};
/** Under this many seconds a /demo order shows its voice time left. */
const SHOW_VOICE_LEFT = 60;
/** Room kept for the cart summary, in rem: its one-line pill (3.5rem) and padding, with some to spare. */
const SUMMARY_REM = 6;

interface Props {
  kiosk: KioskData;
  session: Session | null;
  deviceToken: string | null;
  locale: Locale;
  onLocaleChange(locale: Locale): void;
  /** What the AI speaks (14-final:4); default `locale`. With `onLanguageChange` the app bar offers every AI language. */
  language?: SpeechLanguage;
  onLanguageChange?: (language: SpeechLanguage) => void;
  mode: "phone" | "demo";
  examples?: string[];
  claimError?: PhoneLocal["claimError"];
  streamState?: StreamState;
  /** Server time minus local time, from ping; session times are server time. */
  clockOffset?: number;
  /** /demo only: messages allowed per order (the server's demo limit); then the input gives way to [Try again]. */
  chatLimit?: number;
  /** /demo only: a new demo order. */
  onTryAgain?: () => void;
  /** /demo only: shown next to the order number and on the ended screen (Flow C5). */
  endCard?: ReactNode;
  /** /assistant in an in-app browser: `held` while the claim waits for the user's choice on P1. */
  inApp?: { held: boolean; onStay(): void };
  /** /demo only: receives the panel's own send, for the scenario guide (src/components/demo/ScenarioGuide.tsx). */
  onSay?: (say: SayFn | null) => void;
  /** /demo only: what the AI did (typed or spoken), for the "What the AI did" strip. The phone never shows it. */
  onActions?: (actions: AgentAction[]) => void;
  /** /demo only: one user turn went to the AI (typed, spoken, an example or a choice), for the D3 comparison card. */
  onUserTurn?: () => void;
  /** /assistant: the AI voice setting kept on the phone (/app settings); /demo keeps its own, on by default. */
  voiceOutput?: boolean;
  onVoiceOutputChange?: (on: boolean) => void;
  /**
   * Larger text, in the app bar's sheet (15-judge-fixes:2). /assistant keeps it in the phone settings, which scale the
   * root font size; /demo keeps its own and zooms only this panel, because the kiosk canvas beside it uses rem too.
   */
  largeText?: boolean;
  onLargeTextChange?: (on: boolean) => void;
}

/** A small phone (CSS px, so larger text does not change it): with larger text the dock has no room to spare. */
const NARROW = "(max-width: 380px)";
function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export type SayFn = (text: string) => Promise<SendResult>;

/** The parent keys this by session id, so local flags never carry over to a new session. */
export function AssistantPanel(props: Props) {
  const { kiosk, session, deviceToken, locale, mode } = props;
  const language = props.language ?? locale;
  const clockOffset = props.clockOffset ?? 0;
  const [doneDismissed, setDoneDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  // Typed and spoken turns share one utteranceSeq (I-079).
  const utterances = useRef(0);
  const chat = useChat({
    sessionId: session?.sessionId ?? null,
    token: deviceToken,
    locale,
    language,
    nextSeq: () => ++utterances.current,
    onActions: props.onActions,
    onSend: props.onUserTurn,
  });
  const now = useNow();

  // /demo has its own intro and a judge may have no microphone, so only the phone shows P1.
  const micHintStored = useSyncExternalStore(noSubscribe, () => localStorage.getItem(MIC_HINT_KEY) !== null, () => true);
  const [micHintDone, setMicHintDone] = useState(false);
  const micHint = mode === "phone" && !micHintStored && !micHintDone;
  function finishMicHint() {
    localStorage.setItem(MIC_HINT_KEY, "1");
    setMicHintDone(true);
  }

  // A learned kiosk (KIBO Learn): the bridge enters each change on the kiosk page, and the user pays on the kiosk.
  const learned = kiosk.kind === "learned";
  const ticket = kiosk.domain === "ticket";
  const screen = phoneScreen(
    session,
    {
      claimError: props.claimError ?? null,
      doneDismissed,
      micHint,
      inAppHold: props.inApp?.held ?? false,
    },
    learned,
    kiosk.dineOptions !== undefined,
  );
  const busy = chat.busy || sending || !deviceToken;
  const limited = props.chatLimit !== undefined && chat.sent >= props.chatLimit;
  // The AI's first line (owner 10-17): spoken when voice opens, or the first bubble when typing, while nothing has
  // been said yet and before the review. Phone only: /demo's laptop column keeps its own examples first.
  const greeting =
    mode === "phone" && chat.messages.length === 0 && (session?.status === "connected" || session?.status === "ordering")
      ? lt("greeting", language, kiosk.domain)
      : null;

  // The text field sits behind [Type] in the dock and, once open, stays open for this order until the user closes it
  // (UX C3). /demo opens it at once: a judge on a laptop types more often than they talk.
  const [typing, setTyping] = useState(mode === "demo");
  // The text field gets focus when voice gives way to text; if it is not on screen yet, as soon as it mounts.
  const input = useRef<HTMLInputElement | null>(null);
  const focusPending = useRef(false);
  const inputElement = useCallback((el: HTMLInputElement | null) => {
    input.current = el;
    if (el && focusPending.current) {
      focusPending.current = false;
      el.focus();
    }
  }, []);
  function focusText() {
    // Typing instead of talking: the same greeting the voice would have said, without a model call.
    if (greeting) chat.voice("model", greeting);
    setTyping(true);
    if (input.current) input.current.focus();
    else focusPending.current = true;
  }

  const [ownVoiceOutput, setOwnVoiceOutput] = useState(true);
  const voiceOutput = props.voiceOutput ?? ownVoiceOutput;
  const setVoiceOutput = props.onVoiceOutputChange ?? setOwnVoiceOutput;
  // On a small phone with larger text the AI voice switch leaves the dock for the app bar's sheet, so the dock's
  // row keeps room for [Type] and the mic (15-judge-fixes:2).
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const voiceInBar = mode === "phone" && Boolean(props.largeText) && narrow;
  /** One plain sentence in the dock: why voice stopped, or the noise suggestion. */
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const voice = useLiveVoice({
    sessionId: session?.sessionId ?? null,
    deviceToken,
    kiosk,
    locale,
    language,
    status: session?.status ?? null,
    getCartVersion: () => session?.cartVersion ?? 0,
    onUserText: (text) => {
      chat.voice("user", text);
      followOwnWords(text);
      props.onUserTurn?.();
    },
    onAiText: (text) => chat.voice("model", text),
    onFallback: (reason) => {
      setVoiceNote(reason);
      focusText();
    },
    onNoise: () => setVoiceNote(pt("voiceNoise", locale)),
    voiceOutput,
    utterances,
    getCart: () => session?.cart ?? [],
    getSession: () => session,
    onAction: props.onActions ? (action) => props.onActions?.([action]) : undefined,
    greeting,
  });
  const voiceOpen = voice.state === "listening" || voice.state === "thinking" || voice.state === "speaking";

  /** Starts voice; call only from a tap (the microphone and iOS audio need a user gesture). */
  function startVoice() {
    setVoiceNote(null);
    void voice.start();
  }

  function toggleVoice() {
    if (voiceActive(voice.state)) voice.stop();
    else startVoice();
  }

  async function command(type: CommandType, args: object, cartVersion?: number): Promise<boolean> {
    if (!session || !deviceToken || sending) return false;
    setSending(true);
    try {
      await sendCommand({ sessionId: session.sessionId, token: deviceToken, type, args, source: "button", cartVersion });
      return true;
    } catch (e) {
      chat.notice(errorText(e, locale));
      return false;
    } finally {
      setSending(false);
    }
  }

  /** [Yes, pay now]. /demo lists the user's own confirm next to the AI's actions, so the safety rule shows (D2). */
  async function confirmByTap(cartVersion: number) {
    const started = performance.now();
    if (await command("confirmCheckout", {}, cartVersion)) {
      props.onActions?.([{ tool: "confirmCheckout", args: {}, code: "ok", tap: true, ms: Math.round(performance.now() - started) }]);
    }
  }

  /**
   * While voice is open, a typed line, an example or a choice tap is one user turn on the same Live conversation, so
   * the voice model never misses a change. Otherwise it goes to /api/chat. The confirm card shows `cartVersion`; a
   * typed "yes" carries it so the server can match it (voice reads it from the session itself).
   */
  async function speak(text: string): Promise<SendResult> {
    if (voiceOpen && voice.sendText(text)) {
      chat.voice("user", text);
      props.onUserTurn?.();
      return "ok";
    }
    if (limited) return "limit";
    return (await chat.send(text, session?.status === "confirming" ? session.cartVersion : undefined)) ? "ok" : "error";
  }
  function say(text: string) {
    void speak(text);
  }
  /**
   * The screens and the AI follow the language of the user's own words, spoken or typed (owner 10-18, I-404), like a
   * picker choice. Never a tapped label or example: those are the screens' words. Voice keeps its connection; the next
   * one asks in the new language (useLiveVoice reads its options on every render).
   */
  function followOwnWords(text: string) {
    const next = followSpeaker(language, text);
    if (next === null) return;
    if (props.onLanguageChange) props.onLanguageChange(next);
    else props.onLocaleChange(uiLocale(next));
  }
  function sayOwn(text: string) {
    followOwnWords(text);
    say(text);
  }
  // /demo's scenario guide sends its sentences through this same path, so they show and count exactly as typed.
  const onSay = props.onSay;
  useEffect(() => {
    if (!onSay) return;
    onSay(speak);
    return () => onSay(null);
  });

  function pickChoice(choice: ChoiceRef, label: string) {
    // Dine choices go straight to the session; any other tap is the user's answer to the agent's question.
    if (choice.kind === "dine") void chooseDine(choice.id as DineOption);
    // The same command as the header's [Call staff].
    else if (choice.kind === "staff") void command("callStaff", { reasonCode: "user_request" });
    else say(label);
  }

  /**
   * A dine tap. When the AI held an order for this question (15-judge-fixes:1), the order goes on once the session
   * has the dine option (a learned kiosk sets it only after the bridge replayed it): typed, the phone sends the held
   * message again; with voice open, the tap goes to the Live conversation as the user's answer, since the model there
   * still holds the order it asked about.
   */
  const [afterDine, setAfterDine] = useState<{ option: DineOption; voice: boolean } | null>(null);
  async function chooseDine(option: DineOption) {
    const asked = session?.pendingChoice?.templateId === "pick_dine";
    if (!(await command("setDineOption", { option }))) return;
    if (voiceOpen ? asked : chat.held !== null) setAfterDine({ option, voice: voiceOpen });
  }
  // The tap that was already followed up; each tap sets a new object, so it goes on once.
  const continued = useRef<typeof afterDine>(null);
  const continueOrder = useEffectEvent(() => {
    if (!afterDine || continued.current === afterDine) return;
    if (session?.dineOption !== afterDine.option || session.pendingBridgeCommand) return;
    continued.current = afterDine;
    if (afterDine.voice) say(kiosk.dineOptions?.[afterDine.option].name[locale] ?? afterDine.option);
    else void chat.resend(pt("continuingOrder", locale));
  });
  useEffect(() => continueOrder(), [session, afterDine]);

  // [No thanks] on an offer: the AI hears it, and the buttons go away at once, because a "no" changes nothing on
  // the server that would clear them. Keyed by the offer, so a later one shows again.
  const pendingKey = session?.pendingChoice ? `${session.cartVersion}:${JSON.stringify(session.pendingChoice)}` : null;
  const [declined, setDeclined] = useState<string | null>(null);
  function decline(label: string) {
    setDeclined(pendingKey);
    say(label);
  }

  // P3: when the cart card is out of view (a small phone, larger text, a laptop's /demo column under its full dock), a
  // one-line summary above the dock shows the count and total; a tap scrolls to the card's total.
  const cartEnd = useRef<HTMLSpanElement>(null);
  const [cartInView, setCartInView] = useState(true);
  useEffect(() => {
    const el = cartEnd.current;
    if (!el) return;
    // The newest record: a busy main thread can hand over several at once, and the first of them is stale (it left
    // the summary off on /demo with the total out of view, 1 of 6 runs of D2-hero-summary, #1 18).
    const io = new IntersectionObserver((entries) => setCartInView(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [screen]);
  // The summary takes height from the scroll area. When keyboard focus scrolls the card away, the summary appears
  // and would cover the control that just took focus (WCAG 2.4.11, I-220), so that control is brought back into view
  // in the same render.
  useLayoutEffect(() => {
    const area = cartEnd.current?.closest("[data-phone-scroll]");
    const focused = document.activeElement;
    if (area && focused instanceof HTMLElement && focused !== area && area.contains(focused))
      focused.scrollIntoView({ block: "nearest" });
  }, [cartInView]);

  // Screens other than talk show only replies that came after they opened, so an old error never lingers there. The
  // entry screens show no messages, so what came while one showed (the greeting when [Type instead] is tapped) still
  // counts as new on the screen after it.
  const [opened, setOpened] = useState({ screen, count: chat.messages.length });
  if (opened.screen !== screen) setOpened({ screen, count: ENTRY_SCREENS.has(opened.screen) ? opened.count : chat.messages.length });
  const fresh = chat.messages.slice(opened.screen === screen ? opened.count : chat.messages.length);

  // At once on every send: a gap without feedback reads as broken (14-final:1).
  const working = chat.busy;
  // The kiosk says "KIBO is working…" too, from the session: the phone tells the server when a typed or spoken turn
  // goes to the AI and when it is answered.
  const aiWorking = chat.busy || voice.state === "thinking";
  const sessionId = session?.sessionId ?? null;
  useEffect(() => {
    if (!sessionId || !deviceToken) return;
    // A send is the user's own activity, so it extends the session; the "done" ping is not.
    ping({ sessionId, token: deviceToken, active: aiWorking, working: aiWorking }).catch(() => {});
  }, [aiWorking, sessionId, deviceToken]);
  const notice = learned && session ? bridgeNotice(session, now, clockOffset) : null;
  // The mismatch line already says staff is on the way.
  const staffVisible = session !== null && notice !== "mismatch" && staffBannerVisible(session, now, clockOffset);
  const idle = session ? idleWarning(session, now, clockOffset) : { show: false, secondsLeft: 0 };
  const reconnecting = session !== null && props.streamState !== undefined && props.streamState !== "open";
  // The server refused the stream (too many screens on one network) and it reconnects after a wait (I-033).
  const retrying = props.streamState === "retrying";
  const ended = screen === "ended" || screen === "taken";
  const itemsInCart = session ? session.cart.reduce((n, l) => n + l.qty, 0) : 0;
  const choicesShown = screen === "talk" && Boolean(session?.pendingChoice) && pendingKey !== declined;
  const summaryShown = itemsInCart > 0 && !cartInView && !choicesShown;

  // P3: after each send and reply, the newest message and the choices under it come fully into view above the dock;
  // on a small phone with larger text they were left under it (15-judge-fixes:2).
  const turnRef = useRef<HTMLDivElement>(null);
  const lastId = chat.messages.at(-1)?.id ?? 0;
  const showTurn = useEffectEvent(() => {
    const turn = turnRef.current;
    if (!turn || (lastId === 0 && !choicesShown)) return;
    const bubbles = turn.querySelectorAll("[data-bubble]");
    // Room for the cart summary, which appears once the card below scrolls out of view.
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const reserve = itemsInCart > 0 && !choicesShown && !summaryShown ? SUMMARY_REM * rootPx : 0;
    keepInView(bubbles[bubbles.length - 1] ?? turn, turn, reserve, turn.querySelector("[data-choices]"));
  });
  useEffect(() => showTurn(), [lastId, working, choicesShown, pendingKey]);

  const bridgeLine = notice && (
    <BridgeLine notice={notice} locale={locale} onCallStaff={() => void command("callStaff", { reasonCode: "user_request" })} />
  );
  // A learned kiosk undoes only the last add that made a new line, and nothing while the kiosk is still busy.
  const waiting = notice === "pending" || notice === "slow";
  const undoable = session !== null && (learned ? learnedUndoLine(session) !== null : session.undoStack.length > 0);
  const placeholder = learned
    ? pt(kiosk.kioskId === "bunsik" ? "snackPlaceholder" : "learnedPlaceholder", locale)
    : ticket
      ? pt("ticketPlaceholder", locale)
      : undefined;
  const secondsLeft = mode === "demo" && voice.secondsLeft !== null && voice.secondsLeft < SHOW_VOICE_LEFT ? voice.secondsLeft : null;
  const suggestions = !limited && <Suggestions examples={props.examples ?? []} locale={locale} disabled={busy} onPick={say} />;
  // /demo with an empty cart: the examples before the empty card, which pushed every one under the dock on a laptop
  // (#1 11, I-179).
  const examplesFirst = mode === "demo" && itemsInCart === 0;

  /** After the demo limit, a plain notice with [Try again] takes the text field's place. */
  const limitNotice = limited && (
    <div role="status" className="flex flex-col gap-2">
      <p className="text-xl font-bold">{pt("demoLimit", locale)}</p>
      {props.onTryAgain && (
        <button type="button" onClick={props.onTryAgain} className={SECONDARY}>
          {pt("tryAgain", locale)}
        </button>
      )}
    </div>
  );

  const dock = (
    <Dock
      state={voice.state}
      locale={locale}
      disabled={!session || !deviceToken}
      sendDisabled={busy}
      onMic={toggleVoice}
      voiceOutput={voiceOutput}
      onVoiceOutput={setVoiceOutput}
      voiceSwitch={!voiceInBar}
      typing={typing}
      onTyping={(open) => (open ? focusText() : setTyping(false))}
      onSend={sayOwn}
      placeholder={placeholder}
      note={voiceNote}
      limit={limitNotice || undefined}
      inputElement={inputElement}
      compactWhileTyping={mode === "phone"}
      status={
        <>
          {retrying && <StatusChip text={pt("streamRetrying", locale)} tone="warn" />}
          {working && <StatusChip text={pt("working", locale)} />}
          {secondsLeft !== null && (
            <p role="timer" className="rounded-full bg-staff-tint px-3 py-1 text-base font-semibold text-staff-ink">
              {voiceSecondsLeft(secondsLeft, locale)}
            </p>
          )}
        </>
      }
    />
  );

  const dineOptions = kiosk.dineOptions;
  let body: ReactNode;
  switch (screen) {
    case "connecting":
      body = (
        <Scroll>
          <p role="status" className="py-12 text-center text-xl text-muted">
            {pt(retrying ? "streamRetrying" : "connecting", locale)}
          </p>
        </Scroll>
      );
      break;
    case "inapp":
      body = (
        <InAppScreen
          locale={locale}
          onStay={() => {
            finishMicHint();
            props.inApp?.onStay();
            focusText();
          }}
        />
      );
      break;
    case "mic":
      body = (
        <Scroll>
          <h1 className="text-2xl font-bold">{pt("micHintTitle", locale)}</h1>
          {/* The intro screen's 3 steps, now that the claim link lands here (owner 10-17). */}
          <p className="text-xl text-muted">{pt("micHintSteps", locale)}</p>
          <AllowPicture locale={locale} />
          <p className="text-xl">
            {pt("micHintPre", locale)}
            <strong>{pt("micHintAllow", locale)}</strong>
            {pt("micHintPost", locale)}
          </p>
          <button
            type="button"
            onClick={() => {
              finishMicHint();
              startVoice();
            }}
            className={`${PRIMARY} min-h-22 text-2xl`}
          >
            <Mic size={32} strokeWidth={2} aria-hidden />
            {pt("micTurnOn", locale)}
          </button>
          <button
            type="button"
            onClick={() => {
              finishMicHint();
              focusText();
            }}
            className={SECONDARY}
          >
            {pt("typeInstead", locale)}
          </button>
        </Scroll>
      );
      break;
    case "dine":
      body = (
        <>
          <Scroll>
            <h1 className="text-2xl font-bold">{pt("dineQuestion", locale)}</h1>
            <div className="grid grid-cols-2 gap-3">
              {dineOptions && (["eat_in", "take_out"] as DineOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => void chooseDine(option)}
                  className={`min-h-15 overflow-hidden rounded-tile bg-white text-left shadow-card active:bg-kibo-tint disabled:opacity-60 ${PRESS} ${FOCUS}`}
                >
                  {/* A learned kiosk's dine "photo" is only a placeholder ring: text-only buttons there (I-103). */}
                  {!learned && (
                    <span className="relative block aspect-[4/3] bg-cream">
                      <Image src={dineOptions[option].image} alt="" fill sizes="50vw" loading="eager" className="object-cover" />
                    </span>
                  )}
                  <span className="block px-4 py-3 text-xl font-semibold">{dineOptions[option].name[locale]}</span>
                </button>
              ))}
            </div>
            <p className="text-xl text-muted">{pt("dineOrTalk", locale)}</p>
            {bridgeLine}
            <LastMessage messages={fresh} locale={locale} />
          </Scroll>
          {dock}
        </>
      );
      break;
    case "talk":
      body = session && (
        <>
          <Scroll>
            <h1 className="sr-only">{pt("cartTitle", locale, kiosk.domain)}</h1>
            <div ref={turnRef} className="flex flex-col gap-4">
              <Messages messages={chat.messages} locale={locale} />
              {choicesShown && (
                <Choices
                  kiosk={kiosk}
                  pending={session.pendingChoice!}
                  locale={locale}
                  disabled={busy}
                  onPick={pickChoice}
                  onDecline={decline}
                />
              )}
            </div>
            {examplesFirst && suggestions}
            <div className="flex flex-col">
              <OrderCard
                kiosk={kiosk}
                cart={session.cart}
                total={session.total}
                locale={locale}
                canUndo={!busy && !waiting && undoable}
                onUndo={learned && !undoable ? undefined : () => void command("undoLastChange", {})}
                status={bridgeLine}
              />
              <span ref={cartEnd} aria-hidden className="block h-px scroll-mb-4" />
            </div>
            {!examplesFirst && suggestions}
          </Scroll>
          {/* /demo too: right after the first order its full dock left the card's total out of view at every laptop
              size (#1 18). Focus stays in view as the summary comes and goes (Scroll, I-220). */}
          {/* Not while choices show: the pill would cover the buttons the AI just asked about (15-judge-fixes:2). */}
          {summaryShown && (
            <div className="flex-none px-4 pt-2 pb-2">
              <button
                type="button"
                data-cart-summary
                onClick={() => cartEnd.current?.scrollIntoView({ block: "end" })}
                className={`@container flex min-h-14 w-full items-center justify-between gap-2 rounded-full bg-white px-4 text-xl font-semibold text-kibo-deep shadow-card ${PRESS} ${FOCUS}`}
              >
                {/* One line (#1 9): it wrapped to two at 360px with larger text. The title gives way, to screen readers
                    only, with larger text or when the pill is too narrow for it; the count and total stay. Never
                    clipped: text spacing a user sets may still wrap it (WCAG 1.4.12). */}
                <span className="min-w-0 text-left">
                  <span className={props.largeText ? "sr-only" : "@max-[19rem]:sr-only"}>
                    {pt("cartTitle", locale, kiosk.domain)}{" "}
                  </span>
                  {itemCount(itemsInCart, locale)} · {formatWon(session.total, locale)}
                </span>
                <ChevronRight {...ICON} />
              </button>
            </div>
          )}
          {dock}
        </>
      );
      break;
    case "confirm":
      // The total and [Yes, pay now] own the bottom area, so nothing pushes them off a small screen (I-134, R-009);
      // the lines scroll above them. A spoken "yes" confirms too, after the card appeared (docs/ARCHITECTURE.md
      // "Commands and actors"); a typed one goes through the text field behind [Type].
      body = session && (
        <>
          <Scroll>
            {/* The AI's reply above the card: below [Pick more] it sat under the bottom bar (15-judge-fixes:2). */}
            <LastMessage messages={fresh} locale={locale} />
            <ConfirmCard
              kiosk={kiosk}
              cart={session.cart}
              locale={locale}
              dine={session.dineOption ? kiosk.dineOptions?.[session.dineOption].name[locale] : undefined}
              onPickMore={() => void command("cancelCheckout", {})}
              pickMoreDisabled={busy}
              autoFocus
            />
          </Scroll>
          <ConfirmBar
            total={session.total}
            locale={locale}
            onPay={() => void confirmByTap(session.cartVersion)}
            // Taken as soon as the card shows, even while the AI is still finishing its reply: the server checks the
            // tap against cartVersion, and only a spoken "yes" waits (docs/ARCHITECTURE.md "Commands and actors").
            payDisabled={sending || !deviceToken}
            voice={voice.state}
            micDisabled={!deviceToken}
            onMic={toggleVoice}
            typing={typing}
            onTyping={(open) => (open ? focusText() : setTyping(false))}
            note={voiceNote}
            limit={limitNotice || undefined}
            typingSheet={
              <TypingSheet locale={locale} disabled={busy} placeholder={placeholder} quiet onSend={sayOwn} inputElement={inputElement} />
            }
          />
        </>
      );
      break;
    case "confirmLearned":
      // A learned kiosk's order ends here: no pay button, the user taps the kiosk's own checkout button and pays there.
      body = session && kiosk.learned && (
        <>
          <Scroll>
            <ConfirmCard
              kiosk={kiosk}
              cart={session.cart}
              locale={locale}
              dine={session.dineOption ? kiosk.dineOptions?.[session.dineOption].name[locale] : undefined}
              total={session.total}
              after={<PayOnKiosk checkout={kiosk.learned.checkout} locale={locale} />}
              onPickMore={() => void command("cancelCheckout", {})}
              pickMoreDisabled={busy || waiting}
              autoFocus
            />
            {bridgeLine}
            <LastMessage messages={fresh} locale={locale} />
            {mode === "demo" && props.endCard}
          </Scroll>
          {dock}
        </>
      );
      break;
    case "pay":
      body = session && (
        <Scroll>
          {/* In /demo the kiosk is on the left, so the picture points there (I-069). */}
          {/* Only words here: no phone control may pay. /demo's card stand-in is on the kiosk half (15-judge-fixes:2). */}
          <PayCard total={session.total} locale={locale} mirrored={mode === "demo"} picked={kioskPickedCard(kiosk, session)} />
          <LastMessage messages={fresh} locale={locale} />
        </Scroll>
      );
      break;
    case "done":
      body = session && (
        <Scroll>
          <DoneCard
            orderNumber={session.orderNumber ?? 0}
            locale={locale}
            domain={kiosk.domain}
            onDone={
              mode === "demo" && props.endCard
                ? undefined
                : () => {
                    setDoneDismissed(true);
                    chat.reset();
                  }
            }
          />
          {mode === "demo" && props.endCard}
        </Scroll>
      );
      break;
    case "ended":
    case "taken":
      body = (
        <Scroll>
          <section className={`${CARD} flex flex-col items-center gap-4 py-8 text-center`}>
            <Smartphone size={48} strokeWidth={2} aria-hidden className="text-muted" />
            <h1 className="text-2xl font-bold">{pt(screen === "taken" ? "takenTitle" : "endedTitle", locale)}</h1>
            {!(mode === "demo" && props.endCard) && (
              <p className="text-xl text-muted">{pt(screen === "taken" ? "takenNext" : "endedNext", locale)}</p>
            )}
          </section>
          {mode === "demo" && props.endCard}
        </Scroll>
      );
      break;
  }

  const panel = (
    <div
      lang={locale}
      data-phone-screen={screen}
      data-mode={mode}
      data-ai-language={language}
      data-large-text={props.largeText || undefined}
      // /demo: larger text zooms this panel only (the phone scales its root font size instead).
      style={mode === "demo" && props.largeText ? { zoom: LARGE_TEXT_SCALE } : undefined}
      className="relative flex h-full min-h-0 flex-col bg-cream text-ink"
    >
      <AppBar
        brand={kiosk.brand.name[locale]}
        locale={locale}
        // The stream's state; nothing to say before there is a session, or after it ended.
        connection={session === null || ended ? undefined : reconnecting ? "reconnecting" : "connected"}
        onLocaleChange={props.onLocaleChange}
        language={language}
        onLanguageChange={props.onLanguageChange}
        largeText={props.largeText}
        onLargeText={props.onLargeTextChange}
        voice={voiceInBar ? { on: voiceOutput, onChange: setVoiceOutput } : undefined}
        onStaff={ended ? undefined : () => void command("callStaff", { reasonCode: "user_request" })}
        staffDisabled={!session || !deviceToken}
      />
      {!ended && staffVisible && (
        <p role="status" className="flex flex-none items-center gap-2 bg-staff-tint px-4 py-3 text-xl font-semibold text-staff-ink">
          <Bell {...ICON} />
          {pt("staffCalled", locale)}
        </p>
      )}
      {!ended && props.inApp && !props.inApp.held && (
        <p role="note" className="flex-none bg-kibo-tint px-4 py-3 text-base font-semibold text-kibo-deep">
          {pt("inAppTitle", locale)} {pt("inAppTyping", locale)}
        </p>
      )}
      {body}
      {/* Cart changes for screen readers (docs/UI_GUIDE.md "Accessibility"); silent while the AI voice speaks. */}
      <p aria-live={voiceOutput && voice.state === "speaking" ? "off" : "polite"} className="sr-only">
        {session && itemsInCart > 0 ? cartAnnouncement(itemsInCart, session.total, locale) : ""}
      </p>
      {!ended && idle.show && session && deviceToken && (
        <ModalLayer className="absolute inset-0 z-20 flex items-end bg-ink/60 p-4">
          <section
            role="alertdialog"
            aria-modal
            aria-labelledby="phone-idle-title"
            className="kibo-sheet-in flex w-full flex-col gap-4 rounded-sheet bg-white p-6 text-center shadow-dock"
          >
            <h2 id="phone-idle-title" className="text-2xl font-bold">
              {pt("idleQuestion", locale, kiosk.domain)}
            </h2>
            <p role="timer" className="font-display text-[2rem] font-bold text-staff-ink tabular-nums">
              {phoneSecondsLeft(idle.secondsLeft, locale)}
            </p>
            <button
              type="button"
              // The extended expiresAt comes back through the stream; a failed ping leaves the warning up.
              onClick={() => ping({ sessionId: session.sessionId, token: deviceToken, active: true }).catch(() => {})}
              className={PRIMARY}
            >
              {pt("idleContinue", locale)}
            </button>
          </section>
        </ModalLayer>
      )}
    </div>
  );
  // The few strings a first-time user must read follow an AI-only language (src/components/phone/language.tsx).
  return <AiLanguageProvider value={language}>{panel}</AiLanguageProvider>;
}

function Scroll({ children }: { children: ReactNode }) {
  // Focusable: while a message is on its way every control inside is disabled, and a keyboard must still scroll it
  // (WCAG 2.1.1). The ring sits inside, because the phone frame clips anything outside.
  return (
    <div
      data-phone-scroll
      tabIndex={0}
      // A control that takes keyboard focus half under the area's bottom edge stays covered by the cart summary or
      // the dock (WCAG 2.4.11, I-220 seen again on P3-upsell at 320×700); bring it fully into view. Keyboard focus
      // only, so a tap never makes the list jump.
      onFocus={(e) => {
        const el = e.target;
        if (el !== e.currentTarget && el instanceof HTMLElement && el.matches(":focus-visible"))
          el.scrollIntoView({ block: "nearest" });
      }}
      className="flex min-h-0 flex-1 scroll-pb-8 flex-col gap-4 overflow-y-auto px-4 py-6 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ink"
    >
      {/* And lines cut at the top edge read as "more above" (#1 32). */}
      <ScrollFade edge="top" className="-top-6 -mx-4 -mb-12 to-cream" />
      {children}
      {/* Lines cut at the bottom edge read as "more below", not as broken (#1 2-phone, I-281). */}
      <ScrollFade className="-bottom-6 -mx-4 -mt-12 to-cream" />
    </div>
  );
}

/**
 * P1 in an in-app browser. The claim waits until the user chooses, so the copied link (with its one-use code)
 * still connects in Safari or Chrome; staying here claims and goes on by typing.
 */
function InAppScreen({ locale, onStay }: { locale: Locale; onStay(): void }) {
  const [copied, setCopied] = useState<"linkCopied" | "copyFailed" | null>(null);
  function copy() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => setCopied("linkCopied"))
      .catch(() => setCopied("copyFailed"));
  }
  return (
    <Scroll>
      <h1 className="text-2xl font-bold">{pt("inAppTitle", locale)}</h1>
      <p className="text-xl">{pt("inAppOpen", locale)}</p>
      <button type="button" onClick={copy} className={PRIMARY}>
        <Link2 {...ICON} />
        {pt("copyLink", locale)}
      </button>
      <p role="status" className="text-xl font-semibold">
        {copied && pt(copied, locale)}
      </p>
      <button type="button" onClick={onStay} className={SECONDARY}>
        {pt("stayHere", locale)}
      </button>
    </Scroll>
  );
}

/** P1: a browser permission prompt with its Allow button marked, so the real prompt looks familiar. */
function AllowPicture({ locale }: { locale: Locale }) {
  return (
    <div aria-hidden className={`${CARD} flex flex-col gap-3 self-center`}>
      <div className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-10 items-center justify-center rounded-full bg-kibo-tint text-kibo">
          <Mic {...ICON} />
        </span>
        {pt("allowPicTitle", locale)}
      </div>
      <div className="flex gap-3">
        <span className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-cream px-4 text-base text-muted">
          {pt("allowPicBlock", locale)}
        </span>
        <span className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-kibo px-4 text-base font-bold text-white outline-[3px] outline-offset-4 outline-kibo outline-dashed">
          {pt("micHintAllow", locale)}
        </span>
      </div>
    </div>
  );
}

/** P4 on a learned kiosk: where to finish. The label is the kiosk's own checkout button from the reviewed skill. */
function PayOnKiosk({ checkout, locale }: { checkout: { label: string; name: LocalizedName }; locale: Locale }) {
  const hint = learnedPayHint(checkout, locale);
  return (
    <p data-pay-on-kiosk className="rounded-tile bg-kibo-tint px-4 py-3 text-xl text-kibo-deep">
      {hint.pre}
      <strong lang="ko">{hint.label}</strong>
      {hint.gloss}
      {hint.post}
    </p>
  );
}

/**
 * What a learned kiosk is doing with the last change. Plain text while it works (it usually takes under a second);
 * after 15 s or a mismatch, what to do next.
 */
function BridgeLine({ notice, locale, onCallStaff }: { notice: BridgeNotice; locale: Locale; onCallStaff(): void }) {
  if (notice === "pending") {
    return (
      <p role="status" data-bridge-notice={notice} className="text-base font-semibold text-muted">
        {pt("bridgePending", locale)}
      </p>
    );
  }
  return (
    <div role="status" data-bridge-notice={notice} className="flex flex-col gap-3 rounded-tile bg-staff-tint px-4 py-3 text-staff-ink">
      <p className="text-xl font-semibold">{pt(notice === "slow" ? "bridgeSlow" : "bridgeMismatch", locale)}</p>
      {notice === "slow" && (
        <button
          type="button"
          onClick={onCallStaff}
          className={`flex min-h-15 w-full items-center justify-center gap-2 rounded-tile bg-white px-4 text-xl font-semibold text-staff-ink shadow-card active:bg-staff-tint-pressed ${PRESS} ${FOCUS}`}
        >
          <Bell {...ICON} />
          {pt("callStaff", locale)}
        </button>
      )}
    </div>
  );
}
