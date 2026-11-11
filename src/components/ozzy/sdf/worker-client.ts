// One shared SDF worker per page; every Ozzy renderer posts frame requests to it. If workers are unavailable
// or the worker errors, `sdfWorker()` returns null and renderers rasterize synchronously as before.
import type { OzzyState } from "../types";
import type { SdfRequest, SdfResponse } from "./worker";
import { SDF_WORKER_VERSION } from "./worker-version";

type Done = (r: SdfResponse) => void;
let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Done>();

export interface SdfWorker { request(s: OzzyState, t: number, blink: boolean, still: boolean, done: Done): void }

export function sdfWorker(): SdfWorker | null {
  if (worker === undefined) {
    worker = null;
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      try {
        const w = new Worker(`/ozzy/sdf-worker.js?v=${SDF_WORKER_VERSION}`);
        w.onmessage = (e: MessageEvent<SdfResponse>) => {
          const cb = pending.get(e.data.id);
          pending.delete(e.data.id);
          cb?.(e.data);
        };
        w.onerror = () => {
          // Fall back to the main thread for good; drop in-flight requests (renderers re-request).
          worker = null;
          pending.clear();
          w.terminate();
        };
        worker = w;
      } catch {
        worker = null;
      }
    }
  }
  const w = worker;
  if (!w) return null;
  return {
    request(s, t, blink, still, done) {
      const id = nextId++;
      pending.set(id, done);
      const msg: SdfRequest = { id, s, t, blink, still };
      w.postMessage(msg);
    },
  };
}
