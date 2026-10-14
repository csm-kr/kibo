// The phone's conversation (docs/ARCHITECTURE.md "State management"): React state only, never stored or sent
// anywhere but /api/chat as history.

export interface ChatMessage {
  id: number;
  /** `notice` is the screen's own plain-words message (an error), never sent to the model. */
  role: "user" | "model" | "notice";
  text: string;
  /** What the bubble shows instead of `text` (a message sent again: "Continuing your order…"); history keeps `text`. */
  shown?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Finished user turns; one sent message is one utterance (docs/ARCHITECTURE.md "Commands and actors"). */
  utteranceSeq: number;
  busy: boolean;
  nextId: number;
  /** An order the agent could not place before the dine option; sent again after the dine tap (15-judge-fixes:1). */
  held: string | null;
}

export type ChatAction =
  | { type: "send"; text: string; shown?: string }
  | { type: "reply"; text: string; heldForDine?: boolean }
  | { type: "notice"; text: string }
  /** What voice heard or said: shown and kept as history, but not a typed message (no busy, no count). */
  | { type: "voice"; role: "user" | "model"; text: string }
  | { type: "reset" };

export const initialChat: ChatState = { messages: [], utteranceSeq: 0, busy: false, nextId: 1, held: null };

/** /api/chat takes the last 10 turns. */
const HISTORY_TURNS = 10;
/** /api/chat refuses a longer history turn; a model reply can exceed it. */
const MAX_TURN_CHARS = 1000;

function add(state: ChatState, role: ChatMessage["role"], text: string, shown?: string): Pick<ChatState, "messages" | "nextId"> {
  const m: ChatMessage = shown === undefined ? { id: state.nextId, role, text } : { id: state.nextId, role, text, shown };
  return { messages: [...state.messages, m], nextId: state.nextId + 1 };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      // Whatever the user sends next replaces a held order, including the held order itself sent again.
      return { ...state, ...add(state, "user", action.text, action.shown), utteranceSeq: state.utteranceSeq + 1, busy: true, held: null };
    case "reply": {
      const asked = action.heldForDine ? (state.messages.findLast((m) => m.role === "user")?.text ?? null) : null;
      return { ...state, ...add(state, "model", action.text), busy: false, held: asked };
    }
    case "notice":
      return { ...state, ...add(state, "notice", action.text), busy: false };
    case "voice":
      return { ...state, ...add(state, action.role, action.text) };
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
