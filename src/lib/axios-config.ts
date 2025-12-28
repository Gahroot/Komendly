import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import axiosRetry, { exponentialDelay, isNetworkOrIdempotentRequestError } from 'axios-retry';
import { logger } from './logger';

/**
 * Axios Configuration with Automatic Retries
 *
 * Provides pre-configured axios instances with:
 * - Automatic retries on network errors and 5xx responses
 * - Exponential backoff (2^attempt * 1000ms)
 * - Request/response logging
 * - Timeout handling
 */

interface RetryConfig {
  retries?: number;
  retryDelay?: (retryCount: number, error: AxiosError) => number;
  retryCondition?: (error: AxiosError) => boolean;
  timeout?: number;
  onRetry?: (retryCount: number, error: AxiosError, requestConfig: AxiosRequestConfig) => void;
}

/**
 * Create axios instance with retry logic
 */
export function createAxiosWithRetry(config?: RetryConfig): AxiosInstance {
  const {
    retries = 3,
    retryDelay = exponentialDelay,
    retryCondition = isNetworkOrIdempotentRequestError,
    timeout = 10000,
    onRetry,
  } = config || {};

  const instance = axios.create({
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Configure retry logic
  axiosRetry(instance, {
    retries,
    retryDelay,
    retryCondition,
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn(
        {
          url: requestConfig.url,
          method: requestConfig.method,
          retryCount,
          error: error.message,
        },
        `Retrying request (attempt ${retryCount}/${retries})`
      );

      if (onRetry) {
        onRetry(retryCount, error, requestConfig);
      }
    },
  });

  // Request interceptor for logging
  instance.interceptors.request.use(
    (config) => {
      logger.debug(
        { method: config.method, url: config.url },
        `HTTP Request: ${config.method?.toUpperCase()} ${config.url}`
      );
      return config;
    },
    (error) => {
      logger.error({ error }, 'Request interceptor error');
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging
  instance.interceptors.response.use(
    (response) => {
      logger.debug(
        {
          method: response.config.method,
          url: response.config.url,
          status: response.status,
        },
        `HTTP Response: ${response.status} ${response.config.url}`
      );
      return response;
    },
    (error: AxiosError) => {
      logger.error(
        {
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          error: error.message,
        },
        `HTTP Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`
      );
      return Promise.reject(error);
    }
  );

  return instance;
}

/**
 * Pre-configured axios instances
 */

// OpenAI API - Longer timeout for AI generation
export const openaiAxios = createAxiosWithRetry({
  retries: 3,
  timeout: 60000, // 60 seconds for AI generation
  retryCondition: (error) => {
    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }
    return isNetworkOrIdempotentRequestError(error);
  },
});

// Mirage/RapidAPI - Increased timeout for video generation
export const mirageAxios = createAxiosWithRetry({
  retries: 4,
  timeout: 30000, // 30 seconds - Mirage API can take longer
  retryCondition: (error) => {
    // Don't retry on 429 - could be quota exhausted
    if (error.response?.status === 429) return false;
    // Don't retry on other 4xx errors
    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }
    return isNetworkOrIdempotentRequestError(error);
  },
});

// Generic HTTP client with retry
export const httpClient = createAxiosWithRetry();

/**
 * Helper: Check if error is retryable
 */
export function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return true;
  if (error.response.status >= 500) return true;
  if (error.response.status === 429) return true;
  const retryableStatuses = [408, 502, 503, 504];
  if (retryableStatuses.includes(error.response.status)) return true;
  return false;
}

/**
 * Helper: Extract error message from axios error
 */
export function getAxiosErrorMessage(error: AxiosError): string {
  if (error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    return (data.message as string) || (data.error as string) || (data.error_message as string) || error.message;
  }
  return error.message;
}
