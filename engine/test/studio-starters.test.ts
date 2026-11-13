import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KIT = join(import.meta.dirname, "../src/studio/kit");
const DIR = join(KIT, "starters");
const starters = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
const files = [...starters.map((f) => join(DIR, f)), join(KIT, "starter.html")];

describe("studio layout starters", () => {
  it.each(files)("%s is a valid composition", (file) => {
    const html = readFileSync(file, "utf8");
    expect(html).toContain('data-composition-id="main"');
    expect(html).toMatch(/data-duration="[\d.]+"/);
    const init = html.indexOf("window.__timelines = window.__timelines ||");
    const reg = html.indexOf('window.__timelines["main"]');
    expect(init).toBeGreaterThan(-1);
    expect(reg).toBeGreaterThan(init);
    for (const rule of html.match(/\.wipe\s*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/transform/);
  });

  it("every starter is listed in INDEX.md", () => {
    const index = readFileSync(join(DIR, "INDEX.md"), "utf8");
    for (const f of [...starters, "starter.html"]) expect(index).toContain(f);
    for (const name of ["bold-type", "product-showcase", "offer-price", "before-after", "testimonial", "listicle", "caption-ugc", "editorial", "app-feature", "local-service"]) expect(starters).toContain(`${name}.html`);
  });
});
