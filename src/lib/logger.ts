import pino, { Logger, LoggerOptions } from 'pino';

// Environment detection
const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// Patterns for sensitive data that should be redacted
const REDACT_PATHS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'apikey',
  'secret',
  'authorization',
  'auth',
  'credentials',
  'FAL_API_KEY',
  'DATABASE_URL',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.api_key',
  '*.secret',
];

// Base logger configuration
const baseOptions: LoggerOptions = {
  level: logLevel,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.1.0',
  },
};

// Development transport with pretty printing
const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    singleLine: false,
    messageFormat: '{msg}',
  },
};

// Create the root logger
const rootLogger: Logger = pino({
  ...baseOptions,
  ...(isDev ? { transport: devTransport } : {}),
});

// Module-specific child loggers
export const logger = rootLogger;
export const apiLogger = rootLogger.child({ module: 'api' });
export const scraperLogger = rootLogger.child({ module: 'scraper' });
export const videoGenLogger = rootLogger.child({ module: 'video-gen' });
export const dbLogger = rootLogger.child({ module: 'database' });
export const authLogger = rootLogger.child({ module: 'auth' });

/**
 * Request duration tracking utility
 * Returns an object with start time and a done() method to calculate duration
 */
export function createRequestTimer() {
  const startTime = performance.now();
  const startTimestamp = new Date().toISOString();

  return {
    startTime,
    startTimestamp,
    /**
     * Calculate the duration since the timer was started
     * @returns Duration in milliseconds
     */
    getDuration(): number {
      return Math.round(performance.now() - startTime);
    },
    /**
     * Get duration formatted as a string
     * @returns Formatted duration string (e.g., "125ms" or "1.5s")
     */
    getDurationFormatted(): string {
      const duration = this.getDuration();
      if (duration < 1000) {
        return `${duration}ms`;
      }
      return `${(duration / 1000).toFixed(2)}s`;
    },
  };
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, baseLogger: Logger = apiLogger): Logger {
  return baseLogger.child({ requestId });
}

/**
 * Log an error with full stack trace
 */
export function logError(
  log: Logger,
  error: unknown,
  message: string,
  context: Record<string, unknown> = {}
): void {
  if (error instanceof Error) {
    log.error(
      {
        ...context,
        err: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause,
        },
      },
      message
    );
  } else {
    log.error(
      {
        ...context,
        err: {
          message: String(error),
        },
      },
      message
    );
  }
}

/**
 * Performance timer for specific operations
 * Usage:
 *   const timer = createPerformanceTimer(logger, 'video-generation');
 *   // ... do work ...
 *   timer.end({ videoId: '123' }); // logs completion with duration
 */
export function createPerformanceTimer(log: Logger, operationName: string) {
  const timer = createRequestTimer();
  log.debug({ operation: operationName }, `Starting ${operationName}`);

  return {
    /**
     * End the timer and log the completion with duration
     */
    end(context: Record<string, unknown> = {}): number {
      const duration = timer.getDuration();
      log.info(
        {
          operation: operationName,
          durationMs: duration,
          durationFormatted: timer.getDurationFormatted(),
          ...context,
        },
        `Completed ${operationName}`
      );
      return duration;
    },
    /**
     * End the timer with an error
     */
    error(error: unknown, context: Record<string, unknown> = {}): number {
      const duration = timer.getDuration();
      logError(log, error, `Failed ${operationName}`, {
        operation: operationName,
        durationMs: duration,
        durationFormatted: timer.getDurationFormatted(),
        ...context,
      });
      return duration;
    },
    /**
     * Log an intermediate step without ending the timer
     */
    step(stepName: string, context: Record<string, unknown> = {}): void {
      log.debug(
        {
          operation: operationName,
          step: stepName,
          elapsedMs: timer.getDuration(),
          ...context,
        },
        `${operationName}: ${stepName}`
      );
    },
  };
}

/**
 * HTTP request/response logging helper for API routes
 */
export interface RequestLogContext {
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  requestId: string;
}

export interface ResponseLogContext extends RequestLogContext {
  statusCode: number;
  durationMs: number;
}

export function logRequest(log: Logger, context: RequestLogContext): void {
  log.info(context, `Incoming ${context.method} ${context.url}`);
}

export function logResponse(log: Logger, context: ResponseLogContext): void {
  const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info';
  log[level](context, `Response ${context.statusCode} ${context.method} ${context.url}`);
}

// Export types for external use
export type { Logger };

// Default export for convenience
export default logger;
