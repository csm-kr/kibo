import { describe, expect, it } from "vitest";
import { offerScheduling, scheduleOffers } from "./offerScheduling";

const SHOWN = { ok: true, buttons: "shown", status: "ordering" };

describe("offerScheduling", () => {
  it("is SILENT once the AI said anything since the user last spoke", () => {
    expect(offerScheduling(SHOWN, { said: "Would you like me to call staff to check?", calls: ["offerChoices"] })).toBe("SILENT");
    // An invitation is the question too: "say so if you need staff" came back word for word (10-18 probe).
    expect(offerScheduling(SHOWN, { said: "직원에게 확인이 필요하시면 말씀해 주세요.", calls: ["offerChoices"] })).toBe("SILENT");
    // Without the question aloud, the phone's choice card still shows it (Choices.tsx).
    expect(offerScheduling(SHOWN, { said: "We cannot confirm it is safe for you.", calls: ["offerChoices"] })).toBe("SILENT");
  });

  it("lets the model ask once when it said nothing yet", () => {
    expect(offerScheduling(SHOWN, { said: "", calls: ["offerChoices"] })).toBe("WHEN_IDLE");
    expect(offerScheduling(SHOWN, { said: "  ", calls: ["offerChoices"] })).toBe("WHEN_IDLE");
  });

  it("is SILENT when another call in the same response will start the reply anyway", () => {
    expect(offerScheduling(SHOWN, { said: "", calls: ["showMenu", "offerChoices"] })).toBe("SILENT");
  });

  it("buttons already on the phone are never asked about again", () => {
    expect(offerScheduling({ ...SHOWN, buttons: "alreadyShown" }, { said: "", calls: ["offerChoices"] })).toBe("SILENT");
  });

  it("a refused offer makes the model react", () => {
    expect(offerScheduling({ ok: false, code: "BAD_REQUEST" }, { said: "Which one?", calls: ["offerChoices"] })).toBe("WHEN_IDLE");
  });
});

describe("scheduleOffers", () => {
  it("adds scheduling to offerChoices answers only", () => {
    const out = scheduleOffers(
      [
        { id: "1", name: "showMenu", response: { ok: true } },
        { id: "2", name: "offerChoices", response: SHOWN },
      ],
      { said: "", calls: ["showMenu", "offerChoices"] },
    );
    expect(out).toEqual([
      { id: "1", name: "showMenu", response: { ok: true } },
      { id: "2", name: "offerChoices", response: SHOWN, scheduling: "SILENT" },
    ]);
  });
});
