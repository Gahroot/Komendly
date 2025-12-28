import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { videoQueue, type JobStatus } from "@/lib/video-queue";
import {
  pollQueueStatus,
  getQueueResult,
  type Duration,
  DURATION_OPTIONS,
} from "@/lib/fal/video-generator";
import type { GenerationStage } from "@/components/generation-progress";

// Map queue job status to generation stage for UI
function mapJobStatusToStage(job: {
  status: JobStatus;
  progress: number;
}): GenerationStage {
  if (job.status === "completed") return "complete";
  if (job.status === "failed") return "error";
  if (job.status === "pending") return "script";

  // When processing, infer stage from progress
  if (job.progress < 25) return "script";
  if (job.progress < 50) return "audio";
  if (job.progress < 85) return "video";
  return "processing";
}

// Calculate stage-specific progress
function calculateStageProgress(progress: number): number {
  if (progress < 25) {
    // Script stage: 0-25 maps to 0-100
    return (progress / 25) * 100;
  } else if (progress < 50) {
    // Audio stage: 25-50 maps to 0-100
    return ((progress - 25) / 25) * 100;
  } else if (progress < 85) {
    // Video stage: 50-85 maps to 0-100
    return ((progress - 50) / 35) * 100;
  } else {
    // Processing stage: 85-100 maps to 0-100
    return ((progress - 85) / 15) * 100;
  }
}

// Estimate remaining time based on progress
function estimateRemainingTime(progress: number, startedAt?: Date): number {
  if (!startedAt || progress <= 0) {
    // Default estimate of 30 seconds for a new job
    return 30;
  }

  const elapsed = (Date.now() - startedAt.getTime()) / 1000;
  if (progress >= 100) return 0;

  // Estimate total time based on current progress
  const estimatedTotal = (elapsed / progress) * 100;
  const remaining = estimatedTotal - elapsed;

  // Clamp to reasonable values
  return Math.max(0, Math.min(remaining, 300));
}

// Poll fal.ai and update job status
async function syncWithFalAi(jobId: string): Promise<void> {
  const job = videoQueue.getJob(jobId);

  if (!job || !job.falRequestId || !env.FAL_API_KEY) {
    return;
  }

  // Only poll for processing jobs
  if (job.status !== "processing") {
    return;
  }

  try {
    const falStatus = await pollQueueStatus(env.FAL_API_KEY, job.falRequestId);

    switch (falStatus.status) {
      case "COMPLETED": {
        const result = await getQueueResult(env.FAL_API_KEY, job.falRequestId);
        if (result?.video) {
          const duration = (job.metadata?.duration as Duration) || "5";
          videoQueue.completeJob(job.id, {
            url: result.video.url,
            duration: DURATION_OPTIONS[duration].seconds,
            contentType: result.video.content_type,
          });
        }
        break;
      }
      case "FAILED":
        videoQueue.failJob(job.id, falStatus.error || "Video generation failed");
        break;
      case "IN_PROGRESS":
        // Estimate progress (50-85% for video generation)
        videoQueue.updateProgress(job.id, 65);
        break;
      case "IN_QUEUE":
        // Estimate progress based on queue position
        if (falStatus.position) {
          const estimatedProgress = Math.max(5, 25 - falStatus.position * 2);
          videoQueue.updateProgress(job.id, estimatedProgress);
        } else {
          videoQueue.updateProgress(job.id, 10);
        }
        break;
    }
  } catch (error) {
    console.error("Failed to sync with fal.ai:", error);
  }
}

