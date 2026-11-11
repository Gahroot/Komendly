import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSurveyAnswers, PRICE_SURVEY_EVENT, PRICE_SURVEY_SUBJECT, vanWestendorp, type PriceSurveyAnswers } from "@/lib/price-survey";

/** Van Westendorp results for the admin page. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const segment = new URL(request.url).searchParams.get("segment");
  const rows = await prisma.adsEvent.findMany({ where: { name: PRICE_SURVEY_EVENT }, orderBy: { createdAt: "asc" }, select: { props: true } });
  const answers: PriceSurveyAnswers[] = [];
  for (const row of rows) {
    const p = row.props as Record<string, unknown> | null;
    if (segment === "customers" && p?.customer !== true) continue;
    if (segment === "visitors" && p?.customer === true) continue;
    const a = parseSurveyAnswers(p);
    if (a.ok) answers.push(a.value);
  }
  return NextResponse.json({ subject: PRICE_SURVEY_SUBJECT, total: rows.length, ...vanWestendorp(answers) });
}
