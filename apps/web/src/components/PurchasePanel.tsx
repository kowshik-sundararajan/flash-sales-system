import { usePurchase } from "../hooks/usePurchase";
import { useUserId } from "../hooks/useUserId";
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
  const { userId } = useUserId();
  const { buy, pending, code, failed } = usePurchase(saleId, userId);

  return (
    <div>
      <button
        type="button"
        disabled={status !== "active" || pending}
        onClick={() => void buy()}
      >
        {pending ? "Buying…" : "Buy now"}
      </button>
      <p role="status">{failed ? FAILED_MESSAGE : code && MESSAGES[code]}</p>
    </div>
  );
}
