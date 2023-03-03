// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Deferred } from "../../utils/Deferred";
import { sleep } from "../../utils/time";

export async function retryWhile<T>(
  func: () => Promise<T>,
  predicate: (result: T) => boolean,
  retryOptions?: Readonly<{
    interval?: number;
    timeout?: number;
  }>
): Promise<T> {
  let result = await func();

  const interval = retryOptions?.interval ?? 2000;
  let count = (retryOptions?.timeout ?? 10000) / interval;

  while (predicate(result)) {
    if (count-- <= 0) {
      throw new Error("Timeout");
    }
    result = await func();
    await sleep(interval);
  }

  return result;
}

export async function until(
  predicate: () => boolean,
  retryOptions?: Readonly<{
    interval?: number;
    timeoutMs?: number;
  }>
): Promise<void> {
  await retryWhile(
    async () => void 0,
    () => !predicate(),
    retryOptions
  );
}

//asdfg test
export async function awaitWithTimeout(
  promise: Promise<unknown>,
  timeoutMs: number,
  timedOutMessage: string | (() => string)
): Promise<void> {
  const timeoutDeferred = new Deferred<void>();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutDeferred.resolve();
  }, timeoutMs);

  await Promise.race([timeoutDeferred.promise, promise]);
  clearTimeout(timeout);

  if (timedOut) {
    const msg = `Timed out after ${timeoutMs / 1000} seconds: ${
      typeof timedOutMessage === "string" ? timedOutMessage : timedOutMessage()
    }`;
    throw new Error(msg);
  }
}
