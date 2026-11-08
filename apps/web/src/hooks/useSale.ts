import { useEffect, useState } from "react";
import { fetchSaleStatus } from "../lib/sale/sale";
import type { SaleStatusResponse } from "../types/sale";

const POLL_MS = 1000;

export function useSale(saleId: string) {
  const [sale, setSale] = useState<SaleStatusResponse | null>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isSubscribed = true;

    async function poll() {
      try {
        const latestSale = await fetchSaleStatus(saleId);
        if (!isSubscribed) return;
        setSale(latestSale);
        setFailed(false);
      } catch {
        if (isSubscribed) setFailed(true);
      }
    }

    void poll();
    const intervalId = setInterval(poll, POLL_MS);
    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [saleId]);

  return { sale, failed };
}
