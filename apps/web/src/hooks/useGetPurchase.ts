import { useRef, useState } from "react";
import { getPurchase } from "../lib/purchase/purchase";
import type { Purchase } from "../types/purchase";

type Outcome = { userId: string } & (
  { failed: false; purchase: Purchase | null } | { failed: true }
);

export function useGetPurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const inFlight = useRef(false); // guards against double submits

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setOutcome(undefined);

    try {
      const purchase = await getPurchase(saleId, userId);
      setOutcome({ userId, failed: false, purchase });
    } catch {
      setOutcome({ userId, failed: true });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  // only show checked user
  const current = outcome?.userId === userId ? outcome : undefined;

  return {
    check,
    pending,
    purchase: current && !current.failed ? current.purchase : undefined,
    failed: current?.failed ?? false,
  };
}
