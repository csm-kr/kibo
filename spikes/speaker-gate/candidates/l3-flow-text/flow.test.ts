import { describe, expect, it } from "vitest";
import { flowPrompt, parseFlow } from "./flow";

describe("flow filter", () => {
  const state = { lang: "en" as const, menu: ["Cheeseburger", "Cola"], cart: [], lastQuestion: "What would you like to order?", earlier: [] };

  it("puts the dialogue state and the transcript in the prompt, transcript last", () => {
    const p = flowPrompt(state, "two cheeseburgers did you see the game");
    expect(p).toContain("What would you like to order?");
    expect(p).toContain("Cheeseburger");
    expect(p).toContain("(empty)");
    expect(p.trim().endsWith("two cheeseburgers did you see the game")).toBe(true);
  });

  it("lists the customer's earlier words when there are some", () => {
    expect(flowPrompt({ ...state, earlier: ["Two cheeseburgers."] }, "x")).toContain("Two cheeseburgers.");
  });

  it("parses the model's JSON", () => {
    expect(parseFlow('{"text":"two cheeseburgers","complete":true,"unsure":false}')).toEqual({ text: "two cheeseburgers", complete: true, unsure: false });
  });

  it("treats a broken answer as unsure with nothing kept, never as the whole transcript", () => {
    expect(parseFlow("not json")).toEqual({ text: "", complete: false, unsure: true });
    expect(parseFlow('{"text":5}')).toEqual({ text: "", complete: false, unsure: true });
  });
});
