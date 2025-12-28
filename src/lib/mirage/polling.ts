import { prisma } from '@/lib/prisma';
import { checkVideoStatus } from './client';
import { logger } from '@/lib/logger';

/**
 * Background Polling Job for Video Status
 *
 * This module provides functions to poll pending/processing videos
 * and update their status in the database.
 *
 * Usage:
 * - Call pollPendingVideos() periodically (e.g., every 30 seconds)
 * - Can be triggered via cron job, setInterval, or API endpoint
 */

/**
 * Poll all pending/processing videos and update their status
 */
export async function pollPendingVideos(): Promise<{
  polled: number;
  completed: number;
  failed: number;
  stillProcessing: number;
}> {
  const stats = {
    polled: 0,
    completed: 0,
    failed: 0,
    stillProcessing: 0,
  };

  try {
    // Find all videos that need polling
    const pendingVideos = await prisma.generatedVideo.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
        mirageOperationId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 50, // Limit batch size
    });

    if (pendingVideos.length === 0) {
      logger.debug('No pending videos to poll');
      return stats;
    }

    logger.info({ count: pendingVideos.length }, 'Polling pending videos');

    for (const video of pendingVideos) {
      if (!video.mirageOperationId) continue;

      stats.polled++;

      try {
        const status = await checkVideoStatus(video.mirageOperationId);

        if (status.status === 'completed') {
          await prisma.generatedVideo.update({
            where: { id: video.id },
            data: {
              status: 'completed',
              url: status.videoUrl,
              thumbnailUrl: status.thumbnailUrl,
              duration: status.duration,
              creditsUsed: status.creditsUsed,
              completedAt: new Date(),
            },
          });
          stats.completed++;
          logger.info({ videoId: video.id, operationId: video.mirageOperationId }, 'Video completed');
        } else if (status.status === 'failed') {
          await prisma.generatedVideo.update({
            where: { id: video.id },
            data: {
              status: 'failed',
              errorMessage: status.error,
              completedAt: new Date(),
            },
          });
          stats.failed++;
          logger.error({ videoId: video.id, error: status.error }, 'Video failed');
        } else {
          // Update to processing if still pending
          if (video.status === 'pending' && status.status === 'processing') {
            await prisma.generatedVideo.update({
              where: { id: video.id },
              data: { status: 'processing' },
            });
          }
          stats.stillProcessing++;
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (pollError) {
        logger.error(
          { videoId: video.id, error: pollError },
          'Failed to poll video status'
        );
      }
    }

    logger.info(stats, 'Polling complete');
    return stats;
  } catch (error) {
    logger.error({ error }, 'Polling job failed');
    throw error;
  }
}

/**
 * Start a polling interval (for development/simple deployments)
 * For production, use a proper job queue like BullMQ
 */
let pollingInterval: NodeJS.Timeout | null = null;

export function startPolling(intervalMs: number = 30000): void {
  if (pollingInterval) {
    logger.warn('Polling already running');
    return;
  }

  logger.info({ intervalMs }, 'Starting video status polling');

  pollingInterval = setInterval(async () => {
    try {
      await pollPendingVideos();
    } catch (error) {
      logger.error({ error }, 'Polling interval error');
    }
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('Polling stopped');
  }
}

/**
 * Check if a specific video has completed
 * Useful for client-side polling
 */
export async function checkVideoComplete(videoId: string): Promise<{
  completed: boolean;
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const video = await prisma.generatedVideo.findUnique({
    where: { id: videoId },
  });

  if (!video) {
    return { completed: false, status: 'not_found', error: 'Video not found' };
  }

  if (video.status === 'completed') {
    return {
      completed: true,
      status: 'completed',
      videoUrl: video.url || undefined,
    };
  }

  if (video.status === 'failed') {
    return {
      completed: true, // Finished, but with error
      status: 'failed',
      error: video.errorMessage || 'Unknown error',
    };
  }

  return {
    completed: false,
    status: video.status,
  };
}
