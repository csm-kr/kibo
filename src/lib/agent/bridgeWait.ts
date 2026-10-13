// Learned kiosks (I-155): a cart change waits in pendingBridgeCommand until the bridge has replayed it on the kiosk
// page, and the server refuses the next change meanwhile. So when one model response holds several calls
// ("eat here, and one spaghetti"), the text agent and the voice runner wait for the replay before the next call.
// Client-safe: the voice runner on the phone uses it too.

/** Under the phone's 15 s "Please check the kiosk screen" and the server's 20 s replay timeout. */
export const BRIDGE_WAIT_MS = 12_000;
const POLL_MS = 200;

/** The server's own refusal while a replay is pending, so the model reads the same words either way. */
export const KIOSK_BUSY = {
  ok: false as const,
  error: { code: "CONFLICT" as const, message: "The kiosk is still working on your last request." },
};

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Checks `done` every 200 ms; false when the replay is still not done after 12 s. */
export async function waitForBridge(
  done: () => boolean | Promise<boolean>,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = sleepFor,
): Promise<boolean> {
  const deadline = now() + BRIDGE_WAIT_MS;
  while (!(await done())) {
    if (now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}
