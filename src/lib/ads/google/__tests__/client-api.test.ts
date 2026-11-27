import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleApiError, googleApi, plainServerError } from "../client-api";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("googleApi", () => {
  it("GETs status with the run id", async () => {
    const f = reply(200, { available: true, connection: null, publishes: [] });
    vi.stubGlobal("fetch", f);
    const s = await googleApi.status("run 1");
    expect(s.available).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/ads/google/status?runId=run%201", expect.objectContaining({ method: "GET" }));
  });
  it("POSTs JSON bodies", async () => {
    const f = reply(200, { status: "pending", acceptUrl: "https://ads.google.com" });
    vi.stubGlobal("fetch", f);
    await googleApi.managerLink("123-456-7890");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ customerId: "123-456-7890" });
  });
  it("uses a plain server sentence and keeps the code", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Your ads are already being created.", code: "busy" }));
    await expect(googleApi.publish({} as never)).rejects.toMatchObject({ message: "Your ads are already being created.", status: 409, code: "busy" });
  });
  it("hides raw errors behind the fallback", async () => {
    vi.stubGlobal("fetch", reply(500, { error: "TypeError: Cannot read properties of undefined\n    at x (y.js:1)" }));
    await expect(googleApi.activate("p1", "enable")).rejects.toThrow("We couldn't start your ads.");
  });
  it("turns network failures into a plain message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const e = await googleApi.accounts().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(GoogleApiError);
    expect((e as GoogleApiError).message).toMatch(/couldn't reach Komendly/);
  });
  it("plainServerError rejects codes and JSON", () => {
    expect(plainServerError("not_connected", "fb")).toBe("fb");
    expect(plainServerError('{"a":1}', "fb")).toBe("fb");
    expect(plainServerError("Pick a Google Ads account first.", "fb")).toBe("Pick a Google Ads account first.");
  });
});
