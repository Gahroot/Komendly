import { NextResponse } from 'next/server';
import { listCreators } from '@/lib/mirage/client';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

/**
 * GET /api/mirage/creators
 *
 * List all available Mirage AI creators
 */
export async function GET() {
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

    // Fetch creators from Mirage API
    const { creators, total } = await listCreators();

    logger.info({ userId: session.user.id, count: total }, 'Fetched Mirage creators');

    return NextResponse.json({
      creators,
      count: total,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch Mirage creators');

    // Check for specific error types
    if (errorMessage.includes('MIRAGE_API_KEY')) {
      return NextResponse.json(
        { error: 'Mirage API not configured' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
