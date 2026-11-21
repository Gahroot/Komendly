// @ts-nocheck -- local dev harness (needs playwright, not a web dependency); run with npx tsx.
// Local MCP Apps host harness for ui://komendly/ad-gallery (no DB, no network, no sign-in).
// Reads the widget over MCP from the real server (tools/list + resources/read via an in-memory transport), then hosts it
// the way Claude/ChatGPT do: sandboxed iframe + CSP built from `_meta.ui.csp`, JSON-RPC over postMessage (ui/initialize,
// tool-input, tool-result, tools/call, ui/open-link, size-changed). Tool results are fixtures shaped like ads_get_run.
// Writes screenshots to docs/ai-assistants/screenshots/. Run: npx tsx --env-file=.env.local scripts/ad-gallery-harness.ts (S3_ENDPOINT -> CSP)
// Needs Playwright's Chromium (uses engine/node_modules/playwright; nothing is installed).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildOzzyServer } from "@/lib/agent-keys/mcp-server";

const root = process.cwd();
const out = path.join(root, "docs/ai-assistants/screenshots");
const { chromium } = createRequire(path.join(root, "engine/package.json"))("playwright") as typeof import("playwright");

// Stand-in for the ads storage host: serves the sample ads over http so the widget treats them like real presigned links.
const PORT = 4791;
const FIXTURE_ORIGIN = `http://127.0.0.1:${PORT}`;
const files = createServer((req, res) => {
  const name = path.basename(new URL(req.url ?? "/", FIXTURE_ORIGIN).pathname);
  try {
    res.writeHead(200, { "content-type": "image/jpeg" }).end(readFileSync(path.join(root, "public/ads/samples", name)));
  } catch {
    res.writeHead(404).end();
  }
});
const img = (f: string) => `${FIXTURE_ORIGIN}/${f}?X-Amz-Expires=604800`;
const view = "https://www.komendly.com/ads/runs/cmdemo123?utm_source=ai_assistant&utm_medium=assistant&utm_campaign=claude";
const upgrade = "https://www.komendly.com/pricing?utm_source=ai_assistant&utm_campaign=claude";
const ad = (i: number, status: string, headline: string, body: string, file: string | null) => ({
  ad_id: `ad${i}`, kind: "static", status, headline, primary_text: body, cta: "Get quote", cta_type: "GET_QUOTE", awareness: "problem_aware", angle: "", landing_url: "https://maxteriors.example.com/",
  assets: [{ asset_id: `as${i}`, ratio: "1:1", mime: "image/jpeg", width: 900, height: 900, url: file ? img(file) : null, filename: `ad-0${i + 1}-1x1.jpg`, placements: ["feed"] }],
});
const ADS = [
  ["Holiday lights, no ladder", "Permanent outdoor lights installed by a local, insured crew. Free quote in 24 hours.", "maxteriors-ad-0.jpg"],
  ["Lights up before the first frost", "Book your install this week: we design, mount and set the app up for you.", "maxteriors-ad-4.jpg"],
  ["Already bought Govee lights?", "We install customer-supplied Govee Permanent Outdoor Lights. Request a time.", "maxteriors-ad-8.jpg"],
] as const;
const base = { run_id: "cmdemo123", website: "https://maxteriors.example.com/", landing_url: "https://maxteriors.example.com/", links_expire_at: new Date(Date.now() + 7 * 864e5).toISOString(), view_url: view };
const ready = { structuredContent: { ...base, status: "completed", progress: { ready: 3, total: 3 }, ads: ADS.map(([h, b, f], i) => ad(i, "ready", h, b, f)) }, _meta: { "komendly/gallery": { upgrade_url: upgrade } } };
const working = { structuredContent: { ...base, status: "generating", progress: { ready: 1, total: 3 }, ads: ADS.map(([h, b, f], i) => ad(i, i === 0 ? "ready" : "generating", h, b, i === 0 ? f : null)) }, _meta: { "komendly/gallery": { upgrade_url: upgrade } } };

function cspFor(csp: { connectDomains?: string[]; resourceDomains?: string[] }): string {
  const r = (csp.resourceDomains ?? []).join(" ");
  const c = (csp.connectDomains ?? []).join(" ") || "'none'";
  return `default-src 'none'; script-src 'unsafe-inline' ${r}; style-src 'unsafe-inline' ${r}; img-src data: ${r}; media-src data: ${r}; font-src ${r}; connect-src ${c}; frame-src 'none'; object-src 'none'; base-uri 'self'`;
}

const HOST = `<!doctype html><html><body style="margin:0;padding:24px;background:BG;font-family:system-ui">
<div style="max-width:760px;margin:0 auto"><div style="color:FG;font-size:14px;margin:0 0 10px">USER</div>
<iframe id="v" sandbox="allow-scripts" style="width:100%;border:1px solid #ddd;border-radius:16px;height:200px;background:transparent"></iframe></div>
<script>
window.__log=[];const f=document.getElementById("v");
const send=(m)=>f.contentWindow.postMessage(m,"*");
window.addEventListener("message",(e)=>{if(e.source!==f.contentWindow)return;const m=e.data;window.__log.push(m);
 if(m.method==="ui/initialize")send({jsonrpc:"2.0",id:m.id,result:{protocolVersion:"2026-01-26",hostInfo:{name:"harness",version:"1"},hostCapabilities:{openLinks:{},serverTools:{}},hostContext:{theme:THEME,displayMode:"inline",containerDimensions:{maxWidth:760,maxHeight:2000}}}});
 else if(m.method==="ui/notifications/initialized"){send({jsonrpc:"2.0",method:"ui/notifications/tool-input",params:{arguments:{run_id:"cmdemo123"}}});send({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:window.__result});}
 else if(m.method==="ui/notifications/size-changed"&&m.params.height)f.style.height=m.params.height+"px";
 else if(m.method==="ui/open-link")send({jsonrpc:"2.0",id:m.id,result:{}});
 else if(m.method==="tools/call")send({jsonrpc:"2.0",id:m.id,result:window.__next});
});
</script></body></html>`;

