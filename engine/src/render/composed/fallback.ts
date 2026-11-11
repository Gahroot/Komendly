// Runs the composed path; on any failure (QC reject, image limit, provider error) returns null files
// with meta explaining why, so the render job falls back to the template renderer.
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";
import type { BrandKit, RenderedFile } from "../static/types";
import { ComposedRejectedError, renderComposedAd } from "./index";

interface Ctx { provider: AIProvider; usage: UsageMeter[]; signal?: AbortSignal }

export async function tryComposed(ctx: Ctx, i: { spec: AdSpec; brand: BrandKit; ratios: Ratio[]; workDir: string; avoidHashes?: string[]; sceneOffset?: number }): Promise<{ files: RenderedFile[] | null; meta: Record<string, unknown> }> {
  const started = Date.now();
  try {
    const once = () => renderComposedAd({ ...i, provider: ctx.provider, signal: ctx.signal });
    const r = await once().catch((e: unknown) => {
      if (!/fetch failed|ECONNRESET|socket hang up|ETIMEDOUT/i.test(String(e))) throw e;
      const u = (e as { usage?: UsageMeter[] }).usage;
      if (u) ctx.usage.push(...u);
      return once();
    });
    ctx.usage.push(...r.usage);
    return { files: r.files, meta: { path: "composed", attempts: r.attempts, hash: r.hash, sceneShift: r.sceneShift, logo: r.logo, ...(r.failedReasons.length ? { retriedFor: r.failedReasons.slice(0, 6) } : {}), ms: Date.now() - started } };
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    const u = (e as { usage?: UsageMeter[] }).usage;
    if (u) ctx.usage.push(...u);
    const reason = e instanceof ComposedRejectedError ? "qc_fail" : /image limit/i.test(String(e)) ? "image_limit" : "error";
    return { files: null, meta: { path: "template", fallbackFrom: "composed", reason, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300), ms: Date.now() - started } };
  }
}
