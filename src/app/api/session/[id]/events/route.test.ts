import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { getStore } from "@/lib/store";
import type { MemoryStore } from "@/lib/store/memory";
import { POST as command } from "../../../command/route";
import { POST as createSession } from "../../route";
import { auth, BASE, commandBody, HERO_LINE, jsonRequest, read } from "../../../testing";
import { GET } from "./route";

beforeEach(() => resetLimits());
afterEach(() => vi.restoreAllMocks());

function open(id: string, signal?: AbortSignal) {
  return GET(new Request(`${BASE}/api/session/${id}/events`, { signal }), { params: Promise.resolve({ id }) });
}

/** Reads whole SSE events (blocks ending in a blank line) from a response body. */
function events(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(): Promise<string | null> {
      while (!buffer.includes("\n\n")) {
        const { done, value } = await reader.read();
        if (done) return null;
        buffer += decoder.decode(value, { stream: true });
      }
      const end = buffer.indexOf("\n\n");
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return event;
    },
    cancel: () => reader.cancel(),
  };
}

function dataOf(event: string | null) {
  expect(event).toMatch(/^data: /);
  return JSON.parse(event!.slice("data: ".length));
}

/** How many store listeners the streams hold now: one per stream that has not ended. */
function countSubscribers() {
  const store = getStore();
  let n = 0;
  const original = store.subscribe.bind(store);
  vi.spyOn(store, "subscribe").mockImplementation((id, onChange, onError) => {
    n++;
    const off = original(id, onChange, onError);
    let done = false;
    return () => {
      if (!done) n--;
      done = true;
      off();
    };
  });
  return () => n;
}

async function newSession() {
  const { body } = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
  return { sessionId: body.sessionId as string, kioskToken: body.kioskToken as string };
}

