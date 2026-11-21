// MCP Apps ad gallery: resource registration, CSP, tool linkage. No DB (tools/list + resources/* only).
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildOzzyServer } from "../mcp-server";
import { AD_GALLERY_HTML, AD_GALLERY_URI, AD_GALLERY_TOOLS, adGalleryCsp, MCP_APP_MIME } from "../ad-gallery";

async function connect() {
  const server = buildOzzyServer({ origin: "https://www.komendly.com", headers: new Headers() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("ui://komendly/ad-gallery", () => {
  it("is listed and readable as an MCP App with a declared CSP", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources).toEqual(expect.arrayContaining([expect.objectContaining({ uri: AD_GALLERY_URI, mimeType: MCP_APP_MIME })]));
    const read = await client.readResource({ uri: AD_GALLERY_URI });
    const c = read.contents[0] as { uri: string; mimeType: string; text: string; _meta: { ui: { csp: { connectDomains: string[]; resourceDomains: string[] }; prefersBorder: boolean } } };
    expect(c).toMatchObject({ uri: AD_GALLERY_URI, mimeType: "text/html;profile=mcp-app" });
    expect(c.text).toMatch(/^<!DOCTYPE html>/);
    expect(c._meta.ui.prefersBorder).toBe(true);
    expect(c._meta.ui.csp.connectDomains).toEqual([]);
    expect(c._meta.ui.csp).toEqual(adGalleryCsp());
    await client.close();
  });

  it("links only the Ad Pack tools to the gallery and keeps their input schemas", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const t of tools) {
      const meta = (t._meta ?? {}) as Record<string, unknown>;
      if ((AD_GALLERY_TOOLS as readonly string[]).includes(t.name)) {
        expect(meta.ui).toMatchObject({ resourceUri: AD_GALLERY_URI });
        expect(meta["openai/outputTemplate"]).toBe(AD_GALLERY_URI);
        expect(t.annotations).toMatchObject({ readOnlyHint: t.name === "ads_get_run" });
      } else {
        expect(meta.ui).toBeUndefined();
      }
    }
    const create = tools.find((t) => t.name === "ads_create_pack");
    expect(Object.keys(create?.inputSchema.properties ?? {}).sort()).toEqual(["animated", "website_url"]);
    expect(create?.inputSchema.required).toEqual(["website_url"]);
    const get = tools.find((t) => t.name === "ads_get_run");
    expect(get?.inputSchema.required).toEqual(["run_id"]);
    await client.close();
  });

  it("is self-contained: no external scripts, styles or fetches, untrusted data rendered as text", () => {
    expect(AD_GALLERY_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(AD_GALLERY_HTML).not.toMatch(/<link[^>]+href=/i);
    expect(AD_GALLERY_HTML).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|innerHTML/);
    expect(AD_GALLERY_HTML).toContain("ui/initialize");
    expect(AD_GALLERY_HTML).toContain("ui/notifications/tool-result");
    expect(AD_GALLERY_HTML).toContain("ui/open-link");
    for (const label of ["Download", "Publish to Meta", "Upgrade"]) expect(AD_GALLERY_HTML).toContain(label);
  });

  it("allows images only from the https storage host", () => {
    expect(adGalleryCsp("https://t3.storageapi.dev", "kmd-ads", "")).toEqual({ connectDomains: [], resourceDomains: ["https://kmd-ads.t3.storageapi.dev"] });
    expect(adGalleryCsp("https://t3.storageapi.dev", "kmd-ads", "path").resourceDomains).toEqual(["https://t3.storageapi.dev"]);
    expect(adGalleryCsp("https://t3.storageapi.dev", "", "").resourceDomains).toEqual(["https://t3.storageapi.dev"]);
    expect(adGalleryCsp("https://t3.storageapi.dev", "kmd-ads", "").resourceDomains.some((d) => d.includes("*"))).toBe(false);
    expect(adGalleryCsp("http://localhost:9000").resourceDomains).toEqual([]);
    expect(adGalleryCsp("").resourceDomains).toEqual([]);
  });
});

describe("upgradePromptAllowed", () => {
  it("is off for ChatGPT (no upgrade promotion) and on for Claude, CLI and others", async () => {
    const { upgradePromptAllowed } = await import("../assistant");
    const agent = (clientName: string | null) => ({ user: {} as never, keyId: "k", via: "mcp" as const, auth: "oauth" as const, clientName });
    expect(upgradePromptAllowed(agent("ChatGPT"))).toBe(false);
    expect(upgradePromptAllowed(agent("OpenAI Apps"))).toBe(false);
    expect(upgradePromptAllowed(agent("Claude"))).toBe(true);
    expect(upgradePromptAllowed(agent(null))).toBe(true);
    expect(upgradePromptAllowed(null)).toBe(true);
  });
});
