// Off-main-thread SDF rasterizer for Ozzy: the per-frame raymarch used to block phones' main thread
// (~200ms tasks under Lighthouse mobile throttling). Pure: (state, t, blink, still) -> pixels.
import type { OzzyState } from "../types";
import { sdfFrame } from "./frame";

export interface SdfRequest { id: number; s: OzzyState; t: number; blink: boolean; still: boolean }
export interface SdfResponse { id: number; size: number; rgba: Uint8ClampedArray<ArrayBuffer>; glow: Uint8ClampedArray<ArrayBuffer> }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<SdfRequest>) => void) | null; postMessage: (m: SdfResponse, transfer: Transferable[]) => void };

ctx.onmessage = (e) => {
  const { id, s, t, blink, still } = e.data;
  let f;
  try {
    f = sdfFrame(s, t, blink, still);
  } catch {
    f = sdfFrame({ ...s, form: "classic" }, t, blink, still);
  }
  ctx.postMessage({ id, size: f.size, rgba: f.rgba, glow: f.glow }, [f.rgba.buffer, f.glow.buffer]);
};
