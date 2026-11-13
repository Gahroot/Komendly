import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";
import { friendlyError } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { run, EXIT } from "../src/commands.js";
import { pollUntil } from "../src/poll.js";
import { ApiError } from "../src/client.js";
import { json, makeDeps, mockFetch, tempHome } from "./helpers.js";

const KEY = "kmd_testkey000000000000000000000000000000";

describe("parseArgs", () => {
  it("parses commands, positionals, booleans, repeatable --file and --flag=value", () => {
    const r = parseArgs(["video", "make a teaser", "--file", "a.mp4", "-f", "b.png", "--wait", "--out=./o", "--json"]);
    expect(r).toEqual({ ok: true, args: { command: "video", positionals: ["make a teaser"], flags: { wait: true, out: "./o", json: true }, files: ["a.mp4", "b.png"] } });
  });
  it("rejects unknown flags and missing values", () => {
    expect(parseArgs(["runs", "--nope"])).toEqual({ ok: false, error: "Unknown option --nope" });
    expect(parseArgs(["video", "x", "--out"])).toEqual({ ok: false, error: "--out needs a value" });
  });
  it("treats everything after -- as positionals", () => {
    const r = parseArgs(["say", "s1", "--", "--json is text"]);
    expect(r.ok && r.args.positionals).toEqual(["s1", "--json is text"]);
  });
});

describe("config", () => {
  it("prefers --key, then env, then the config file; base URL env override", async () => {
    const home = await tempHome();
    await mkdir(join(home, ".config", "komendly"), { recursive: true });
    await writeFile(join(home, ".config", "komendly", "cli.json"), JSON.stringify({ apiKey: "kmd_file", baseUrl: "https://file.test/" }));
    expect(await loadConfig({ env: {}, home })).toMatchObject({ apiKey: "kmd_file", keySource: "file", baseUrl: "https://file.test" });
    expect(await loadConfig({ env: { KOMENDLY_API_KEY: "kmd_env", KOMENDLY_BASE_URL: "http://localhost:3000" }, home })).toMatchObject({ apiKey: "kmd_env", keySource: "env", baseUrl: "http://localhost:3000" });
    expect(await loadConfig({ env: { KOMENDLY_API_KEY: "kmd_env" }, home, keyFlag: "kmd_flag" })).toMatchObject({ apiKey: "kmd_flag", keySource: "flag" });
    expect(await loadConfig({ env: {}, home: await tempHome() })).toMatchObject({ apiKey: undefined, keySource: "none", baseUrl: "https://www.komendly.com" });
  });

  it("login verifies the key and saves it", async () => {
    const home = await tempHome();
    const m = mockFetch({ "GET /api/ads/me": () => json({ email: "a@b.co", plan: "free", isPaid: false, trialAvailable: true, balance: 0 }) });
    const t = makeDeps(m.fetch, { env: { KOMENDLY_BASE_URL: "https://k.test" }, home });
    expect(await run(["login", "--key", KEY], t.deps)).toBe(EXIT.ok);
    expect(m.calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(await readFile(join(home, ".config", "komendly", "cli.json"), "utf8"))).toEqual({ apiKey: KEY });
    expect(t.out()).toContain("Signed in as a@b.co");
  });

  it("without any key, explains where to get one (exit 3)", async () => {
    const m = mockFetch({});
    const t = makeDeps(m.fetch, { env: {}, home: await tempHome() });
    expect(await run(["runs"], t.deps)).toBe(EXIT.auth);
    expect(t.err()).toContain("/dashboard/api");
    expect(m.calls).toHaveLength(0);
  });
});

