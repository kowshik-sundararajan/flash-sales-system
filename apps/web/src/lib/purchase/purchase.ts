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

// status 0: no response at all (network error). 429 and other 4xx mean the
// request was refused, so it cannot have gone through.
export class PurchaseRequestError extends Error {
  constructor(readonly httpStatus: number) {
    super(`purchase failed: ${httpStatus}`);
  }

  get outcomeIsUnknown() {
    return this.httpStatus === 0 || this.httpStatus >= 500;
  }
}

export async function postPurchase(
  saleId: string,
  userId: string,
): Promise<PurchaseResponse> {
  const response = await fetch(
    `/api/sales/${encodeURIComponent(saleId)}/purchases`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    },
  ).catch(() => {
    throw new PurchaseRequestError(0);
  });

  const body = await response.json().catch(() => null);

  if (isPurchaseCode(body?.code)) return body;

  throw new PurchaseRequestError(response.status);
}

export async function getPurchase(
  saleId: string,
  userId: string,
): Promise<Purchase | null> {
  const response = await fetch(
    `/api/sales/${encodeURIComponent(saleId)}/purchases/${encodeURIComponent(userId)}`,
  );

  const body = await response.json().catch(() => null);

  if (response.status === 200 && typeof body?.purchasedAt === "number") {
    return { purchasedAt: body.purchasedAt };
  }

  if (response.status === 404 && body?.error === "purchase_not_found") {
    return null;
  }

  throw new Error(`purchase lookup failed: ${response.status}`);
}
