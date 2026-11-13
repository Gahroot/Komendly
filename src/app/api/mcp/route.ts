import { handleMcp } from "@/lib/agent-keys/mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// studio_get_session may wait up to 4 minutes for Ozzy.
export const maxDuration = 300;

export function POST(request: Request) {
  return handleMcp(request, null);
}

export function GET(request: Request) {
  return handleMcp(request, null);
}

export function DELETE(request: Request) {
  return handleMcp(request, null);
}
