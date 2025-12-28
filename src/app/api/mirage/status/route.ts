import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { checkVideoStatus } from '@/lib/mirage/client';
import { logger } from '@/lib/logger';

/**
 * GET /api/mirage/status?videoId=xxx or ?operationId=xxx
 *
 * Check the status of a video generation request
 */
export async function GET(request: NextRequest) {
  try {
    // Validate session
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Get video ID or operation ID from query params
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    const operationId = searchParams.get('operationId');

    if (!videoId && !operationId) {
      return NextResponse.json(
        { error: 'Either videoId or operationId is required' },
        { status: 400 }
      );
    }

    // Find the video record
    const video = await prisma.generatedVideo.findFirst({
      where: {
        userId: session.user.id,
        ...(videoId ? { id: videoId } : { mirageOperationId: operationId }),
      },
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // If video is already completed or failed, return stored status
    if (video.status === 'completed' || video.status === 'failed') {
      return NextResponse.json({
        videoId: video.id,
        operationId: video.mirageOperationId,
        status: video.status,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        creditsUsed: video.creditsUsed,
        error: video.errorMessage,
        completedAt: video.completedAt,
      });
    }

    // If no operation ID, something went wrong
    if (!video.mirageOperationId) {
      return NextResponse.json({
        videoId: video.id,
        status: 'failed',
        error: 'No operation ID found for this video',
      });
    }

    // Poll Mirage API for status
    try {
      const mirageStatus = await checkVideoStatus(video.mirageOperationId);

      // Update database if status changed
      if (mirageStatus.status === 'completed') {
        await prisma.generatedVideo.update({
          where: { id: video.id },
          data: {
            status: 'completed',
            url: mirageStatus.videoUrl,
            thumbnailUrl: mirageStatus.thumbnailUrl,
            duration: mirageStatus.duration,
            creditsUsed: mirageStatus.creditsUsed,
            completedAt: new Date(),
          },
        });

        logger.info({ videoId: video.id }, 'Video completed, database updated');
      } else if (mirageStatus.status === 'failed') {
        await prisma.generatedVideo.update({
          where: { id: video.id },
          data: {
            status: 'failed',
            errorMessage: mirageStatus.error,
            completedAt: new Date(),
          },
        });

        logger.error({ videoId: video.id, error: mirageStatus.error }, 'Video failed');
      } else if (mirageStatus.status === 'processing' && video.status !== 'processing') {
        await prisma.generatedVideo.update({
          where: { id: video.id },
          data: { status: 'processing' },
        });
      }

      return NextResponse.json({
        videoId: video.id,
        operationId: video.mirageOperationId,
        status: mirageStatus.status,
        progress: mirageStatus.progress,
        videoUrl: mirageStatus.videoUrl,
        thumbnailUrl: mirageStatus.thumbnailUrl,
        duration: mirageStatus.duration,
        creditsUsed: mirageStatus.creditsUsed,
        error: mirageStatus.error,
      });
    } catch (pollError) {
      // If polling fails, return last known status
      logger.error({ error: pollError, videoId: video.id }, 'Failed to poll Mirage status');

      return NextResponse.json({
        videoId: video.id,
        operationId: video.mirageOperationId,
        status: video.status,
        error: 'Failed to check status. Will retry automatically.',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Status check failed');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mirage/status
 *
 * Webhook endpoint for Mirage to notify us of video completion
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId, state, url, thumbnailUrl, duration, creditsUsed, error } = body;

    if (!operationId) {
      return NextResponse.json({ error: 'operationId is required' }, { status: 400 });
    }

    logger.info({ operationId, state }, 'Received Mirage webhook');

    // Find the video by operation ID
    const video = await prisma.generatedVideo.findFirst({
      where: { mirageOperationId: operationId },
    });

    if (!video) {
      logger.warn({ operationId }, 'Video not found for webhook');
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Map Mirage state to our status
    const statusMap: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {
      'QUEUED': 'pending',
      'PROCESSING': 'processing',
      'COMPLETED': 'completed',
      'COMPLETE': 'completed',
      'FAILED': 'failed',
    };

    const status = statusMap[state?.toUpperCase()] || 'pending';

    // Update the video record
    await prisma.generatedVideo.update({
      where: { id: video.id },
      data: {
        status,
        url: url || video.url,
        thumbnailUrl: thumbnailUrl || video.thumbnailUrl,
        duration: duration || video.duration,
        creditsUsed: creditsUsed || video.creditsUsed,
        errorMessage: error || video.errorMessage,
        ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
      },
    });

    logger.info({ videoId: video.id, status }, 'Video updated from webhook');

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Webhook processing failed');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
