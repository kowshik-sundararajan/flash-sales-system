import type { Tone } from "../lib/messages";
import type { SaleStatus } from "../types/sale";

const PILLS: Record<SaleStatus, { label: string; tone: Tone }> = {
  upcoming: { label: "Coming soon", tone: "info" },
  active: { label: "Live now", tone: "success" },
  sold_out: { label: "Sold out", tone: "warning" },
  ended: { label: "Ended", tone: "neutral" },
};

export function StatusPill({ status }: { status: SaleStatus }) {
  const { label, tone } = PILLS[status];
  return <span className={`pill tone-${tone}`}>{label}</span>;
}
