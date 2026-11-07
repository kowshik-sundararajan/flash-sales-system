export const PURCHASE_CODE = {
  PURCHASED: "PURCHASED",
  ALREADY_PURCHASED: "ALREADY_PURCHASED",
  SOLD_OUT: "SOLD_OUT",
  NOT_STARTED: "NOT_STARTED",
  ENDED: "ENDED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
} as const;

export type PurchaseCode = (typeof PURCHASE_CODE)[keyof typeof PURCHASE_CODE];

export type PurchaseResponse = {
  code: PurchaseCode;
  remaining?: number;
  purchasedAt?: number;
};
