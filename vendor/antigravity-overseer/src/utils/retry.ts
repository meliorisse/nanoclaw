export async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number,
  delayMs = 0
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
