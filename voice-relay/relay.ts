import { z } from "zod";
import { issueLiveToken, liveConnectConfig, liveTokenRequest, type LiveTokenIssuer } from "@/lib/agent/live";
import { CommandError, HTTP_STATUS } from "@/lib/commands/errors";
import { checkIpLimit } from "@/lib/limits/ip";
import type { UsageStore } from "@/lib/limits/usage";
import type { SessionStore } from "@/lib/store/types";

// One browser's voice connection through the relay (12-phone-app:8). Vertex AI Live has no ephemeral tokens, so
// the browser talks to this relay and the relay talks to Vertex. Checks, budgets and the pinned config are the
// token path's own code (issueLiveToken with an issuer that opens Vertex instead of minting a token), so the two
// paths cannot drift. Audio, transcripts and tokens are never logged.

export type OpenLiveInput = {
  model: string;
  config: ReturnType<typeof liveConnectConfig>;
  onMessage(m: object): void;
  onClose(): void;
};

/** An open Live session, as the relay uses it (the SDK's Session fits). */
export interface LiveUpstream {
  sendRealtimeInput(p: object): void;
  sendClientContent(p: object): void;
  sendToolResponse(p: object): void;
  close(): void;
}

/** Resolves once Live setup is complete; Live messages before that go to onMessage first, as in the SDK. */
export type OpenLive = (input: OpenLiveInput) => Promise<LiveUpstream>;

/** The browser's socket. */
export interface ClientSocket {
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface RelayDeps {
  store: SessionStore;
  usage: UsageStore;
  now: () => number;
  /** The last X-Forwarded-For hop, as on the API routes. */
  ip: string;
  openLive: OpenLive;
}

/** The first message: who is asking. The device token travels here because browsers cannot set WebSocket headers. */
export const relayHello = z.strictObject({ ...liveTokenRequest.shape, deviceToken: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });

const HELLO_MS = 10_000;
/** The SDK's connect never settles if the socket closes before setup; the phone uses the same limit. */
const SETUP_MS = 10_000;
const UNAVAILABLE = "Voice is not available right now. Please type instead.";
/** Only these go to Vertex; a client `setup` would change the pinned instructions or tools. */
const FORWARD = ["realtimeInput", "clientContent", "toolResponse"] as const;

/** A close reason may hold at most 123 bytes. */
function reason(text: string): string {
  return Buffer.byteLength(text) <= 123 ? text : Buffer.from(text).subarray(0, 120).toString("utf8") + "…";
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function relayConnection(client: ClientSocket, deps: RelayDeps): { onMessage(text: string): void; onClose(): void } {
  let state: "hello" | "opening" | "open" | "closed" = "hello";
  let upstream: LiveUpstream | null = null;
  // Live messages that arrive before the relay's own first message.
  const queued: object[] = [];
  let failSetup: ((e: Error) => void) | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  const helloTimer = setTimeout(() => closeBoth(4408, "Voice could not start. Please try again."), HELLO_MS);

  function closeBoth(code: number, why: string) {
    if (state === "closed") return;
    state = "closed";
    clearTimeout(helloTimer);
    if (endTimer) clearTimeout(endTimer);
    try {
      upstream?.close();
    } catch {
      // Already closed.
    }
    upstream = null;
    client.close(code, reason(why));
  }

  function fromUpstream(m: object) {
    if (state === "opening") queued.push(m);
    else if (state === "open") client.send(JSON.stringify(m));
  }

  function upstreamClosed() {
    if (state === "opening") failSetup?.(new Error("closed during setup"));
    else closeBoth(1011, "Voice connection ended.");
  }

  // Opens Vertex Live in place of minting a token, so issueLiveToken gives every count back when it fails.
  const issuer: LiveTokenIssuer = {
    async create({ model, system, tools, languageCode }) {
      const live = deps.openLive({ model, config: liveConnectConfig(system, tools, languageCode), onMessage: fromUpstream, onClose: upstreamClosed });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const failed = new Promise<never>((_, reject) => {
        failSetup = reject;
        timer = setTimeout(() => reject(new Error("setup timeout")), SETUP_MS);
      });
      try {
        upstream = await Promise.race([live, failed]);
      } catch (e) {
        // A session that opens after the timeout or an early close is closed at once.
        live.then((u) => u.close(), () => {});
        console.error("voice relay: vertex live failed:", e instanceof Error ? e.name : typeof e);
        throw new CommandError("UPSTREAM", UNAVAILABLE);
      } finally {
        clearTimeout(timer);
        failSetup = null;
      }
      return { name: "relay" };
    },
  };

  async function start(text: string) {
    state = "opening";
    clearTimeout(helloTimer);
    try {
      const hello = relayHello.safeParse(parse(text));
      if (!hello.success) throw new CommandError("BAD_REQUEST", "That request could not be understood.");
      checkIpLimit(deps.ip, "api", deps.now());
      const { sessionId, deviceToken, locale, language } = hello.data;
      const out = await issueLiveToken(
        { store: deps.store, usage: deps.usage, issuer, now: deps.now },
        { sessionId, bearer: deviceToken, locale, language, ip: deps.ip },
      );
      if (state !== "opening") {
        // The browser left while Vertex was opening.
        upstream?.close();
        upstream = null;
        return;
      }
      state = "open";
      client.send(JSON.stringify({ relay: { model: out.model, expiresAt: out.expiresAt, voiceSeconds: out.voiceSeconds } }));
      for (const m of queued.splice(0)) client.send(JSON.stringify(m));
      // The same voice time as a token from the token route.
      endTimer = setTimeout(() => closeBoth(4000, "Voice time is up."), out.expiresAt - deps.now());
    } catch (e) {
      if (e instanceof CommandError) return closeBoth(4000 + HTTP_STATUS[e.code], e.message);
      console.error("voice relay error:", e instanceof Error ? e.name : typeof e);
      closeBoth(4500, "Voice could not start. Please try again.");
    }
  }

  return {
    onMessage(text) {
      if (state === "hello") return void start(text);
      if (state !== "open" || !upstream) return;
      const msg = parse(text);
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
      const keys = Object.keys(msg);
      const key = FORWARD.find((k) => k === keys[0]);
      if (keys.length !== 1 || !key) return;
      const body = (msg as Record<string, unknown>)[key];
      if (!body || typeof body !== "object") return;
      try {
        if (key === "realtimeInput") upstream.sendRealtimeInput(body);
        else if (key === "clientContent") upstream.sendClientContent(body);
        else upstream.sendToolResponse(body);
      } catch {
        // A malformed message is dropped; the SDK checks tool responses before sending.
      }
    },
    onClose() {
      if (state === "closed") return;
      const wasOpening = state === "opening";
      state = "closed";
      clearTimeout(helloTimer);
      if (endTimer) clearTimeout(endTimer);
      // While opening, start() closes the session once it is ready.
      if (!wasOpening) {
        try {
          upstream?.close();
        } catch {
          // Already closed.
        }
        upstream = null;
      }
    },
  };
}
