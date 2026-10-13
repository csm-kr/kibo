import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { bearer, clientIp, fail, ok, pairUrl, publicOrigin, readJson } from "./http";

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

  it("uses PUBLIC_ORIGIN when it is set to an http(s) origin, so every kiosk shows one short host", () => {
    try {
      process.env.PUBLIC_ORIGIN = "https://kibo-1.asia-northeast3.run.app";
      expect(publicOrigin(req({ host: "kibo-abc-du.a.run.app" }))).toBe("https://kibo-1.asia-northeast3.run.app");
      process.env.PUBLIC_ORIGIN = "not a url";
      expect(publicOrigin(req({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    } finally {
      delete process.env.PUBLIC_ORIGIN;
    }
  });
});

describe("pairUrl", () => {
  afterEach(() => {
    delete process.env.SHORT_APP_URL;
    delete process.env.PUBLIC_ORIGIN;
  });

  it("is <public host>/app without SHORT_APP_URL", () => {
    expect(pairUrl(req({ host: "localhost:3000" }))).toBe("localhost:3000/app");
    process.env.PUBLIC_ORIGIN = "https://kibo-1.asia-northeast3.run.app";
    expect(pairUrl(req({ host: "internal:8080" }))).toBe("kibo-1.asia-northeast3.run.app/app");
  });

  it("is SHORT_APP_URL when it is a bare lowercase host", () => {
    process.env.PUBLIC_ORIGIN = "https://kibo-1.asia-northeast3.run.app";
    process.env.SHORT_APP_URL = "kibo-2026.web.app";
    expect(pairUrl(req({ host: "localhost:3000" }))).toBe("kibo-2026.web.app");
  });

  it("ignores anything but a bare lowercase host, with one log line per value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = [
      "https://kibo-2026.web.app",
      "kibo-2026.web.app/app",
      "Kibo-2026.web.app",
      "kibo-2026.web.app:443",
      "localhost",
      " kibo-2026.web.app",
      "-kibo.web.app",
      "kibo..web.app",
      "kibo_2026.web.app",
      `${"a".repeat(64)}.web.app`,
    ];
    for (const value of bad) {
      process.env.SHORT_APP_URL = value;
      expect(pairUrl(req({ host: "localhost:3000" }))).toBe("localhost:3000/app");
      expect(pairUrl(req({ host: "localhost:3000" }))).toBe("localhost:3000/app");
    }
    expect(warn).toHaveBeenCalledTimes(bad.length);
  });
});
