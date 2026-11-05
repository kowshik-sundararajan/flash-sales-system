import type { FastifyPluginAsync } from "fastify";
import { SaleNotFoundError, SalesService } from "../services/sales.service.js";

export interface SalesRoutesOptions {
  salesService: Pick<SalesService, "getStatus">;
}

const getSaleSchema = {
  params: {
    type: "object",
    properties: { saleId: { type: "string", minLength: 1, maxLength: 64 } },
    required: ["saleId"],
  },
} as const;

export const salesRoutes: FastifyPluginAsync<SalesRoutesOptions> = async (
  app,
  { salesService },
) => {
  app.get<{ Params: { saleId: string } }>(
    "/api/sales/:saleId",
    { schema: getSaleSchema },
    async (request, reply) => {
      const now = Date.now();
      try {
        const status = await salesService.getStatus(request.params.saleId, now);
        return { ...status, serverTime: now };
      } catch (err) {
        if (err instanceof SaleNotFoundError) {
          return reply.code(404).send({ error: "sale_not_found" });
        }
        throw err;
      }
    },
  );
};
