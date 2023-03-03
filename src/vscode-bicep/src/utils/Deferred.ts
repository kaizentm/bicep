// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

//asdfg test
export class Deferred<T> {
  private _resolve?: (value: T) => void;
  private _reject?: (reason: unknown) => void;
  private _promise?: Promise<T>;

  public resolve(value: T): void {
    // Ensure promise created
    void this.promise;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._resolve!(/*asdfg?*/ value);
  }

  public reject(reason: unknown): void {
    // Ensure promise created
    void this.promise;

    reason = reason ?? "unknown rejection reason";

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._reject!(/*asdfg?*/ reason);
  }

  public get promise(): Promise<T> {
    if (this._promise) {
      return this._promise;
    }

    this._promise = new Promise((resolve, reject): void => {
      this._resolve = resolve; //asdfg is this called immediately?
      this._reject = reject;
    });

    return this._promise;
  }
}
