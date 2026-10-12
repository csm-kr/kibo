import pkg from "../../../../package.json";
import { clientIp, fail, ok } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { storeKind } from "@/lib/store";

// Liveness check for Cloud Run and uptime monitoring. Extended later to probe Gemini and Firestore.
// Runs on Node.js, the default; `runtime` config is not allowed with cacheComponents.
// Reading the request headers keeps this handler dynamic under cacheComponents. It happens outside
// the try, because during the build Next.js stops prerendering by throwing there and fail() must not catch it.
export async function GET(req: Request) {
  const ip = clientIp(req);
  try {
    checkIpLimit(ip, "api");
    return ok({
      service: "kibo",
      version: pkg.version,
      store: storeKind(),
      revision: process.env.K_REVISION ?? "local",
      time: new Date().toISOString(),
    });
  } catch (e) {
    return fail(e);
  }
}
