// Pure parts of the forged-command check (scripts/attack-check.ts): matching a response to what the docs promise,
// the summary, and the guard that keeps tokens, claim tokens and session ids out of the evidence file.

export interface Expect {
  status: number;
  code?: string;
  message?: string;
  duplicate?: boolean;
}

export interface Got {
  status: number;
  code?: string;
  message?: string;
  duplicate?: boolean;
  /** The session status in an accepted response. */
  sessionStatus?: string;
  /** The public session read before and after was identical; null when there is no session to read. */
  sessionUnchanged?: boolean | null;
}

/** An attack must be refused (and change nothing); a control is a legit command that must go through. */
export type Kind = "attack" | "control";

export interface AttemptRecord {
  name: string;
  kind: Kind;
  tries: string;
  expected: Expect | Expect[];
  got: Got;
  pass: boolean;
  note?: string;
}

export function matches(expected: Expect | Expect[], got: Got, kind: Kind): boolean {
  if (kind === "attack" && got.sessionUnchanged === false) return false;
  return (Array.isArray(expected) ? expected : [expected]).some(
    (e) =>
      e.status === got.status &&
      (e.code === undefined || e.code === got.code) &&
      (e.message === undefined || e.message === got.message) &&
      (e.duplicate === undefined || e.duplicate === (got.duplicate === true)),
  );
}

export function summarize(records: AttemptRecord[]) {
  const attacks = records.filter((r) => r.kind === "attack");
  const controls = records.filter((r) => r.kind === "control");
  return {
    attempts: records.length,
    attacks: attacks.length,
    refusedAsExpected: attacks.filter((r) => r.pass).length,
    controls: controls.length,
    controlsAsExpected: controls.filter((r) => r.pass).length,
    unexpected: records.filter((r) => !r.pass).length,
    unexpectedNames: records.filter((r) => !r.pass).map((r) => r.name),
  };
}

/**
 * A base64url run as long as a session id (16 random bytes = 22 chars) that mixes upper case, lower case and digits.
 * Names, codes and messages in the file are snake_case or plain words, so they never match.
 */
const TOKEN_LIKE = /[A-Za-z0-9_-]{22,}/g;
const looksRandom = (s: string) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);

/** Describes each leak by kind and position only, so the report never repeats the secret. */
export function findLeaks(text: string, secrets: string[]): string[] {
  const leaks: string[] = [];
  secrets.forEach((s, i) => {
    const at = s ? text.indexOf(s) : -1;
    if (at >= 0) leaks.push(`known secret #${i + 1} at offset ${at}`);
  });
  for (const m of text.matchAll(TOKEN_LIKE)) {
    if (looksRandom(m[0]) && !secrets.some((s) => s && m[0].includes(s))) leaks.push(`token-like string at offset ${m.index}`);
  }
  for (const marker of ["#t=", "Bearer "]) {
    const at = text.indexOf(marker);
    if (at >= 0) leaks.push(`"${marker.trim()}" at offset ${at}`);
  }
  return leaks;
}

export function buildEvidence<A extends object>(about: A, records: AttemptRecord[], secrets: string[]) {
  const evidence = { ...about, summary: summarize(records), attempts: records };
  const leaks = findLeaks(JSON.stringify(evidence), secrets);
  if (leaks.length > 0) throw new Error(`Evidence would hold a secret: ${leaks.join("; ")}`);
  return evidence;
}
