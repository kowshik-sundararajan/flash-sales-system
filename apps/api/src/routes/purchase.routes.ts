import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { PURCHASE_CODE, type PurchaseCode } from "../models/purchase.model.js";
import {
  createPurchaseBodySchema,
  getPurchaseParamsSchema,
} from "../schemas/purchase.schema.js";
import { getSaleParamsSchema } from "../schemas/sale.schema.js";
import type { PurchasesService } from "../services/purchases.service.js";

export interface PurchasesRoutesOptions {
  purchasesService: Pick<PurchasesService, "purchase" | "getPurchase">;
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

    const httpStatus = HTTP_STATUS_BY_PURCHASE_CODE[code];
    return reply.code(httpStatus).send({ code });
  });

  app.get("/api/sales/:saleId/purchases/:userId", async (request, reply) => {
    const params = getPurchaseParamsSchema.safeParse(request.params);
    if (!params.success) return sendInvalidRequest(reply, params.error);

    const purchase = await purchasesService.getPurchase(
      params.data.saleId,
      params.data.userId,
    );

    if (!purchase) {
      return reply.code(404).send({ error: "purchase_not_found" });
    }

    return reply.code(200).send(purchase);
  });
};
