import { useRef, useState } from "react";
import { getPurchase } from "../lib/purchase/purchase";
import type { Purchase } from "../types/purchase";

type CheckOutcome = { userId: string } & (
  { failed: false; purchase: Purchase | null } | { failed: true }
);

export function useCheckPurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome>();
  const isRequestInFlight = useRef(false); // guards against double submits

  async function check() {
    if (isRequestInFlight.current) return;
    isRequestInFlight.current = true;
    setPending(true);
    setOutcome(undefined);

    try {
      const purchase = await getPurchase(saleId, userId);
      setOutcome({ userId, failed: false, purchase });
    } catch {
      setOutcome({ userId, failed: true });
    } finally {
      isRequestInFlight.current = false;
      setPending(false);
    }
  }

  // only show checked user
  const outcomeForUser = outcome?.userId === userId ? outcome : undefined;

  return {
    check,
    pending,
    purchase:
      outcomeForUser && !outcomeForUser.failed
        ? outcomeForUser.purchase
        : undefined,
    failed: outcomeForUser?.failed ?? false,
  };
}
