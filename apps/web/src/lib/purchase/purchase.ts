import {
  PURCHASE_CODE,
  type Purchase,
  type PurchaseResponse,
} from "../../types/purchase";

const PURCHASE_CODES: ReadonlySet<string> = new Set(
  Object.values(PURCHASE_CODE),
);

function isPurchaseCode(value: unknown): boolean {
  return typeof value === "string" && PURCHASE_CODES.has(value);
}

export async function postPurchase(
  saleId: string,
  userId: string,
): Promise<PurchaseResponse> {
  const res = await fetch(
    `/api/sales/${encodeURIComponent(saleId)}/purchases`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    },
  );

  const body = await res.json().catch(() => null);

  if (isPurchaseCode(body?.code)) return body;

  throw new Error(`purchase failed: ${res.status}`);
}

export async function getPurchase(
  saleId: string,
  userId: string,
): Promise<Purchase | null> {
  const res = await fetch(
    `/api/sales/${encodeURIComponent(saleId)}/purchases/${encodeURIComponent(userId)}`,
  );

  const body = await res.json().catch(() => null);

  if (res.status === 200 && typeof body?.purchasedAt === "number") {
    return { purchasedAt: body.purchasedAt };
  }

  if (res.status === 404 && body?.error === "purchase_not_found") {
    return null;
  }

  throw new Error(`purchase lookup failed: ${res.status}`);
}
