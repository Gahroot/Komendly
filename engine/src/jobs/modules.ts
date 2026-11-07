// Dynamic loading of render modules built by other workers.
import type { Browser } from "playwright";
import type { RenderStaticAd, StaticRenderInput, StaticRenderResult } from "../render/static/types";

type RenderWith = (browser: Browser, input: StaticRenderInput) => Promise<StaticRenderResult>;
import type { RenderMotionAd } from "../modules/ezmotion/types";

type Loaded<T> = { ok: true; mod: T } | { ok: false; error: string };

export async function loadStaticModule(): Promise<Loaded<{ renderStaticAd: RenderStaticAd; renderStaticAdWith?: RenderWith }>> {
  try {
    const m = (await import("../render/static/index")) as unknown as Partial<{ renderStaticAd: RenderStaticAd; renderStaticAdWith: RenderWith }>;
    if (typeof m.renderStaticAd !== "function") return { ok: false, error: "render/static/index.ts does not export renderStaticAd" };
    return { ok: true, mod: { renderStaticAd: m.renderStaticAd, ...(typeof m.renderStaticAdWith === "function" ? { renderStaticAdWith: m.renderStaticAdWith } : {}) } };
  } catch (e) {
    return { ok: false, error: `static render module unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

type Availability = boolean | { ok: boolean; reason?: string };

export async function loadMotionModule(): Promise<
  Loaded<{ renderMotionAd: RenderMotionAd; isMotionAvailable: () => Promise<boolean>; availability: () => Promise<{ ok: boolean; reason?: string }> }>
> {
  try {
    const m = (await import("../modules/ezmotion/index")) as unknown as Partial<{ renderMotionAd: RenderMotionAd; isMotionAvailable: () => Availability | Promise<Availability> }>;
    if (typeof m.renderMotionAd !== "function" || typeof m.isMotionAvailable !== "function") {
      return { ok: false, error: "modules/ezmotion/index.ts must export renderMotionAd and isMotionAvailable" };
    }
    const avail = m.isMotionAvailable;
    const availability = async () => {
      const a = await avail();
      return typeof a === "boolean" ? { ok: a } : a;
    };
    return { ok: true, mod: { renderMotionAd: m.renderMotionAd, availability, isMotionAvailable: async () => (await availability()).ok } };
  } catch (e) {
    return { ok: false, error: `ezmotion module unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Renderer's template catalogue at runtime (new template ids work as they land). */
export async function loadLayoutCatalog(brand: { brandName: string; colors: unknown[]; fonts: unknown[]; assets: unknown[] }): Promise<{ templates: string[]; imageTemplates: string[] | undefined }> {
  try {
    const m = (await import("../render/static/index")) as unknown as { TEMPLATE_IDS?: readonly string[]; imageLayoutsFor?: (b: unknown) => unknown };
    const templates = Array.isArray(m.TEMPLATE_IDS) ? [...m.TEMPLATE_IDS] : [];
    let imageTemplates: string[] | undefined;
    if (typeof m.imageLayoutsFor === "function") {
      try {
        const r = await m.imageLayoutsFor({ ...brand, logoPath: null, assets: brand.assets.map((a) => ({ ...(a as object), path: "" })) });
        if (Array.isArray(r)) imageTemplates = r.filter((x): x is string => typeof x === "string");
      } catch {
        /* fall back to IMAGE_LED */
      }
    }
    return { templates, imageTemplates };
  } catch {
    return { templates: [], imageTemplates: undefined };
  }
}
