"use client";

import { useReducer } from "react";
import type { AgentAction } from "@/lib/agent/actions";
import { ApiError, chat } from "@/lib/client/api";
import { errorCopy } from "@/lib/i18n/errors";
import type { SpeechLanguage } from "@/lib/i18n/languages";
import { pt } from "@/lib/i18n/phone";
import { chatReducer, historyFor, initialChat } from "@/lib/phone/chat";
import type { Locale } from "@/types/menu";

/** Plain words for a failed request (heuristic 9); a rate limit points to the buttons, which still work. */
export function errorText(e: unknown, locale: Locale): string {
  const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "");
  const text = errorCopy(err.code, locale, err.detail);
  return err.code === "RATE_LIMITED" ? `${text} ${pt("useButtons", locale)}` : text;
}

/** The text conversation with /api/chat. Kept in React state only; nothing of it is stored. */
export function useChat(opts: {
  sessionId: string | null;
  token: string | null;
  locale: Locale;
  /** What the AI speaks, when the user chose a language the screens do not have (14-final:4). */
  language?: SpeechLanguage;
  /** Takes the next utteranceSeq from the counter shared with voice (I-079); without it the chat counts on its own. */
  nextSeq?: () => number;
  /** /demo: what the AI did for each answered message. */
  onActions?: (actions: AgentAction[]) => void;
  /** /demo: a message went to the agent, for the comparison card's count. */
  onSend?: () => void;
}) {
  const [state, dispatch] = useReducer(chatReducer, initialChat);

  /** True when the agent answered; false when nothing was sent or the request failed (the notice says why). */
  /** `shown`: the bubble's words when the phone, not the user, sends it (a held order sent again). */
  async function send(text: string, cartVersion?: number, shown?: string): Promise<boolean> {
    const message = text.trim().slice(0, 500);
    if (!message || !opts.sessionId || !opts.token || state.busy) return false;
    const history = historyFor(state.messages);
    const utteranceSeq = opts.nextSeq ? opts.nextSeq() : state.utteranceSeq + 1;
    dispatch({ type: "send", text: message, shown });
    // /demo counts what the user sent; a held order sent again after a tap is not a new message from them.
    if (shown === undefined) opts.onSend?.();
    try {
      const r = await chat({
        sessionId: opts.sessionId,
        token: opts.token,
        message,
        history,
        utteranceSeq,
        cartVersion,
        locale: opts.locale,
        language: opts.language,
      });
      dispatch({ type: "reply", text: r.reply, heldForDine: r.heldForDine });
      if (r.actions?.length) opts.onActions?.(r.actions);
      return true;
    } catch (e) {
      dispatch({ type: "notice", text: errorText(e, opts.locale) });
      return false;
    }
  }

  return {
    messages: state.messages,
    busy: state.busy,
    /** Messages sent so far; never goes back, like the server's per-session count. */
    sent: state.utteranceSeq,
    send,
    /** An order the agent held for the dine question (15-judge-fixes:1); null when there is none. */
    held: state.held,
    /** Sends the held order again, shown as `shown` ("Continuing your order…"). */
    resend: (shown: string) => (state.held ? send(state.held, undefined, shown) : Promise.resolve(false)),
    notice: (text: string) => dispatch({ type: "notice", text }),
    /** What voice heard or said, into the same conversation. */
    voice: (role: "user" | "model", text: string) => dispatch({ type: "voice", role, text }),
    reset: () => dispatch({ type: "reset" }),
  };
}
