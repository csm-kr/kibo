import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { getStore } from "@/lib/store";
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

  it("refuses a malformed id", async () => {
    const res = await open("../../secrets");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
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
