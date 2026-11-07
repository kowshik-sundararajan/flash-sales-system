import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(
  err: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const status = err.statusCode;

  if (status !== undefined && status >= 400 && status < 500) {
    request.log.info({ err }, "client error");
    return reply.code(status).send({
      error: err.code ?? "bad_request",
      message: err.message,
    });
  }

  request.log.error({ err }, "unhandled error");
  return reply.code(500).send({ error: "internal_error" });
}
