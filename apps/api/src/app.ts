import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { salesRoutes } from "./routes/sales.routes.js";
import type { SalesService } from "./services/sales.service.js";

export interface AppDeps {
  salesService: Pick<SalesService, "getStatus">;
}

export function buildApp(
  deps: AppDeps,
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = fastify(options);

  app.get("/api/health", async () => ({ status: "ok" }));

  app.register(salesRoutes, { salesService: deps.salesService });

  return app;
}
