import { describe, expect, it } from "vitest";
import { holdToTalk, SHORT_HOLD_MS } from "./hold";

// Owner 11-22: in a loud place the open microphone also sent the people around the phone, so a turn never ended
// and bystanders were answered (I-431, spikes/crowd-voice). Now the microphone goes to Live only while the user
// holds the button.
describe("holdToTalk", () => {
  it("sends no frame unless the button is held", () => {
    const h = holdToTalk();
    expect(h.frame(true)).toBe(false);
    h.press(0);
    expect(h.frame(true)).toBe(true);
    h.release(1000);
    expect(h.frame(true)).toBe(false);
  });

  it("sends nothing while the phone cannot send, even when held", () => {
    const h = holdToTalk();
    h.press(0);
    // The AI's voice is playing (half-duplex), or the connection is not open yet.
    expect(h.frame(false)).toBe(false);
    expect(h.frame(true)).toBe(true);
  });

  it("asks for the end signal once on release, and only when something was sent", () => {
    const h = holdToTalk();
    h.press(0);
    h.frame(true);
    expect(h.release(1000)).toEqual({ end: true, short: false });
    // A second release (pointer up after a pointer cancel) does nothing.
    expect(h.release(1100)).toEqual({ end: false, short: false });

    h.press(2000);
    h.frame(false);
    expect(h.release(3000).end).toBe(false);
  });

  it("an answer that starts with nothing sent, or with the button up, needs no end signal", () => {
    const h = holdToTalk();
    expect(h.answered()).toBe(false);
    h.press(0);
    h.frame(false);
    expect(h.answered()).toBe(false);
    // After a release that sent its own end signal.
    h.press(1000);
    h.frame(true);
    h.release(2000);
    expect(h.answered()).toBe(false);
  });

  it("ends the hold when the AI starts to answer", () => {
    const h = holdToTalk();
    h.press(0);
    h.frame(true);
    // Live heard a pause and answers while the button is still down: what comes after would cut its answer off.
    // What went up in this hold still has to be closed for Live.
    expect(h.answered()).toBe(true);
    expect(h.held).toBe(false);
    expect(h.frame(true)).toBe(false);
    // The finger comes up later: nothing more to say to Live, and it was not a short tap.
    expect(h.release(5000)).toEqual({ end: false, short: false });
  });

  it("calls a hold shorter than a word a short tap, so the screen can say to keep holding", () => {
    const h = holdToTalk();
    h.press(0);
    h.frame(true);
    expect(h.release(SHORT_HOLD_MS - 1)).toEqual({ end: true, short: true });
    h.press(1000);
    h.frame(true);
    expect(h.release(1000 + SHORT_HOLD_MS).short).toBe(false);
  });

  it("starts each hold fresh", () => {
    const h = holdToTalk();
    h.press(0);
    h.frame(true);
    h.release(1000);
    h.press(2000);
    expect(h.held).toBe(true);
    // Nothing sent in this hold yet.
    expect(h.release(3000).end).toBe(false);
  });

  it("a second press while held changes nothing", () => {
    const h = holdToTalk();
    h.press(0);
    h.frame(true);
    h.press(900);
    expect(h.release(1000)).toEqual({ end: true, short: false });
  });
});
