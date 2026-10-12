import type { Actor } from "@/types/session";
import type { CommandType } from "./schemas";

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
  ]),
};
