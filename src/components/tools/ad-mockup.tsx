"use client";

// Ad mockup generator (free tool, no AI): draws Facebook / Instagram / Story / TikTok / LinkedIn ad frames on <canvas>
// in the browser. The preview IS the PNG, so "Download PNG" is exact. The image never leaves the device.
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { MOCKUP_CTAS, MOCKUP_FRAMES, displayDomain, visibleAdText, wrapText, type MockupFrame } from "@/lib/growth/free-tools";

const field = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SCALE = 2;

export interface MockupContent { brand: string; text: string; headline: string; cta: string; url: string; img: HTMLImageElement | null; feedRatio: number }

type Ctx = CanvasRenderingContext2D;
const font = (ctx: Ctx, size: number, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };

function cover(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (!img) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#cfd4dc"); g.addColorStop(1, "#9aa3b2");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    font(ctx, 15, 600); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.fillText("Your image here", x + w / 2, y + h / 2); ctx.textAlign = "left";
    return;
  }
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function avatar(ctx: Ctx, brand: string, cx: number, cy: number, r: number, square = false) {
  ctx.fillStyle = "#e8b44c";
  ctx.beginPath();
  if (square) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, 4); else ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  font(ctx, Math.round(r * 0.95), 700); ctx.fillStyle = "#2a0f10"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((brand.trim()[0] ?? "B").toUpperCase(), cx, cy + 1);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function lines(ctx: Ctx, ls: string[], x: number, y: number, lh: number) {
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

function pill(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, label: string, color: string, size = 14, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2 > 18 ? 6 : h / 2);
  if (fill !== "none") { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  font(ctx, size, 600); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

/** Draw one frame; with draw=false only measures and returns the frame height. */
function paint(ctx: Ctx, f: MockupFrame, c: MockupContent, draw: boolean): number {
  const W = f.width, pad = 12;
  const brand = c.brand.trim() || "Your Business";
  const domain = displayDomain(c.url) || "yourbusiness.com";
  const headline = c.headline.trim() || "Your headline goes here";
  const text = c.text.trim() || "Your primary text: the words people read above or below your ad image.";
  const measure = (s: string) => ctx.measureText(s).width;
  const D = (fn: () => void) => { if (draw) fn(); };

  if (f.fullScreen) {
    const H = f.height;
    D(() => {
      cover(ctx, c.img, 0, 0, W, H);
      const top = ctx.createLinearGradient(0, 0, 0, 90); top.addColorStop(0, "rgba(0,0,0,0.45)"); top.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = top; ctx.fillRect(0, 0, W, 90);
      const bot = ctx.createLinearGradient(0, H * 0.5, 0, H); bot.addColorStop(0, "rgba(0,0,0,0)"); bot.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = bot; ctx.fillRect(0, H * 0.5, W, H * 0.5);
    });
    if (f.id === "instagram-story") {
      D(() => {
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(8, 8, W - 16, 2.5);
        avatar(ctx, brand, 26, 32, 13);
        font(ctx, 13, 600); ctx.fillStyle = "#fff"; ctx.fillText(brand, 46, 30);
        font(ctx, 11); ctx.fillText("Sponsored", 46, 44);
        font(ctx, 17, 700);
        const hl = wrapText(measure, headline, W - 40, 2);
        lines(ctx, hl, 20, H - 118 - (hl.length - 1) * 21, 21);
        font(ctx, 18, 700); ctx.textAlign = "center"; ctx.fillText("︿", W / 2, H - 72); ctx.textAlign = "left";
        pill(ctx, W / 2 - 62, H - 60, 124, 34, "#ffffff", c.cta, "#111111", 13);
      });
    } else {
      D(() => {
        const icons = [H - 300, H - 245, H - 195, H - 145];
        avatar(ctx, brand, W - 28, icons[0], 18);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const y of icons.slice(1)) { ctx.beginPath(); ctx.arc(W - 28, y, 13, 0, Math.PI * 2); ctx.fill(); }
        font(ctx, 15, 700); ctx.fillStyle = "#fff"; ctx.fillText(brand, 12, H - 128);
        font(ctx, 13);
        const cap = wrapText(measure, visibleAdText(text, f.visibleText, f.moreLabel).text, W - 70, 3);
        lines(ctx, cap, 12, H - 108, 17);
        font(ctx, 11, 600); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.roundRect(12, H - 108 + cap.length * 17 - 9, 64, 18, 3); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText("Sponsored", 17, H - 108 + cap.length * 17 + 4);
        pill(ctx, 12, H - 46, W - 24, 34, "#fe2c55", c.cta, "#ffffff", 14);
      });
    }
    return H;
  }

  const mediaH = Math.round(W / (f.id === "linkedin-feed" ? f.mediaRatio : c.feedRatio));
  let y = 0;
  D(() => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, 4000); });

  if (f.id === "instagram-feed") {
    D(() => {
      avatar(ctx, brand, pad + 16, 27, 16);
      font(ctx, 13, 600); ctx.fillStyle = "#111"; ctx.fillText(brand, 52, 24);
      font(ctx, 11); ctx.fillStyle = "#555"; ctx.fillText("Sponsored", 52, 38);
      font(ctx, 18, 700); ctx.fillStyle = "#111"; ctx.fillText("···", W - 34, 30);
    });
    y = 54;
    D(() => cover(ctx, c.img, 0, y, W, mediaH));
    y += mediaH;
    D(() => {
      ctx.fillStyle = "#f2f2f2"; ctx.fillRect(0, y, W, 42);
      font(ctx, 14, 600); ctx.fillStyle = "#0095f6"; ctx.fillText(c.cta, pad, y + 26); ctx.fillText("›", W - 22, y + 26);
      ctx.strokeStyle = "#111"; ctx.lineWidth = 1.6;
      [pad + 10, pad + 44, pad + 78].forEach((x) => { ctx.beginPath(); ctx.arc(x, y + 66, 9, 0, Math.PI * 2); ctx.stroke(); });
    });
    y += 42 + 46;
    font(ctx, 13);
    const cap = wrapText(measure, `${brand} ${visibleAdText(text, f.visibleText, f.moreLabel).text}`, W - 2 * pad, 3);
    D(() => {
      ctx.fillStyle = "#111";
      cap.forEach((l, i) => {
        if (i === 0 && l.startsWith(brand)) {
          font(ctx, 13, 600); ctx.fillText(brand, pad, y + 6);
          const bw = measure(`${brand} `); font(ctx, 13); ctx.fillText(l.slice(brand.length + 1), pad + bw, y + 6);
        } else ctx.fillText(l, pad, y + 6 + i * 18);
      });
    });
    return y + cap.length * 18 + 10;
  }

  const li = f.id === "linkedin-feed";
  D(() => {
    avatar(ctx, brand, pad + (li ? 22 : 20), pad + (li ? 22 : 20), li ? 22 : 20, li);
    font(ctx, 14, 600); ctx.fillStyle = "#050505"; ctx.fillText(brand, li ? 70 : 64, 30);
    font(ctx, 12); ctx.fillStyle = "#65676b"; ctx.fillText(li ? "Promoted" : "Sponsored · Public", li ? 70 : 64, 47);
    font(ctx, 18, 700); ctx.fillText("···", W - 34, 30);
  });
  y = li ? 68 : 62;
  font(ctx, 14);
  const body = wrapText(measure, visibleAdText(text, f.visibleText, f.moreLabel).text, W - 2 * pad, 5);
  D(() => { ctx.fillStyle = "#050505"; lines(ctx, body, pad, y + 6, 19); });
  y += body.length * 19 + 6;
  D(() => cover(ctx, c.img, 0, y, W, mediaH));
  y += mediaH;
  const btnW = li ? 104 : 106;
  font(ctx, li ? 14 : 15, 600);
  const hl = wrapText(measure, headline, W - 2 * pad - btnW - 10, 2);
  const barH = 30 + hl.length * 19;
  D(() => {
    ctx.fillStyle = li ? "#eef3f8" : "#f0f2f5"; ctx.fillRect(0, y, W, barH);
    if (li) {
      ctx.fillStyle = "#000000e6"; lines(ctx, hl, pad, y + 22, 19);
      font(ctx, 12); ctx.fillStyle = "#666"; ctx.fillText(domain, pad, y + 22 + hl.length * 19);
      pill(ctx, W - pad - btnW, y + barH / 2 - 16, btnW, 32, "none", c.cta, "#0a66c2", 14, "#0a66c2");
    } else {
      font(ctx, 12); ctx.fillStyle = "#65676b"; ctx.fillText(domain.toUpperCase(), pad, y + 20);
      font(ctx, 15, 600); ctx.fillStyle = "#050505"; lines(ctx, hl, pad, y + 40, 19);
      pill(ctx, W - pad - btnW, y + barH / 2 - 18, btnW, 36, "#e4e6eb", c.cta, "#050505", 14);
    }
  });
  y += barH;
  D(() => {
    ctx.fillStyle = "#dadde1"; ctx.fillRect(pad, y + 6, W - 2 * pad, 1);
    font(ctx, 13, 600); ctx.fillStyle = "#65676b";
    const acts = li ? ["Like", "Comment", "Repost", "Send"] : ["Like", "Comment", "Share"];
    acts.forEach((a, i) => { ctx.textAlign = "center"; ctx.fillText(a, ((i + 0.5) * W) / acts.length, y + 30); });
    ctx.textAlign = "left";
  });
  return y + 44;
}

