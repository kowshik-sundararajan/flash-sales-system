import { useRef, useState } from "react";
import { postPurchase } from "../lib/purchase/purchase";
import type { PurchaseCode } from "../types/purchase";

export function usePurchase(saleId: string, userId: string) {
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState<PurchaseCode>();
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false); // guards against double clicks

  async function buy() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setCode(undefined);
    setFailed(false);

    try {
      const response = await postPurchase(saleId, userId);
      setCode(response.code);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { buy, pending, code, failed };
}
