import type { ErrorSource, RemoteError } from './types';

/** A deliberate failure: a message written for the screen and the source that decides when it clears. Anything else thrown inside a step (SecureStore, JSON, a runtime error) shows that step's fallback message instead, so raw error text never reaches the screen. */
export class RemoteFailure extends Error {
  readonly error: RemoteError;

  constructor(message: string, source: ErrorSource) {
    super(message);
    this.error = { message, source };
  }

  static from(error: RemoteError): RemoteFailure {
    return new RemoteFailure(error.message, error.source);
  }
}
