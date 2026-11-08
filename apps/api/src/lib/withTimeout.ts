import { CommandTimeoutError } from "../errors/errors.js";

export async function withTimeout<T>(
  command: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      reject,
      ms,
      new CommandTimeoutError(`command timed out after ${ms}ms`),
    );
  });

  try {
    return await Promise.race([command, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
