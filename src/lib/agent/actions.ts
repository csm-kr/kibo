import type { ErrorCode } from "@/lib/commands/errors";
import type { CartLine } from "@/types/session";
import { toolCallToCommand } from "./mapping";

// What the AI did in one request, for /demo's "What the AI did" strip (src/components/demo/ActionStrip.tsx).
// Ids, numbers and result codes only: no utterance, model text, message, session id or token ever goes in here.

export interface AgentAction {
  /** A declared tool name, or "unknown" for a name the model made up. */
  tool: string;
  /** The mapped command's arguments, reduced to ids and numbers; line tools add the line's `itemId`. */
  args: Record<string, unknown>;
  code: "ok" | ErrorCode | "NETWORK";
  /** A learned kiosk accepted it; the bridge is entering it on the kiosk. */
  pending?: boolean;
  /** Not the AI's: the user tapped the confirm card's [Yes, pay now] (/demo shows it in the same list). */
  tap?: boolean;
  /** Around the command, in ms. */
  ms: number;
}

// The message is read by the model only; it never goes into an action.
type ActionOutcome = { ok: true; response: { pending?: true } } | { ok: false; error: { code: string; message?: string } };

/** Catalog ids (snake_case, `largeSet`) and lineIds (hex); anything else could be model text. */
const ID = /^[A-Za-z0-9_]{1,64}$/;

function idsOnly(value: unknown, depth = 0): unknown {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return ID.test(value) ? value : undefined;
  if (depth > 3) return undefined;
  if (Array.isArray(value)) {
    const out = value.map((v) => idsOnly(v, depth + 1)).filter((v) => v !== undefined);
    return out.length > 0 || depth === 0 ? out : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const kept = ID.test(k) ? idsOnly(v, depth + 1) : undefined;
      if (kept !== undefined) out[k] = kept;
    }
    // Nested leftovers of dropped text are left out; the top level stays an object.
    return Object.keys(out).length > 0 || depth === 0 ? out : undefined;
  }
  return undefined;
}

export function agentAction(name: string, rawArgs: unknown, outcome: ActionOutcome, ms: number, cartBefore: CartLine[]): AgentAction {
  let tool = "unknown";
  let args: Record<string, unknown> = {};
  try {
    const cmd = toolCallToCommand(name, rawArgs);
    tool = cmd.type;
    args = idsOnly(cmd.args) as Record<string, unknown>;
  } catch {
    // A made-up tool name or bad arguments: the name is model text, so it is not shown.
  }
  const lineId = args.lineId;
  const line = typeof lineId === "string" ? cartBefore.find((l) => l.lineId === lineId) : undefined;
  if (line) args = { ...args, itemId: line.itemId };
  return {
    tool,
    args,
    code: outcome.ok ? "ok" : (outcome.error.code as AgentAction["code"]),
    ...(outcome.ok && outcome.response.pending && { pending: true }),
    ms: Math.round(ms),
  };
}
