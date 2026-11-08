import type { SaleStatusResponse } from "../types/sale";
import { PurchasePanel } from "./PurchasePanel";
import { SaleWindow } from "./SaleWindow";
import { StatusPill } from "./StatusPill";
import { StockBar } from "./StockBar";

export function SaleCard({ sale }: { sale: SaleStatusResponse }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <p className="eyebrow">Limited drop</p>
          <h1 className="title">{sale.product.name}</h1>
        </div>
        <StatusPill status={sale.status} />
      </div>
      <SaleWindow sale={sale} />
      {sale.status !== "ended" && <StockBar stock={sale.stock} />}
      <PurchasePanel saleId={sale.saleId} status={sale.status} />
    </section>
  );
}
