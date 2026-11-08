import { CommandTimeoutError } from "../errors/errors.js";

export async function withTimeout<T>(
  command: Promise<T>,
  ms: number,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutRejection = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      reject,
      ms,
      new CommandTimeoutError(`command timed out after ${ms}ms`),
    );
  });

  try {
    return await Promise.race([command, timeoutRejection]);
  } finally {
    clearTimeout(timeoutId);
  }
}
