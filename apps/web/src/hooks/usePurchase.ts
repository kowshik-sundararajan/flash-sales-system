import { useRef, useState } from "react";
import { postPurchase } from "../lib/purchase/purchase";
import type { PurchaseCode } from "../types/purchase";

type Outcome = { userId: string } & (
  { failed: false; code: PurchaseCode } | { failed: true }
);

export function usePurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const inFlight = useRef(false); // guards against double clicks

  async function buy() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setOutcome(undefined);

    try {
      const response = await postPurchase(saleId, userId);
      setOutcome({ userId, failed: false, code: response.code });
    } catch {
      setOutcome({ userId, failed: true });
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
  };
}
