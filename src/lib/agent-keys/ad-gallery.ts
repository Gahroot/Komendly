// MCP Apps UI (SEP-1865, "io.modelcontextprotocol/ui") for Ad Packs: `ui://komendly/ad-gallery` renders the result of
// ads_create_pack / ads_get_run beside the chat in Claude (interactive connectors) and ChatGPT (Apps SDK). Hosts without
// MCP Apps ignore the tool `_meta` and keep using the text + structuredContent. Self-contained HTML: no external scripts,
// styles or fonts; images/videos only from the ads storage host (declared CSP). Pure TS: no Next/Prisma/Node imports.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const AD_GALLERY_URI = "ui://komendly/ad-gallery";
export const MCP_APP_MIME = "text/html;profile=mcp-app";
/** Tools whose results the gallery renders (names and schemas unchanged; only `_meta` is added). */
export const AD_GALLERY_TOOLS = ["ads_create_pack", "ads_get_run"] as const;
/** Widget-only data on a tool result's `_meta` (the model never sees it): upgrade link for free accounts. */
export const GALLERY_RESULT_META = "komendly/gallery";

export interface McpUiCsp {
  connectDomains: string[];
  resourceDomains: string[];
}

/** Origins the ad images/videos load from: the S3-compatible storage endpoint (path and virtual-host style). Read at call time. */
export function adGalleryCsp(endpoint: string | undefined = process.env.S3_ENDPOINT): McpUiCsp {
  const resourceDomains: string[] = [];
  try {
    if (endpoint) {
      const u = new URL(endpoint);
      if (u.protocol === "https:") resourceDomains.push(u.origin, `https://*.${u.host}`);
    }
  } catch {
    // no storage endpoint configured: images can't load, the cards still show copy + links
  }
  return { connectDomains: [], resourceDomains };
}

/** Tool `_meta` linking a tool to the gallery: MCP Apps standard key, its deprecated flat alias, and ChatGPT's alias. */
export function adGalleryToolMeta(): Record<string, unknown> {
  return {
    ui: { resourceUri: AD_GALLERY_URI, visibility: ["model", "app"] },
    "ui/resourceUri": AD_GALLERY_URI,
    "openai/outputTemplate": AD_GALLERY_URI,
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "Working on your ads…",
    "openai/toolInvocation/invoked": "Here are your ads",
  };
}

