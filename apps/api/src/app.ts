import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

export function buildApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = fastify(options);

  app.get("/api/health", async () => ({ status: "ok" }));

  return app;
}
