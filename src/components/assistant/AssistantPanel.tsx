"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ModalLayer } from "@/components/kiosk/ModalLayer";
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
import { cartAnnouncement, learnedPayHint, payMethodHint, phoneSecondsLeft, pt } from "@/lib/i18n/phone";
import { idleWarning, staffBannerVisible } from "@/lib/kiosk/timers";
import { bridgeNotice, phoneScreen, type BridgeNotice, type PhoneLocal } from "@/lib/phone/screen";
import type { KioskData, Locale, LocalizedName } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";
import { CartCard, CartLines, TotalRow } from "./CartCard";
import { ChoiceButtons } from "./ChoiceButtons";
import { Composer, Conversation, Examples, LastMessage } from "./Conversation";
import { CARD, FOCUS, PRIMARY, SECONDARY, SMALL } from "./styles";
import { MicIcon, VoiceControls, voiceActive } from "./VoiceControls";

// The phone screen (docs/UX.md P1–P7, PX), shared by /assistant and /demo: voice (Gemini Live) with text as the
// fallback. Phone buttons send `source: "button"` only from real taps: the server trusts it as a tap
// (docs/SECURITY.md). The microphone starts only from a tap.

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
}

export type SayFn = (text: string) => Promise<SendResult>;

/** The parent keys this by session id, so local flags never carry over to a new session. */
export function AssistantPanel(props: Props) {
  const { kiosk, session, deviceToken, locale, mode } = props;
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
    nextSeq: () => ++utterances.current,
    onActions: props.onActions,
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

  // The text input gets focus when voice gives way to text; if it is not on screen yet, as soon as it mounts.
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
    if (input.current) input.current.focus();
    else focusPending.current = true;
  }

  const [voiceOutput, setVoiceOutput] = useState(true);
  /** One plain sentence above the text input: why voice stopped, or the noise suggestion. */
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const voice = useLiveVoice({
    sessionId: session?.sessionId ?? null,
    deviceToken,
    kiosk,
    locale,
    status: session?.status ?? null,
    getCartVersion: () => session?.cartVersion ?? 0,
    onUserText: (text) => chat.voice("user", text),
    onAiText: (text) => chat.voice("model", text),
    onFallback: (reason) => {
      setVoiceNote(reason);
      focusText();
    },
    onNoise: () => setVoiceNote(pt("voiceNoise", locale)),
    voiceOutput,
    utterances,
    getCart: () => session?.cart ?? [],
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

  /**
   * While voice is open, a typed line, an example or a choice tap is one user turn on the same Live conversation, so
   * the voice model never misses a change. Otherwise it goes to /api/chat. The confirm card shows `cartVersion`; a
   * typed "yes" carries it so the server can match it (voice reads it from the session itself).
   */
  async function speak(text: string): Promise<SendResult> {
    if (voiceOpen && voice.sendText(text)) {
      chat.voice("user", text);
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

  // Screens other than talk show only replies that came after they opened, so an old error never lingers there.
  const [opened, setOpened] = useState({ screen, count: chat.messages.length });
  if (opened.screen !== screen) setOpened({ screen, count: chat.messages.length });
  const fresh = chat.messages.slice(opened.screen === screen ? opened.count : chat.messages.length);
  // P4's [Type] opens the text input for this visit to the screen only.
  const [typingOn, setTypingOn] = useState<object | null>(null);
  const typing = typingOn === opened;

  const otherLocale: Locale = locale === "ko" ? "en" : "ko";
  const working = chat.busy && chat.sentAt > 0 && now - chat.sentAt >= 1000;
  const notice = learned && session ? bridgeNotice(session, now, clockOffset) : null;
  // The mismatch line already says staff is on the way.
  const staffVisible = session !== null && notice !== "mismatch" && staffBannerVisible(session, now, clockOffset);
  const idle = session ? idleWarning(session, now, clockOffset) : { show: false, secondsLeft: 0 };
  const reconnecting = session !== null && props.streamState !== undefined && props.streamState !== "open";
  const ended = screen === "ended" || screen === "taken";

  /** The text input, or after the demo limit a plain notice with [Try again]. */
  function composer(hint?: string) {
    if (limited) {
      return (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-xl font-bold">{pt("demoLimit", locale)}</p>
          {props.onTryAgain && (
            <button type="button" onClick={props.onTryAgain} className={PRIMARY}>
              {pt("tryAgain", locale)}
            </button>
          )}
        </div>
      );
    }
    return (
      <Composer
        locale={locale}
        disabled={busy}
        hint={voiceNote ?? hint}
        placeholder={learned ? pt("learnedPlaceholder", locale) : ticket ? pt("ticketPlaceholder", locale) : undefined}
        onSend={say}
        inputElement={inputElement}
      />
    );
  }

  const bridgeLine = notice && (
    <BridgeLine notice={notice} locale={locale} onCallStaff={() => void command("callStaff", { reasonCode: "user_request" })} />
  );
  // A learned kiosk undoes only the last add that made a new line, and nothing while the kiosk is still busy.
  const waiting = notice === "pending" || notice === "slow";
  const undoable = session !== null && (learned ? learnedUndoLine(session) !== null : session.undoStack.length > 0);

  const voiceControls = (
    <VoiceControls
      state={voice.state}
      locale={locale}
      disabled={!session || !deviceToken}
      onMic={toggleVoice}
      voiceOutput={voiceOutput}
      onVoiceOutput={setVoiceOutput}
      secondsLeft={mode === "demo" && voice.secondsLeft !== null && voice.secondsLeft < SHOW_VOICE_LEFT ? voice.secondsLeft : null}
    />
  );

  const dineOptions = kiosk.dineOptions;
  let body: ReactNode;
  switch (screen) {
    case "connecting":
      body = (
        <Scroll>
          <p role="status" className="py-12 text-center text-xl text-[#4B463F]">
            {pt("connecting", locale)}
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
            <MicIcon />
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
                  className={`min-h-15 overflow-hidden rounded-[18px] border-2 border-[#15171C] bg-white text-left active:border-[#3446D4] disabled:opacity-60 ${FOCUS}`}
                >
                  {/* A learned kiosk's dine "photo" is only a placeholder ring: text-only buttons there (I-103). */}
                  {!learned && (
                    <span className="relative block aspect-[4/3]">
                      <Image src={dineOptions[option].image} alt="" fill sizes="50vw" loading="eager" className="object-cover" />
                    </span>
                  )}
                  <span className="block px-3 py-3 text-xl font-bold">{dineOptions[option].name[locale]}</span>
                </button>
              ))}
            </div>
            {bridgeLine}
            <LastMessage messages={fresh} locale={locale} />
          </Scroll>
          <Footer>
            {voiceControls}
            {composer(pt("dineOrTalk", locale))}
          </Footer>
        </>
      );
      break;
    case "talk":
      body = session && (
        <>
          <Scroll>
            <h1 className="sr-only">{pt("cartTitle", locale, kiosk.domain)}</h1>
            <Conversation messages={chat.messages} locale={locale} working={working} />
            {session.pendingChoice && (
              <ChoiceButtons kiosk={kiosk} pending={session.pendingChoice} locale={locale} disabled={busy} onPick={pickChoice} />
            )}
            <CartCard
              kiosk={kiosk}
              cart={session.cart}
              total={session.total}
              locale={locale}
              canUndo={!busy && !waiting && undoable}
              onUndo={learned && !undoable ? undefined : () => void command("undoLastChange", {})}
              status={bridgeLine}
            />
            {!limited && <Examples examples={props.examples ?? []} locale={locale} disabled={busy} onPick={say} />}
          </Scroll>
          <Footer>
            {voiceControls}
            {composer()}
          </Footer>
        </>
      );
      break;
    case "confirm":
      // The total and [Yes, pay now] own the bottom area, so no footer pushes them off a small screen (I-134, R-009);
      // the lines scroll above them. The text input waits behind [Type] unless voice already gave way to text.
      body = session && (
        <>
          <Scroll>
            <ConfirmCard kiosk={kiosk} session={session} locale={locale} total={false} />
            <button type="button" disabled={busy} onClick={() => void command("cancelCheckout", {})} className={SECONDARY}>
              {pt("pickMore", locale)}
            </button>
            <LastMessage messages={fresh} locale={locale} />
          </Scroll>
          <Footer>
            <TotalRow total={session.total} locale={locale} />
            <button
              type="button"
              disabled={busy}
              onClick={() => void command("confirmCheckout", {}, session.cartVersion)}
              className={`${PRIMARY} min-h-22 text-2xl`}
            >
              {pt("payNow", locale)}
            </button>
            {/* A spoken "yes" confirms too, after the card appeared (docs/ARCHITECTURE.md "Commands and actors"). */}
            {typing || voiceNote !== null || limited ? (
              composer(pt("sayYes", locale))
            ) : (
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <VoiceControls
                    state={voice.state}
                    locale={locale}
                    disabled={!session || !deviceToken}
                    onMic={toggleVoice}
                    voiceOutput={voiceOutput}
                    onVoiceOutput={setVoiceOutput}
                    secondsLeft={null}
                    compactHint={pt("sayYes", locale)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTypingOn(opened);
                    focusText();
                  }}
                  className={`flex min-h-22 min-w-22 flex-none flex-col items-center justify-center rounded-[18px] border-2 border-[#15171C] bg-white px-3 text-base font-bold text-[#15171C] active:bg-[#F3EEE4] ${FOCUS}`}
                >
                  <KeyboardIcon />
                  {pt("typeButton", locale)}
                </button>
              </div>
            )}
          </Footer>
        </>
      );
      break;
    case "confirmLearned":
      // A learned kiosk's order ends here: no pay button, the user taps the kiosk's own checkout button and pays there.
      body = session && kiosk.learned && (
        <>
          <Scroll>
            <ConfirmCard kiosk={kiosk} session={session} locale={locale} />
            <PayOnKiosk checkout={kiosk.learned.checkout} locale={locale} />
            <button type="button" disabled={busy || waiting} onClick={() => void command("cancelCheckout", {})} className={SECONDARY}>
              {pt("pickMore", locale)}
            </button>
            {bridgeLine}
            <LastMessage messages={fresh} locale={locale} />
            {mode === "demo" && props.endCard}
          </Scroll>
          <Footer>
            {voiceControls}
            {composer()}
          </Footer>
        </>
      );
      break;
    case "pay":
      body = session && (
        <Scroll>
          <h1 className="text-2xl font-bold">{pt("payTitle", locale)}</h1>
          {/* In /demo the kiosk is on the left, so the arrow points there (I-069). */}
          <InsertCardPicture mirrored={mode === "demo"} />
          <PayMethodLine locale={locale} />
          <TotalRow total={session.total} locale={locale} />
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
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <h1 className="text-xl font-bold">{pt(ticket ? "referenceNumber" : "orderNumber", locale)}</h1>
            <p className="font-display text-[7.5rem] leading-none font-bold text-[#3446D4]">{session.orderNumber}</p>
            <p className="text-xl">{pt(ticket ? "takeTickets" : "pickup", locale)}</p>
          </div>
          {mode === "demo" && props.endCard ? (
            props.endCard
          ) : (
            <button
              type="button"
              onClick={() => {
                setDoneDismissed(true);
                chat.reset();
              }}
              className={PRIMARY}
            >
              {pt("done", locale)}
            </button>
          )}
        </Scroll>
      );
      break;
    case "ended":
    case "taken":
      body = (
        <Scroll>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <EndIcon />
            <h1 className="text-2xl font-bold">{pt(screen === "taken" ? "takenTitle" : "endedTitle", locale)}</h1>
            {!(mode === "demo" && props.endCard) && (
              <p className="text-xl text-[#4B463F]">{pt(screen === "taken" ? "takenNext" : "endedNext", locale)}</p>
            )}
          </div>
          {mode === "demo" && props.endCard}
        </Scroll>
      );
      break;
  }

  return (
    <div lang={locale} data-phone-screen={screen} data-mode={mode} className="relative flex h-full min-h-0 flex-col bg-[#FBF7EF] text-[#15171C]">
      {/* One row at every phone width (I-084): below 400px the language button shows only its globe, and the brand may wrap. */}
      <header className="flex flex-none items-center gap-2 border-b border-[#E2DACB] bg-white px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* max-w-none: a percentage max-width lets the row count the logo as 0px wide and skip wrapping. */}
          <Image src="/kibo-mark.svg" alt="KIBO" width={32} height={32} unoptimized className="size-8 max-w-none flex-none" />
          <span className="min-w-0 text-base leading-tight font-bold [overflow-wrap:anywhere]">{kiosk.brand.name[locale]}</span>
        </div>
        {/* One switch named in the other language, so a reader of either can find it. */}
        <button type="button" lang={otherLocale} onClick={() => props.onLocaleChange(otherLocale)} className={`${SMALL} flex-none`}>
          <GlobeIcon />
          <span className="max-[399px]:sr-only">{pt(otherLocale === "ko" ? "langKo" : "langEn", locale)}</span>
        </button>
        {!ended && (
          <button
            type="button"
            disabled={!session || !deviceToken}
            onClick={() => void command("callStaff", { reasonCode: "user_request" })}
            // min-w-14 replaces the automatic minimum, so without flex-none the label would spill over the brand.
            className={`${SMALL} flex-none max-[399px]:flex-col max-[399px]:gap-0 max-[399px]:rounded-[18px] max-[399px]:py-1 max-[399px]:leading-tight`}
          >
            <BellIcon />
            {pt("callStaff", locale)}
          </button>
        )}
      </header>
      {!ended && staffVisible && (
        <p role="status" className="flex flex-none items-center gap-2 bg-[#FFF1CC] px-4 py-3 text-xl font-bold text-[#7A2E0E]">
          <BellIcon />
          {pt("staffCalled", locale)}
        </p>
      )}
      {!ended && reconnecting && (
        <p role="status" className="flex-none bg-[#F3EEE4] px-4 py-3 text-base font-bold text-[#4B463F]">
          {pt("reconnecting", locale)}
        </p>
      )}
      {!ended && props.inApp && !props.inApp.held && (
        <p role="note" className="flex-none bg-[#F3EEE4] px-4 py-3 text-base font-bold text-[#4B463F]">
          {pt("inAppTitle", locale)} {pt("inAppTyping", locale)}
        </p>
      )}
      {body}
      {/* Cart changes for screen readers (docs/UI_GUIDE.md "Accessibility"); silent while the AI voice speaks. */}
      <p aria-live={voiceOutput && voice.state === "speaking" ? "off" : "polite"} className="sr-only">
        {session && session.cart.length > 0 ? cartAnnouncement(session.cart.reduce((n, l) => n + l.qty, 0), session.total, locale) : ""}
      </p>
      {!ended && idle.show && session && deviceToken && (
        <ModalLayer className="absolute inset-0 z-20 flex items-end bg-[#15171C]/60 p-4">
          <section role="alertdialog" aria-modal aria-labelledby="phone-idle-title" className="flex w-full flex-col gap-4 rounded-[26px] bg-[#FBF7EF] p-6 text-center">
            <h2 id="phone-idle-title" className="text-2xl font-bold">
              {pt("idleQuestion", locale, kiosk.domain)}
            </h2>
            <p role="timer" className="font-display text-[2rem] font-bold text-[#7A2E0E]">
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
}

function Scroll({ children }: { children: ReactNode }) {
  // Focusable: while a message is on its way every control inside is disabled, and a keyboard must still scroll it
  // (WCAG 2.1.1). The ring sits inside, because the phone frame clips anything outside.
  return (
    <div
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-[#15171C]"
    >
      {children}
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-none flex-col gap-2 border-t border-[#E2DACB] bg-white px-4 py-3">{children}</div>;
}

function StartScreen({ locale, onStart }: { locale: Locale; onStart(): void }) {
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <Scroll>
      <h1 className="text-2xl font-bold">{pt("startTitle", locale)}</h1>
      <p className="text-xl text-[#4B463F]">{pt("startLead", locale)}</p>
      <ol className={`${CARD} flex flex-col gap-4`}>
        {steps.map((key, i) => (
          <li key={key} className="flex items-center gap-3 text-xl">
            <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-full bg-[#3446D4] text-base font-bold text-white">
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
        <LinkIcon />
        {pt("copyLink", locale)}
      </button>
      <p role="status" className="text-xl font-bold">
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
    <div aria-hidden className="flex flex-col gap-3 self-center rounded-[18px] border-2 border-[#15171C] bg-white p-4 shadow-[0_8px_0_#E2DACB]">
      <div className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-10 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3446D4]">
          <MicIcon />
        </span>
        {pt("allowPicTitle", locale)}
      </div>
      <div className="flex gap-3">
        <span className="flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-[#E2DACB] px-4 text-base text-[#4B463F]">
          {pt("allowPicBlock", locale)}
        </span>
        <span className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#3446D4] px-4 text-base font-bold text-white outline-[3px] outline-offset-4 outline-[#15171C] outline-dashed">
          {pt("micHintAllow", locale)}
        </span>
      </div>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  );
}

/** P4: every line and the total in large type. Focus moves here when it opens. */
function ConfirmCard({ kiosk, session, locale, total = true }: { kiosk: KioskData; session: Session; locale: Locale; total?: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <section aria-labelledby="phone-confirm-title" className="flex flex-col gap-2 rounded-[26px] border-2 border-[#3446D4] bg-white p-4">
      <h1 id="phone-confirm-title" ref={titleRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        {pt("confirmTitle", locale, kiosk.domain)}
      </h1>
      {session.dineOption && <p className="text-xl text-[#4B463F]">{kiosk.dineOptions?.[session.dineOption].name[locale]}</p>}
      <CartLines kiosk={kiosk} cart={session.cart} locale={locale} />
      {total && <TotalRow total={session.total} locale={locale} />}
    </section>
  );
}

/** P4 on a learned kiosk: where to finish. The label is the kiosk's own checkout button from the reviewed skill. */
function PayOnKiosk({ checkout, locale }: { checkout: { label: string; name: LocalizedName }; locale: Locale }) {
  const hint = learnedPayHint(checkout, locale);
  return (
    <p data-pay-on-kiosk className="rounded-[18px] bg-[#EEF0FD] px-4 py-3 text-xl">
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
      <p role="status" data-bridge-notice={notice} className="text-base font-bold text-[#4B463F]">
        {pt("bridgePending", locale)}
      </p>
    );
  }
  return (
    <div role="status" data-bridge-notice={notice} className="flex flex-col gap-3 rounded-[18px] bg-[#FFF1CC] px-4 py-3 text-[#7A2E0E]">
      <p className="text-xl font-bold">{pt(notice === "slow" ? "bridgeSlow" : "bridgeMismatch", locale)}</p>
      {notice === "slow" && (
        <button type="button" onClick={onCallStaff} className={SECONDARY}>
          <BellIcon />
          {pt("callStaff", locale)}
        </button>
      )}
    </div>
  );
}

/** P5: the kiosk's own Korean card button, glossed, so the user can find it on a screen they may not read. */
function PayMethodLine({ locale }: { locale: Locale }) {
  const hint = payMethodHint(locale);
  return (
    <p className="text-xl">
      {hint.pre}
      <strong lang="ko">{hint.label}</strong>
      {hint.gloss}
      {hint.post}
    </p>
  );
}

/** P5: a card going into the kiosk, with an arrow toward it. */
function InsertCardPicture({ mirrored }: { mirrored: boolean }) {
  return (
    <svg viewBox="0 0 240 140" aria-hidden className={`h-36 w-full max-w-72 self-center ${mirrored ? "-scale-x-100" : ""}`}>
      <rect x="150" y="10" width="76" height="120" rx="10" fill="#FFFFFF" stroke="#15171C" strokeWidth="4" />
      <rect x="162" y="24" width="52" height="40" rx="4" fill="#EEF0FD" stroke="#15171C" strokeWidth="3" />
      <rect x="166" y="90" width="44" height="6" rx="3" fill="#15171C" />
      <rect x="40" y="76" width="72" height="44" rx="6" fill="#3446D4" />
      <rect x="40" y="86" width="72" height="8" fill="#1F2A8A" />
      <path d="M14 40h104m0 0-14-12m14 12-14 12" fill="none" stroke="#15171C" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#4B463F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  );
}
