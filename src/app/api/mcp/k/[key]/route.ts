import { handleMcp } from "@/lib/agent-keys/mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tools may wait ~50s for Ozzy.
export const maxDuration = 60;

// For clients that can't set headers: the key is the secret path segment.
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
