import { CommandError, HTTP_STATUS } from "@/lib/commands/errors";
import { isCommandType, SESSION_ID } from "@/lib/commands/schemas";
import { bearer, claimUrl, clientIp, fail, ok, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { runCommand } from "@/lib/session/service";
import { getStore } from "@/lib/store";

const SOURCES = new Set(["voice", "text", "button", "touch"]);

/**
 * One line per refused command (10-17: two 400s from a real iPhone left no trace). Only values the schema knows: the
 * command type, source, code, HTTP status and failing field, and 6 characters of the session id to tell orders
 * apart; never args, tokens or the whole id (SECURITY "Secrets and repo hygiene").
 */
function logRefused(body: unknown, err: CommandError) {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const type = isCommandType(b.type) ? b.type : "unknown";
  const source = typeof b.source === "string" && SOURCES.has(b.source) ? b.source : "-";
  const session = typeof b.sessionId === "string" && SESSION_ID.test(b.sessionId) ? b.sessionId.slice(0, 6) : "-";
  console.warn("command refused:", type, source, err.code, HTTP_STATUS[err.code], err.detail?.field ?? "-", `s=${session}`);
}

// Every state change (AI tools, phone buttons, kiosk touch, card action). runCommand parses the body
// with zod and takes prices and totals only from menu data.
export async function POST(req: Request) {
  let body: unknown;
  try {
    checkIpLimit(clientIp(req), "api");
    body = await readJson(req);
    const res = await runCommand(getStore(), { body, bearer: bearer(req) }, Date.now());
    const claimToken = res.result?.claimToken;
    if (claimToken) {
      // reissueClaim: runCommand accepted the body, so sessionId is a valid string.
      const { sessionId } = body as { sessionId: string };
      return ok({ ...res, claimUrl: claimUrl(req, sessionId, claimToken), pairCode: res.result?.pairCode });
    }
    return ok(res);
  } catch (e) {
    if (e instanceof CommandError) logRefused(body, e);
    return fail(e);
  }
}