/** `resources/read` content for the gallery. */
export function adGalleryContents() {
  const csp = adGalleryCsp();
  return {
    uri: AD_GALLERY_URI,
    mimeType: MCP_APP_MIME,
    text: AD_GALLERY_HTML,
    _meta: {
      ui: { csp, prefersBorder: true },
      // ChatGPT legacy equivalents (it prefers `ui.*`; kept for older ChatGPT clients).
      "openai/widgetCSP": { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
      "openai/widgetPrefersBorder": true,
      "openai/widgetDomain": "https://www.komendly.com",
      "openai/widgetDescription": "Shows the ads in a Komendly Ad Pack with their status, a download button per ad, and links to publish them to Meta or upgrade on komendly.com.",
    },
  };
}

export function registerAdGallery(server: McpServer): void {
  server.registerResource(
    "ad-gallery",
    AD_GALLERY_URI,
    { title: "Komendly ad gallery", description: "Interactive view of an Ad Pack: thumbnails, headlines, status, Download, Publish to Meta and Upgrade.", mimeType: MCP_APP_MIME },
    async () => ({ contents: [adGalleryContents()] }),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The view. Talks to the host with JSON-RPC over postMessage (ui/initialize, ui/notifications/tool-result, tools/call,
// ui/open-link, ui/notifications/size-changed); falls back to window.openai on older ChatGPT clients. All tool data is
// treated as untrusted: rendered with textContent, links limited to http(s).

const STYLE = `
:root{color-scheme:light dark;--bg:var(--color-background-primary,#fff);--bg2:var(--color-background-secondary,#f6f5fb);--fg:var(--color-text-primary,#16141f);--fg2:var(--color-text-secondary,#5d5a6b);--line:var(--color-border-primary,#e6e3f0);--brand:#5B3DF5;--radius:var(--border-radius-lg,14px);font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)}
:root[data-theme=dark]{--bg:var(--color-background-primary,#17161c);--bg2:var(--color-background-secondary,#211f29);--fg:var(--color-text-primary,#f4f3f8);--fg2:var(--color-text-secondary,#a9a6b8);--line:var(--color-border-primary,#34313f)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg)}body{padding:16px;font-size:14px;line-height:1.4}
.head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.logo{width:28px;height:28px;border-radius:8px;background:var(--brand);color:#fff;font-weight:700;display:grid;place-items:center;flex:none}
.title{font-weight:650;font-size:15px}.site{color:var(--fg2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
.pill{margin-left:auto;font-size:12px;padding:3px 10px;border-radius:999px;background:var(--bg2);border:1px solid var(--line);white-space:nowrap}.pill.ok{color:#127a3e}.pill.bad{color:#b42318}
.bar{height:4px;border-radius:4px;background:var(--bg2);overflow:hidden;margin:0 0 14px}.bar i{display:block;height:100%;background:var(--brand)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.card{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--bg);display:flex;flex-direction:column}
.thumb{position:relative;background:var(--bg2);aspect-ratio:4/5;display:grid;place-items:center;color:var(--fg2);font-size:12px}.thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff}
.body{padding:10px 12px;display:flex;flex-direction:column;gap:6px;flex:1}.hl{font-weight:600}.copy{color:var(--fg2);font-size:12.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
button{font:inherit;font-size:13px;border-radius:10px;padding:7px 12px;cursor:pointer;border:1px solid var(--line);background:var(--bg);color:var(--fg)}button:disabled{opacity:.55;cursor:default}
button.primary{background:var(--brand);border-color:var(--brand);color:#fff}button.up{background:#16141f;border-color:#16141f;color:#fff}:root[data-theme=dark] button.up{background:#fff;color:#16141f}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}.note{color:var(--fg2);font-size:12px;margin-top:10px}.err{color:#b42318}
.empty{padding:28px 8px;text-align:center;color:var(--fg2)}`;

const SCRIPT = `
(function(){
"use strict";
var SETTLED={completed:1,partial:1,failed:1,canceled:1};
var LABEL={queued:"Queued",extracting:"Reading the website",awaiting_confirm:"Checking the brand",generating:"Making ads",rendering:"Making ads",completed:"Ready",partial:"Partly ready",failed:"Failed",canceled:"Canceled",ready:"Ready",failed_qc:"Didn't pass QC",pending:"Waiting",working:"Making"};
var state={data:null,meta:null,isError:false,input:null,busy:false,hostCaps:{}};
var nextId=1,pending={};
var root=document.getElementById("app");

function label(s){return LABEL[s]||String(s||"").replace(/_/g," ");}
function safeUrl(u){try{var x=new URL(String(u));return x.protocol==="https:"||x.protocol==="http:"?x.toString():null;}catch(e){return null;}}
function el(tag,attrs,kids){var n=document.createElement(tag);if(attrs)for(var k in attrs){var v=attrs[k];if(v==null||v===false)continue;if(k==="text")n.textContent=String(v);else if(k==="onclick")n.addEventListener("click",v);else n.setAttribute(k,v===true?"":String(v));}(kids||[]).forEach(function(c){if(c)n.appendChild(c);});return n;}

function post(msg){try{window.parent.postMessage(msg,"*");}catch(e){}}
function request(method,params){var id=nextId++;post({jsonrpc:"2.0",id:id,method:method,params:params||{}});return new Promise(function(res,rej){pending[id]={res:res,rej:rej};setTimeout(function(){if(pending[id]){delete pending[id];rej(new Error("timeout"));}},60000);});}
function notify(method,params){post({jsonrpc:"2.0",method:method,params:params||{}});}

function openLink(url){var u=safeUrl(url);if(!u)return;request("ui/open-link",{url:u}).catch(function(){var o=window.openai;if(o&&typeof o.openExternal==="function")o.openExternal({href:u});else window.open(u,"_blank","noopener");});}

function setResult(r){if(!r||typeof r!=="object")return;state.isError=!!r.isError;state.data=r.structuredContent||null;state.meta=(r._meta&&r._meta["${GALLERY_RESULT_META}"])||null;render();}

function refresh(){var d=state.data;if(!d||!d.run_id||state.busy)return;state.busy=true;render();
 var call=window.openai&&typeof window.openai.callTool==="function"&&!state.hostCaps.serverTools?window.openai.callTool("ads_get_run",{run_id:d.run_id}):request("tools/call",{name:"ads_get_run",arguments:{run_id:d.run_id}});
 Promise.resolve(call).then(function(r){state.busy=false;setResult(r);}).catch(function(){state.busy=false;render();});}

function bestAsset(ad){var a=(ad.assets||[]).filter(function(x){return x&&safeUrl(x.url);});var jpg=a.filter(function(x){return x.mime==="image/jpeg";})[0];return jpg||a[0]||null;}
function anyAsset(ad){return (ad.assets||[])[0]||null;}

function card(ad,gated){
 var a=bestAsset(ad),shape=anyAsset(ad),thumb=el("div",{class:"thumb"});
 if(shape&&shape.width&&shape.height)thumb.style.aspectRatio=shape.width+"/"+shape.height;
 if(a&&String(a.mime).indexOf("video/")===0){var v=el("video",{src:safeUrl(a.url),muted:true,autoplay:true,loop:true,playsinline:true});v.muted=true;thumb.appendChild(v);}
 else if(a)thumb.appendChild(el("img",{src:safeUrl(a.url),alt:ad.headline||"Ad",loading:"lazy"}));
 else thumb.appendChild(el("span",{text:ad.locked?"Locked: upgrade to unlock":ad.status==="ready"?(gated?"Verify your email to download":"Preview on Komendly"):label(ad.status)+"…"}));
 thumb.appendChild(el("span",{class:"badge",text:ad.locked?"Locked":label(ad.status)}));
 var dl=el("button",{text:"Download",disabled:!a,title:a?(a.filename||"Download"):"Not downloadable yet",onclick:function(){if(a)openLink(a.url);}});
 return el("div",{class:"card"},[thumb,el("div",{class:"body"},[el("div",{class:"hl",text:ad.headline||"Untitled ad"}),ad.primary_text?el("div",{class:"copy",text:ad.primary_text}):null,el("div",{class:"row"},[dl])])]);
}

function render(){
 root.textContent="";var d=state.data;
 if(!d){root.appendChild(el("div",{class:"empty",text:state.input&&state.input.website_url?"Komendly is reading "+state.input.website_url+"…":"Waiting for your Ad Pack…"}));return size();}
 var upgrade=safeUrl((state.meta&&state.meta.upgrade_url)||d.upgrade_url);
 if(state.isError||(!d.run_id&&d.error)){
  root.appendChild(el("div",{class:"head"},[el("div",{class:"logo",text:"K"}),el("div",{class:"title",text:"Komendly"})]));
  root.appendChild(el("div",{class:"note err",text:String(d.error||"Something went wrong.")}));
  if(upgrade)root.appendChild(el("div",{class:"actions"},[el("button",{class:"up",text:"Upgrade",onclick:function(){openLink(upgrade);}})]));
  return size();
 }
 var p=d.progress||{},ready=p.ready||0,total=p.total||0,settled=!!SETTLED[d.status];
 var cls=d.status==="completed"?"pill ok":d.status==="failed"||d.status==="canceled"?"pill bad":"pill";
 root.appendChild(el("div",{class:"head"},[el("div",{class:"logo",text:"K"}),el("div",{},[el("div",{class:"title",text:"Your Ad Pack"}),el("div",{class:"site",text:d.website||""})]),el("span",{class:cls,text:label(d.status)+" · "+ready+"/"+total+" ready"})]));
 var bar=el("div",{class:"bar"},[el("i")]);bar.firstChild.style.width=(total?Math.round(100*ready/total):settled?100:8)+"%";root.appendChild(bar);
 var ads=Array.isArray(d.ads)?d.ads:[];
 if(ads.length){var g=el("div",{class:"grid"});ads.forEach(function(ad){if(ad&&typeof ad==="object")g.appendChild(card(ad,!!d.download_note));});root.appendChild(g);}
 else root.appendChild(el("div",{class:"empty",text:settled?"No ads in this pack.":"Your ads are being made. This takes a few minutes."}));
 var view=safeUrl(d.view_url),acts=el("div",{class:"actions"});
 if(view)acts.appendChild(el("button",{class:"primary",text:"Publish to Meta",disabled:!ready,title:ready?"Opens this pack on komendly.com to publish it":"Available when an ad is ready",onclick:function(){openLink(view);}}));
 if(upgrade)acts.appendChild(el("button",{class:"up",text:"Upgrade",onclick:function(){openLink(upgrade);}}));
 if(!settled)acts.appendChild(el("button",{text:state.busy?"Checking…":"Refresh",disabled:state.busy,onclick:refresh}));
 root.appendChild(acts);
 if(d.download_note)root.appendChild(el("div",{class:"note",text:String(d.download_note)}));
 if(d.error)root.appendChild(el("div",{class:"note err",text:String(d.error)}));
 if(ready&&d.links_expire_at)root.appendChild(el("div",{class:"note",text:"Download links work for 7 days."}));
 size();
}

var lastH=0;function size(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h&&h!==lastH){lastH=h;notify("ui/notifications/size-changed",{height:h});}}
if(typeof ResizeObserver==="function")new ResizeObserver(size).observe(document.documentElement);

function applyContext(c){if(!c)return;if(c.theme)document.documentElement.setAttribute("data-theme",c.theme);var v=c.styles&&c.styles.variables;if(v)for(var k in v){if(v[k]!=null&&k.indexOf("--")===0)document.documentElement.style.setProperty(k,String(v[k]));}}

window.addEventListener("message",function(ev){
 if(ev.source!==window.parent)return;var m=ev.data;if(!m||m.jsonrpc!=="2.0")return;
 if(m.id!=null&&!m.method&&pending[m.id]){var p=pending[m.id];delete pending[m.id];if(m.error)p.rej(new Error(m.error.message||"error"));else p.res(m.result);return;}
 if(m.method==="ui/notifications/tool-input"){state.input=(m.params&&m.params.arguments)||null;if(!state.data)render();}
 else if(m.method==="ui/notifications/tool-result")setResult(m.params);
 else if(m.method==="ui/notifications/host-context-changed")applyContext(m.params);
 else if(m.method==="ui/resource-teardown"&&m.id!=null)post({jsonrpc:"2.0",id:m.id,result:{}});
 else if(m.method==="ping"&&m.id!=null)post({jsonrpc:"2.0",id:m.id,result:{}});
});

// Older ChatGPT clients: window.openai globals instead of the bridge.
function fromOpenAI(){var o=window.openai;if(!o)return;applyContext({theme:o.theme});if(o.toolInput&&!state.input)state.input=o.toolInput;if(o.toolOutput)setResult({structuredContent:o.toolOutput,_meta:o.toolResponseMetadata||undefined});}
window.addEventListener("openai:set_globals",fromOpenAI);

render();
request("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"komendly-ad-gallery",version:"1.0.0"},appCapabilities:{availableDisplayModes:["inline"]},clientInfo:{name:"komendly-ad-gallery",version:"1.0.0"},capabilities:{}})
 .then(function(r){r=r||{};state.hostCaps=r.hostCapabilities||{};applyContext(r.hostContext);notify("ui/notifications/initialized",{});render();})
 .catch(function(){fromOpenAI();});
fromOpenAI();
})();`;

export const AD_GALLERY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Komendly ad gallery</title>
<style>${STYLE}</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<script>${SCRIPT}</script>
</body>
</html>`;
