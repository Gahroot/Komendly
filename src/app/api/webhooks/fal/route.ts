import { NextRequest, NextResponse } from "next/server";
import { videoQueue } from "@/lib/video-queue";
import { DURATION_OPTIONS, type Duration } from "@/lib/fal/video-generator";
import crypto from "crypto";

/**
 * Fal.ai Webhook Payload structure
 * https://fal.ai/docs/webhooks
 */
interface FalWebhookPayload {
  request_id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message: string; timestamp: string }>;
  error?: string;
  payload?: {
    video?: {
      url: string;
      content_type?: string;
    };
    images?: Array<{ url: string }>;
  };
}

/**
 * Verify fal.ai webhook signature
 * Uses HMAC-SHA256 with the webhook secret
 */
function verifyFalSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.warn("Missing webhook signature or secret");
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(signature.replace("sha256=", ""), "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * POST /api/webhooks/fal
 * Handle fal.ai webhook callbacks for video generation status updates
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Get webhook secret from environment
    const webhookSecret = process.env.FAL_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = request.headers.get("x-fal-signature") ||
                       request.headers.get("x-webhook-signature");

      if (!verifyFalSignature(rawBody, signature, webhookSecret)) {
        console.error("Invalid fal.ai webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Parse webhook payload
    let payload: FalWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("Failed to parse webhook payload:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!payload.request_id || !payload.status) {
      console.error("Missing required fields in webhook payload");
      return NextResponse.json(
        { error: "Missing required fields: request_id, status" },
        { status: 400 }
      );
    }

    console.log(`Fal.ai webhook: request_id=${payload.request_id}, status=${payload.status}`);

    // Find the job by fal request ID
    const job = videoQueue.findByFalRequestId(payload.request_id);

    if (!job) {
      console.warn(`No job found for fal request_id: ${payload.request_id}`);
      // Return 200 to acknowledge receipt even if job not found
      // This prevents fal.ai from retrying
      return NextResponse.json({
        success: true,
        message: "Webhook received but no matching job found",
        requestId: payload.request_id,
      });
    }

    // Update job based on fal.ai status
    switch (payload.status) {
      case "IN_QUEUE":
        videoQueue.updateProgress(job.id, 10);
        break;

      case "IN_PROGRESS":
        videoQueue.updateProgress(job.id, 50);
        break;

      case "COMPLETED":
        if (payload.payload?.video) {
          const duration = (job.metadata?.duration as Duration) || "5";
          videoQueue.completeJob(job.id, {
            url: payload.payload.video.url,
            duration: DURATION_OPTIONS[duration].seconds,
            contentType: payload.payload.video.content_type,
          });
          console.log(`Job ${job.id} completed with video: ${payload.payload.video.url}`);
        } else {
          // Completed but no video - treat as error
          videoQueue.failJob(job.id, "Video generation completed but no video URL returned");
          console.error(`Job ${job.id} completed but no video URL in payload`);
        }
        break;

      case "FAILED":
        const errorMessage = payload.error || "Video generation failed";
        videoQueue.failJob(job.id, errorMessage);
        console.error(`Job ${job.id} failed: ${errorMessage}`);
        break;

      default:
        console.warn(`Unknown fal.ai status: ${payload.status}`);
    }

    // Get updated job status
    const updatedJob = videoQueue.getJob(job.id);

    return NextResponse.json({
      success: true,
      message: "Webhook processed successfully",
      job: updatedJob
        ? {
            id: updatedJob.id,
            status: updatedJob.status,
            progress: updatedJob.progress,
            videoUrl: updatedJob.result?.url,
          }
        : null,
    });
  } catch (error) {
    console.error("Fal.ai webhook processing error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { error: "Failed to process webhook", details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/fal
 * Webhook endpoint verification
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = searchParams.get("challenge");

  if (challenge) {
    // Echo back the challenge for verification
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({
    status: "ok",
    message: "Fal.ai webhook endpoint is active",
    supportedStatuses: ["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"],
  });
}
