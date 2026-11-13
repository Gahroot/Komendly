import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT, run } from "../src/commands.js";
import { chromeCandidates, isLocalUrl, NO_BROWSER_HINT, pickTourPages, withScheme } from "../src/launch.js";
import { json, makeDeps, mockFetch, tempHome } from "./helpers.js";

const thread = (status: string) => ({
  session: { id: "L1", title: "Launch video · yourapp.com", status, freeVideo: true, lastActivityAt: "", archived: false },
  messages: [{ id: "m2", role: "assistant", content: status === "idle" ? "Here's your launch video." : "", status: status === "idle" ? "done" : "streaming", renderIds: [], error: null }],
  renders: status === "idle" ? [{ id: "r1", version: 1, ratio: "16:9", seconds: 30, watermarked: false, messageId: "m2", posterKey: "p", createdAt: "" }] : [],
});

describe("launch helpers", () => {
  it("tells local addresses from public ones", () => {
    for (const u of ["localhost:3000", "http://127.0.0.1:5173", "http://192.168.1.4", "http://10.0.0.2", "http://myapp.local", "http://api.test", "http://devbox:8080", "http://[::1]:3000"]) expect(isLocalUrl(u)).toBe(true);
    for (const u of ["https://yourapp.com", "staging.yourapp.com", "http://8.8.8.8"]) expect(isLocalUrl(u)).toBe(false);
  });
  it("adds the right scheme", () => {
    expect(withScheme("localhost:3000")).toBe("http://localhost:3000");
    expect(withScheme("yourapp.com")).toBe("https://yourapp.com");
  });
  it("picks key same-origin pages, skipping login and legal", () => {
    const links = [
      { href: "/pricing", text: "Pricing", nav: true },
      { href: "/login", text: "Log in", nav: true },
      { href: "/terms", text: "Terms", nav: false },
      { href: "https://other.com/features", text: "Features", nav: true },
      { href: "/features", text: "Features", nav: true },
      { href: "/", text: "Home", nav: true },
      { href: "/changelog", text: "Changelog", nav: false },
      { href: "/about", text: "About", nav: false },
    ];
    expect(pickTourPages("http://localhost:3000/", links)).toEqual(["http://localhost:3000/features", "http://localhost:3000/pricing", "http://localhost:3000/changelog"]);
    expect(pickTourPages("http://localhost:3000/", links, 1)).toHaveLength(1);
  });
  it("knows where Chrome lives", () => {
    expect(chromeCandidates("darwin", {})[0]).toContain("Google Chrome.app");
    expect(chromeCandidates("win32", { PROGRAMFILES: "C:\\PF" })[0]).toContain("chrome.exe");
    expect(chromeCandidates("linux", {})).toContain("/usr/bin/google-chrome");
  });
});

describe("launch", () => {
  it("sends a public URL to Ozzy with git notes when --notes is missing, waits and saves --out file", async () => {
    const dir = await tempHome();
    const m = mockFetch({
      "POST /api/studio/launch": () => json({ session: { id: "L1" } }, 201),
      "GET /api/studio/sessions/L1": [() => json(thread("queued")), () => json(thread("idle"))],
      "GET /api/studio/media": () => new Response("mp4", { status: 200, headers: { "content-disposition": 'attachment; filename="ozzy-r1.mp4"' } }),
    });
    const t = makeDeps(m.fetch, { gitNotes: async () => "Recent changes:\nabc123 Add CSV export" });
    const out = join(dir, "launch.mp4");
    expect(await run(["launch", "yourapp.com", "--out", out, "--json"], t.deps)).toBe(EXIT.ok);
    expect(JSON.parse(m.calls[0]?.body ?? "")).toEqual({ url: "https://yourapp.com", aspect: "16:9", notes: "Recent changes:\nabc123 Add CSV export" });
    expect(JSON.parse(t.out())).toMatchObject({ session_id: "L1", files: [out] });
  });

  it("records a local app here, uploads the clips and starts the launch with them", async () => {
    const dir = await tempHome();
    await mkdir(dir, { recursive: true });
    const clip = join(dir, "home-16x9.webm");
    await writeFile(clip, "webm");
    const m = mockFetch({
      "POST /api/studio/uploads": () => json({ upload: { id: "u1", filename: "home-16x9.webm", mime: "video/webm", bytes: 4, status: "pending" }, putUrl: "https://s3.test/put/u1" }, 201),
      "PUT https://s3.test/put/u1": () => new Response(null, { status: 200 }),
      "POST /api/studio/uploads/u1/complete": () => json({ upload: { id: "u1", filename: "home-16x9.webm", mime: "video/webm", bytes: 4, status: "uploaded" } }),
      "POST /api/studio/launch": () => json({ session: { id: "L1" } }, 201),
      "GET /api/studio/sessions/L1": () => json(thread("queued")),
    });
    let recorded = "";
    const t = makeDeps(m.fetch, {
      gitNotes: async () => null,
      recordLocal: async (o) => { recorded = `${o.url} ${o.aspect}`; return { dir, files: [clip], footage: [{ filename: "home-16x9.webm", shows: "the homepage" }] }; },
    });
    expect(await run(["launch", "localhost:3000", "--aspect", "9:16", "--notes", "New dashboard"], t.deps)).toBe(EXIT.ok);
    expect(recorded).toBe("http://localhost:3000 9:16");
    const call = m.calls.find((c) => c.url.endsWith("/api/studio/launch"));
    expect(JSON.parse(call?.body ?? "")).toEqual({ url: "http://localhost:3000", aspect: "9:16", notes: "New dashboard", uploadIds: ["u1"], footage: [{ filename: "home-16x9.webm", shows: "the homepage" }] });
    expect(t.out()).toContain("https://k.test/studio/L1");
  });

  it("prints one hint when Chrome or the recorder is missing", async () => {
    const m = mockFetch({});
    const t = makeDeps(m.fetch, { gitNotes: async () => null, recordLocal: async () => null });
    expect(await run(["launch", "http://localhost:3000"], t.deps)).toBe(EXIT.error);
    expect(t.err().trim()).toBe(NO_BROWSER_HINT);
    expect(m.calls).toHaveLength(0);
  });

  it("rejects a missing url and a bad aspect, and has help", async () => {
    const t = makeDeps(mockFetch({}).fetch);
    expect(await run(["launch"], t.deps)).toBe(EXIT.usage);
    expect(await run(["launch", "yourapp.com", "--aspect", "1:1"], t.deps)).toBe(EXIT.usage);
    const h = makeDeps(mockFetch({}).fetch);
    expect(await run(["launch", "--help"], h.deps)).toBe(EXIT.ok);
    expect(h.out()).toContain("komendly launch <url>");
  });
});
