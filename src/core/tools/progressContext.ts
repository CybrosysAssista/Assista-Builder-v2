import { AsyncLocalStorage } from 'async_hooks';

interface ProgressStore {
  callback?: (msg: string) => void;
}

const progressStorage = new AsyncLocalStorage<ProgressStore>();

/**
 * Run a block with a specific progress callback.
 * Used by executeToolWithLock.
 */
export function runWithProgressCallback<T>(
  callback: ((msg: string) => void) | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return progressStorage.run({ callback }, fn);
}

/**
 * Used by tools to report progress.
 */
export function reportProgress(msg: string): void {
  const store = progressStorage.getStore();
  if (store?.callback) {
    store.callback(msg);
  }
}
