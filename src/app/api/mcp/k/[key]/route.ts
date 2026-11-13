import { handleMcp } from "@/lib/agent-keys/mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tools may wait ~50s for Ozzy.
export const maxDuration = 300;

// DEPRECATED: key-in-URL form, kept only so existing connections keep working. Not documented anywhere any more;
// new clients use /api/mcp with OAuth (sign in + Allow) or `Authorization: Bearer kmd_...` (CLI). Remove once unused.
type Ctx = { params: Promise<{ key: string }> };

export async function POST(request: Request, { params }: Ctx) {
  return handleMcp(request, (await params).key);
}

export async function GET(request: Request, { params }: Ctx) {
  return handleMcp(request, (await params).key);
}

export async function DELETE(request: Request, { params }: Ctx) {
  return handleMcp(request, (await params).key);
}
