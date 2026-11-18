// Embedded Shopify admin page (vanilla JS on App Bridge; every API call carries the session token).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function shopifyAppHtml(apiKey: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="shopify-api-key" content="${esc(apiKey)}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>Komendly: free ads from your store</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"San Francisco","Segoe UI",Roboto,sans-serif;background:#f1f1f1;color:#303030;margin:0;padding:16px}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.12);padding:16px;margin:0 auto 16px;max-width:960px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 12px}p{margin:0 0 12px;line-height:1.45}
button,.btn{background:#303030;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary{background:#fff;color:#303030;box-shadow:inset 0 0 0 1px #c9c9c9}button:disabled{opacity:.5;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.prod{border:1px solid #e3e3e3;border-radius:10px;padding:8px}
.prod img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:#f6f6f6}.prod div{font-size:13px;margin:6px 0;min-height:34px}
.muted{color:#616161;font-size:13px}.banner{background:#fff4d6;border-radius:10px;padding:12px;margin-bottom:12px}.err{background:#fee9e8}
.plans{display:flex;gap:12px;flex-wrap:wrap}.plan{flex:1;min-width:220px;border:1px solid #e3e3e3;border-radius:10px;padding:12px}
</style></head><body>
<div class="card"><h1>Free ads from your store</h1><p class="muted">Komendly reads your storefront and products (read-only) and makes ready-to-post ad creatives. Your first pack is free.</p><div id="msg"></div></div>
<div class="card" id="make" hidden><h2>1. Make ads from your whole store</h2><p class="muted" id="storeUrl"></p><button id="storeBtn">Make free ads from my store</button></div>
<div class="card" id="products" hidden><h2>2. Or pick a product</h2><div class="grid" id="grid"><p class="muted">Loading products...</p></div></div>
<div class="card" id="status" hidden><h2>Your ads</h2><p id="statusText"></p><a class="btn" id="openBtn" target="_blank" rel="noopener" hidden>Open my ads</a></div>
<div class="card" id="billing" hidden><h2>Plans (billed by Shopify)</h2><p class="muted" id="planNow"></p><div class="plans" id="plans"></div></div>
<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  function show(id){$(id).hidden=false}
  function note(text,isErr){$("msg").innerHTML="";var d=document.createElement("div");d.className="banner"+(isErr?" err":"");d.textContent=text;$("msg").appendChild(d)}
  async function api(body){
    var token=await shopify.idToken();
    var r=await fetch("/api/shopify/app",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(body)});
    var j=await r.json().catch(function(){return {}});
    if(!r.ok) throw new Error(j.error||j.message||("Error "+r.status));
    return j;
  }
  var pollTimer=null;
  function poll(runId){
    show("status");clearTimeout(pollTimer);
    api({action:"run",runId:runId}).then(function(s){
      var done=["completed","partial"].indexOf(s.status)>=0, failed=["failed","canceled"].indexOf(s.status)>=0;
      $("statusText").textContent=failed?"This run stopped. Try again or pick another product.":done?("Ready: "+s.readyAds+" ads. Open them to download or edit."):("Ozzy is making your ads ("+s.status+", "+s.readyAds+" ready so far). This takes a few minutes; you can leave and come back.");
      var a=$("openBtn");a.href=s.openUrl;a.hidden=false;
      if(!done&&!failed) pollTimer=setTimeout(function(){poll(runId)},8000);
    }).catch(function(e){note(e.message,true)});
  }
  function start(url,btn){
    btn.disabled=true;
    api({action:"start",url:url}).then(function(r){note("Started! Your ads are being made.");poll(r.runId)}).catch(function(e){note(e.message,true)}).finally(function(){btn.disabled=false});
  }
  function render(s){
    show("make");show("billing");show("products");
    $("storeUrl").textContent=s.storeUrl||"";
    $("storeBtn").onclick=function(){start(s.storeUrl,$("storeBtn"))};
    $("planNow").textContent=s.paid?("Current plan: "+s.plan+" · "+s.credits+" credits"):(s.trialAvailable?"You're on the free trial: your first ad pack is free.":"Free pack used. Pick a plan to keep making ads.");
    var p=$("plans");p.innerHTML="";
    s.plans.forEach(function(pl){
      var d=document.createElement("div");d.className="plan";
      var h=document.createElement("strong");h.textContent=pl.name;d.appendChild(h);
      var t=document.createElement("p");t.className="muted";t.textContent="$"+(pl.priceCents/100)+" / 30 days · "+pl.credits+" credits";d.appendChild(t);
      var b=document.createElement("button");b.textContent=s.plan===pl.key&&s.paid?"Current plan":"Choose";b.disabled=s.plan===pl.key&&s.paid;
      b.onclick=function(){b.disabled=true;api({action:"subscribe",plan:pl.key}).then(function(r){open(r.confirmationUrl,"_top")}).catch(function(e){note(e.message,true);b.disabled=false})};
      d.appendChild(b);p.appendChild(d);
    });
    if(s.runs&&s.runs[0]) poll(s.runs[0].id);
  }
  async function boot(){
    try{
      var s=await api({action:"session"});
      if(s.unavailable){note(s.message);return}
      if(s.installed) note("Welcome! Make your first free ad pack below.");
      render(s);
      api({action:"sync"}).then(render).catch(function(){});
      api({action:"products"}).then(function(r){
        var g=$("grid");g.innerHTML="";
        if(!r.products.length){g.innerHTML='<p class="muted">No published products yet. Use your whole store above.</p>';return}
        r.products.forEach(function(pr){
          var d=document.createElement("div");d.className="prod";
          if(pr.image){var i=document.createElement("img");i.src=pr.image;i.alt=pr.title;d.appendChild(i)}
          var t=document.createElement("div");t.textContent=pr.title;d.appendChild(t);
          var b=document.createElement("button");b.className="secondary";b.textContent="Make ads";b.onclick=function(){start(pr.url,b)};d.appendChild(b);
          g.appendChild(d);
        });
      }).catch(function(e){$("grid").textContent=e.message});
    }catch(e){note(e.message,true)}
  }
  boot();
})();
</script></body></html>`;
}
