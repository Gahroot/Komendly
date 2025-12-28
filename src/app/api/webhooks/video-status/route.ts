import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  sendNotifications,
  NotificationPayload,
  NotificationConfig,
  NotificationEvent,
} from "@/lib/notifications";
import { VideoStatus } from "@prisma/client";
import { apiLogger, createRequestTimer, generateRequestId, logError } from "@/lib/logger";

// Webhook payload from video generation service
interface VideoStatusWebhookPayload {
  videoId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  metadata?: {
    duration?: number;
    format?: string;
    size?: number;
  };
  timestamp?: string;
}

// Signature verification for webhook security (timing-safe comparison)
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = createRequestTimer();
  const log = apiLogger.child({ requestId, endpoint: "webhooks/video-status" });

  log.info({ method: "POST" }, "Received video status webhook");

  try {
    const rawBody = await request.text();
    const body: VideoStatusWebhookPayload = JSON.parse(rawBody);

    log.debug({ videoId: body.videoId, status: body.status }, "Parsed webhook payload");

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.VIDEO_WEBHOOK_SECRET;
    const signature = request.headers.get("x-webhook-signature");

    if (webhookSecret) {
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        log.warn({ videoId: body.videoId }, "Invalid webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
      log.debug("Webhook signature verified");
    }

    // Validate required fields
    if (!body.videoId || !body.status) {
      return NextResponse.json(
        { error: "Missing required fields: videoId, status" },
        { status: 400 }
      );
    }

    // Map status string to VideoStatus enum
    const statusMap: Record<string, VideoStatus> = {
      pending: "pending",
      processing: "processing",
      completed: "completed",
      failed: "failed",
    };

    const videoStatus = statusMap[body.status];
    if (!videoStatus) {
      return NextResponse.json(
        { error: `Invalid status: ${body.status}` },
        { status: 400 }
      );
    }

    // Find and update the video in the database
    const video = await prisma.generatedVideo.findUnique({
      where: { id: body.videoId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        review: {
          select: {
            reviewerName: true,
            businessName: true,
          },
        },
      },
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // Update video status in database
    const updatedVideo = await prisma.generatedVideo.update({
      where: { id: body.videoId },
      data: {
        status: videoStatus,
        url: body.videoUrl || video.url,
        thumbnailUrl: body.thumbnailUrl || video.thumbnailUrl,
        duration: body.metadata?.duration || video.duration,
      },
    });

    // Prepare notification payload
    const notificationPayload: NotificationPayload = {
      event: `video.${body.status}` as NotificationEvent,
      videoId: body.videoId,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl,
      userId: video.userId,
      reviewerName: video.review.reviewerName,
      businessName: video.review.businessName,
      errorMessage: body.errorMessage,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
    };

    // Get user's webhook configurations
    const userWebhooks = await prisma.webhook.findMany({
      where: {
        userId: video.userId,
        active: true,
        events: {
          has: `video.${body.status}`,
        },
      },
    });

    // Build notification configs from user webhooks
    const notificationConfigs: NotificationConfig[] = userWebhooks.map(
      (webhook) => ({
        type: webhook.type as NotificationConfig["type"],
        webhookUrl: webhook.webhookUrl,
        email: webhook.type === "email" ? { to: video.user.email } : undefined,
      })
    );

    // Add default email notification for completed/failed videos
    if (
      (body.status === "completed" || body.status === "failed") &&
      video.user.email
    ) {
      const hasEmailConfig = notificationConfigs.some((c) => c.type === "email");
      if (!hasEmailConfig) {
        notificationConfigs.push({
          type: "email",
          email: { to: video.user.email },
        });
      }
    }

    // Send notifications
    let notificationResults = { success: 0, failed: 0, results: [] as boolean[] };
    if (notificationConfigs.length > 0) {
      notificationResults = await sendNotifications(
        notificationPayload,
        notificationConfigs
      );
    }

    log.info(
      {
        videoId: body.videoId,
        status: body.status,
        notificationsSent: notificationResults.success,
        notificationsTotal: notificationConfigs.length,
        durationMs: timer.getDuration(),
      },
      `Video ${body.videoId} status updated to ${body.status}`
    );

    return NextResponse.json({
      success: true,
      video: {
        id: updatedVideo.id,
        status: updatedVideo.status,
        url: updatedVideo.url,
        thumbnailUrl: updatedVideo.thumbnailUrl,
      },
      notifications: {
        sent: notificationResults.success,
        failed: notificationResults.failed,
        total: notificationConfigs.length,
      },
    });
  } catch (error) {
    logError(log, error, "Webhook processing error", { durationMs: timer.getDuration() });

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { error: "Failed to process webhook", details: errorMessage },
      { status: 500 }
    );
  }
}

// GET endpoint for webhook verification (used by some services)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = searchParams.get("challenge");

  if (challenge) {
    // Echo back the challenge for verification
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({
    status: "ok",
    message: "Video status webhook endpoint is active",
    supportedEvents: [
      "video.pending",
      "video.processing",
      "video.completed",
      "video.failed",
    ],
  });
}
