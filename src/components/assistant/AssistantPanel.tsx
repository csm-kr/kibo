"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModalLayer } from "@/components/kiosk/ModalLayer";
import { useChat, errorText } from "@/hooks/useChat";
import { useNow } from "@/hooks/useNow";
import type { StreamState } from "@/hooks/useSessionStream";
import { ping, sendCommand } from "@/lib/client/api";
import type { ChoiceRef } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import { cartAnnouncement, phoneSecondsLeft, pt } from "@/lib/i18n/phone";
import { idleWarning, staffBannerVisible } from "@/lib/kiosk/timers";
import { phoneScreen, type PhoneLocal } from "@/lib/phone/screen";
import type { KioskData, Locale } from "@/types/menu";
import type { DineOption, Session } from "@/types/session";
import { CartCard, CartLines, TotalRow } from "./CartCard";
import { ChoiceButtons } from "./ChoiceButtons";
import { Composer, Conversation, Examples, LastMessage } from "./Conversation";
import { CARD, FOCUS, PRIMARY, SECONDARY, SMALL } from "./styles";

// The phone screen (docs/UX.md P1–P7, PX), shared by /assistant and /demo. Text mode; voice comes in phase 4.
// Phone buttons send `source: "button"` only from real taps: the server trusts it as a tap (docs/SECURITY.md).

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
}

