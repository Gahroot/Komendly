import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildTestimonialPrompt } from "@/lib/prompts";
import {
  submitVideoGeneration,
  type AspectRatio,
  type Duration,
} from "@/lib/fal/video-generator";
import {
  videoQueue,
  type JobPriority,
} from "@/lib/video-queue";
import {
  apiLogger,
  videoGenLogger,
  generateRequestId,
  createRequestLogger,
  createPerformanceTimer,
  createRequestTimer,
  logError,
  logRequest,
  logResponse,
} from "@/lib/logger";

interface GenerateRequestBody {
  reviewText: string;
  reviewerName: string;
  businessName: string;
  style: string;
  aspectRatio?: AspectRatio;
  duration?: Duration;
  userId?: string;
  reviewId?: string;
  priority?: JobPriority;
}

/**
 * POST /api/generate
 * Submit a new video generation job and return job ID immediately
 */
export async function POST(request: NextRequest) {
  // Generate unique request ID for tracing
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, apiLogger);
  const requestTimer = createRequestTimer();

  // Extract request metadata
  const method = request.method;
  const url = request.url;
  const userAgent = request.headers.get("user-agent") || undefined;
  const ip = request.headers.get("x-forwarded-for") ||
             request.headers.get("x-real-ip") ||
             "unknown";

  // Log incoming request
  logRequest(log, { method, url, userAgent, ip, requestId });

  try {
    const body: GenerateRequestBody = await request.json();

    log.debug(
      {
        businessName: body.businessName,
        style: body.style,
        aspectRatio: body.aspectRatio || "16:9",
        duration: body.duration || "5",
        reviewTextLength: body.reviewText?.length,
        priority: body.priority || "normal",
      },
      "Processing video generation request"
    );

    // Validate required fields
    if (!body.reviewText || !body.reviewerName || !body.businessName || !body.style) {
      log.warn(
        {
          hasReviewText: !!body.reviewText,
          hasReviewerName: !!body.reviewerName,
          hasBusinessName: !!body.businessName,
          hasStyle: !!body.style,
        },
        "Missing required fields in request"
      );

      const response = NextResponse.json(
        { error: "Missing required fields: reviewText, reviewerName, businessName, style" },
        { status: 400 }
      );

      logResponse(log, {
        method,
        url,
        requestId,
        statusCode: 400,
        durationMs: requestTimer.getDuration(),
      });

      return response;
    }

    // Check for API key
    if (!env.FAL_API_KEY) {
      log.error("FAL_API_KEY is not configured");

      const response = NextResponse.json(
        { error: "FAL_API_KEY is not configured" },
        { status: 500 }
      );

      logResponse(log, {
        method,
        url,
        requestId,
        statusCode: 500,
        durationMs: requestTimer.getDuration(),
      });

      return response;
    }

    // Create a job in the queue
    const job = videoQueue.createJob({
      userId: body.userId || "anonymous",
      reviewId: body.reviewId || `review_${Date.now()}`,
      priority: body.priority || "normal",
      metadata: {
        reviewText: body.reviewText,
        reviewerName: body.reviewerName,
        businessName: body.businessName,
        style: body.style,
        aspectRatio: body.aspectRatio,
        duration: body.duration,
        requestId,
      },
    });

    log.info(
      { jobId: job.id, priority: job.priority },
      "Created video generation job"
    );

    // Build the testimonial prompt
    const promptTimer = createPerformanceTimer(videoGenLogger.child({ requestId, jobId: job.id }), "prompt-building");
    const prompt = buildTestimonialPrompt({
      reviewText: body.reviewText,
      reviewerName: body.reviewerName,
      businessName: body.businessName,
      style: body.style,
    });
    promptTimer.end({ promptLength: prompt.length });

    try {
      // Submit to fal.ai queue (non-blocking)
      const videoTimer = createPerformanceTimer(
        videoGenLogger.child({ requestId, jobId: job.id }),
        "video-submission"
      );

      videoTimer.step("submitting-to-fal", {
        aspectRatio: body.aspectRatio || "9:16",
        duration: body.duration || "5",
      });

      const falRequestId = await submitVideoGeneration(env.FAL_API_KEY, {
        prompt,
        duration: body.duration,
        aspectRatio: body.aspectRatio,
      });

      videoTimer.end({ falRequestId });

      // Update job with fal request ID and mark as processing
      videoQueue.startProcessing(job.id, falRequestId);

      log.info(
        {
          jobId: job.id,
          falRequestId,
          businessName: body.businessName,
          style: body.style,
        },
        "Video generation submitted to queue"
      );

      const response = NextResponse.json({
        success: true,
        jobId: job.id,
        falRequestId,
        status: "processing",
        message: "Video generation started. Poll /api/generate/status for updates.",
      });

      logResponse(log, {
        method,
        url,
        requestId,
        statusCode: 200,
        durationMs: requestTimer.getDuration(),
      });

      return response;
    } catch (submitError) {
      // If submission fails, mark job as failed
      const errorMessage = submitError instanceof Error ? submitError.message : "Failed to submit";
      videoQueue.failJob(job.id, errorMessage);

      logError(log, submitError, "Failed to submit video generation", {
        jobId: job.id,
      });

      const response = NextResponse.json(
        {
          error: "Failed to submit video generation",
          details: errorMessage,
          jobId: job.id,
        },
        { status: 500 }
      );

      logResponse(log, {
        method,
        url,
        requestId,
        statusCode: 500,
        durationMs: requestTimer.getDuration(),
      });

      return response;
    }
  } catch (error) {
    // Log error with full stack trace
    logError(log, error, "Video generation failed", {
      url,
      method,
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    const response = NextResponse.json(
      { error: "Failed to process request", details: errorMessage },
      { status: 500 }
    );

    logResponse(log, {
      method,
      url,
      requestId,
      statusCode: 500,
      durationMs: requestTimer.getDuration(),
    });

    return response;
  }
}

/**
 * GET /api/generate
 * Get queue statistics
 */
export async function GET() {
  const stats = videoQueue.getQueueStats();

  return NextResponse.json({
    success: true,
    stats,
  });
}
