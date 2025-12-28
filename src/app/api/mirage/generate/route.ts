import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { submitVideoGeneration } from '@/lib/mirage/client';
import { generateUGCScript, generateSimpleScript } from '@/lib/openai-script';
import { logger } from '@/lib/logger';

/**
 * Request schema for video generation
 */
const generateRequestSchema = z.object({
  reviewId: z.string().min(1, 'Review ID is required'),
  creatorName: z.string().min(1, 'Creator name is required'),
  targetDuration: z.number().min(15).max(60).default(30),
  resolution: z.enum(['fhd', '4k']).default('4k'),
  useAIScript: z.boolean().default(true),
  customScript: z.string().max(800).optional(),
});

/**
 * POST /api/mirage/generate
 *
 * Generate a testimonial video using Mirage AI Creator API
 */
export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json();
    const validationResult = generateRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { reviewId, creatorName, targetDuration, resolution, useAIScript, customScript } = validationResult.data;

    // Fetch the review
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        userId: session.user.id,
      },
    });

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    logger.info(
      { userId: session.user.id, reviewId, creatorName, targetDuration },
      'Starting video generation'
    );

    // Generate script
    let script: string;

    if (customScript) {
      script = customScript;
    } else if (useAIScript && process.env.OPENAI_API_KEY) {
      try {
        script = await generateUGCScript(review.reviewText, targetDuration);
      } catch (scriptError) {
        logger.warn({ error: scriptError }, 'AI script generation failed, using simple script');
        script = generateSimpleScript(review.reviewText, review.reviewerName, review.businessName);
      }
    } else {
      script = generateSimpleScript(review.reviewText, review.reviewerName, review.businessName);
    }

    logger.info({ scriptLength: script.length }, 'Script generated');

    // Submit to Mirage API
    const { operationId } = await submitVideoGeneration({
      script,
      creatorName,
      resolution,
    });

    // Create video record in database
    const video = await prisma.generatedVideo.create({
      data: {
        userId: session.user.id,
        reviewId,
        avatarStyle: creatorName,
        aspectRatio: '9:16', // Mirage generates vertical video
        status: 'pending',
        mirageOperationId: operationId,
        mirageCreatorName: creatorName,
        mirageResolution: resolution,
        generatedScript: script,
      },
    });

    logger.info(
      { videoId: video.id, operationId, creatorName },
      'Video generation submitted to Mirage'
    );

    return NextResponse.json({
      success: true,
      videoId: video.id,
      operationId,
      status: 'pending',
      message: 'Video generation started. Poll /api/mirage/status for updates.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Video generation failed');

    // Check for specific error types
    if (errorMessage.includes('MIRAGE_API_KEY')) {
      return NextResponse.json(
        { error: 'Mirage API not configured' },
        { status: 503 }
      );
    }

    if (errorMessage.includes('Rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
