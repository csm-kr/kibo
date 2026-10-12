// The phone's conversation (docs/ARCHITECTURE.md "State management"): React state only, never stored or sent
// anywhere but /api/chat as history.

export interface ChatMessage {
  id: number;
  /** `notice` is the screen's own plain-words message (an error), never sent to the model. */
  role: "user" | "model" | "notice";
  text: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Finished user turns; one sent message is one utterance (docs/ARCHITECTURE.md "Commands and actors"). */
  utteranceSeq: number;
  busy: boolean;
  nextId: number;
}

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "reply"; text: string }
  | { type: "notice"; text: string }
  | { type: "reset" };

export const initialChat: ChatState = { messages: [], utteranceSeq: 0, busy: false, nextId: 1 };

/** /api/chat takes the last 10 turns. */
const HISTORY_TURNS = 10;
/** /api/chat refuses a longer history turn; a model reply can exceed it. */
const MAX_TURN_CHARS = 1000;

function add(state: ChatState, role: ChatMessage["role"], text: string): Pick<ChatState, "messages" | "nextId"> {
  return { messages: [...state.messages, { id: state.nextId, role, text }], nextId: state.nextId + 1 };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return { ...state, ...add(state, "user", action.text), utteranceSeq: state.utteranceSeq + 1, busy: true };
    case "reply":
      return { ...state, ...add(state, "model", action.text), busy: false };
    case "notice":
      return { ...state, ...add(state, "notice", action.text), busy: false };
    case "reset":
      // utteranceSeq never goes back: the server compares it with the seq recorded at requestCheckout.
      return { ...initialChat, utteranceSeq: state.utteranceSeq, nextId: state.nextId };
  }
}

/** The history /api/chat accepts: user and model text only, the last 10 turns. */
export function historyFor(messages: ChatMessage[]): { role: "user" | "model"; text: string }[] {
  return messages
    .filter((m): m is ChatMessage & { role: "user" | "model" } => m.role !== "notice")
    .slice(-HISTORY_TURNS)
    .map(({ role, text }) => ({ role, text: text.slice(0, MAX_TURN_CHARS) }));
}
