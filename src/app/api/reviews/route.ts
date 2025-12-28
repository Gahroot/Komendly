import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Request schema for creating a review
 */
const createReviewSchema = z.object({
  reviewText: z.string().min(1, 'Review text is required').max(2000, 'Review too long'),
  reviewerName: z.string().min(1, 'Reviewer name is required').max(100),
  businessName: z.string().min(1, 'Business name is required').max(200),
  rating: z.number().min(1).max(5).default(5),
  source: z.string().default('manual'),
});

/**
 * POST /api/reviews
 *
 * Create a new review
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
    const validationResult = createReviewSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { reviewText, reviewerName, businessName, rating, source } = validationResult.data;

    // Create review
    const review = await prisma.review.create({
      data: {
        userId: session.user.id,
        reviewText,
        reviewerName,
        businessName,
        rating,
        source,
      },
    });

    logger.info({ reviewId: review.id, userId: session.user.id }, 'Review created');

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        reviewText: review.reviewText,
        reviewerName: review.reviewerName,
        businessName: review.businessName,
        rating: review.rating,
        source: review.source,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to create review');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reviews
 *
 * List reviews for the current user
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

    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch reviews
    const reviews = await prisma.review.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { generatedVideos: true },
        },
      },
    });

    const total = await prisma.review.count({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      reviews: reviews.map(review => ({
        id: review.id,
        reviewText: review.reviewText,
        reviewerName: review.reviewerName,
        businessName: review.businessName,
        rating: review.rating,
        source: review.source,
        createdAt: review.createdAt,
        videoCount: review._count.generatedVideos,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch reviews');

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
