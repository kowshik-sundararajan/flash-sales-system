export interface AppConfig {
  port: number;
  dbUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const dbUrl = env.DB_URL;
  if (!dbUrl) throw new Error("env error: DB_URL is missing");

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `env error: PORT must be an integer between 1 and 65535, got ${env.PORT}`,
    );
  }

  return { port, dbUrl };
}
