"use client";

import { Bell, ChevronRight, Link2, Mic, Smartphone } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ModalLayer } from "@/components/kiosk/ModalLayer";
import { AppBar } from "@/components/phone/AppBar";
import { ConfirmBar, ConfirmCard, DoneCard, PayCard } from "@/components/phone/Checkout";
import { Choices } from "@/components/phone/Choices";
import { LastMessage, Messages, StatusChip } from "@/components/phone/Conversation";
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
import type { SpeechLanguage } from "@/lib/i18n/languages";
import { formatWon } from "@/lib/kiosk/menu";
import { idleWarning, staffBannerVisible } from "@/lib/kiosk/timers";
import { bridgeNotice, phoneScreen, type BridgeNotice, type PhoneLocal } from "@/lib/phone/screen";
import type { KioskData, Locale, LocalizedName } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";

// The phone screen (docs/UX.md P1–P7, PX), shared by /assistant and /demo, in the phone design (docs/UI_GUIDE.md
// "Phone design"): voice (Gemini Live) with text as the fallback. Phone buttons send `source: "button"` only from real
// taps: the server trusts it as a tap (docs/SECURITY.md). The microphone starts only from a tap.

/** P1 is shown once per browser (docs/UX.md A3). */
const MIC_HINT_KEY = "kibo.phone.micHintSeen";
const noSubscribe = () => () => {};
/** Under this many seconds a /demo order shows its voice time left. */
const SHOW_VOICE_LEFT = 60;

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
  /** /demo only: stands in for the card action on the kiosk (Flow C4). */
  onCardStandIn?: () => void;
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
}

export type SayFn = (text: string) => Promise<SendResult>;

