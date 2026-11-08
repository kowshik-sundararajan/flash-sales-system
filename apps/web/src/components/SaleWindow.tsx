import { formatCountdown } from "../utils/helpers";
import type { SaleStatusResponse } from "../types/sale";
import { Icon } from "./Icon";

function Countdown({ label, ms }: { label: string; ms: number }) {
  return (
    <p className="countdown">
      <Icon name="clock" className="countdown-icon" />
      <span className="countdown-label">{label}</span>{" "}
      <span className="countdown-time">{formatCountdown(ms)}</span>
    </p>
  );
}

export function SaleWindow({
  sale,
}: {
  sale: Pick<
    SaleStatusResponse,
    "status" | "startsAt" | "endsAt" | "serverTime"
  >;
}) {
  switch (sale.status) {
    case "upcoming":
      return (
        <Countdown label="Starts in" ms={sale.startsAt - sale.serverTime} />
      );
    case "active":
      return <Countdown label="Ends in" ms={sale.endsAt - sale.serverTime} />;
    case "sold_out":
      return <p className="note">The product has sold out.</p>;
    case "ended":
      return <p className="note">This sale has ended.</p>;
  }
}
