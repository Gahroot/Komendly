/**
 * Van Westendorp price survey (testimonials). Public: anonymous /pricing visitors answer too.
 * Stored in AdsEvent (name = PRICE_SURVEY_EVENT, props = answers); one response per user or per anon cookie.
 */

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseSurveyAnswers, PRICE_SURVEY_EVENT, PRICE_SURVEY_PLACEMENTS, PRICE_SURVEY_SUBJECT, type PriceSurveyPlacement } from "@/lib/price-survey";

const ANON_COOKIE = "kmd_vw";

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    if (!(await rateLimit(`price-survey:${ip}`, 10, 3600))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = parseSurveyAnswers(body?.answers);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const placement: PriceSurveyPlacement = (PRICE_SURVEY_PLACEMENTS as readonly unknown[]).includes(body?.placement)
      ? (body?.placement as PriceSurveyPlacement)
      : "pricing";

    const user = await getCurrentUser();
    const cookieAnon = request.cookies.get(ANON_COOKIE)?.value;
    const anonId = cookieAnon && /^[0-9a-f-]{36}$/.test(cookieAnon) ? cookieAnon : randomUUID();

    const existing = await prisma.adsEvent.findFirst({
      where: user
        ? { name: PRICE_SURVEY_EVENT, userId: user.id }
        : { name: PRICE_SURVEY_EVENT, props: { path: ["anonId"], equals: anonId } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.adsEvent.create({
        data: {
          name: PRICE_SURVEY_EVENT,
          userId: user?.id ?? null,
          props: { ...parsed.value, placement, anonId, subject: PRICE_SURVEY_SUBJECT, customer: !!user && user.plan !== "pending" },
        },
      });
    }

    const res = NextResponse.json({ ok: true, duplicate: !!existing });
    res.cookies.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return res;
  } catch (error) {
    logger.error({ error }, "Failed to save price survey");
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
