import { pino, type Logger } from "pino";

export function createLogger(name: string, level = "info"): Logger {
  return pino({ name, level });
}
