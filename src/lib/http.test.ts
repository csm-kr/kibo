import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { bearer, clientIp, fail, ok, publicOrigin, readJson } from "./http";

function req(headers: Record<string, string> = {}, body?: string, url = "http://kibo.test/api/x"): Request {
  return new Request(url, { method: body === undefined ? "GET" : "POST", headers, body });
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CommandError) return e.code;
    throw e;
  }
  throw new Error("expected a CommandError");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readJson", () => {
  it("parses a JSON body", async () => {
    expect(await readJson(req({}, '{"a":1}'))).toEqual({ a: 1 });
  });

  it("refuses invalid JSON and an empty body", async () => {
    expect(await code(readJson(req({}, "{nope")))).toBe("BAD_REQUEST");
    expect(await code(readJson(req({}, "")))).toBe("BAD_REQUEST");
  });

  it("refuses a body over the limit", async () => {
    const big = JSON.stringify({ s: "x".repeat(64 * 1024) });
    expect(await code(readJson(req({}, big)))).toBe("BAD_REQUEST");
    expect(await readJson(req({}, '{"s":"abc"}'), 16)).toEqual({ s: "abc" });
    expect(await code(readJson(req({}, '{"s":"abcdefghijklmnop"}'), 16))).toBe("BAD_REQUEST");
  });
});

describe("bearer", () => {
  it("reads the token from the Authorization header", () => {
    expect(bearer(req({ authorization: "Bearer abc_DEF-1" }))).toBe("abc_DEF-1");
    expect(bearer(req({ authorization: "Basic abc" }))).toBeNull();
    expect(bearer(req())).toBeNull();
  });
});

describe("ok and fail", () => {
  it("ok wraps the body and disables caching", async () => {
    const res = ok({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, a: 1 });
  });

  it("fail maps a CommandError to its status, with detail", async () => {
    const res = fail(new CommandError("NEEDS_CHOICE", "Please choose a drink.", { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }] }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "NEEDS_CHOICE", message: "Please choose a drink.", detail: { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }] } },
    });
  });

  it("fail hides unknown errors behind INTERNAL and logs only the error name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail(new TypeError("secret-token-123 in the body"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token-123");
  });
});

describe("clientIp", () => {
  it("takes the last X-Forwarded-For hop (the one Cloud Run appends)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(req())).toBe("local");
  });
});

describe("publicOrigin", () => {
  it("prefers the forwarded proto and host", () => {
    expect(publicOrigin(req({ "x-forwarded-proto": "https", "x-forwarded-host": "kibo.example.app", host: "internal:8080" }))).toBe(
      "https://kibo.example.app",
    );
  });

  it("falls back to the host header, then the request URL", () => {
    expect(publicOrigin(req({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(publicOrigin(req({}, undefined, "http://kibo.test:4000/api/session"))).toBe("http://kibo.test:4000");
  });

  it("ignores a forwarded proto other than http or https", () => {
    expect(publicOrigin(req({ "x-forwarded-proto": "javascript", "x-forwarded-host": "kibo.example.app" }))).toBe("http://kibo.example.app");
  });
});