/** The parent keys this by session id, so local flags never carry over to a new session. */
export function AssistantPanel(props: Props) {
  const { kiosk, session, deviceToken, locale, mode } = props;
  const language = props.language ?? locale;
  const clockOffset = props.clockOffset ?? 0;
  // /demo explains the three steps before it starts, so its phone skips the start screen.
  const [startSeen, setStartSeen] = useState(mode === "demo");
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
      startSeen,
      doneDismissed,
      micHint,
      inAppHold: props.inApp?.held ?? false,
    },
    learned,
    kiosk.dineOptions !== undefined,
  );
  const busy = chat.busy || sending || !deviceToken;
  const limited = props.chatLimit !== undefined && chat.sent >= props.chatLimit;

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
    setTyping(true);
    if (input.current) input.current.focus();
    else focusPending.current = true;
  }

  const [ownVoiceOutput, setOwnVoiceOutput] = useState(true);
  const voiceOutput = props.voiceOutput ?? ownVoiceOutput;
  const setVoiceOutput = props.onVoiceOutputChange ?? setOwnVoiceOutput;
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
  // /demo's scenario guide sends its sentences through this same path, so they show and count exactly as typed.
  const onSay = props.onSay;
  useEffect(() => {
    if (!onSay) return;
    onSay(speak);
    return () => onSay(null);
  });

  function pickChoice(choice: ChoiceRef, label: string) {
    // Dine choices go straight to the session; any other tap is the user's answer to the agent's question.
    if (choice.kind === "dine") void command("setDineOption", { option: choice.id });
    else say(label);
  }

  // [No thanks] on an offer: the AI hears it, and the buttons go away at once, because a "no" changes nothing on
  // the server that would clear them. Keyed by the offer, so a later one shows again.
  const pendingKey = session?.pendingChoice ? `${session.cartVersion}:${JSON.stringify(session.pendingChoice)}` : null;
  const [declined, setDeclined] = useState<string | null>(null);
  function decline(label: string) {
    setDeclined(pendingKey);
    say(label);
  }

  // P3: when the cart card is out of view (a small phone, larger text), a one-line summary above the dock shows the
  // count and total; a tap scrolls to the card's total.
  const cartEnd = useRef<HTMLSpanElement>(null);
  const [cartInView, setCartInView] = useState(true);
  useEffect(() => {
    const el = cartEnd.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCartInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [screen]);

  // Screens other than talk show only replies that came after they opened, so an old error never lingers there.
  const [opened, setOpened] = useState({ screen, count: chat.messages.length });
  if (opened.screen !== screen) setOpened({ screen, count: chat.messages.length });
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

  const bridgeLine = notice && (
    <BridgeLine notice={notice} locale={locale} onCallStaff={() => void command("callStaff", { reasonCode: "user_request" })} />
  );
  // A learned kiosk undoes only the last add that made a new line, and nothing while the kiosk is still busy.
  const waiting = notice === "pending" || notice === "slow";
  const undoable = session !== null && (learned ? learnedUndoLine(session) !== null : session.undoStack.length > 0);
  const placeholder = learned ? pt("learnedPlaceholder", locale) : ticket ? pt("ticketPlaceholder", locale) : undefined;
  const secondsLeft = mode === "demo" && voice.secondsLeft !== null && voice.secondsLeft < SHOW_VOICE_LEFT ? voice.secondsLeft : null;

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
      typing={typing}
      onTyping={(open) => (open ? focusText() : setTyping(false))}
      onSend={say}
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
    case "start":
      body = <StartScreen locale={locale} onStart={() => setStartSeen(true)} />;
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
                  onClick={() => void command("setDineOption", { option })}
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
            <Messages messages={chat.messages} locale={locale} working={working} />
            {session.pendingChoice && pendingKey !== declined && (
              <Choices
                kiosk={kiosk}
                pending={session.pendingChoice}
                locale={locale}
                disabled={busy}
                onPick={pickChoice}
                onDecline={decline}
              />
            )}
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
            {!limited && <Suggestions examples={props.examples ?? []} locale={locale} disabled={busy} onPick={say} />}
          </Scroll>
          {/* The phone only: /demo's laptop column has room for the card, and a summary appearing there as keyboard
              focus scrolls the card away would shrink the area under the focused control. */}
          {mode === "phone" && itemsInCart > 0 && !cartInView && (
            <div className="flex-none px-4 pt-2 pb-2">
              <button
                type="button"
                data-cart-summary
                onClick={() => cartEnd.current?.scrollIntoView({ block: "end" })}
                className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-full bg-white px-4 text-xl font-semibold text-kibo-deep shadow-card ${PRESS} ${FOCUS}`}
              >
                <span className="min-w-0 text-left">
                  {pt("cartTitle", locale, kiosk.domain)} {itemCount(itemsInCart, locale)} · {formatWon(session.total, locale)}
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
            <ConfirmCard
              kiosk={kiosk}
              cart={session.cart}
              locale={locale}
              dine={session.dineOption ? kiosk.dineOptions?.[session.dineOption].name[locale] : undefined}
              onPickMore={() => void command("cancelCheckout", {})}
              pickMoreDisabled={busy}
              autoFocus
            />
            <LastMessage messages={fresh} locale={locale} />
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
              <TypingSheet locale={locale} disabled={busy} placeholder={placeholder} quiet onSend={say} inputElement={inputElement} />
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
          <PayCard total={session.total} locale={locale} mirrored={mode === "demo"} />
          {mode === "demo" && props.onCardStandIn && (
            <button type="button" onClick={props.onCardStandIn} className={PRIMARY}>
              {pt("cardStandIn", locale)}
            </button>
          )}
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
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ink"
    >
      {children}
    </div>
  );
}

function StartScreen({ locale, onStart }: { locale: Locale; onStart(): void }) {
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <Scroll>
      <h1 className="text-2xl font-bold">{pt("startTitle", locale)}</h1>
      <p className="text-xl text-muted">{pt("startLead", locale)}</p>
      <ol className={`${CARD} flex flex-col gap-4`}>
        {steps.map((key, i) => (
          <li key={key} className="flex items-center gap-3 text-xl">
            <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-full bg-kibo-tint text-base font-bold text-kibo-deep">
              {i + 1}
            </span>
            {pt(key, locale)}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onStart} className={PRIMARY}>
        {pt("start", locale)}
      </button>
    </Scroll>
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
