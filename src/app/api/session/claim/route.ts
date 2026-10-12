import { z } from "zod";
import { sessionId } from "@/lib/commands/schemas";
import { clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { claimSession } from "@/lib/session/service";
import { getStore } from "@/lib/store";

const bodySchema = z.strictObject({ sessionId, claimToken: z.string().min(1).max(128) });

export async function POST(req: Request) {
  try {
    checkIpLimit(clientIp(req), "api");
    const input = parseBody(bodySchema, await readJson(req));
    const { deviceToken, session } = await claimSession(getStore(), input, Date.now());
    return ok({ deviceToken, status: session.status });
  } catch (e) {
    return fail(e);
  }
}
