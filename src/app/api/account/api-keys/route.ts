import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiKeyView, requireCookieUser } from "@/lib/agent-keys/manage";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace } from "@/lib/ads/workspace";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/agent-keys/keys";

const MAX_ACTIVE_KEYS = 20;
const Body = z.object({ name: z.string().trim().min(1).max(60) });

export async function GET() {
  try {
    const user = await requireCookieUser();
    const keys = await prisma.agentApiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ keys: keys.map(apiKeyView) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCookieUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Give the key a name (up to 60 characters).");
    if (!(await rateLimit(`apikey-create:${user.id}`, 20, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many new keys this hour. Try again later.");
    const active = await prisma.agentApiKey.count({ where: { userId: user.id, revokedAt: null } });
    if (active >= MAX_ACTIVE_KEYS) throw new AdsHttpError(409, "too_many_keys", `You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
    const workspace = await getOrCreateWorkspace(user);
    const key = generateApiKey();
    const row = await prisma.agentApiKey.create({ data: { userId: user.id, workspaceId: workspace.id, name: parsed.data.name, prefix: keyPrefix(key), keyHash: hashApiKey(key) } });
    await trackAdsEvent("api_key_created", { workspaceId: workspace.id, userId: user.id, props: { keyId: row.id } });
    // The full key is returned exactly once; only its hash is stored.
    return NextResponse.json({ key: apiKeyView(row), secret: key }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
