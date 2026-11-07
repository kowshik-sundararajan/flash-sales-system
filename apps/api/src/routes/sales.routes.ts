import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getSaleParamsSchema } from "../schemas/sale.schema.js";
import { SaleNotFoundError, SalesService } from "../services/sales.service.js";

export interface SalesRoutesOptions {
  salesService: Pick<SalesService, "getStatus">;
}

export const salesRoutes: FastifyPluginAsync<SalesRoutesOptions> = async (
  app,
  { salesService },
) => {
  app.get("/api/sales/:saleId", async (request, reply) => {
    const params = getSaleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({
        error: "invalid_request",
        issues: z.flattenError(params.error).fieldErrors,
      });
    }

    try {
      const now = Date.now();
      const status = await salesService.getStatus(params.data.saleId, now);
      return { ...status, serverTime: now };
    } catch (err) {
      if (err instanceof SaleNotFoundError) {
        return reply.code(404).send({ error: "sale_not_found" });
      }
      throw err;
    }
  });
};
