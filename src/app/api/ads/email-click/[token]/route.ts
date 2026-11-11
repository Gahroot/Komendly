// Tracked lifecycle-email link: records AdsEvent email_clicked {kind, path} then redirects to the app path in the
// signed token (app-relative only, so it can't be used as an open redirect). Public (see middleware publicPrefixes).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/ads/lifecycle/tokens";

const DEDUPE_MS = 10 * 60_000;

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = verifyEmailToken(token, process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  if (!p || p.p !== "click") return NextResponse.redirect(`${appOrigin()}/ads/app`, 302);
  try {
    const recent = await prisma.adsEvent.findFirst({
      where: { name: "email_clicked", userId: p.u, createdAt: { gte: new Date(Date.now() - DEDUPE_MS) }, props: { path: ["kind"], equals: p.k } },
      select: { id: true },
    });
    if (!recent) await prisma.adsEvent.create({ data: { name: "email_clicked", userId: p.u, props: { kind: p.k, path: p.l.split("?")[0] ?? p.l } } });
  } catch {
    // Tracking must never block the click.
  }
  return NextResponse.redirect(`${appOrigin()}${p.l}`, 302);
}
