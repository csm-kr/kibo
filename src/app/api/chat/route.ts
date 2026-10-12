import { chatRequest, runChat } from "@/lib/agent/chat";
import { geminiClient } from "@/lib/agent/model";
import { bearer, clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { getUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";

// Text agent (Gemini Flash). Every tool call goes through runCommand like the phone's own commands.
export async function POST(req: Request) {
  try {
    checkIpLimit(clientIp(req), "api");
    const body = parseBody(chatRequest, await readJson(req));
    const deps = { store: getStore(), model: geminiClient(), usage: getUsageStore(), now: Date.now };
    return ok(await runChat(deps, { ...body, bearer: bearer(req) }));
  } catch (e) {
    return fail(e);
  }
}
