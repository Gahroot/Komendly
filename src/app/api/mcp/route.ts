import { handleMcp } from "@/lib/agent-keys/mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tools may wait ~50s for Ozzy.
export const maxDuration = 60;

export function POST(request: Request) {
  return handleMcp(request, null);
}

export function GET(request: Request) {
  return handleMcp(request, null);
}

export function DELETE(request: Request) {
  return handleMcp(request, null);
}
