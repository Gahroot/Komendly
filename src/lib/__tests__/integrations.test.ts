import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTEGRATIONS, INTEGRATION_PATHS, INTEGRATION_STATUS, MCP_TOOLS, statusLine } from "@/lib/integrations";

describe("integrations config", () => {
  it("has unique slugs and titles", () => {
    expect(new Set(INTEGRATIONS.map((i) => i.slug)).size).toBe(INTEGRATIONS.length);
    expect(new Set(INTEGRATIONS.map((i) => i.title)).size).toBe(INTEGRATIONS.length);
    for (const i of INTEGRATIONS) expect(i.title).not.toMatch(/\| Komendly/);
  });
  it("no directory listing claimed yet", () => {
    for (const i of INTEGRATIONS) {
      expect(INTEGRATION_STATUS[i.slug].listed).toBe(false);
      expect(statusLine(i.slug)).not.toMatch(/official|approved|\blisted\b/i);
    }
    expect(statusLine("shopify")).toMatch(/in review/);
    expect(statusLine("chatgpt")).toMatch(/custom connector/);
  });
  it("sitemap and llms.txt include every integration page", () => {
    expect(INTEGRATION_PATHS).toEqual(["/integrations", "/integrations/chatgpt", "/integrations/claude", "/integrations/shopify"]);
    expect(readFileSync("src/app/sitemap.ts", "utf8")).toContain("...INTEGRATION_PATHS.map");
    expect(readFileSync("src/lib/seo/llms.ts", "utf8")).toContain("INTEGRATIONS.map");
  });
  it("lists only tools the MCP server registers", () => {
    const src = readFileSync("src/lib/agent-keys/mcp-server.ts", "utf8");
    for (const t of MCP_TOOLS) for (const n of t.name.split(" / ")) expect(src).toContain(`"${n}"`);
  });
});
