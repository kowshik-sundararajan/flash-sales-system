import { useRef, useState } from "react";
import { getPurchase, postPurchase } from "../lib/purchase/purchase";
import { PURCHASE_CODE, type PurchaseCode } from "../types/purchase";

// unconfirmed: the buy failed and we could not find out whether it went through
type Outcome = { userId: string } & (
  { failed: false; code: PurchaseCode } | { failed: true; unconfirmed: boolean }
);

export function usePurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const inFlight = useRef(false); // guards against double clicks

  // The request failed, but it may still have gone through: a slow Redis can
  // finish a purchase after the API stopped waiting. Ask before saying it failed.
  async function whatHappened(): Promise<Outcome> {
    try {
      const purchase = await getPurchase(saleId, userId);
      if (purchase) {
        return {
          userId,
          failed: false,
          code: PURCHASE_CODE.ALREADY_PURCHASED,
        };
      }
      return { userId, failed: true, unconfirmed: false };
    } catch {
      // the lookup failed too, so we cannot say
      return { userId, failed: true, unconfirmed: true };
    }
  }

  async function buy() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setOutcome(undefined);

    try {
      const response = await postPurchase(saleId, userId);
      setOutcome({ userId, failed: false, code: response.code });
    } catch {
      setOutcome(await whatHappened());
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const current = outcome?.userId === userId ? outcome : undefined;

  return {
    buy,
    pending,
    code: current && !current.failed ? current.code : undefined,
    failed: current?.failed ?? false,
    unconfirmed: current?.failed ? current.unconfirmed : false,
  };
}
