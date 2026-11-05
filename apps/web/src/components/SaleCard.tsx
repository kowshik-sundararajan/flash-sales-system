import type { SaleStatusResponse } from "../types/sale";
import { SaleWindow } from "./SaleWindow";

export function SaleCard({ sale }: { sale: SaleStatusResponse }) {
  return (
    <section>
      <h1>{sale.product.name}</h1>
      <SaleWindow sale={sale} />
    </section>
  );
}