describe("errors", () => {
  it("402 prints the upgrade URL (human and --json)", async () => {
    const m = mockFetch({
      "POST /api/studio/sessions": () => json({ session: { id: "s1", title: "x", status: "idle" } }, 201),
      "POST /api/studio/sessions/s1/messages": () => json({ error: "You need credits for this one.", code: "free_used", neededCredits: 10 }, 402),
    });
    const human = makeDeps(m.fetch);
    expect(await run(["video", "make an ad"], human.deps)).toBe(EXIT.payment);
    expect(human.err()).toContain("You need credits for this one. Upgrade or top up here: https://k.test/pricing?utm_source=cli");

    const j = makeDeps(m.fetch);
    expect(await run(["video", "make an ad", "--json"], j.deps)).toBe(EXIT.payment);
    expect(JSON.parse(j.out())).toMatchObject({ status: 402, code: "free_used", upgrade_url: "https://k.test/pricing?utm_source=cli" });
  });

  it("maps 401, 409 and 429 to friendly sentences", () => {
    expect(friendlyError(401, null, "https://k.test").message).toContain("invalid or revoked");
    expect(friendlyError(409, { error: "Ozzy is still working on the last message." }, "https://k.test").message).toBe("Ozzy is still working on the last message.");
    expect(friendlyError(429, null, "https://k.test", "30").message).toContain("try again in 30s");
  });
});

describe("pollUntil", () => {
  it("backs off, tolerates transient errors and stops when done", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const seq: Array<string | Error> = ["working", new ApiError("down", 503), "working", "idle"];
    const r = await pollUntil(
      async () => {
        const next = seq.shift();
        if (next instanceof Error) throw next;
        return next ?? "idle";
      },
      (s) => s === "idle",
      { intervalMs: 1000, factor: 2, maxIntervalMs: 3000, sleep: async (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock },
    );
    expect(r).toEqual({ value: "idle", timedOut: false });
    expect(sleeps).toEqual([1000, 2000, 3000]);
  });
  it("returns timedOut with the last value", async () => {
    let clock = 0;
    const r = await pollUntil(async () => "working", () => false, { intervalMs: 1000, timeoutMs: 2500, sleep: async (ms) => { clock += ms; }, now: () => clock });
    expect(r).toEqual({ value: "working", timedOut: true });
  });
  it("rethrows non-transient errors", async () => {
    await expect(pollUntil(async () => { throw new ApiError("nope", 404); }, () => true, { sleep: async () => {}, now: () => 0 })).rejects.toThrow("nope");
  });
});

