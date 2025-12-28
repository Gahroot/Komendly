/**
 * Video Queue Management System
 * Tracks video generation jobs with status, priority, and cleanup functionality
 */

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface VideoJobResult {
  url: string;
  duration: number;
  contentType?: string;
  width?: number;
  height?: number;
}

export interface VideoJob {
  id: string;
  userId: string;
  reviewId: string;
  status: JobStatus;
  priority: JobPriority;
  progress: number; // 0-100
  result?: VideoJobResult;
  error?: string;
  falRequestId?: string; // Request ID from fal.ai
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, unknown>;
}

export interface CreateJobInput {
  userId: string;
  reviewId: string;
  priority?: JobPriority;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface JobUpdateInput {
  status?: JobStatus;
  progress?: number;
  result?: VideoJobResult;
  error?: string;
  falRequestId?: string;
  retryCount?: number;
}

// Priority weights for sorting (higher = more urgent)
const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

/**
 * In-memory video queue manager
 * For production, replace with Redis or database storage
 */
class VideoQueueManager {
  private jobs: Map<string, VideoJob> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private cleanupIntervalMs: number = 5 * 60 * 1000; // 5 minutes
  private maxCompletedJobAge: number = 60 * 60 * 1000; // 1 hour
  private maxFailedJobAge: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `job_${timestamp}_${randomPart}`;
  }

  /**
   * Create a new video generation job
   */
  createJob(input: CreateJobInput): VideoJob {
    const now = new Date();
    const job: VideoJob = {
      id: this.generateJobId(),
      userId: input.userId,
      reviewId: input.reviewId,
      status: "pending",
      priority: input.priority || "normal",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 3,
      metadata: input.metadata,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): VideoJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs for a user
   */
  getJobsByUser(userId: string): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get all jobs for a review
   */
  getJobsByReview(reviewId: string): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.reviewId === reviewId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get pending jobs sorted by priority (highest first)
   */
  getPendingJobsByPriority(): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "pending")
      .sort((a, b) => {
        // First sort by priority (descending)
        const priorityDiff =
          PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by creation time (ascending - older first)
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Get the next job to process based on priority
   */
  getNextJob(): VideoJob | undefined {
    const pendingJobs = this.getPendingJobsByPriority();
    return pendingJobs[0];
  }

  /**
   * Update a job
   */
  updateJob(jobId: string, updates: JobUpdateInput): VideoJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const now = new Date();
    const updatedJob: VideoJob = {
      ...job,
      ...updates,
      updatedAt: now,
    };

    // Set startedAt when job starts processing
    if (updates.status === "processing" && !job.startedAt) {
      updatedJob.startedAt = now;
    }

    // Set completedAt when job completes or fails
    if (
      (updates.status === "completed" || updates.status === "failed") &&
      !job.completedAt
    ) {
      updatedJob.completedAt = now;
    }

    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }

  /**
   * Mark a job as processing
   */
  startProcessing(jobId: string, falRequestId?: string): VideoJob | undefined {
    return this.updateJob(jobId, {
      status: "processing",
      falRequestId,
      progress: 5,
    });
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number): VideoJob | undefined {
    return this.updateJob(jobId, { progress: Math.min(Math.max(progress, 0), 100) });
  }

  /**
   * Complete a job successfully
   */
  completeJob(jobId: string, result: VideoJobResult): VideoJob | undefined {
    return this.updateJob(jobId, {
      status: "completed",
      progress: 100,
      result,
    });
  }

  /**
   * Mark a job as failed
   */
  failJob(jobId: string, error: string): VideoJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    // Check if we should retry
    if (job.retryCount < job.maxRetries) {
      return this.updateJob(jobId, {
        status: "pending", // Back to pending for retry
        retryCount: job.retryCount + 1,
        error,
      });
    }

    return this.updateJob(jobId, {
      status: "failed",
      error,
    });
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /**
   * Cancel a pending or processing job
   */
  cancelJob(jobId: string): VideoJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    if (job.status === "pending" || job.status === "processing") {
      return this.updateJob(jobId, {
        status: "failed",
        error: "Job cancelled by user",
      });
    }

    return job;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byPriority: Record<JobPriority, number>;
  } {
    const jobs = Array.from(this.jobs.values());

    const stats = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byPriority: {
        low: 0,
        normal: 0,
        high: 0,
        urgent: 0,
      } as Record<JobPriority, number>,
    };

    for (const job of jobs) {
      stats[job.status]++;
      stats.byPriority[job.priority]++;
    }

    return stats;
  }

  /**
   * Cleanup old completed and failed jobs
   */
  cleanupOldJobs(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      const jobAge = now - job.updatedAt.getTime();

      if (job.status === "completed" && jobAge > this.maxCompletedJobAge) {
        this.jobs.delete(jobId);
        cleanedCount++;
      } else if (job.status === "failed" && jobAge > this.maxFailedJobAge) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old video jobs`);
    }

    return cleanedCount;
  }

  /**
   * Start the automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldJobs();
    }, this.cleanupIntervalMs);

    // Prevent the interval from keeping Node.js alive
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Configure cleanup settings
   */
  configureCleanup(options: {
    intervalMs?: number;
    maxCompletedAge?: number;
    maxFailedAge?: number;
  }): void {
    if (options.intervalMs !== undefined) {
      this.cleanupIntervalMs = options.intervalMs;
    }
    if (options.maxCompletedAge !== undefined) {
      this.maxCompletedJobAge = options.maxCompletedAge;
    }
    if (options.maxFailedAge !== undefined) {
      this.maxFailedJobAge = options.maxFailedAge;
    }

    // Restart the cleanup interval with new settings
    this.startCleanupInterval();
  }

  /**
   * Clear all jobs (useful for testing)
   */
  clearAll(): void {
    this.jobs.clear();
  }

  /**
   * Get all jobs (for debugging/admin)
   */
  getAllJobs(): VideoJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Find job by fal.ai request ID
   */
  findByFalRequestId(falRequestId: string): VideoJob | undefined {
    return Array.from(this.jobs.values()).find(
      (job) => job.falRequestId === falRequestId
    );
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): VideoJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "failed") return undefined;

    return this.updateJob(jobId, {
      status: "pending",
      progress: 0,
      error: undefined,
      retryCount: job.retryCount + 1,
    });
  }

  /**
   * Change job priority
   */
  setPriority(jobId: string, priority: JobPriority): VideoJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const updatedJob: VideoJob = {
      ...job,
      priority,
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }
}

// Singleton instance
export const videoQueue = new VideoQueueManager();

// Export types for external use
export type { VideoQueueManager };
