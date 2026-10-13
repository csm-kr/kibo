"use client";

import type { ReactNode } from "react";
import { CARD } from "@/components/assistant/styles";
import { HERO_CART, type Comparison } from "@/lib/demo/compare";
import { lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";

// D3 "touch vs talk" (docs/PRD.md "Demo scenario" step 8). Each column says where its numbers come from: counted in
// this browser for this order, or an evidence file (src/lib/demo/evidence.ts). No ratios or "× faster" (R-001).

type Words = Record<Locale, string>;

const TITLE: Words = { ko: "터치와 말하기 비교", en: "Touch vs talk" };
const KIBO_TITLE: Words = { ko: "KIBO로 한 이번 주문", en: "This order with KIBO" };
const KIBO_SOURCE: Words = {
  ko: "이 브라우저에서 이번 주문만 셌어요. [시작]부터 주문 번호까지.",
  en: "Counted in this browser for this order, from Start to the order number.",
};
const SENTENCES: Words = { ko: "AI에게 보낸 말 (말하기, 입력, 선택 포함)", en: "Messages to the AI (spoken, typed or picked)" };
const PHONE_TAPS: Words = { ko: "휴대폰 터치", en: "Taps on the phone" };
const KIOSK_TAPS: Words = { ko: "키오스크 터치", en: "Taps on the kiosk" };
const TIME: Words = { ko: "걸린 시간", en: "Time" };
const SAME_TITLE: Words = { ko: "같은 주문을 터치로", en: "The same order by touch" };
const REFERENCE_TITLE: Words = { ko: "기준 주문을 터치로", en: "The reference order by touch" };
const NO_MACHINE_TIME: Words = {
  ko: "표시 안 함: 자동 실행은 기계 속도로 눌러요.",
  en: "Not shown: an automated run taps at machine speed.",
};

const seconds = (n: number, locale: Locale) => (locale === "ko" ? `${n}초` : `${n} s`);

export function CompareCard({ kiosk, comparison, locale }: { kiosk: KioskData; comparison: Comparison; locale: Locale }) {
  const { live, touch } = comparison;
  const reference = HERO_CART.map((l) => lineLabel(kiosk, { ...l, lineId: "", unitPrice: 0 }, locale));

  return (
    <section data-compare-card aria-labelledby="demo-compare-title" className={`${CARD} flex flex-col gap-4`}>
      <h2 id="demo-compare-title" className="text-xl font-bold">
        {TITLE[locale]}
      </h2>
      <div className={`grid gap-4 ${touch ? "grid-cols-2" : ""}`}>
        <Column title={KIBO_TITLE[locale]} data="kibo">
          <Row label={SENTENCES[locale]} value={live.sentences} name="sentences" />
          <Row label={PHONE_TAPS[locale]} value={live.phoneTaps} name="phone-taps" />
          <Row label={KIOSK_TAPS[locale]} value={live.kioskTaps} name="kiosk-taps" />
          <Row label={TIME[locale]} value={seconds(live.seconds, locale)} name="seconds" />
        </Column>
        {touch && (
          <Column title={(touch.sameOrder ? SAME_TITLE : REFERENCE_TITLE)[locale]} data="touch">
            <Row label={KIOSK_TAPS[locale]} value={touch.taps} name="touch-taps" />
            {touch.source === "human" ? (
              <Row label={TIME[locale]} value={seconds(touch.seconds, locale)} name="touch-seconds" />
            ) : (
              <div>
                <dt className="text-base text-[#4B463F]">{TIME[locale]}</dt>
                <dd className="text-base">{NO_MACHINE_TIME[locale]}</dd>
              </div>
            )}
          </Column>
        )}
      </div>
      <p className="text-base text-[#4B463F]">{KIBO_SOURCE[locale]}</p>
      {touch && (
        <p data-compare-source className="text-base text-[#4B463F]">
          {touch.source === "human"
            ? locale === "ko"
              ? `터치: 이 키오스크 시뮬레이터에서 ${touch.runs}명이 직접 한 기록의 중간값.`
              : `Touch: median of ${touch.runs} people on this kiosk simulator.`
            : locale === "ko"
              ? `터치: 이 키오스크 시뮬레이터에서 자동 실행 (${touch.date.slice(0, 10)}), 옵션을 담을 때 고르는 경로.`
              : `Touch: automated run on this kiosk simulator (${touch.date.slice(0, 10)}), options picked while adding.`}
          {touch.source === "automated" &&
            touch.editPathTaps !== null &&
            (locale === "ko"
              ? ` 담은 뒤 옵션을 바꾸려면 지우고 다시 담아야 해서 ${touch.editPathTaps}번이 돼요.`
              : ` Changing an option after adding means delete and add again here: ${touch.editPathTaps} taps.`)}
        </p>
      )}
      {touch && !touch.sameOrder && (
        <p className="text-base text-[#4B463F]">
          {locale === "ko" ? "기준 주문: " : "Reference order: "}
          {reference.map((r) => `${r.title} (${r.detail})`).join(", ")}
          {locale === "ko" ? ". 이번 주문과 달라요." : ". Your order is different."}
        </p>
      )}
    </section>
  );
}

function Column(props: { title: string; data: string; children: ReactNode }) {
  return (
    <div data-compare-column={props.data} className="flex min-w-0 flex-col gap-2">
      <h3 className="text-base font-bold">{props.title}</h3>
      <dl className="flex flex-col gap-2">{props.children}</dl>
    </div>
  );
}

function Row({ label, value, name }: { label: string; value: ReactNode; name: string }) {
  return (
    <div>
      <dt className="text-base text-[#4B463F]">{label}</dt>
      <dd data-compare={name} className="font-display text-[2rem] leading-tight font-bold">
        {value}
      </dd>
    </div>
  );
}
