import { CommandError } from "@/lib/commands/errors";
import { SESSION_ID } from "@/lib/commands/schemas";
import { clientIp, fail } from "@/lib/http";
import { checkIpLimit, openStream } from "@/lib/limits/ip";
import { toPublicSession } from "@/lib/session/public";
import { getStore } from "@/lib/store";

const KEEPALIVE_MS = 25_000;
// An open stream keeps a Cloud Run instance billed as active, so each one ends after 15 min. Must stay below
// the Cloud Run request timeout (900 s, scripts/deploy.sh) so the server, not Cloud Run, ends it cleanly.
const MAX_STREAM_MS = 15 * 60_000;

// ADR-010: screens read the session only through this stream; the server holds the store listener.
// EventSource reconnects on its own when the stream ends, so a screen in use just reads the next snapshot.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Outside the try: during the build Next.js stops prerendering by throwing on request access.
  const ip = clientIp(req);
  try {
    checkIpLimit(ip, "api");
  } catch (e) {
    return fail(e);
  }
  const { id } = await ctx.params;
  if (!SESSION_ID.test(id)) return fail(new CommandError("BAD_REQUEST", "That request could not be understood."));
  // Each open stream holds a Cloud Run request until it closes, so one address may hold only a few (I-149).
  let release: () => void;
  try {
    release = openStream(ip);
  } catch (e) {
    return fail(e);
  }

  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      // Every way the stream ends goes through close(), which frees the address's place once: the request's abort,
      // cancel() from the reader, the 15 min cap, `gone`, a listener error, and a write that fails here.
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client is gone and the stream can no longer be written.
          close();
        }
      };
      const timer = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
      const cap = setTimeout(() => {
        send(": stream end\n\n");
        close();
      }, MAX_STREAM_MS);
      close = () => {
        if (closed) return;
        closed = true;
        release();
        unsubscribe();
        clearInterval(timer);
        clearTimeout(cap);
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      };
      req.signal.addEventListener("abort", close);
      unsubscribe = getStore().subscribe(
        id,
        (s) => {
          if (s) return send(`data: ${JSON.stringify(toPublicSession(s))}\n\n`);
          // Unknown or deleted session. EventSource drops events without data, hence the empty object.
          send("event: gone\ndata: {}\n\n");
          close();
        },
        (e) => {
          // The store listener stopped. Ending the stream makes EventSource reconnect and subscribe again.
          console.error("sse listener error:", e instanceof Error ? e.name : typeof e);
          close();
        },
      );
      // The listener may have closed the stream before subscribe returned.
      if (closed) unsubscribe();
      if (req.signal.aborted) close();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