describe("video --wait --out", () => {
  it("creates a session, sends the prompt, polls until idle and downloads the render without leaking the key", async () => {
    const thread = (status: string) => ({
      session: { id: "s1", title: "Teaser", status, freeVideo: true, lastActivityAt: "", archived: false },
      messages: [
        { id: "m1", role: "user", content: "teaser", status: "done", renderIds: [], error: null },
        { id: "m2", role: "assistant", content: status === "idle" ? "Here's your teaser." : "", status: status === "idle" ? "done" : "streaming", renderIds: [], error: null },
      ],
      renders: status === "idle" ? [{ id: "r1", version: 1, ratio: "9:16", seconds: 15, watermarked: true, messageId: "m2", posterKey: "p", createdAt: "" }] : [],
    });
    const m = mockFetch({
      "POST /api/studio/sessions": () => json({ session: { id: "s1" } }, 201),
      "POST /api/studio/sessions/s1/messages": () => json({}, 201),
      "GET /api/studio/sessions/s1": [() => json(thread("queued")), () => json(thread("working")), () => json(thread("idle"))],
      "GET /api/studio/media": () => new Response(null, { status: 302, headers: { location: "https://s3.test/bucket/v.mp4?sig=1" } }),
      "GET https://s3.test/bucket/v.mp4": () => new Response("MP4DATA", { headers: { "content-disposition": 'attachment; filename="ozzy-v1-9x16.mp4"' } }),
    });
    const out = await tempHome();
    const t = makeDeps(m.fetch);
    expect(await run(["video", "teaser", "--out", out, "--json"], t.deps)).toBe(EXIT.ok);
    const result = JSON.parse(t.out());
    expect(result).toMatchObject({ session_id: "s1", status: "idle", reply: "Here's your teaser.", video: { render_id: "r1", ratio: "9:16", seconds: 15, watermarked: true }, view_url: "https://k.test/studio/s1" });
    expect(await readdir(out)).toEqual(["ozzy-v1-9x16.mp4"]);
    expect(JSON.parse(m.calls[1]?.body ?? "")).toEqual({ content: "teaser", uploadIds: [] });
    const s3 = m.calls.find((c) => c.url.startsWith("https://s3.test"));
    expect(s3?.headers.authorization).toBeUndefined();
    expect(t.err()).toContain("Ozzy is");
    expect(t.sleeps.length).toBe(2);
  });

  it("uploads --file through the presigned PUT handshake first", async () => {
    const dir = await tempHome();
    const file = join(dir, "clip.mp4");
    await writeFile(file, "video-bytes");
    const m = mockFetch({
      "POST /api/studio/uploads": () => json({ upload: { id: "u1", filename: "clip.mp4", mime: "video/mp4", bytes: 11, status: "pending" }, putUrl: "https://s3.test/put/u1", headers: { "Content-Type": "video/mp4" } }, 201),
      "PUT https://s3.test/put/u1": () => new Response(null, { status: 200 }),
      "POST /api/studio/uploads/u1/complete": () => json({ upload: { id: "u1", filename: "clip.mp4", mime: "video/mp4", bytes: 11, status: "uploaded" } }),
    });
    const t = makeDeps(m.fetch);
    expect(await run(["upload", file, "--json"], t.deps)).toBe(EXIT.ok);
    expect(JSON.parse(t.out())).toMatchObject({ upload_id: "u1", status: "uploaded" });
    expect(JSON.parse(m.calls[0]?.body ?? "")).toEqual({ filename: "clip.mp4", mime: "video/mp4", bytes: 11 });
    expect(m.calls[1]).toMatchObject({ method: "PUT", url: "https://s3.test/put/u1" });
    expect(m.calls[1]?.headers.authorization).toBeUndefined();
  });
});

describe("pack --wait", () => {
  it("confirms the brand step and waits for a terminal status", async () => {
    const view = (status: string, ready: boolean) => ({
      id: "run1", url: "https://acme.test", status, isTrial: true, staticCount: 1, motionCount: 0, error: null, bonusPending: false,
      ads: [{ id: "ad1", index: 0, kind: "static", headline: "Hi", status: ready ? "ready" : "rendering", assets: ready ? [{ id: "as1", ratio: "1:1", mime: "image/png", previewUrl: "/p", downloadUrl: "/api/ads/assets/as1/download" }] : [] }],
    });
    const m = mockFetch({
      "POST /api/ads/runs": () => json({ runId: "run1", resumed: false }, 201),
      "GET /api/ads/runs/run1": [() => json(view("awaiting_confirm", false)), () => json(view("generating", false)), () => json(view("completed", true))],
      "POST /api/ads/runs/run1/confirm": () => json({ ok: true }),
    });
    const t = makeDeps(m.fetch);
    expect(await run(["pack", "acme.test", "--animated", "--wait", "--json"], t.deps)).toBe(EXIT.ok);
    expect(JSON.parse(m.calls[0]?.body ?? "")).toEqual({ url: "acme.test", motion: true });
    expect(m.calls.filter((c) => c.url.endsWith("/confirm"))).toHaveLength(1);
    expect(JSON.parse(t.out())).toMatchObject({ run_id: "run1", status: "completed", progress: { ready: 1, total: 1 }, ads: [{ assets: [{ asset_id: "as1", url: "https://k.test/api/ads/assets/as1/download" }] }] });
  });
});

describe("help", () => {
  it("prints per-command help", async () => {
    const t = makeDeps(mockFetch({}).fetch);
    expect(await run(["video", "--help"], t.deps)).toBe(EXIT.ok);
    expect(t.out()).toContain('komendly video "<prompt>"');
  });
});