/** The parent keys this by session id, so local flags never carry over to a new session. */
export function AssistantPanel(props: Props) {
  const { kiosk, session, deviceToken, locale, mode } = props;
  const clockOffset = props.clockOffset ?? 0;
  const [startSeen, setStartSeen] = useState(false);
  const [doneDismissed, setDoneDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const chat = useChat({ sessionId: session?.sessionId ?? null, token: deviceToken, locale });
  const now = useNow();
  const screen = phoneScreen(session, { claimError: props.claimError ?? null, startSeen, doneDismissed });
  const busy = chat.busy || sending || !deviceToken;

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

  /** The confirm card shows `cartVersion`; a spoken "yes" carries it so the server can match it. */
  function say(text: string) {
    void chat.send(text, session?.status === "confirming" ? session.cartVersion : undefined);
  }

  function pickChoice(choice: ChoiceRef, label: string) {
    // Dine choices go straight to the session; any other tap is the user's answer to the agent's question.
    if (choice.kind === "dine") void command("setDineOption", { option: choice.id });
    else say(label);
  }

  // Screens other than talk show only replies that came after they opened, so an old error never lingers there.
  const [opened, setOpened] = useState({ screen, count: chat.messages.length });
  if (opened.screen !== screen) setOpened({ screen, count: chat.messages.length });
  const fresh = chat.messages.slice(opened.screen === screen ? opened.count : chat.messages.length);

  const otherLocale: Locale = locale === "ko" ? "en" : "ko";
  const working = chat.busy && chat.sentAt > 0 && now - chat.sentAt >= 1000;
  const staffVisible = session !== null && staffBannerVisible(session, now, clockOffset);
  const idle = session ? idleWarning(session, now, clockOffset) : { show: false, secondsLeft: 0 };
  const reconnecting = session !== null && props.streamState !== undefined && props.streamState !== "open";
  const ended = screen === "ended" || screen === "taken";

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
    case "dine":
      body = (
        <>
          <Scroll>
            <h1 className="text-2xl font-bold">{pt("dineQuestion", locale)}</h1>
            <div className="grid grid-cols-2 gap-3">
              {(["eat_in", "take_out"] as DineOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => void command("setDineOption", { option })}
                  className={`overflow-hidden rounded-[18px] border-2 border-[#15171C] bg-white text-left active:border-[#3446D4] disabled:opacity-60 ${FOCUS}`}
                >
                  <span className="relative block aspect-[4/3]">
                    <Image src={kiosk.dineOptions[option].image} alt="" fill sizes="50vw" loading="eager" className="object-cover" />
                  </span>
                  <span className="block px-3 py-3 text-xl font-bold">{kiosk.dineOptions[option].name[locale]}</span>
                </button>
              ))}
            </div>
            <LastMessage messages={fresh} locale={locale} />
          </Scroll>
          <Footer>
            {/* Mic slot (phase 4, voice): the large mic button goes here, above the text input. */}
            <Composer locale={locale} disabled={busy} hint={pt("dineOrTalk", locale)} onSend={say} />
          </Footer>
        </>
      );
      break;
    case "talk":
      body = session && (
        <>
          <Scroll>
            <h1 className="sr-only">{pt("cartTitle", locale)}</h1>
            <Conversation messages={chat.messages} locale={locale} working={working} />
            {session.pendingChoice && (
              <ChoiceButtons kiosk={kiosk} pending={session.pendingChoice} locale={locale} disabled={busy} onPick={pickChoice} />
            )}
            <CartCard
              kiosk={kiosk}
              cart={session.cart}
              total={session.total}
              locale={locale}
              canUndo={!busy && session.undoStack.length > 0}
              onUndo={() => void command("undoLastChange", {})}
            />
            <Examples examples={props.examples ?? []} locale={locale} disabled={busy} onPick={say} />
          </Scroll>
          <Footer>
            {/* Mic slot (phase 4, voice): the large mic button goes here, above the text input. */}
            <Composer locale={locale} disabled={busy} onSend={say} />
          </Footer>
        </>
      );
      break;
    case "confirm":
      body = session && (
        <>
          <Scroll>
            <ConfirmCard kiosk={kiosk} session={session} locale={locale} />
            <button
              type="button"
              disabled={busy}
              onClick={() => void command("confirmCheckout", {}, session.cartVersion)}
              className={`${PRIMARY} min-h-22 text-2xl`}
            >
              {pt("payNow", locale)}
            </button>
            <button type="button" disabled={busy} onClick={() => void command("cancelCheckout", {})} className={SECONDARY}>
              {pt("pickMore", locale)}
            </button>
            <LastMessage messages={fresh} locale={locale} />
          </Scroll>
          <Footer>
            {/* Mic slot (phase 4, voice): a spoken "yes" confirms too. */}
            <Composer locale={locale} disabled={busy} hint={pt("sayYes", locale)} onSend={say} />
          </Footer>
        </>
      );
      break;
    case "pay":
      body = session && (
        <Scroll>
          <h1 className="text-2xl font-bold">{pt("payTitle", locale)}</h1>
          <InsertCardPicture />
          <p className="text-xl">{pt("payHint", locale)}</p>
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
            <h1 className="text-xl font-bold">{pt("orderNumber", locale)}</h1>
            <p className="font-display text-[7.5rem] leading-none font-bold text-[#3446D4]">{session.orderNumber}</p>
            <p className="text-xl">{pt("pickup", locale)}</p>
          </div>
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
            <p className="text-xl text-[#4B463F]">{pt(screen === "taken" ? "takenNext" : "endedNext", locale)}</p>
          </div>
        </Scroll>
      );
      break;
  }

  return (
    <div lang={locale} data-phone-screen={screen} data-mode={mode} className="relative flex h-full min-h-0 flex-col bg-[#FBF7EF] text-[#15171C]">
      <header className="flex flex-none flex-wrap items-center gap-2 border-b border-[#E2DACB] bg-white px-4 py-2">
        <div className="flex flex-1 items-center gap-2">
          {/* max-w-none: a percentage max-width lets the row count the logo as 0px wide and skip wrapping. */}
          <Image src="/kibo-mark.svg" alt="KIBO" width={32} height={32} unoptimized className="size-8 max-w-none flex-none" />
          <span className="text-base font-bold">{kiosk.brand.name[locale]}</span>
        </div>
        {/* One switch named in the other language, so a reader of either can find it; it fits one row at 390px. */}
        <button type="button" lang={otherLocale} onClick={() => props.onLocaleChange(otherLocale)} className={`${SMALL} flex-none`}>
          <GlobeIcon />
          {pt(otherLocale === "ko" ? "langKo" : "langEn", locale)}
        </button>
        {!ended && (
          <button
            type="button"
            disabled={!session || !deviceToken}
            onClick={() => void command("callStaff", { reasonCode: "user_request" })}
            // min-w-14 replaces the automatic minimum, so without flex-none the label would spill over the brand.
            className={`${SMALL} flex-none`}
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
      {body}
      {/* Cart changes for screen readers (docs/UI_GUIDE.md "Accessibility"); voice comes in phase 4. */}
      <p aria-live="polite" className="sr-only">
        {session && session.cart.length > 0 ? cartAnnouncement(session.cart.reduce((n, l) => n + l.qty, 0), session.total, locale) : ""}
      </p>
      {!ended && idle.show && session && deviceToken && (
        <ModalLayer className="absolute inset-0 z-20 flex items-end bg-[#15171C]/60 p-4">
          <section role="alertdialog" aria-modal aria-labelledby="phone-idle-title" className="flex w-full flex-col gap-4 rounded-[26px] bg-[#FBF7EF] p-6 text-center">
            <h2 id="phone-idle-title" className="text-2xl font-bold">
              {pt("idleQuestion", locale)}
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
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">{children}</div>;
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

/** P4: every line and the total in large type. Focus moves here when it opens. */
function ConfirmCard({ kiosk, session, locale }: { kiosk: KioskData; session: Session; locale: Locale }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <section aria-labelledby="phone-confirm-title" className="flex flex-col gap-2 rounded-[26px] border-2 border-[#3446D4] bg-white p-4">
      <h1 id="phone-confirm-title" ref={titleRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        {pt("confirmTitle", locale)}
      </h1>
      {session.dineOption && <p className="text-xl text-[#4B463F]">{kiosk.dineOptions[session.dineOption].name[locale]}</p>}
      <CartLines kiosk={kiosk} cart={session.cart} locale={locale} />
      <TotalRow total={session.total} locale={locale} />
    </section>
  );
}

/** P5: a card going into the kiosk, with an arrow toward it. */
function InsertCardPicture() {
  return (
    <svg viewBox="0 0 240 140" aria-hidden className="h-36 w-full max-w-72 self-center">
      <rect x="150" y="10" width="76" height="120" rx="10" fill="#FFFFFF" stroke="#15171C" strokeWidth="4" />
      <rect x="162" y="24" width="52" height="40" rx="4" fill="#EEF0FD" stroke="#15171C" strokeWidth="3" />
      <rect x="166" y="90" width="44" height="6" rx="3" fill="#15171C" />
      <rect x="40" y="76" width="72" height="44" rx="6" fill="#3446D4" />
      <rect x="40" y="86" width="72" height="8" fill="#1F2A8A" />
      <path d="M14 40h104m0 0-14-12m14 12-14 12" fill="none" stroke="#15171C" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
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
