import { z } from "zod";

export const saleIdSchema = z.string().trim().toLowerCase().pipe(z.uuid());

export type SaleId = z.infer<typeof saleIdSchema>;

export const getSaleParamsSchema = z.object({ saleId: saleIdSchema });

export type GetSaleParams = z.infer<typeof getSaleParamsSchema>;
