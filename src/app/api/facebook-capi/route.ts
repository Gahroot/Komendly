import { NextRequest, NextResponse } from "next/server";
import { sendPurchaseEvent, sendLeadEvent, sendSubscribeEvent } from "@/lib/facebook-capi";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventType, ...eventData } = body;

    // Get client IP and user agent from request headers
    const clientIpAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const clientUserAgent = request.headers.get("user-agent") || undefined;

    // Add client info to event data
    const enrichedData = {
      ...eventData,
      clientIpAddress,
      clientUserAgent,
    };

    let result;

    switch (eventType) {
      case "Purchase":
        result = await sendPurchaseEvent({
          email: enrichedData.email,
          value: enrichedData.value,
          currency: enrichedData.currency || "USD",
          transactionId: enrichedData.transactionId,
          contentName: enrichedData.contentName,
          sourceUrl: enrichedData.sourceUrl,
          clientIpAddress: enrichedData.clientIpAddress,
          clientUserAgent: enrichedData.clientUserAgent,
          fbc: enrichedData.fbc,
          fbp: enrichedData.fbp,
        });
        break;

      case "Lead":
        result = await sendLeadEvent({
          email: enrichedData.email,
          sourceUrl: enrichedData.sourceUrl,
          clientIpAddress: enrichedData.clientIpAddress,
          clientUserAgent: enrichedData.clientUserAgent,
          fbc: enrichedData.fbc,
          fbp: enrichedData.fbp,
        });
        break;

      case "Subscribe":
        result = await sendSubscribeEvent({
          email: enrichedData.email,
          value: enrichedData.value,
          currency: enrichedData.currency || "USD",
          planName: enrichedData.planName,
          transactionId: enrichedData.transactionId,
          sourceUrl: enrichedData.sourceUrl,
          clientIpAddress: enrichedData.clientIpAddress,
          clientUserAgent: enrichedData.clientUserAgent,
          fbc: enrichedData.fbc,
          fbp: enrichedData.fbp,
        });
        break;

      default:
        return NextResponse.json(
          { error: `Unknown event type: ${eventType}` },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        eventId: result.eventId,
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Failed to send event" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Facebook CAPI route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
