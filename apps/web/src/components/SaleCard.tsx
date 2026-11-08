import type { SaleStatusResponse } from "../types/sale";
import { PurchasePanel } from "./PurchasePanel";
import { SaleWindow } from "./SaleWindow";

export function SaleCard({ sale }: { sale: SaleStatusResponse }) {
  return (
    <section>
      <h1>{sale.product.name}</h1>
      <SaleWindow sale={sale} />
      {sale.status === "active" && <p>Stock: {sale.stock.remaining}</p>}
      <PurchasePanel saleId={sale.saleId} status={sale.status} />
    </section>
  );
}
