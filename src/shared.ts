/**
 * Message defines the structure of protocol messages sent between Bun and Web.
 */
export interface Message {
  type: "start" | "next" | "error" | "done" | "cancel";
  stream: string;
  method?: string;
  content?: unknown;
}

/**
 * createAsyncIterable creates a queue-backed AsyncGenerator that allows pushing values, throwing errors,
 * and completing the stream manually. Also accepts a cleanup callback triggered
 * when the generator is cancelled or completed.
 */
export function createAsyncIterable<T>(onCleanup?: () => void): {
  push: (value: T) => void;
  reject: (err: unknown) => void;
  complete: () => void;
  generator: AsyncGenerator<T, void, unknown>;
} {
  const queue: T[] = [];
  const resolvers: {
    resolve: (res: IteratorResult<T>) => void;
    reject: (err: unknown) => void;
  }[] = [];
  let done = false;
  let error: unknown = null;

  const push = (value: T): void => {
    if (done) return;
    if (resolvers.length > 0) {
      const { resolve } = resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      queue.push(value);
    }
  };

  const reject = (err: unknown): void => {
    if (done) return;
    done = true;
    error = err;
    while (resolvers.length > 0) {
      const { reject: rej } = resolvers.shift()!;
      rej(err);
    }
    onCleanup?.();
  };

  const complete = (): void => {
    if (done) return;
    done = true;
    while (resolvers.length > 0) {
      const { resolve } = resolvers.shift()!;
      resolve({ value: undefined as unknown as T, done: true });
    }
    onCleanup?.();
  };

  const generator: AsyncGenerator<T, void, unknown> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      if (queue.length > 0) {
        return { value: queue.shift()!, done: false };
      }
      if (done) {
        if (error) throw error;
        return { value: undefined as unknown as T, done: true };
      }
      return new Promise<IteratorResult<T>>((resolve, reject) => {
        resolvers.push({ resolve, reject });
      });
    },
    async return(value?: void | PromiseLike<void>) {
      complete();
      const resolvedValue = await value;
      return { value: resolvedValue, done: true };
    },
    async throw(err: unknown) {
      reject(err);
      throw err;
    },
    async [Symbol.asyncDispose]() {
      await this.return();
    },
  };

  return { push, reject, complete, generator };
}
