import { z } from "zod";
import { userIdSchema } from "./userId.schema.js";
import { saleIdSchema } from "./sale.schema.js";

export const createPurchaseBodySchema = z.strictObject({
  userId: userIdSchema,
});

export type CreatePurchaseBody = z.infer<typeof createPurchaseBodySchema>;

export const getPurchaseParamsSchema = z.strictObject({
  saleId: saleIdSchema,
  userId: userIdSchema,
});

export type GetPurchaseParams = z.infer<typeof getPurchaseParamsSchema>;