// SSE endpoint for real-time progress updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Check Accept header for SSE vs JSON
  const acceptHeader = request.headers.get("accept") || "";
  const wantsSSE = acceptHeader.includes("text/event-stream");

  const job = videoQueue.getJob(jobId);

  if (!job) {
    if (wantsSSE) {
      const errorData = JSON.stringify({
        stage: "error" as GenerationStage,
        stageProgress: 0,
        overallProgress: 0,
        status: "error",
        error: "Job not found",
      });
      return new Response(`data: ${errorData}\n\n`, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
    return NextResponse.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  // For JSON requests, sync with fal.ai and return current status
  if (!wantsSSE) {
    await syncWithFalAi(jobId);

    const currentJob = videoQueue.getJob(jobId);
    if (!currentJob) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    const stage = mapJobStatusToStage(currentJob);
    const stageProgress = calculateStageProgress(currentJob.progress);
    const estimatedTimeRemaining = estimateRemainingTime(
      currentJob.progress,
      currentJob.startedAt
    );

    return NextResponse.json({
      success: true,
      job: {
        id: currentJob.id,
        stage,
        stageProgress: Math.round(stageProgress),
        overallProgress: currentJob.progress,
        estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
        status:
          currentJob.status === "completed"
            ? "complete"
            : currentJob.status === "failed"
            ? "error"
            : currentJob.status === "pending"
            ? "queued"
            : "generating",
        videoUrl: currentJob.result?.url,
        error: currentJob.error,
        createdAt: currentJob.createdAt,
        startedAt: currentJob.startedAt,
        completedAt: currentJob.completedAt,
        priority: currentJob.priority,
        retryCount: currentJob.retryCount,
      },
    });
  }

  // Create SSE stream for real-time updates
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let pollCount = 0;
      const maxPolls = 600; // 5 minutes at 500ms intervals

      // Send status update
      const sendStatus = async (): Promise<boolean> => {
        // Sync with fal.ai every 3rd poll to avoid rate limiting
        if (pollCount % 3 === 0) {
          await syncWithFalAi(jobId);
        }
        pollCount++;

        const currentJob = videoQueue.getJob(jobId);

        if (!currentJob) {
          const errorData = JSON.stringify({
            stage: "error" as GenerationStage,
            stageProgress: 0,
            overallProgress: 0,
            status: "error",
            error: "Job not found",
          });
          try {
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          } catch {
            // Stream already closed
          }
          return false;
        }

        const stage = mapJobStatusToStage(currentJob);
        const stageProgress = calculateStageProgress(currentJob.progress);
        const estimatedTimeRemaining = estimateRemainingTime(
          currentJob.progress,
          currentJob.startedAt
        );

        const data = JSON.stringify({
          stage,
          stageProgress: Math.round(stageProgress),
          overallProgress: currentJob.progress,
          estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
          status:
            currentJob.status === "completed"
              ? "complete"
              : currentJob.status === "failed"
              ? "error"
              : currentJob.status === "pending"
              ? "queued"
              : "generating",
          videoUrl: currentJob.result?.url,
          error: currentJob.error,
        });

        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          return false;
        }

        // Close stream if job is complete or failed
        if (
          currentJob.status === "completed" ||
          currentJob.status === "failed"
        ) {
          try {
            controller.close();
          } catch {
            // Already closed
          }
          return false;
        }

        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          const timeoutData = JSON.stringify({
            stage: "error" as GenerationStage,
            stageProgress: 0,
            overallProgress: 0,
            status: "error",
            error: "Polling timeout - job still in progress",
          });
          try {
            controller.enqueue(encoder.encode(`data: ${timeoutData}\n\n`));
            controller.close();
          } catch {
            // Already closed
          }
          return false;
        }

        return true;
      };

      // Send initial status
      if (!(await sendStatus())) return;

      // Poll for updates every 500ms
      const interval = setInterval(async () => {
        if (!(await sendStatus())) {
          clearInterval(interval);
        }
      }, 500);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Cancel job endpoint
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = videoQueue.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  if (job.status === "completed" || job.status === "failed") {
    return NextResponse.json(
      { success: false, error: "Job already finished" },
      { status: 400 }
    );
  }

  const cancelledJob = videoQueue.cancelJob(jobId);

  if (!cancelledJob) {
    return NextResponse.json(
      { success: false, error: "Failed to cancel job" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Job cancelled",
    job: {
      id: cancelledJob.id,
      status: cancelledJob.status,
    },
  });
}

// Retry or update job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));

  const job = videoQueue.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  // Handle retry action
  if (body.action === "retry") {
    if (job.status !== "failed") {
      return NextResponse.json(
        { success: false, error: "Can only retry failed jobs" },
        { status: 400 }
      );
    }

    const retriedJob = videoQueue.retryJob(jobId);

    return NextResponse.json({
      success: true,
      message: "Job queued for retry",
      job: retriedJob
        ? {
            id: retriedJob.id,
            status: retriedJob.status,
            retryCount: retriedJob.retryCount,
          }
        : null,
    });
  }

  // Handle priority change
  if (body.priority) {
    const updatedJob = videoQueue.setPriority(jobId, body.priority);

    return NextResponse.json({
      success: true,
      message: "Job priority updated",
      job: updatedJob
        ? {
            id: updatedJob.id,
            priority: updatedJob.priority,
          }
        : null,
    });
  }

  // Default: return current status (sync first)
  await syncWithFalAi(jobId);

  const currentJob = videoQueue.getJob(jobId);
  if (!currentJob) {
    return NextResponse.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  const stage = mapJobStatusToStage(currentJob);
  const stageProgress = calculateStageProgress(currentJob.progress);
  const estimatedTimeRemaining = estimateRemainingTime(
    currentJob.progress,
    currentJob.startedAt
  );

  return NextResponse.json({
    success: true,
    job: {
      id: currentJob.id,
      stage,
      stageProgress: Math.round(stageProgress),
      overallProgress: currentJob.progress,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      status:
        currentJob.status === "completed"
          ? "complete"
          : currentJob.status === "failed"
          ? "error"
          : currentJob.status === "pending"
          ? "queued"
          : "generating",
      videoUrl: currentJob.result?.url,
      error: currentJob.error,
      createdAt: currentJob.createdAt,
      startedAt: currentJob.startedAt,
      completedAt: currentJob.completedAt,
    },
  });
}
