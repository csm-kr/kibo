"use client";

import { useReducer, useState } from "react";
import { ApiError, chat } from "@/lib/client/api";
import { errorCopy } from "@/lib/i18n/errors";
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
  /** Takes the next utteranceSeq from the counter shared with voice (I-079); without it the chat counts on its own. */
  nextSeq?: () => number;
}) {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  // When the current request started, for the "Working…" line after 1 s.
  const [sentAt, setSentAt] = useState(0);

  async function send(text: string, cartVersion?: number) {
    const message = text.trim().slice(0, 500);
    if (!message || !opts.sessionId || !opts.token || state.busy) return;
    const history = historyFor(state.messages);
    const utteranceSeq = opts.nextSeq ? opts.nextSeq() : state.utteranceSeq + 1;
    dispatch({ type: "send", text: message });
    setSentAt(Date.now());
    try {
      const r = await chat({
        sessionId: opts.sessionId,
        token: opts.token,
        message,
        history,
        utteranceSeq,
        cartVersion,
        locale: opts.locale,
      });
      dispatch({ type: "reply", text: r.reply });
    } catch (e) {
      dispatch({ type: "notice", text: errorText(e, opts.locale) });
    }
  }

  return {
    messages: state.messages,
    busy: state.busy,
    /** Messages sent so far; never goes back, like the server's per-session count. */
    sent: state.utteranceSeq,
    sentAt,
    send,
    notice: (text: string) => dispatch({ type: "notice", text }),
    /** What voice heard or said, into the same conversation. */
    voice: (role: "user" | "model", text: string) => dispatch({ type: "voice", role, text }),
    reset: () => dispatch({ type: "reset" }),
  };
}
