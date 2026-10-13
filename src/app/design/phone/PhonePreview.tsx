"use client";

import { useId, useState, type ReactNode } from "react";
import { AppBar } from "@/components/phone/AppBar";
import { ConfirmBar, ConfirmCard, DoneCard, PayCard } from "@/components/phone/Checkout";
import { Choices } from "@/components/phone/Choices";
import { Bubble, StatusChip } from "@/components/phone/Conversation";
import { Dock } from "@/components/phone/Dock";
import { OrderCard } from "@/components/phone/OrderCard";
import { Suggestions } from "@/components/phone/Suggestions";
import type { VoiceState } from "@/hooks/useLiveVoice";
import { examplesFor } from "@/lib/agent/examples";
import { pt } from "@/lib/i18n/phone";
import type { ChatMessage } from "@/lib/phone/chat";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine, Session } from "@/types/session";

// Sample data only: ids and options from data/kiosks/malo.json, prices as the server computes them.

const CART: CartLine[] = [
  {
    lineId: "l1",
    itemId: "cheese_burger",
    variant: "set",
    qty: 1,
    selections: { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] },
    unitPrice: 6900,
  },
  { lineId: "l2", itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_m"], drink: ["cider"] }, unitPrice: 6900 },
];
const TOTAL = 13800;

const MESSAGES: Record<Locale, ChatMessage[]> = {
  en: [
    { id: 1, role: "user", text: "Two cheeseburger sets, one without pickles. Drinks zero cola and cider." },
    { id: 2, role: "model", text: "Added two cheeseburger sets. One without pickles with zero cola, one with cider." },
  ],
  ko: [
    { id: 1, role: "user", text: "치즈버거 세트 두 개, 하나는 피클 빼고요. 음료는 제로 콜라랑 사이다." },
    { id: 2, role: "model", text: "치즈버거 세트 두 개를 담았어요. 하나는 피클 없이 제로 콜라, 하나는 사이다예요." },
  ],
};

const CHOICE: NonNullable<Session["pendingChoice"]> = {
  templateId: "pick_item",
  choices: [
    { kind: "item", id: "bulgogi_burger" },
    { kind: "item", id: "double_cheese_burger" },
  ],
};

const DOCK_STATES: VoiceState[] = ["off", "listening", "thinking", "reconnecting"];

function noop() {}

function Frame({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section data-preview={id} aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="px-4 text-base font-semibold text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PhonePreview({ kiosk }: { kiosk: KioskData }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [typing, setTyping] = useState(true);
  const brand = kiosk.brand.name[locale];
  return (
    <main lang={locale} className="mx-auto flex w-full max-w-[480px] flex-col gap-8 bg-cream pb-16 text-ink">
      <h1 className="px-4 pt-6 text-2xl font-bold">Phone design preview</h1>

      <Frame id="app-bar" title="App bar">
        <AppBar brand={brand} locale={locale} connection="connected" onLocaleChange={setLocale} onStaff={noop} />
        <AppBar brand={brand} locale={locale} connection="reconnecting" onLocaleChange={setLocale} onStaff={noop} />
      </Frame>

      <Frame id="conversation" title="Conversation">
        <div className="flex flex-col gap-2 px-4">
          {MESSAGES[locale].map((m) => (
            <Bubble key={m.id} m={m} locale={locale} />
          ))}
          <Bubble m={{ id: 3, role: "notice", text: pt("voiceNoise", locale) }} locale={locale} />
          <div className="flex flex-wrap gap-2">
            <StatusChip text={pt("micListening", locale)} />
            <StatusChip text={pt("working", locale)} />
            <StatusChip text={pt("reconnecting", locale)} tone="warn" />
          </div>
          <Choices kiosk={kiosk} pending={CHOICE} locale={locale} disabled={false} onPick={noop} />
        </div>
      </Frame>

      <Frame id="cart" title="Cart card">
        <div className="flex flex-col gap-4 px-4">
          <OrderCard kiosk={kiosk} cart={CART} total={TOTAL} locale={locale} canUndo onUndo={noop} />
          <OrderCard kiosk={kiosk} cart={[]} total={0} locale={locale} canUndo={false} onUndo={noop} />
        </div>
      </Frame>

      <Frame id="suggestions" title="Suggestions">
        <div className="px-4">
          <Suggestions examples={examplesFor(kiosk.kioskId, locale)} locale={locale} disabled={false} onPick={noop} />
        </div>
      </Frame>

      <Frame id="dock" title="Dock">
        <div className="flex flex-col gap-6">
          {DOCK_STATES.map((state) => (
            <Dock
              key={state}
              state={state}
              locale={locale}
              disabled={false}
              onMic={noop}
              voiceOutput={voiceOutput}
              onVoiceOutput={setVoiceOutput}
              typing={false}
              onTyping={noop}
              onSend={noop}
            />
          ))}
        </div>
      </Frame>

      <Frame id="dock-typing" title="Dock with the text field open">
        <Dock
          state="off"
          locale={locale}
          disabled={false}
          onMic={noop}
          voiceOutput={voiceOutput}
          onVoiceOutput={setVoiceOutput}
          typing={typing}
          onTyping={setTyping}
          onSend={noop}
        />
      </Frame>

      <Frame id="confirm" title="Confirm (P4)">
        <div className="px-4">
          <ConfirmCard kiosk={kiosk} cart={CART} locale={locale} dine={kiosk.dineOptions?.eat_in.name[locale]} onPickMore={noop} />
        </div>
        <ConfirmBar total={TOTAL} locale={locale} onPay={noop} voice="off" onMic={noop} onTyping={noop} />
      </Frame>

      <Frame id="pay" title="Pay (P5)">
        <div className="px-4">
          <PayCard total={TOTAL} locale={locale} />
        </div>
      </Frame>

      <Frame id="done" title="Done (P6)">
        <div className="px-4">
          <DoneCard orderNumber={179} locale={locale} domain={kiosk.domain} onDone={noop} />
        </div>
      </Frame>
    </main>
  );
}
