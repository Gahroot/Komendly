// Short unsubscribe link in Kly's cold emails (komendly.com/u/<token>): GET from the footer, POST for RFC 8058 one-click.
import { NextRequest, NextResponse } from "next/server";
import { GET as unsubGet, POST as unsubPost } from "@/app/api/outbound/unsubscribe/route";

type Ctx = { params: Promise<{ token: string }> };

async function withToken(request: NextRequest, token: string): Promise<NextRequest> {
  const url = new URL(request.url);
  url.pathname = "/api/outbound/unsubscribe";
  url.searchParams.set("t", token);
  // Keep the body: the confirm button posts "confirm=1", RFC 8058 posts "List-Unsubscribe=One-Click".
  const body = request.method === "POST" ? await request.text() : undefined;
  return new NextRequest(url, { method: request.method, headers: request.headers, body });
}

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  return unsubGet(await withToken(request, (await params).token));
}

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  return unsubPost(await withToken(request, (await params).token));
}
