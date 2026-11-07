import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { errorHandler } from "./errorHandler.js";
import { salesRoutes } from "./routes/sales.routes.js";
import type { SalesService } from "./services/sales.service.js";
import { purchasesRoutes } from "./routes/purchase.routes.js";
import type { PurchasesService } from "./services/purchases.service.js";

export interface AppDeps {
  salesService: Pick<SalesService, "getStatus">;
  purchasesService: Pick<PurchasesService, "purchase" | "getPurchase">;
}

export function buildApp(
  deps: AppDeps,
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = fastify(options);

  app.setErrorHandler(errorHandler);

  app.get("/api/health", async () => ({ status: "ok" }));

  app.register(salesRoutes, { salesService: deps.salesService });
  app.register(purchasesRoutes, { purchasesService: deps.purchasesService });

  return app;
}
