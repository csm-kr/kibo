import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createSession, ping, sendCommand } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastCall(): { url: string; init: RequestInit; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe("sendCommand", () => {
  it("posts the command with a fresh commandId and the bearer token", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, status: "ordering", cart: [], total: 0, cartVersion: 1 }));
    const res = await sendCommand({
      sessionId: "sess",
      token: "tok_123",
      type: "setDineOption",
      args: { option: "eat_in" },
      source: "touch",
      cartVersion: 3,
    });
    const { url, init, body } = lastCall();
    expect(url).toBe("/api/command");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok_123");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(body).toMatchObject({
      sessionId: "sess",
      type: "setDineOption",
      args: { option: "eat_in" },
      source: "touch",
      cartVersion: 3,
    });
    expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty("utteranceSeq");
    expect(res.status).toBe("ordering");
  });

  it("uses a new commandId for every call", async () => {
    fetchMock.mockImplementation(async () => reply(200, { ok: true, status: "ordering", cart: [], total: 0, cartVersion: 0 }));
    const input = { sessionId: "s", token: "t", type: "startTouch" as const, args: {}, source: "touch" as const };
    await sendCommand(input);
    const first = lastCall().body.commandId;
    await sendCommand(input);
    expect(lastCall().body.commandId).not.toBe(first);
  });

  it("maps an error reply to ApiError with code, message and detail", async () => {
    const detail = { templateId: "pick_dine", choices: [{ kind: "dine", id: "eat_in" }] };
    fetchMock.mockResolvedValue(
      reply(422, { ok: false, error: { code: "NEEDS_CHOICE", message: "Eat here or take out?", detail } }),
    );
    const err = await sendCommand({ sessionId: "s", token: "t", type: "requestCheckout", args: {}, source: "touch" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "NEEDS_CHOICE", message: "Eat here or take out?", detail });
  });

  it("turns a failed fetch into a NETWORK error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await sendCommand({ sessionId: "s", token: "t", type: "startTouch", args: {}, source: "touch" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "NETWORK", message: "Connection problem. Please try again." });
  });

  it("treats a reply that is not our JSON as INTERNAL", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    const err = await sendCommand({ sessionId: "s", token: "t", type: "startTouch", args: {}, source: "touch" }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "INTERNAL" });
  });

  it("treats an unknown error code as INTERNAL, so screens always have copy for it", async () => {
    fetchMock.mockResolvedValue(reply(418, { ok: false, error: { code: "TEAPOT", message: "?" } }));
    const err = await sendCommand({ sessionId: "s", token: "t", type: "startTouch", args: {}, source: "touch" }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "INTERNAL" });
  });
});

describe("createSession and ping", () => {
  it("createSession posts the kiosk id without a token", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { ok: true, sessionId: "s", claimUrl: "http://x/assistant?s=s#t=c", kioskToken: "k", expiresAt: 1 }),
    );
    const r = await createSession("malo");
    const { url, init, body } = lastCall();
    expect(url).toBe("/api/session");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(body).toEqual({ kioskId: "malo" });
    expect(r.kioskToken).toBe("k");
  });

  it("createSession sends demo only when asked", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, sessionId: "s", claimUrl: "u", kioskToken: "k", expiresAt: 1 }));
    await createSession("malo", true);
    expect(lastCall().body).toEqual({ kioskId: "malo", demo: true });
  });

  it("ping sends active with the token and returns serverTime", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, status: "idle", expiresAt: 5, serverTime: 42 }));
    const r = await ping({ sessionId: "s", token: "k", active: true });
    const { url, init, body } = lastCall();
    expect(url).toBe("/api/ping");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer k");
    expect(body).toEqual({ sessionId: "s", active: true });
    expect(r.serverTime).toBe(42);
  });
});
