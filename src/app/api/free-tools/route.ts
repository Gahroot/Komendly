import { NextRequest, NextResponse } from "next/server";
import { isAiTool, isFreeToolSlug, parseAiToolInput } from "@/lib/growth/free-tools";
import { freeToolsEnabled, queueAiTool, trackToolUse } from "@/lib/growth/free-tools-server";
import { rateLimit } from "@/lib/ads/abuse";

export const dynamic = "force-dynamic";

/**
 * Public (no sign-up) free tools API. AI tools: { tool, input } -> { jobId } (poll /api/free-tools/job/<id>).
 * Deterministic tools (run in the browser): { tool } -> usage beacon only.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { tool?: unknown; input?: unknown };
  if (!isFreeToolSlug(body.tool)) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  if (!(await freeToolsEnabled())) return NextResponse.json({ error: "This tool is taking a short break. Back soon!", off: true }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const tool = body.tool;
  if (!isAiTool(tool)) {
    if (await rateLimit(`free_tool_beacon:${ip}`, 60, 3600).catch(() => false)) await trackToolUse(tool);
    return NextResponse.json({ ok: true });
  }
  const parsed = parseAiToolInput(tool, body.input);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const r = await queueAiTool(tool, parsed.input, ip);
    return r.ok ? NextResponse.json({ jobId: r.jobId }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("[free-tools] queue failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
