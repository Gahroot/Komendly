// Chrome Web Store assets -> store/: two 1280x800 screenshots and the 440x280 promo tile, rendered with Playwright.
// Sources: e2e-out/popup.png (screenshot 1 is a mock page with made-up businesses, no third-party brands) (run `npm run build && node scripts/e2e.mjs` first).
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "store");
mkdirSync(out, { recursive: true });
const src = (f) => {
  const p = join(root, f);
  if (!existsSync(p)) throw new Error(`missing ${f}: run npm run build && node scripts/e2e.mjs`);
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
};
const popup = src("e2e-out/popup.png");
const icon = src("icons/icon-128.png");

const base = `*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%}body{background:#0c0820;color:#f6eee2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow:hidden}
.gold{color:#ffcf4a}.muted{color:#b9b0d0}.note{position:absolute;right:28px;bottom:18px;font-size:14px;color:#8f86aa}`;

const shots = [
  {
    file: "screenshot-1-ad-library-1280x800.png", w: 1280, h: 800,
    html: `<style>${base}
      .top{height:132px;display:flex;align-items:center;gap:20px;padding:0 48px}
      .top img{width:64px;height:64px;border-radius:14px}
      h1{font-size:40px;line-height:1.1;letter-spacing:-.02em}p{font-size:20px;margin-top:6px}
      .page{position:absolute;left:64px;top:132px;width:1152px;height:700px;border-radius:14px 14px 0 0;background:#f0f2f5;color:#1c1e21;padding:22px 26px;box-shadow:0 20px 60px #000a}
      .page h2{font-size:20px;font-weight:700}.page .sub{font-size:14px;color:#65676b;margin:4px 0 16px}
      .cards{display:flex;gap:18px}.card{flex:1;background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px #0003}
      .adv{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}.av{width:36px;height:36px;border-radius:50%}
      .id{font-size:12px;color:#65676b;margin:2px 0 8px;font-weight:400}.txt{font-size:14px;line-height:1.35;margin:8px 0}
      .img{height:200px;border-radius:8px;display:flex;align-items:flex-end;padding:14px;font-size:22px;font-weight:800;color:#fff;line-height:1.1}
      .btn{margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:#0c0820;color:#ffcf4a;border:1px solid #7b3cf0;font-weight:700;font-size:14px}
      .btn img{width:20px;height:20px;border-radius:4px}.btn small{color:#cbbcff;font-size:11px;font-weight:500}
      .lib{margin-top:12px;font-size:12px;color:#65676b}</style>
      <div class="top"><img src="${icon}"><div><h1>A <span class="gold">Remake for my business</span> button on every ad</h1>
      <p class="muted">Find an ad you like in the Meta Ad Library. One click opens Komendly with it and your website.</p></div></div>
      <div class="page"><h2>Ad Library: results for "plumber"</h2><div class="sub">Example ads from made-up businesses</div>
      <div class="cards">
      ${[["Brightline Plumbing","#2b6cb0,#63b3ed","Fast fixes. Fair prices.","Leaky tap? Blocked drain? Book a local plumber today.","#4a90d9"],
         ["Summit Roofing Co.","#c05621,#f6ad55","Free roof inspection","Storm damage? We check your roof for free and show you photos.","#dd6b20"],
         ["Sparkle Home Cleaning","#2f855a,#68d391","First clean 20% off","Weekly or one-off cleans by a friendly local team.","#38a169"]]
        .map(([n,g,h,t,c],i)=>`<div class="card"><div class="adv"><div class="av" style="background:${c}"></div><div>${n}<div class="id">Sponsored</div></div></div>
        <div class="txt">${t}</div><div class="img" style="background:linear-gradient(135deg,${g})">${h}</div>
        <div class="btn"><img src="${icon}"><span>Remake for my business</span><small>· Komendly</small></div>
        <div class="lib">Library ID: 10000000000${i+1}</div></div>`).join("")}
      </div></div><div class="note" style="top:14px;bottom:auto">Not affiliated with Meta.</div>`,
  },
  {
    file: "screenshot-2-popup-1280x800.png", w: 1280, h: 800,
    html: `<style>${base}
      .wrap{display:flex;align-items:center;gap:72px;height:800px;padding:0 96px}
      .copy{flex:1}.copy img{width:80px;height:80px;border-radius:16px}
      h1{font-size:48px;line-height:1.08;letter-spacing:-.02em;margin-top:24px}
      ul{margin-top:28px;padding-left:24px;font-size:22px;line-height:1.6}
      .pop{width:465px;height:700px;border:1px solid #3d2f70;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px #000a}
      .pop img{width:465px;display:block}</style>
      <div class="wrap"><div class="copy"><img src="${icon}"><h1>Save your website <span class="gold">once</span></h1>
      <ul class="muted"><li>Stored in your Chrome profile only</li><li>Every Remake button uses it</li><li>Shortcut to the free Meta ad check</li><li>Free. No tracking.</li></ul></div>
      <div class="pop"><img src="${popup}"></div></div><div class="note">Not affiliated with Meta.</div>`,
  },
  {
    file: "promo-tile-440x280.png", w: 440, h: 280,
    html: `<style>${base}
      body{background:radial-gradient(120% 120% at 0% 0%,#2a1460 0%,#0c0820 60%)}
      .t{padding:30px 30px 0}.t img{width:64px;height:64px;border-radius:14px}
      h1{font-size:31px;line-height:1.08;letter-spacing:-.02em;margin-top:16px}p{font-size:15px;margin-top:8px}
      .note{right:16px;bottom:12px;font-size:11px}</style>
      <div class="t"><img src="${icon}"><h1>Remake <span class="gold">this ad</span><br>for your business</h1>
      <p class="muted">One click from the Meta Ad Library. Free.</p></div><div class="note">by Komendly · Not affiliated with Meta</div>`,
  },
  {
    file: "marquee-1400x560.png", w: 1400, h: 560,
    html: `<style>${base}
      body{background:radial-gradient(120% 140% at 0% 0%,#2a1460 0%,#0c0820 60%)}
      .m{display:flex;align-items:center;gap:56px;height:560px;padding:0 96px}.m img{width:200px;height:200px;border-radius:40px;box-shadow:0 20px 60px #000a}
      h1{font-size:68px;line-height:1.05;letter-spacing:-.03em}p{font-size:26px;margin-top:18px}</style>
      <div class="m"><img src="${icon}"><div><h1>Remake <span class="gold">this ad</span><br>for your business</h1>
      <p class="muted">A button on every Meta Ad Library ad. One click opens Komendly with it. Free.</p></div></div><div class="note">Not affiliated with Meta.</div>`,
  },
];

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body>${s.html}</body></html>`, { waitUntil: "load" });
    await page.screenshot({ path: join(out, s.file), clip: { x: 0, y: 0, width: s.w, height: s.h } });
    await page.close();
    console.log(`store/${s.file} ${s.w}x${s.h}`);
  }
} finally {
  await browser.close();
}
