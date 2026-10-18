export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "NEEDS_CHOICE"
  | "SOLD_OUT"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "INTERNAL";

export type TemplateId =
  | "pick_item"
  | "pick_variant"
  | "pick_option"
  | "pick_dine"
  | "yes_no"
  | "alternatives"
  | "upsell"
  // [Call staff] alone, after an allergy or health question the data cannot settle (16-judge-r3-fixes:1).
  | "ask_staff";

export interface ChoiceRef {
  /** `staff` (id "staff"): a [Call staff] button after choices that may all be wrong (15-judge-fixes:1). */
  kind: "item" | "variant" | "option" | "dine" | "yesno" | "staff";
  id: string;
}

export interface ErrorDetail {
  templateId?: TemplateId;
  itemId?: string;
  groupId?: string;
  choices?: ChoiceRef[];
  /** BAD_REQUEST from a schema: the path of the field that failed ("args.choices") and why ("at most 6 items"). */
  field?: string;
  reason?: string;
  /** RATE_LIMITED by this order's own allowance (its voice tokens), not by shared load (I-410). */
  limit?: "session";
}

/** `message` is shown to users: plain words, never ids or stack traces. */
export class CommandError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public detail?: ErrorDetail,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  NEEDS_CHOICE: 422,
  SOLD_OUT: 422,
  UNAVAILABLE: 422,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
};
