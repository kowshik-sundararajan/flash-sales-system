import { useEffect, useState } from "react";
import { fetchSaleStatus } from "../lib/sale/sale";
import type { SaleStatusResponse } from "../types/sale";

const POLL_MS = 1000;

export function useSale(saleId: string) {
  const [sale, setSale] = useState<SaleStatusResponse | null>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const next = await fetchSaleStatus(saleId);
        if (!active) return;
        setSale(next);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    }

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [saleId]);

  return { sale, failed };
}
