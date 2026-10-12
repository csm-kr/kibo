// Helpers for route tests only. Handlers are called directly with `new Request(...)` (STORE=memory).

export const BASE = "http://kibo.test";
export const HERO_LINE = { itemId: "cheese_burger", variant: "set", selections: { drink: ["zero_cola"] } };

export function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function read(res: Response): Promise<{ status: number; body: any }> {
  return { status: res.status, body: await res.json() };
}

let seq = 0;
export function commandBody(sessionId: string, type: string, args: object = {}, extra: Record<string, unknown> = {}) {
  return { sessionId, commandId: `t${++seq}`, type, args, source: "touch", ...extra };
}
