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
  | "UPSTREAM";

export type TemplateId =
  | "pick_item"
  | "pick_variant"
  | "pick_option"
  | "pick_dine"
  | "yes_no"
  | "alternatives"
  | "upsell";

export interface ChoiceRef {
  kind: "item" | "variant" | "option" | "dine" | "yesno";
  id: string;
}

export interface ErrorDetail {
  templateId?: TemplateId;
  itemId?: string;
  groupId?: string;
  choices?: ChoiceRef[];
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
};
