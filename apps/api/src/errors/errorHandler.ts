import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ServiceUnavailableError } from "./errors.js";

const RETRY_AFTER_SECONDS = "1";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ServiceUnavailableError) {
    request.log.error({ error }, "dependency unavailable");
    return reply
      .header("Retry-After", RETRY_AFTER_SECONDS)
      .code(503)
      .send({ error: "temporarily_unavailable" });
  }

  const statusCode = error.statusCode;

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    request.log.info({ error }, "client error");
    return reply.code(statusCode).send({
      error: error.code ?? "bad_request",
      message: error.message,
    });
  }

  request.log.error({ error }, "unhandled error");
  return reply.code(500).send({ error: "internal_error" });
}
