import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ServiceUnavailableError } from "./errors.js";

const RETRY_AFTER_SECONDS = "1";

export function errorHandler(
  err: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (err instanceof ServiceUnavailableError) {
    request.log.error({ err }, "dependency unavailable");
    return reply
      .header("Retry-After", RETRY_AFTER_SECONDS)
      .code(503)
      .send({ error: "temporarily_unavailable" });
  }

  const statusCode = err.statusCode;

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    request.log.info({ err }, "client error");
    return reply.code(statusCode).send({
      error: err.code ?? "bad_request",
      message: err.message,
    });
  }

  request.log.error({ err }, "unhandled error");
  return reply.code(500).send({ error: "internal_error" });
}
