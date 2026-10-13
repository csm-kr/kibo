import { chatRequest, runChat } from "@/lib/agent/chat";
import { geminiClient } from "@/lib/agent/model";
import { bearer, clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { CommandError } from "@/lib/commands/errors";
import { checkIpLimit, takeDailyBudget } from "@/lib/limits/ip";
import { getUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";

// Text agent (Gemini Flash). Every tool call goes through runCommand like the phone's own commands.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    checkIpLimit(ip, "api");
    const body = parseBody(chatRequest, await readJson(req));
    // One address may use only a small share of the day's chat budget (I-148).
    if (!takeDailyBudget(ip, "chat")) throw new CommandError("RATE_LIMITED", "You've reached today's message limit. Please use the buttons.");
    const deps = { store: getStore(), model: geminiClient(), usage: getUsageStore(), now: Date.now };
    return ok(await runChat(deps, { ...body, bearer: bearer(req) }));
  } catch (e) {
    return fail(e);
  }
}
