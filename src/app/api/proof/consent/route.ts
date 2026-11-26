// Case-study consent (public; signed token from the day-14/30 results email). GET shows a confirm page only (mail scanners
// prefetch links); POST records AdsEvent proof_consent {answer, key}. Latest answer per workspace wins.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyConsent } from "@/lib/growth/proof";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (title: string, body: string, status = 200) =>
  new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#1a1530;line-height:1.6">${body}<p style="color:#6b6580;font-size:14px;margin-top:32px">Komendly</p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

const secret = () => process.env.LIFECYCLE_EMAIL_SECRET ?? "";

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  const p = verifyConsent(t, secret());
  if (!p) return page("Link expired", "<h1>This link has expired</h1><p>Write to nolan@komendly.com and we'll sort it out.</p>", 400);
  const yes = p.a === "yes";
  return page("Case study", `<h1>${yes ? "Use my results as a case study?" : "Don't use my results?"}</h1><p>${yes ? "We would show your business name and only the measured numbers from your results email, with the dates. You can change your mind any time by writing to nolan@komendly.com." : "We won't publish your results or business name."}</p><form method="post" action="/api/proof/consent?t=${encodeURIComponent(t)}"><button type="submit" style="background:#ffcf3f;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:16px;cursor:pointer">${yes ? "Yes, you may" : "Confirm: no"}</button></form>`);
}

export async function POST(request: NextRequest) {
  const p = verifyConsent(request.nextUrl.searchParams.get("t") ?? "", secret());
  if (!p) return page("Link expired", "<h1>This link has expired</h1><p>Write to nolan@komendly.com and we'll sort it out.</p>", 400);
  const report = await prisma.adsEvent.findUnique({ where: { id: p.k }, select: { name: true, workspaceId: true } });
  if (!report || report.name !== "proof_report_sent" || report.workspaceId !== p.w) return page("Link invalid", "<h1>This link isn't valid</h1>", 400);
  const last = await prisma.adsEvent.findFirst({ where: { name: "proof_consent", workspaceId: p.w, props: { path: ["key"], equals: p.k } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  if ((last?.props as { answer?: string } | null)?.answer !== p.a) {
    await prisma.adsEvent.create({ data: { name: "proof_consent", workspaceId: p.w, userId: p.u, props: { answer: p.a, key: p.k, consentedAt: new Date().toISOString() } } });
  }
  return page("Thank you", p.a === "yes" ? "<h1>Thank you</h1><p>We'll only ever show the measured numbers, with their dates. Want it removed later? Write to nolan@komendly.com.</p>" : "<h1>Understood</h1><p>We won't publish your results. Thanks for telling us.</p>");
}