async function main() {
  const server = buildOzzyServer({ origin: "https://www.komendly.com", headers: new Headers() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "harness", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "ads_get_run");
  const uri = (tool?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
  if (!uri) throw new Error("ads_get_run has no _meta.ui.resourceUri");
  const res = (await client.readResource({ uri })).contents[0] as { mimeType: string; text: string; _meta: { ui: { csp: { connectDomains: string[]; resourceDomains: string[] } } } };
  console.log(`tools/list: ads_get_run -> ${uri}; resources/read: ${res.mimeType}, ${res.text.length} chars, csp`, JSON.stringify(res._meta.ui.csp));
  await client.close();
  await new Promise<void>((r) => files.listen(PORT, "127.0.0.1", r));
  // Declared CSP + the fixture host standing in for the storage host.
  const csp = { ...res._meta.ui.csp, resourceDomains: [...res._meta.ui.csp.resourceDomains, FIXTURE_ORIGIN] };
  const html = res.text.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${cspFor(csp)}">`);

  const browser = await chromium.launch();
  const errors: string[] = [];
  const shot = async (name: string, theme: "light" | "dark", result: unknown, next: unknown, user: string) => {
    const page = await browser.newPage({ viewport: { width: 820, height: 600 }, deviceScaleFactor: 2 });
    page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    await page.setContent(HOST.replace("BG", theme === "dark" ? "#212121" : "#fff").replace("FG", theme === "dark" ? "#eee" : "#333").replace("THEME", JSON.stringify(theme)).replace("USER", user));
    await page.evaluate(([r, n, h]) => { (window as unknown as Record<string, unknown>).__result = r; (window as unknown as Record<string, unknown>).__next = n; (document.getElementById("v") as HTMLIFrameElement).srcdoc = h as string; }, [result, next, html] as const);
    await page.waitForFunction(() => (window as unknown as { __log: { method?: string }[] }).__log.some((m) => m.method === "ui/notifications/size-changed"));
    await page.waitForTimeout(600);
    await page.locator("#v").screenshot({ path: path.join(out, `${name}.png`) });
    return page;
  };

  const p1 = await shot("ad-gallery-ready", "light", ready, ready, "You: Make Facebook ads for maxteriors.example.com · Claude called ads_get_run");
  const frame = p1.frameLocator("#v");
  await frame.getByRole("button", { name: "Download" }).first().click();
  await frame.getByRole("button", { name: "Publish to Meta" }).click();
  await frame.getByRole("button", { name: "Upgrade" }).click();
  await p1.waitForFunction(() => (window as unknown as { __log: { method?: string }[] }).__log.filter((m) => m.method === "ui/open-link").length >= 3, undefined, { timeout: 5000 }).catch(() => undefined);
  const links = await p1.evaluate(() => (window as unknown as { __log: { method?: string; params?: { url?: string } }[] }).__log.filter((m) => m.method === "ui/open-link").map((m) => String(m.params?.url).slice(0, 60)));
  console.log("ui/open-link:", links);
  if (links.length !== 3 || !links[1]?.includes("/ads/runs/") || !links[2]?.includes("utm_source=ai_assistant")) throw new Error("buttons did not open the expected links");

  const p2 = await shot("ad-gallery-in-progress", "dark", working, ready, "You: Are my ads ready yet? · ChatGPT called ads_get_run");
  await p2.frameLocator("#v").getByRole("button", { name: "Refresh" }).click();
  await p2.frameLocator("#v").getByText("Ready · 3/3 ready").waitFor();
  await p2.waitForTimeout(400);
  await p2.waitForFunction(() => { const f = document.getElementById("v") as HTMLIFrameElement; return f.getBoundingClientRect().height > 300; });
  await p2.locator("#v").screenshot({ path: path.join(out, "ad-gallery-after-refresh.png") });
  console.log("Refresh -> tools/call ads_get_run -> re-rendered 3/3");
  const paywall = { isError: true, content: [{ type: "text", text: "You've used your free trial. Pick a plan to generate more ads. Upgrade or top up: " + upgrade }], structuredContent: { error: "You've used your free trial. Pick a plan to generate more ads.", code: "trial_used", upgrade_url: upgrade } };
  const p3 = await shot("ad-gallery-upgrade", "light", paywall, paywall, "You: Make another ad pack for my second location · Claude called ads_create_pack");
  await p3.frameLocator("#v").getByRole("button", { name: "Upgrade" }).waitFor();
  await browser.close();
  files.close();
  if (errors.length) throw new Error(`widget errors:\n${errors.join("\n")}`);
  console.log(`screenshots in ${path.relative(root, out)}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
