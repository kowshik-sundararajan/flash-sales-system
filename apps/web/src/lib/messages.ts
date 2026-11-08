import { PURCHASE_CODE, type PurchaseCode } from "../types/purchase";

export type Tone = "success" | "info" | "warning" | "danger" | "neutral";

export interface Message {
  tone: Tone;
  text: string;
}

export const FAILED_MESSAGE: Message = {
  tone: "danger",
  text: "Something went wrong. Please try again.",
};

export const PURCHASE_MESSAGES: Record<PurchaseCode, Message> = {
  [PURCHASE_CODE.PURCHASED]: { tone: "success", text: "You got it!" },
  [PURCHASE_CODE.ALREADY_PURCHASED]: {
    tone: "info",
    text: "You have already bought this item.",
  },
  [PURCHASE_CODE.SOLD_OUT]: { tone: "warning", text: "Sold out." },
  [PURCHASE_CODE.NOT_STARTED]: {
    tone: "info",
    text: "The sale has not started yet.",
  },
  [PURCHASE_CODE.ENDED]: { tone: "neutral", text: "The sale has ended." },
  [PURCHASE_CODE.NOT_CONFIGURED]: {
    tone: "danger",
    text: "This sale is not available right now.",
  },
};

export const CHECK_PURCHASED_MESSAGE: Message = {
  tone: "success",
  text: "You secured this item.",
};

export const CHECK_NOT_FOUND_MESSAGE: Message = {
  tone: "neutral",
  text: "No purchase found for this username.",
};
