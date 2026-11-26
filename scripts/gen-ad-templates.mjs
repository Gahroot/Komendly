// Generates public/ad-templates/*.svg (4 layouts x 3 sizes). Run: node scripts/gen-ad-templates.mjs
import { mkdirSync, writeFileSync } from "node:fs";
const sizes = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };
const font = "font-family=\"Helvetica, Arial, sans-serif\"";
const text = (x, y, size, weight, fill, s, anchor = "middle") => `<text x="${x}" y="${y}" ${font} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
const layouts = {
  offer: (w, h) => `<rect width="${w}" height="${h}" fill="#1b1340"/><rect x="60" y="60" width="${w - 120}" height="${h - 120}" rx="40" fill="none" stroke="#f5b942" stroke-width="6"/>` +
    text(w / 2, h * 0.28, 56, 600, "#f5b942", "[YOUR BUSINESS]") + text(w / 2, h * 0.5, 190, 800, "#ffffff", "[$X OFF]") + text(w / 2, h * 0.6, 60, 500, "#ffffff", "[your first service]") +
    `<rect x="${w / 2 - 260}" y="${h * 0.72}" width="520" height="110" rx="55" fill="#f5b942"/>` + text(w / 2, h * 0.72 + 72, 48, 700, "#1b1340", "[Call or book now]") + text(w / 2, h - 110, 34, 400, "#c9c3e6", "[your town] · [phone] · [website]"),
  "photo-headline": (w, h) => `<rect width="${w}" height="${h}" fill="#d9d9e3"/><rect x="${w * 0.1}" y="${h * 0.08}" width="${w * 0.8}" height="${h * 0.6}" fill="#bdbdcc"/>` + text(w / 2, h * 0.38, 44, 500, "#6b6b80", "[Replace with your photo]") +
    `<rect y="${h * 0.72}" width="${w}" height="${h * 0.28}" fill="#1b1340"/>` + text(w / 2, h * 0.72 + 110, 72, 800, "#ffffff", "[One-line headline]") + text(w / 2, h * 0.72 + 190, 40, 400, "#f5b942", "[Your business] · [your town]"),
  review: (w, h) => `<rect width="${w}" height="${h}" fill="#fff8e8"/>` + text(w / 2, h * 0.22, 80, 700, "#f5b942", "★ ★ ★ ★ ★") + text(w / 2, h * 0.4, 62, 600, "#1b1340", "“[Paste a real customer") + text(w / 2, h * 0.4 + 80, 62, 600, "#1b1340", "review here, word for word.]”") +
    text(w / 2, h * 0.62, 42, 500, "#4b4670", "- [Customer first name], [town]") + `<rect x="${w / 2 - 280}" y="${h * 0.74}" width="560" height="104" rx="52" fill="#1b1340"/>` + text(w / 2, h * 0.74 + 68, 44, 700, "#ffffff", "[Your business]"),
  announcement: (w, h) => `<rect width="${w}" height="${h}" fill="#f5b942"/>` + text(w / 2, h * 0.25, 52, 700, "#1b1340", "[EVENT / SEASON]") + text(w / 2, h * 0.45, 150, 800, "#1b1340", "[DATE]") +
    text(w / 2, h * 0.57, 56, 500, "#1b1340", "[What is happening, in one line]") + `<rect x="${w / 2 - 260}" y="${h * 0.7}" width="520" height="110" rx="55" fill="#1b1340"/>` + text(w / 2, h * 0.7 + 72, 46, 700, "#ffffff", "[Book your spot]") + text(w / 2, h - 110, 34, 400, "#1b1340", "[Your business] · [your town]"),
};
mkdirSync("public/ad-templates", { recursive: true });
for (const [lid, fn] of Object.entries(layouts)) for (const [sid, [w, h]] of Object.entries(sizes)) {
  writeFileSync(`public/ad-templates/komendly-${lid}-${sid}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fn(w, h)}</svg>\n`);
}
console.log("done");
