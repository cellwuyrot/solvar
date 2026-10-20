// SQLite write contention is transient. Retry whole transactions, never a partially completed business operation.
export async function databaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      let cause: unknown = error, busy = false;
      for (let depth = 0; cause && depth < 5; depth++) {
        const current = cause as { code?: string; cause?: unknown };
        if (["SQLITE_BUSY", "SQLITE_LOCKED"].includes(current.code || "")) busy = true;
        cause = current.cause;
      }
      if (!busy || attempt >= 9) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 + 20 * attempt + Math.floor(Math.random() * 20)));
    }
  }
}
