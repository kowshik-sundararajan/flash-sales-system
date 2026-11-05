import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp({ logger: true });

process.on("SIGTERM", () => {
  void app.close().then(() => process.exit(0));
});

await app.listen({ port });
