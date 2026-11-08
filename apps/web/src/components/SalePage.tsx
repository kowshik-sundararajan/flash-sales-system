import { useSale } from "../hooks/useSale";
import { SaleCard } from "./SaleCard";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="card empty">
      <p className="empty-title">{title}</p>
      <p className="note">{body}</p>
    </section>
  );
}

function SaleContent({ saleId }: { saleId: string }) {
  const { sale, failed } = useSale(saleId);

  if (sale) return <SaleCard sale={sale} />;
  if (sale === null) {
    return (
      <Message
        title="No sale found"
        body="This sale doesn't exist or has been removed."
      />
    );
  }
  if (failed) {
    return (
      <Message title="Can't load the sale" body="Trying again automatically." />
    );
  }
  return <p className="note">Loading sale…</p>;
}

export function SalePage() {
  return (
    <main className="page">
      <header className="app-header">
        <span className="brand">Flash sale</span>
      </header>
      <SaleContent saleId={SALE_ID} />
    </main>
  );
}