function FrameCanvas({ frame, content }: { frame: MockupFrame; content: MockupContent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const h = frame.fullScreen ? frame.height : paint(ctx, frame, content, false);
    cv.width = frame.width * SCALE; cv.height = h * SCALE;
    cv.style.width = `${frame.width}px`; cv.style.height = `${h}px`;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    paint(ctx, frame, content, true);
  }, [frame, content]);
  const download = () => {
    ref.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${frame.id}-ad-mockup.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{frame.name}</figcaption>
      <canvas ref={ref} role="img" aria-label={`${frame.name} ad mockup preview`} className="max-w-full rounded-lg shadow-lg" />
      <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"><Download className="size-4" /> Download PNG</button>
    </figure>
  );
}

export function MockupTool({ onUse }: { onUse: () => void }) {
  const [v, setV] = useState({ brand: "", url: "", text: "", headline: "", cta: "Learn More", feedRatio: "0.8" });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const used = useRef(false);
  const touch = () => { if (!used.current) { used.current = true; onUse(); } };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV({ ...v, [k]: e.target.value }); touch(); };
  function onFile(f: File | undefined) {
    if (!f) return;
    const el = new window.Image();
    el.onload = () => { setImg(el); touch(); };
    el.src = URL.createObjectURL(f);
  }
  const content: MockupContent = { ...v, feedRatio: Number(v.feedRatio), img };
  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center hover:border-[var(--studio-gold)]">
        <span className="font-medium">{img ? "Change the ad image" : "Choose your ad image"}</span>
        <span className="text-sm text-muted-foreground">JPG or PNG. Drawn in your browser; nothing is uploaded.</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Page or brand name" maxLength={40} value={v.brand} onChange={set("brand")} placeholder="Page name: Fast Flow Plumbing" className={field} />
        <input aria-label="Website" maxLength={200} value={v.url} onChange={set("url")} placeholder="Website: fastflow.co.uk" className={field} />
      </div>
      <textarea aria-label="Primary text" rows={3} maxLength={2000} value={v.text} onChange={set("text")} placeholder="Primary text: the words above (Facebook, LinkedIn) or below (Instagram) the image" className={field} />
      <div className="grid gap-3 sm:grid-cols-3">
        <input aria-label="Headline" maxLength={120} value={v.headline} onChange={set("headline")} placeholder="Headline: Burst pipe? Here in 60 min" className={`${field} sm:col-span-3`} />
        <select aria-label="Button" value={v.cta} onChange={set("cta")} className={field}>{MOCKUP_CTAS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Feed image shape" value={v.feedRatio} onChange={set("feedRatio")} className={`${field} sm:col-span-2`}>
          <option value="0.8">Feed image 4:5 (1080x1350)</option>
          <option value="1">Feed image 1:1 (1080x1080)</option>
        </select>
      </div>
      <div className="grid justify-items-center gap-10 sm:grid-cols-2">
        {MOCKUP_FRAMES.map((f) => <FrameCanvas key={f.id} frame={f} content={content} />)}
      </div>
      <p className="text-xs text-muted-foreground">Text is cut where each app cuts it (about 125 characters on Facebook and Instagram, 150 on LinkedIn), so you can see what people read before &quot;See more&quot;.</p>
    </div>
  );
}
