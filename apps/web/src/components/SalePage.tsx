import { useSale } from "../hooks/useSale";
import { ApiStatusBadge } from "./ApiStatusBadge";
import { SaleCard } from "./SaleCard";

const SALE_ID = "sale-1";

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
      <ApiStatusBadge />
    </main>
  );
}
