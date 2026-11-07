import { formatDuration } from "../utils/helpers";
import type { SaleStatusResponse } from "../types/sale";

export function SaleWindow({
  sale,
}: {
  sale: Pick<
    SaleStatusResponse,
    "status" | "startsAt" | "endsAt" | "serverTime"
  >;
}) {
  return (
    <>
      <p>Status: {sale.status}</p>
      {sale.status === "upcoming" && (
        <p>Starts in {formatDuration(sale.startsAt - sale.serverTime)}</p>
      )}
      {sale.status === "active" && (
        <p>Ends in {formatDuration(sale.endsAt - sale.serverTime)}</p>
      )}
      {sale.status === "sold_out" && <p>The product has sold out!</p>}
      {sale.status === "ended" && <p>This sale has ended.</p>}
    </>
  );
}