describe("GET /api/session/[id]/events", () => {
  it("streams the public session on connect and after every change", async () => {
    const s = await newSession();
    const res = await open(s.sessionId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const stream = events(res);
    const first = dataOf(await stream.next());
    expect(first).toMatchObject({ sessionId: s.sessionId, status: "idle", cartVersion: 0 });
    // Only the public document: no token or hash fields.
    expect(Object.keys(first).some((k) => /token|hash|claim/i.test(k))).toBe(false);

    const send = async (type: string, args?: object) =>
      expect((await command(jsonRequest("/api/command", commandBody(s.sessionId, type, args), auth(s.kioskToken)))).status).toBe(200);
    await send("startTouch");
    expect(dataOf(await stream.next())).toMatchObject({ status: "ordering", cartVersion: 0 });
    await send("addToCart", HERO_LINE);
    expect(dataOf(await stream.next())).toMatchObject({ status: "ordering", cartVersion: 1 });
    await stream.cancel();
  });

  it("sends `gone` and closes for an unknown session", async () => {
    const stream = events(await open("A".repeat(22)));
    expect(await stream.next()).toMatch(/^event: gone\n/);
    expect(await stream.next()).toBeNull();
  });

  it("refuses a malformed or 1,000-character id", async () => {
    for (const id of ["../../secrets", "a".repeat(1000)]) {
      const res = await open(id);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
    }
  });

  it("unsubscribes when the request is aborted", async () => {
    const s = await newSession();
    const store = getStore();
    const unsubscribe = vi.fn();
    const original = store.subscribe.bind(store);
    vi.spyOn(store, "subscribe").mockImplementation((id, onChange) => {
      const off = original(id, onChange);
      return () => {
        unsubscribe();
        off();
      };
    });
    const ac = new AbortController();
    const stream = events(await open(s.sessionId, ac.signal));
    await stream.next();
    expect(unsubscribe).not.toHaveBeenCalled();
    ac.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it("unsubscribes when the stream is cancelled", async () => {
    const s = await newSession();
    const store = getStore();
    const unsubscribe = vi.fn();
    const original = store.subscribe.bind(store);
    vi.spyOn(store, "subscribe").mockImplementation((id, onChange) => {
      const off = original(id, onChange);
      return () => {
        unsubscribe();
        off();
      };
    });
    const stream = events(await open(s.sessionId));
    await stream.next();
    await stream.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("closes the stream and unsubscribes when the store listener fails, so EventSource reconnects", async () => {
    const s = await newSession();
    const store = getStore() as MemoryStore;
    const unsubscribe = vi.fn();
    const original = store.subscribe.bind(store);
    vi.spyOn(store, "subscribe").mockImplementation((id, onChange, onError) => {
      const off = original(id, onChange, onError);
      return () => {
        unsubscribe();
        off();
      };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stream = events(await open(s.sessionId));
    await stream.next();
    store.failSubscribers(s.sessionId, new Error("listen failed"));
    expect(await stream.next()).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // I-149: each stream holds one Cloud Run request (concurrency 80 x max 3 instances = 240) for up to the request
  // timeout, so one address may hold 40 (shared office networks during judging, I-154), well below the 240 slots.
  // I-206 (11-22): Cloud Run does not tell the server that a browser left (116 of 119 production streams lasted the
  // whole 15 min), so closed screens kept their places and the 41st page opened within 15 min got "Too many open
  // screens": the finale rehearsal locked its own address out. Now the address's oldest stream ends instead. A screen
  // that is gone loses nothing; one that is still open reconnects (EventSource).
  it("I-149, I-206: one address holds at most 40 streams; one more ends its oldest stream instead of being refused", async () => {
    const s = await newSession();
    const held = countSubscribers();
    const streams = [];
    for (let k = 0; k < 45; k++) {
      const res = await GET(new Request(`${BASE}/api/session/${s.sessionId}/events`, { headers: { "x-forwarded-for": "203.0.113.9" } }), {
        params: Promise.resolve({ id: s.sessionId }),
      });
      expect(res.status).toBe(200);
      streams.push(events(res));
      expect(held()).toBe(Math.min(k + 1, 40));
    }
    // The five oldest were closed, after what was already written to them; the sixth is still open.
    for (const old of streams.slice(0, 5)) {
      let last: string | null = "";
      while (last !== null) last = await old.next();
    }
    expect(dataOf(await streams[5].next())).toMatchObject({ sessionId: s.sessionId });
    await Promise.all(streams.slice(5).map((x) => x.cancel()));
    expect(held()).toBe(0);
  });

  // Live 10-13: places came back minutes after pages were closed. Every way a stream ends must end it at once, and
  // only once.
  it("I-149: cancelling a stream ends it at once, and an abort after it does nothing more", async () => {
    const s = await newSession();
    const held = countSubscribers();
    const req = (signal?: AbortSignal) =>
      GET(new Request(`${BASE}/api/session/${s.sessionId}/events`, { headers: { "x-forwarded-for": "203.0.113.13" }, signal }), {
        params: Promise.resolve({ id: s.sessionId }),
      });
    const ac = new AbortController();
    const first = await req(ac.signal);
    const rest = [];
    for (let i = 0; i < 39; i++) rest.push(await req());
    expect(held()).toBe(40);

    await first.body!.cancel();
    expect(held()).toBe(39);
    ac.abort();
    expect(held()).toBe(39);
    const again = await req();
    expect(again.status).toBe(200);
    expect(held()).toBe(40);
    await Promise.all([again, ...rest].map((r) => r.body!.cancel()));
  });

  it("I-149: a write that fails (the client is gone, nothing cancelled) ends the stream and frees its place", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    try {
      const s = await newSession();
      const req = () =>
        GET(new Request(`${BASE}/api/session/${s.sessionId}/events`, { headers: { "x-forwarded-for": "203.0.113.14" } }), {
          params: Promise.resolve({ id: s.sessionId }),
        });
      const held = countSubscribers();
      const open = [];
      for (let i = 0; i < 40; i++) open.push(await req());
      expect(held()).toBe(40);

      // The next keepalive cannot be written.
      const enqueue = vi.spyOn(ReadableStreamDefaultController.prototype, "enqueue").mockImplementation(() => {
        throw new TypeError("Invalid state: Controller is already closed");
      });
      vi.advanceTimersByTime(25_000);
      enqueue.mockRestore();
      expect(held()).toBe(0);

      const again = await req();
      expect(again.status).toBe(200);
      await Promise.all([again, ...open].map((r) => r.body!.cancel()));
    } finally {
      vi.useRealTimers();
    }
  });

  it("I-149: a stream for a bad session id does not hold a place", async () => {
    for (let i = 0; i < 42; i++) {
      const res = await GET(new Request(`${BASE}/api/session/a.b/events`, { headers: { "x-forwarded-for": "203.0.113.11" } }), {
        params: Promise.resolve({ id: "a.b" }),
      });
      expect(res.status).toBe(400);
    }
  });

  // 12-phone-app:7: a stream held open for the whole Cloud Run timeout keeps an instance billed as active,
  // so the server ends each stream after 15 min and EventSource reconnects if the screen is still in use.
  it("ends the stream cleanly after 15 min, unsubscribes and frees its place", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    try {
      const s = await newSession();
      const store = getStore();
      const unsubscribe = vi.fn();
      const original = store.subscribe.bind(store);
      vi.spyOn(store, "subscribe").mockImplementation((id, onChange, onError) => {
        const off = original(id, onChange, onError);
        return () => {
          unsubscribe();
          off();
        };
      });
      const ip = { headers: { "x-forwarded-for": "203.0.113.12" } };
      const req = () =>
        GET(new Request(`${BASE}/api/session/${s.sessionId}/events`, ip), { params: Promise.resolve({ id: s.sessionId }) });
      // Fill this address's 40 places; the 15-minute end of the first must free one.
      const first = events(await req());
      for (let i = 0; i < 39; i++) expect((await req()).status).toBe(200);

      await first.next();
      vi.advanceTimersByTime(15 * 60_000 - 1);
      // Only keepalives before the cap.
      for (let i = 0; i < Math.floor((15 * 60_000 - 1) / 25_000); i++) expect(await first.next()).toBe(": keepalive");
      expect(unsubscribe).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      // The 36th keepalive falls on the same millisecond; the last frame must be the end comment.
      const tail: (string | null)[] = [];
      for (let e = await first.next(); e !== null; e = await first.next()) tail.push(e);
      expect(tail.at(-1)).toBe(": stream end");
      // All forty were opened at the same (fake) moment, so all end together and free their places.
      expect(unsubscribe).toHaveBeenCalledTimes(40);

      const again = await req();
      expect(again.status).toBe(200);
      await again.body!.cancel();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a keepalive comment every 25 s", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const s = await newSession();
      const stream = events(await open(s.sessionId));
      await stream.next();
      vi.advanceTimersByTime(25_000);
      expect(await stream.next()).toBe(": keepalive");
      await stream.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
