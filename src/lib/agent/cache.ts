import { createHash } from "node:crypto";
import { ApiError, type CachedContent, type CreateCachedContentParameters } from "@google/genai";
import type { TextBackend } from "./model";

// Explicit context caching for the text agent (11-hardening:2): the static part of the prompt (rules, menu, tools)
// is the same for every order on one kiosk and locale, so it is stored once on the backend and each request names it
// instead of resending about 9,600 tokens. Only static text goes in: the cart and status stay in the request, so a
// shared cache never holds an order. Cache names stay on the server. Server only, in memory per instance.

export interface CacheApi {
  create(params: CreateCachedContentParameters): Promise<CachedContent>;
}

export interface PromptCache {
  /** The cache name for this static prompt, or null to send it inline (the backend refused a cache recently). */
  get(backend: TextBackend, model: string, system: string, tools: object[]): Promise<string | null>;
  /** The backend refused this name (expired or deleted early); the next request makes a new cache. */
  drop(name: string): void;
}

const TTL_MS = 60 * 60_000;
/** A cache this close to expiry is replaced, so no request names one that expires on the way. */
const REFRESH_MS = 5 * 60_000;
/** After a refused create (too few tokens, model or region without caching), inline for this long. */
const RETRY_MS = 10 * 60_000;

type Entry = { name: string; expiresAt: number } | { failedAt: number };

export function createPromptCache(caches: (backend: TextBackend) => CacheApi, now: () => number = Date.now): PromptCache {
  const entries = new Map<string, Promise<Entry>>();
  const keys = new Map<string, string>();

  async function create(backend: TextBackend, model: string, system: string, tools: object[], key: string): Promise<Entry> {
    try {
      const res = await caches(backend).create({
        model,
        config: { systemInstruction: system, tools, ttl: `${TTL_MS / 1000}s`, displayName: "kibo-text-agent" },
      });
      if (!res.name) throw new Error("no cache name");
      keys.set(res.name, key);
      return { name: res.name, expiresAt: now() + TTL_MS };
    } catch (e) {
      // The status only: an SDK error message may echo the request.
      console.error(`gemini cache unavailable on ${backend} (${e instanceof ApiError ? e.status : e instanceof Error ? e.name : "error"})`);
      return { failedAt: now() };
    }
  }

  async function get(backend: TextBackend, model: string, system: string, tools: object[]): Promise<string | null> {
    const key = createHash("sha256").update(JSON.stringify([backend, model, system, tools])).digest("hex");
    const current = entries.get(key);
    const entry = current && (await current);
    if (entry && "name" in entry && entry.expiresAt - now() > REFRESH_MS) return entry.name;
    if (entry && "failedAt" in entry && now() - entry.failedAt < RETRY_MS) return null;
    // Another request replaced the entry while this one waited: use theirs.
    if (entries.get(key) !== current) return get(backend, model, system, tools);
    const next = create(backend, model, system, tools, key);
    entries.set(key, next);
    const made = await next;
    return "name" in made ? made.name : null;
  }

  return {
    get,
    drop(name) {
      const key = keys.get(name);
      keys.delete(name);
      if (key) entries.delete(key);
    },
  };
}
