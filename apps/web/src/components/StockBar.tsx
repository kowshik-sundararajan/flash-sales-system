import type { SaleStatusResponse } from "../types/sale";

export function StockBar({ stock }: { stock: SaleStatusResponse["stock"] }) {
  const { initial, remaining } = stock;
  const ratio = initial > 0 ? Math.min(1, Math.max(0, remaining / initial)) : 0;

  return (
    <div className="stock">
      <div className="stock-row">
        <span className="stock-left">
          {remaining > 0 ? `${remaining} left` : "None left"}
        </span>
        <span className="stock-total">of {initial}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
