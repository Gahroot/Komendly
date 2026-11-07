/** Provider is not usable right now (no login, expired, usage limit). Jobs should wait, not burn retries. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 5 * 60_000,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
