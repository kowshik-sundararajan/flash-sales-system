import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { PURCHASE_CODE, type PurchaseCode } from "../models/purchase.model.js";
import { createPurchaseBodySchema } from "../schemas/purchase.schema.js";
import { getSaleParamsSchema } from "../schemas/sale.schema.js";
import type { PurchasesService } from "../services/purchases.service.js";

export interface PurchasesRoutesOptions {
  purchasesService: Pick<PurchasesService, "purchase">;
}

const HTTP_STATUS_BY_PURCHASE_CODE: Record<PurchaseCode, number> = {
  [PURCHASE_CODE.PURCHASED]: 201,
  [PURCHASE_CODE.ALREADY_PURCHASED]: 409,
  [PURCHASE_CODE.SOLD_OUT]: 409,
  [PURCHASE_CODE.NOT_STARTED]: 409,
  [PURCHASE_CODE.ENDED]: 409,
  [PURCHASE_CODE.NOT_CONFIGURED]: 503,
};

function sendInvalidRequest(reply: FastifyReply, error: z.ZodError) {
  return reply
    .code(400)
    .send({ error: "invalid_request", issues: z.flattenError(error) });
}

export const purchasesRoutes: FastifyPluginAsync<
  PurchasesRoutesOptions
> = async (app, { purchasesService }) => {
  app.post("/api/sales/:saleId/purchases", async (request, reply) => {
    const params = getSaleParamsSchema.safeParse(request.params);
    if (!params.success) return sendInvalidRequest(reply, params.error);

    const body = createPurchaseBodySchema.safeParse(request.body);
    if (!body.success) return sendInvalidRequest(reply, body.error);

    const { code } = await purchasesService.purchase(
      params.data.saleId,
      body.data.userId,
    );

    const status = HTTP_STATUS_BY_PURCHASE_CODE[code];
    return reply.code(status).send({ code });
  });
};
