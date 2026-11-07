import { useState } from "react";
import { usePurchase } from "../hooks/usePurchase";
import { USERNAME_HINT, isValidUsername } from "../lib/username";
import { PURCHASE_CODE, type PurchaseCode } from "../types/purchase";
import type { SaleStatus } from "../types/sale";

const FAILED_MESSAGE = "Something went wrong. Please try again.";

const MESSAGES: Record<PurchaseCode, string> = {
  [PURCHASE_CODE.PURCHASED]: "You got it!",
  [PURCHASE_CODE.ALREADY_PURCHASED]: "You have already bought this item.",
  [PURCHASE_CODE.SOLD_OUT]: "Sold out.",
  [PURCHASE_CODE.NOT_STARTED]: "The sale has not started yet.",
  [PURCHASE_CODE.ENDED]: "The sale has ended.",
  [PURCHASE_CODE.NOT_CONFIGURED]: "This sale is not available right now.",
};

interface PurchasePanelProps {
  saleId: string;
  status: SaleStatus;
}

export function PurchasePanel({ saleId, status }: PurchasePanelProps) {
  const [input, setInput] = useState("");
  const username = input.trim();
  const valid = isValidUsername(username);
  const { buy, pending, code, failed } = usePurchase(saleId, username);

  return (
    <div>
      <label>
        Username{" "}
        <input
          value={input}
          maxLength={32}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      {username && !valid && <p>{USERNAME_HINT}</p>}
      <button
        type="button"
        disabled={status !== "active" || !valid || pending}
        onClick={() => void buy()}
      >
        {pending ? "Buying…" : "Buy now"}
      </button>
      <p role="status">{failed ? FAILED_MESSAGE : code && MESSAGES[code]}</p>
    </div>
  );
}
