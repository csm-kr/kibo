import type { Actor, Source } from "@/types/session";
import type { CommandType } from "./schemas";

/**
 * The kiosk (and the learned-kiosk bridge) only taps. The phone's `button` counts as a tap on the confirm card,
 * so the phone code must send it only from real taps (SECURITY "Command handling").
 */
export const ACTOR_SOURCES: Record<Actor, readonly Source[]> = {
  phone: ["voice", "text", "button"],
  kiosk: ["touch"],
};

/** ARCHITECTURE "Commands and actors". Payment-side commands (cardAction, editOrder) are kiosk only. */
export const ACTOR_COMMANDS: Record<Actor, ReadonlySet<CommandType>> = {
  phone: new Set<CommandType>([
    "setDineOption",
    "addToCart",
    "updateCart",
    "removeFromCart",
    "undoLastChange",
    "offerChoices",
    "callStaff",
    "requestCheckout",
    "cancelCheckout",
    "confirmCheckout",
  ]),
  kiosk: new Set<CommandType>([
    "startTouch",
    "setDineOption",
    "addToCart",
    "updateCart",
    "removeFromCart",
    "clearCart",
    "undoLastChange",
    "callStaff",
    "requestCheckout",
    "cancelCheckout",
    "confirmCheckout",
    "editOrder",
    "cardAction",
    "reissueClaim",
    "bridgeReport",
  ]),
};
