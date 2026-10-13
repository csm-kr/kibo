import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_CLOSE_MS, IDLE_PAUSE_MS, RETRY_FIRST_MS, RETRY_MAX_MS, StreamControl } from "./streamControl";

/** Stands in for EventSource: only open and close matter here. */
class FakeSource {
  closed = false;
  close() {
    this.closed = true;
  }
}

function setup(opts: { hidden?: boolean; idlePause?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const onPause = vi.fn();
  const control = new StreamControl({
    open: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    onPause,
    ...(opts.idlePause === undefined ? {} : { idlePause: opts.idlePause }),
  });
  control.start(opts.hidden ?? false);
  const openCount = () => sources.filter((s) => !s.closed).length;
  return { control, sources, onPause, openCount };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("StreamControl: hidden tabs", () => {
  it("opens one stream on start", () => {
    const { sources, openCount } = setup();
    expect(sources).toHaveLength(1);
    expect(openCount()).toBe(1);
  });

  it("closes the stream after 60 s hidden, so a hidden tab holds nothing", () => {
    const { control, openCount } = setup();
    control.setHidden(true);
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1);
    expect(openCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(openCount()).toBe(0);
  });

  it("keeps the stream when the tab comes back within 60 s", () => {
    const { control, sources, openCount } = setup();
    control.setHidden(true);
    vi.advanceTimersByTime(30_000);
    control.setHidden(false);
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    expect(openCount()).toBe(1);
    expect(sources).toHaveLength(1);
  });

  it("opens a new stream when the page is visible again", () => {
    const { control, sources, openCount } = setup();
    control.setHidden(true);
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    control.setHidden(false);
    expect(sources).toHaveLength(2);
    expect(openCount()).toBe(1);
  });

  it("a page that starts hidden closes after 60 s too", () => {
    const { openCount } = setup({ hidden: true });
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    expect(openCount()).toBe(0);
  });
});

describe("StreamControl: idle screens", () => {
  it("pauses after 20 min with no activity and closes the stream", () => {
    const { onPause, openCount } = setup();
    vi.advanceTimersByTime(IDLE_PAUSE_MS - 1);
    expect(onPause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPause).toHaveBeenCalledWith(true);
    expect(openCount()).toBe(0);
  });

  it("activity (input or a session change) restarts the 20 min", () => {
    const { control, onPause } = setup();
    vi.advanceTimersByTime(IDLE_PAUSE_MS - 1_000);
    control.activity();
    vi.advanceTimersByTime(IDLE_PAUSE_MS - 1);
    expect(onPause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPause).toHaveBeenCalledWith(true);
  });

  it("activity while paused does not resume; only resume() does", () => {
    const { control, sources, onPause, openCount } = setup();
    vi.advanceTimersByTime(IDLE_PAUSE_MS);
    control.activity();
    expect(openCount()).toBe(0);
    control.resume();
    expect(onPause).toHaveBeenLastCalledWith(false);
    expect(sources).toHaveLength(2);
    expect(openCount()).toBe(1);
    // The 20 min start again from the resume.
    vi.advanceTimersByTime(IDLE_PAUSE_MS - 1);
    expect(openCount()).toBe(1);
  });

  it("does not reopen on visible while paused", () => {
    const { control, sources } = setup();
    control.setHidden(true);
    vi.advanceTimersByTime(IDLE_PAUSE_MS);
    control.setHidden(false);
    expect(sources).toHaveLength(1);
    control.resume();
    expect(sources).toHaveLength(2);
  });

  it("a hidden tab still pauses after 20 min, so returning to it shows the pause", () => {
    const { control, onPause } = setup();
    control.setHidden(true);
    vi.advanceTimersByTime(IDLE_PAUSE_MS);
    expect(onPause).toHaveBeenCalledWith(true);
  });
});

describe("StreamControl: kiosk screens (idlePause off, I-172)", () => {
  it("never pauses a visible kiosk, so its QR stays up and its bridge keeps replaying", () => {
    const { onPause, openCount } = setup({ idlePause: false });
    vi.advanceTimersByTime(IDLE_PAUSE_MS * 3);
    expect(onPause).not.toHaveBeenCalled();
    expect(openCount()).toBe(1);
  });

  it("still closes after 60 s hidden and reopens when visible", () => {
    const { control, sources, onPause, openCount } = setup({ idlePause: false });
    control.setHidden(true);
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    expect(openCount()).toBe(0);
    vi.advanceTimersByTime(IDLE_PAUSE_MS);
    control.setHidden(false);
    expect(onPause).not.toHaveBeenCalled();
    expect(sources).toHaveLength(2);
    expect(openCount()).toBe(1);
  });
});

describe("StreamControl: a stream refused for good (429, 503; I-033)", () => {
  it("reopens after 3 s, then 6 s, 12 s, 24 s, and every 30 s after that", () => {
    const { control, sources } = setup();
    expect([RETRY_FIRST_MS, RETRY_MAX_MS]).toEqual([3_000, 30_000]);
    const waits = [3_000, 6_000, 12_000, 24_000, 30_000, 30_000];
    for (const [i, wait] of waits.entries()) {
      control.failed();
      expect(sources[i].closed).toBe(true);
      vi.advanceTimersByTime(wait - 1);
      expect(sources).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(sources).toHaveLength(i + 2);
    }
  });

  it("a successful open starts the waits again at 3 s", () => {
    const { control, sources } = setup();
    control.failed();
    vi.advanceTimersByTime(3_000);
    control.failed();
    vi.advanceTimersByTime(6_000);
    expect(sources).toHaveLength(3);
    control.opened();
    control.failed();
    vi.advanceTimersByTime(3_000);
    expect(sources).toHaveLength(4);
  });

  it("does not reopen while hidden; reopens when the page is visible again", () => {
    const { control, sources, openCount } = setup();
    control.failed();
    control.setHidden(true);
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS * 2);
    expect(sources).toHaveLength(1);
    control.setHidden(false);
    expect(sources).toHaveLength(2);
    expect(openCount()).toBe(1);
  });

  it("coming back within the wait does not cut it short", () => {
    const { control, sources } = setup();
    control.failed();
    control.setHidden(true);
    vi.advanceTimersByTime(1_000);
    control.setHidden(false);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(sources).toHaveLength(2);
  });

  it("does not reopen while paused; resume() does", () => {
    const { control, sources, onPause, openCount } = setup();
    vi.advanceTimersByTime(IDLE_PAUSE_MS - 1_000);
    control.failed();
    vi.advanceTimersByTime(1_000);
    expect(onPause).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(RETRY_MAX_MS * 2);
    expect(sources).toHaveLength(1);
    control.resume();
    expect(sources).toHaveLength(2);
    expect(openCount()).toBe(1);
  });

  it("keeps retrying on a kiosk screen, which never pauses", () => {
    const { control, sources } = setup({ idlePause: false });
    for (let i = 0; i < 50; i++) {
      control.failed();
      vi.advanceTimersByTime(RETRY_MAX_MS);
    }
    expect(sources).toHaveLength(51);
  });

  it("stop() cancels a pending retry", () => {
    const { control, sources } = setup();
    control.failed();
    control.stop();
    vi.advanceTimersByTime(RETRY_MAX_MS * 2);
    expect(sources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("StreamControl: stop", () => {
  it("closes the stream and stops every timer", () => {
    const { control, sources, onPause, openCount } = setup();
    control.stop();
    expect(openCount()).toBe(0);
    control.setHidden(false);
    vi.advanceTimersByTime(IDLE_PAUSE_MS * 2);
    expect(onPause).not.toHaveBeenCalled();
    expect(sources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
