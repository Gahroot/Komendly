// Shutdown/abort handling for jobs that swallow per-call errors (e.g. plan batches): an aborted
// signal must surface as an abort, so the runner releases the job for a retry instead of
// recording a misleading content failure.

export class JobAbortedError extends Error {
  constructor(reason?: unknown) {
    super(`aborted${reason instanceof Error ? `: ${reason.message}` : typeof reason === "string" ? `: ${reason}` : ""}`);
    this.name = "JobAbortedError";
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new JobAbortedError(signal.reason);
}
