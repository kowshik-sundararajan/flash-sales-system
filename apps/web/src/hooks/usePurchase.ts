import { useRef, useState } from "react";
import {
  getPurchase,
  postPurchase,
  PurchaseRequestError,
} from "../lib/purchase/purchase";
import { PURCHASE_CODE, type PurchaseCode } from "../types/purchase";

// unconfirmed: the buy failed and we could not find out whether it went through
type BuyOutcome = { userId: string } & (
  { failed: false; code: PurchaseCode } | { failed: true; unconfirmed: boolean }
);

export function usePurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<BuyOutcome>();
  const isRequestInFlight = useRef(false); // guards against double clicks

  // A network error or 5xx may still have gone through: a slow Redis can finish
  // a purchase after the API stopped waiting. Ask before saying it failed.
  // Refusals (429, 4xx) cannot have gone through, so there is nothing to ask.
  async function resolveFailedBuy(buyError: unknown): Promise<BuyOutcome> {
    const outcomeIsUnknown =
      !(buyError instanceof PurchaseRequestError) || buyError.outcomeIsUnknown;
    if (!outcomeIsUnknown) {
      return { userId, failed: true, unconfirmed: false };
    }

    try {
      const existingPurchase = await getPurchase(saleId, userId);
      if (existingPurchase) {
        return {
          userId,
          failed: false,
          code: PURCHASE_CODE.PURCHASED,
        };
      }
      return { userId, failed: true, unconfirmed: false };
    } catch {
      // the lookup failed too, so we cannot say
      return { userId, failed: true, unconfirmed: true };
    }
  }

  async function buy() {
    if (isRequestInFlight.current) return;
    isRequestInFlight.current = true;
    setPending(true);
    setOutcome(undefined);

    try {
      const purchaseResponse = await postPurchase(saleId, userId);
      setOutcome({ userId, failed: false, code: purchaseResponse.code });
    } catch (buyError) {
      setOutcome(await resolveFailedBuy(buyError));
    } finally {
      isRequestInFlight.current = false;
      setPending(false);
    }
  }

  const outcomeForUser = outcome?.userId === userId ? outcome : undefined;

  return {
    buy,
    pending,
    code:
      outcomeForUser && !outcomeForUser.failed
        ? outcomeForUser.code
        : undefined,
    failed: outcomeForUser?.failed ?? false,
    unconfirmed: outcomeForUser?.failed ? outcomeForUser.unconfirmed : false,
  };
}
