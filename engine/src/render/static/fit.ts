// Runs inside the page (page.evaluate): logo legibility chip + text auto-fit + layout report.

export interface FitReport {
  ok: boolean;
  overflow: string[]; // data-key of elements/boxes that still overflow at min size
  sizes: Record<string, number>; // final font-size per data-key
  rects: Record<string, { x: number; y: number; width: number; height: number }>;
}

export async function inPageFit(families: string[]): Promise<FitReport> {
  // Fonts: wait for brand families (bounded) then document.fonts.ready.
  await Promise.race([
    Promise.all(families.map((f) => document.fonts.load(`800 64px "${f}"`).catch(() => []))),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));

  const safe = document.querySelector<HTMLElement>(".safe");
  const fits = [...document.querySelectorAll<HTMLElement>("[data-fit]")];
  const boxes = [...document.querySelectorAll<HTMLElement>("[data-box]")];
  const keyOf = (e: HTMLElement) => e.dataset.key ?? e.dataset.fit ?? "?";
  const over = (): string[] => {
    const o: string[] = [];
    if (safe && safe.scrollHeight > safe.clientHeight + 1) o.push("safe");
    for (const e of fits) if (e.scrollWidth > e.clientWidth + 1) o.push(keyOf(e));
    for (const b of boxes) if (b.scrollHeight > b.clientHeight + 1) o.push(keyOf(b) === "?" ? "box" : keyOf(b));
    return o;
  };
  const size = (e: HTMLElement) => parseFloat(e.style.fontSize || "0");
  for (const e of fits) e.style.fontSize = `${e.dataset.max}px`;
  // Shrink order: stat (horizontal only), then body while it stays >= 42% of the headline, then headline, then body; never below data-min.
  const shrink = (els: HTMLElement[]) => { for (const e of els) e.style.fontSize = `${Math.max(Number(e.dataset.min), size(e) - 2)}px`; };
  for (let guard = 0; guard < 500 && over().length; guard++) {
    const live = (k: string) => fits.filter((e) => e.dataset.fit === k && size(e) > Number(e.dataset.min));
    const st = live("stat"), bo = live("body"), he = live("headline");
    const hs = Math.max(0, ...fits.filter((e) => e.dataset.fit === "headline").map(size));
    if (st.length) shrink(st);
    else if (bo.length && (!hs || Math.max(...bo.map(size)) > hs * 0.42)) shrink(bo);
    else if (he.length) shrink(he);
    else if (bo.length) shrink(bo);
    else break;
  }
  // Region bands: in each [data-bands] box pick the pre-cut band (snapped to whitespace rows) whose aspect
  // fits the box at full width, then size the frame to hug it (no side bars, no pale overhang, no cut edge).
  for (const box of [...document.querySelectorAll<HTMLElement>("[data-bands]")]) {
    const frame = box.querySelector<HTMLElement>(".band-frame");
    const imgs = [...box.querySelectorAll<HTMLImageElement>("img[data-aspect]")];
    if (!frame || !imgs.length) continue;
    const chrome = Number(frame.dataset.chrome ?? "0");
    const w = box.clientWidth, h = box.clientHeight - chrome;
    const sorted = imgs.sort((a, b) => Number(a.dataset.aspect) - Number(b.dataset.aspect));
    const pick = sorted.find((i) => w / Number(i.dataset.aspect) <= h) ?? sorted[sorted.length - 1];
    if (!pick) continue;
    const a = Number(pick.dataset.aspect);
    const fw = Math.min(w, Math.round(h * a)); // widest band still too tall -> narrower frame, centred
    for (const i of imgs) i.style.display = i === pick ? "block" : "none";
    frame.style.width = `${fw}px`;
    pick.style.width = `${fw}px`;
    pick.style.height = `${Math.round(fw / a)}px`;
  }
  const rects: FitReport["rects"] = {};
  for (const e of [...document.querySelectorAll<HTMLElement>("[data-key]")]) {
    const r = e.getBoundingClientRect();
    rects[e.dataset.key ?? "?"] = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  const sizes: Record<string, number> = {};
  for (const e of fits) sizes[keyOf(e)] = size(e);
  const overflow = over();
  return { ok: overflow.length === 0, overflow, sizes, rects };
}
