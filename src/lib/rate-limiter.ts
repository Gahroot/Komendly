import Bottleneck from 'bottleneck';
import { logger } from './logger';

/**
 * Rate Limiting with Bottleneck
 *
 * Coordinates rate limiting across concurrent operations.
 * Prevents API rate limit violations by queueing requests.
 */

interface RateLimiterConfig {
  maxConcurrent?: number;
  minTime?: number;
  reservoir?: number;
  reservoirRefreshAmount?: number;
  reservoirRefreshInterval?: number;
  id?: string;
}

/**
 * Create a rate limiter
 */
export function createRateLimiter(config: RateLimiterConfig): Bottleneck {
  const {
    maxConcurrent = 1,
    minTime = 0,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id = 'default',
  } = config;

  const limiter = new Bottleneck({
    maxConcurrent,
    minTime,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id,
  });

  limiter.on('failed', async (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage, limiterId: id }, `Rate limiter job failed`);
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return 5000; // Retry after 5 seconds
    }
  });

  limiter.on('depleted', () => {
    logger.warn({ limiterId: id }, 'Rate limiter reservoir depleted');
  });

  return limiter;
}

/**
 * Pre-configured rate limiters
 */

// OpenAI: ~500 RPM for tier 1
export const openaiRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 150,
  reservoir: 500,
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 60 * 1000,
  id: 'openai',
});

// Mirage: ~5 req/min for video generation
export const mirageRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 12000, // 12 seconds between requests (5 per minute)
  reservoir: 5,
  reservoirRefreshAmount: 5,
  reservoirRefreshInterval: 60 * 1000,
  id: 'mirage',
});

// Generic API limiter (conservative)
export const genericRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 500,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'generic',
});

/**
 * Wrap a function with rate limiting
 */
export function withRateLimit<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  limiter: Bottleneck
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return limiter.schedule(() => fn(...args)) as Promise<TResult>;
  };
}

/**
 * Get rate limiter stats
 */
export function getRateLimiterStats(limiter: Bottleneck) {
  const counts = limiter.counts();
  return {
    running: counts.RUNNING,
    queued: counts.QUEUED,
    done: counts.DONE,
  };
}
