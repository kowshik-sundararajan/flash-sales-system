export interface AppConfig {
  host: string;
  port: number;
  dbUrl: string;
  redisUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const dbUrl = env.DB_URL;
  if (!dbUrl) throw new Error("env error: DB_URL is missing");

  const redisUrl = env.REDIS_URL;
  if (!redisUrl) throw new Error("env error: REDIS_URL is missing");

  const host = env.HOST?.trim() || "localhost";

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `env error: PORT must be an integer between 1 and 65535, got ${env.PORT}`,
    );
  }

  return { host, port, dbUrl, redisUrl };
}
