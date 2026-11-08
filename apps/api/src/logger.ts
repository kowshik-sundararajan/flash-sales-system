import { pino, stdSerializers, type Logger } from "pino";

// Log errors under the `error` key; pino only formats `err` by default.
export const logSerializers = { error: stdSerializers.err };

export function createLogger(name: string, level = "info"): Logger {
  return pino({ name, level, serializers: logSerializers });
}
