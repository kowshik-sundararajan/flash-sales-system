import { useSale } from "../hooks/useSale";
import { ApiStatusBadge } from "./ApiStatusBadge";
import { PurchaseCheck } from "./PurchaseCheck";
import { SaleCard } from "./SaleCard";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

function SaleContent({ saleId }: { saleId: string }) {
  const { sale, failed } = useSale(saleId);

  if (sale) return <SaleCard sale={sale} />;
  if (sale === null) return <p>No sale found.</p>;
  return <p>{failed ? "Could not load the sale." : "Loading sale…"}</p>;
}

export function SalePage() {
  return (
    <main>
      <SaleContent saleId={SALE_ID} />
      <PurchaseCheck saleId={SALE_ID} />
      <ApiStatusBadge />
    </main>
  );
}
