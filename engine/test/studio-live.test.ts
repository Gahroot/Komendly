import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LiveManifestSchema } from "../../src/lib/studio/contracts";
import { LIVE_RUNTIME_REL, collectLive, compositionSize, injectRuntime, isPlayable, livePublisher, liveRefs, safeRel } from "../src/studio/live";

const HTML = `<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body>
<div id="root" data-composition-id="root" data-width="1080" data-height="1920">
<video src="../uploads/clip.mp4"></video><img src="https://cdn.x/y.png"><div data-composition-src="./scenes/intro.html"></div>
</div></body></html>`;

const dirs: string[] = [];
async function project(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "live-"));
  dirs.push(d);
  await mkdir(join(d, "comp", "scenes"), { recursive: true });
  await mkdir(join(d, "uploads"), { recursive: true });
  await mkdir(join(d, "comp", "node_modules"), { recursive: true });
  await writeFile(join(d, "comp", "index.html"), HTML);
  await writeFile(join(d, "comp", "style.css"), "body{background:url('bg.png')}");
  await writeFile(join(d, "comp", "bg.png"), "png");
  await writeFile(join(d, "comp", "scenes", "intro.html"), `<div data-composition-id="intro"><img src="../logo.svg"></div>`);
  await writeFile(join(d, "comp", "logo.svg"), "<svg/>");
  await writeFile(join(d, "comp", "unused.mp4"), "x");
  await writeFile(join(d, "comp", "node_modules", "big.js"), "x");
  await writeFile(join(d, "uploads", "clip.mp4"), "video");
  await writeFile(join(d, "uploads", "other.mp4"), "video");
  return d;
}
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

describe("studio live preview", () => {
  it("parses refs, size and playability", () => {
    expect(liveRefs(HTML)).toEqual(["../uploads/clip.mp4", "./scenes/intro.html", "style.css"]);
    expect(liveRefs("a{background:url(\"img/a%20b.png?x=1\")}")).toEqual(["img/a b.png"]);
    expect(compositionSize(HTML)).toEqual({ width: 1080, height: 1920 });
    expect(compositionSize("<div data-composition-id='r' data-width='1920' data-height='1080'>")).toEqual({ width: 1920, height: 1080 });
    expect(isPlayable(HTML)).toBe(true);
    expect(isPlayable("<html><body>half")).toBe(false);
    expect(safeRel("a/../b")).toBe(false);
    expect(safeRel("comp/index.html")).toBe(true);
  });

  it("injects the runtime relative to the entry and drops the agent's own", () => {
    const out = injectRuntime(`<html><head><script src="/runtime.js" data-hyperframes-preview-runtime></script></head><body></body></html>`, "comp/index.html");
    expect(out).toContain(`src="../${LIVE_RUNTIME_REL}"`);
    expect(out).not.toContain("/runtime.js\"");
  });

  it("collects referenced files (media only when referenced, nothing outside the project)", async () => {
    const d = await project();
    const r = await collectLive(d, join(d, "comp"));
    expect(r.entry).toBe("comp/index.html");
    expect(r.files.map((f) => f.rel)).toEqual(["comp/bg.png", "comp/index.html", "comp/logo.svg", "comp/scenes/intro.html", "comp/style.css", "uploads/clip.mp4"]);
  });

  it("publishes a version, skips unchanged, reuses unchanged files and respects the gap", async () => {
    const d = await project();
    const puts = new Map<string, Buffer>();
    const events: { version: string; ratio: string }[] = [];
    let t = 0;
    const pub = livePublisher({
      storage: { put: async (k, b) => { puts.set(k, b); } },
      workspaceId: "ws", sessionId: "s1", messageId: "m1", project: d,
      findComposition: async () => join(d, "comp"),
      emit: (row) => events.push(row.data),
      now: () => t,
      runtimeJs: async () => Buffer.from("/*rt*/"),
    });
    await pub.tick();
    expect(events).toEqual([{ version: "m1-1", width: 1080, height: 1920, ratio: "9:16" }]);
    const m = LiveManifestSchema.parse(JSON.parse(String(puts.get("studio/ws/s1/live/m1-1.json"))));
    expect(m.entry).toBe("comp/index.html");
    expect(Object.keys(m.files)).toContain(LIVE_RUNTIME_REL);
    expect(String(puts.get("studio/ws/s1/live/m1-1/comp/index.html"))).toContain(`../${LIVE_RUNTIME_REL}`);
    await pub.flush();
    expect(events).toHaveLength(1);
    await writeFile(join(d, "comp", "index.html"), HTML.replace("root\" data-width", "root\" data-x=\"1\" data-width"));
    await utimes(join(d, "comp", "index.html"), new Date(), new Date(Date.now() + 5_000));
    t = 1_000;
    await pub.tick();
    expect(events).toHaveLength(1);
    t = 20_000;
    await pub.tick();
    expect(events.map((e) => e.version)).toEqual(["m1-1", "m1-2"]);
    const m2 = LiveManifestSchema.parse(JSON.parse(String(puts.get("studio/ws/s1/live/m1-2.json"))));
    expect(m2.files["uploads/clip.mp4"]?.key).toBe("studio/ws/s1/live/m1-1/uploads/clip.mp4");
    expect(m2.files["comp/index.html"]?.key).toBe("studio/ws/s1/live/m1-2/comp/index.html");
    expect(m2.token).not.toBe(m.token);
  });

  it("waits for a playable composition", async () => {
    const d = await project();
    await writeFile(join(d, "comp", "index.html"), "<html><body>");
    const events: unknown[] = [];
    const pub = livePublisher({ storage: { put: async () => undefined }, workspaceId: "w", sessionId: "s", messageId: "m", project: d, findComposition: async () => join(d, "comp"), emit: (r) => events.push(r), now: () => 0, runtimeJs: async () => Buffer.from("") });
    await pub.flush();
    expect(events).toEqual([]);
  });
});
