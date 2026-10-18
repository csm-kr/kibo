import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { Session } from "@/types/session";
import { kioskPickedCard } from "./payment";

const paying = (over: Partial<Session>) => ({ status: "paying", ...over }) as Session;

describe("kioskPickedCard", () => {
  it("is true when the phone confirmed on a kiosk that takes card only: the kiosk opens on the card step", () => {
    expect(kioskPickedCard(getKiosk("malo"), paying({ confirmedBy: "phone" }))).toBe(true);
    expect(kioskPickedCard(getKiosk("airport_rail"), paying({ confirmedBy: "phone" }))).toBe(true);
  });

  it("is false for a touch confirm, an older session without the field, another status or a learned kiosk", () => {
    expect(kioskPickedCard(getKiosk("malo"), paying({ confirmedBy: "kiosk" }))).toBe(false);
    expect(kioskPickedCard(getKiosk("malo"), paying({}))).toBe(false);
    expect(kioskPickedCard(getKiosk("malo"), { status: "confirming", confirmedBy: "phone" } as Session)).toBe(false);
    expect(kioskPickedCard(getKiosk("doughhouse"), paying({ confirmedBy: "phone" }))).toBe(false);
  });

  it("is false on a kiosk that takes more than card: the user picks the method there", () => {
    const both = { ...getKiosk("malo"), payment: { methods: ["card", "cash"] } } as ReturnType<typeof getKiosk>;
    expect(kioskPickedCard(both, paying({ confirmedBy: "phone" }))).toBe(false);
  });
});
