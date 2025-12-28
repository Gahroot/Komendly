import CircuitBreaker from 'opossum';
import { logger } from './logger';

/**
 * Circuit Breaker Wrapper for External APIs
 *
 * Prevents cascading failures when external services are down.
 *
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Service failing, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

interface CircuitBreakerConfig {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  name?: string;
}

/**
 * Create a circuit breaker for an async function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: CircuitBreakerConfig
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  const {
    timeout = 10000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    volumeThreshold = 5,
    name = fn.name || 'unnamed',
  } = config || {};

  const breaker = new CircuitBreaker(fn, {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    volumeThreshold,
    name,
  });

  breaker.on('open', () => {
    logger.warn({ circuit: name, state: 'OPEN' }, `Circuit breaker opened for ${name}`);
  });

  breaker.on('halfOpen', () => {
    logger.info({ circuit: name, state: 'HALF_OPEN' }, `Circuit breaker half-open for ${name}`);
  });

  breaker.on('close', () => {
    logger.info({ circuit: name, state: 'CLOSED' }, `Circuit breaker closed for ${name}`);
  });

  breaker.on('failure', (error) => {
    logger.error({ circuit: name, error }, `Circuit breaker failure in ${name}`);
  });

  return breaker as CircuitBreaker<Parameters<T>, ReturnType<T>>;
}

/**
 * Pre-configured circuit breakers for common APIs
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createOpenAICircuitBreaker<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return createCircuitBreaker(fn, {
    timeout: 60000, // AI can be slow
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 3,
    name: `openai:${fn.name}`,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMirageCircuitBreaker<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return createCircuitBreaker(fn, {
    timeout: 30000, // Video API can be slow
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 3,
    name: `mirage:${fn.name}`,
  });
}

/**
 * Get circuit breaker stats
 */
export function getCircuitBreakerStats(breaker: CircuitBreaker<unknown[], unknown>) {
  const stats = breaker.stats;
  return {
    name: breaker.name,
    state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    failures: stats.failures,
    successes: stats.successes,
    timeouts: stats.timeouts,
    rejects: stats.rejects,
  };
}
