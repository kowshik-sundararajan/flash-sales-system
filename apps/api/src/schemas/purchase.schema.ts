import { z } from "zod";
import { userIdSchema } from "./userId.schema.js";

export const createPurchaseBodySchema = z.strictObject({
  userId: userIdSchema,
});

export type CreatePurchaseBody = z.infer<typeof createPurchaseBodySchema>;
