import {
  ClientClosedError,
  ClientOfflineError,
  ConnectionTimeoutError,
  DisconnectsClientError,
  ErrorReply,
  ReconnectStrategyError,
  SocketClosedUnexpectedlyError,
  SocketTimeoutError,
  TimeoutError,
} from "redis";
import {
  MongoNetworkError,
  MongoOperationTimeoutError,
  MongoServerSelectionError,
} from "mongodb";

export class ServiceUnavailableError extends Error {}

export class CommandTimeoutError extends Error {
  override name = "CommandTimeoutError";
}

const TRANSIENT_REDIS_REPLY =
  /^(LOADING|BUSY|TRYAGAIN|MASTERDOWN|READONLY|CLUSTERDOWN|NOREPLICAS)\b/;

export function isDependencyOutage(error: unknown): boolean {
  if (error instanceof ErrorReply)
    return TRANSIENT_REDIS_REPLY.test(error.message);

  return (
    error instanceof CommandTimeoutError ||
    error instanceof ClientClosedError ||
    error instanceof ClientOfflineError ||
    error instanceof ConnectionTimeoutError ||
    error instanceof DisconnectsClientError ||
    error instanceof ReconnectStrategyError ||
    error instanceof SocketClosedUnexpectedlyError ||
    error instanceof SocketTimeoutError ||
    error instanceof TimeoutError ||
    error instanceof MongoNetworkError ||
    error instanceof MongoServerSelectionError ||
    error instanceof MongoOperationTimeoutError
  );
}
