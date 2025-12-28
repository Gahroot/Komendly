import { mirageAxios } from '../axios-config';
import { logger } from '../logger';
import type {
  MirageCreator,
  SubmitVideoRequest,
  SubmitVideoResponse,
  VideoStatus,
  ListCreatorsResponse,
} from './types';

/**
 * Mirage AI Creator API Client (Captions.ai)
 *
 * API Base: https://api.captions.ai/api
 * Documentation: https://help.mirage.app/api-reference
 *
 * Features:
 * - Automatic retries with exponential backoff (4 attempts)
 * - Rate limiting (5 req/min for /creator/submit)
 * - Structured logging
 *
 * Authentication: x-api-key header
 */

const MIRAGE_API_KEY = process.env.MIRAGE_API_KEY;
const MIRAGE_BASE_URL = 'https://api.captions.ai/api';

/**
 * List all available AI creators and AI Twins
 */
export async function listCreators(): Promise<ListCreatorsResponse> {
  if (!MIRAGE_API_KEY) {
    throw new Error('MIRAGE_API_KEY not set in environment variables');
  }

  try {
    logger.info('Fetching available Mirage AI creators');

    const response = await mirageAxios.request({
      method: 'POST',
      url: `${MIRAGE_BASE_URL}/creator/list`,
      headers: {
        'x-api-key': MIRAGE_API_KEY,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    const supportedCreators = response.data.supportedCreators || [];
    const thumbnails = response.data.thumbnails || {};

    // Convert to our MirageCreator format
    const creators: MirageCreator[] = supportedCreators.map((name: string) => ({
      name,
      displayName: formatCreatorName(name),
      gender: inferGender(name),
      type: name.startsWith('twin-') ? 'twin' as const : 'community' as const,
      thumbnail: thumbnails[name]?.imageUrl,
      previewVideo: thumbnails[name]?.videoUrl,
    }));

    logger.info({ count: creators.length }, 'Fetched AI creators');

    return {
      creators,
      total: creators.length,
    };
  } catch (error) {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: { message?: string; error?: string; detail?: string };
      };
      message?: string;
    };

    const status = axiosError.response?.status;
    const responseData = axiosError.response?.data;

    let userMessage = 'Failed to list Mirage creators';

    if (status === 401 || status === 403) {
      userMessage = 'Mirage API authentication failed. Check your MIRAGE_API_KEY.';
    } else if (status === 429) {
      userMessage = 'Rate limit exceeded. Mirage API allows 5 requests per minute.';
    } else if (status && status >= 500) {
      userMessage = 'Mirage API server error. Try again later.';
    } else if (responseData?.detail || responseData?.message || responseData?.error) {
      userMessage = `${responseData.detail || responseData.message || responseData.error}`;
    }

    logger.error({ status, responseData, userMessage }, 'Mirage List Creators API Error');

    const enhancedError = new Error(userMessage);
    (enhancedError as Error & { originalError: unknown; status?: number }).originalError = error;
    (enhancedError as Error & { status?: number }).status = status;
    throw enhancedError;
  }
}

/**
 * Submit a video generation request to AI Creator API
 * Rate limit: 5 requests per minute
 */
export async function submitVideoGeneration(
  request: SubmitVideoRequest
): Promise<SubmitVideoResponse> {
  if (!MIRAGE_API_KEY) {
    throw new Error('MIRAGE_API_KEY not set in environment variables');
  }

  // Validate script length
  if (request.script.length > 800) {
    throw new Error(`Script too long: ${request.script.length} characters (max 800)`);
  }

  // Validate creatorName is provided
  if (!request.creatorName) {
    throw new Error('creatorName is required for AI Creator API');
  }

  try {
    logger.info(
      {
        creatorName: request.creatorName,
        scriptLength: request.script.length,
        resolution: request.resolution || '4k',
      },
      'Submitting video generation to Mirage AI Creator API'
    );

    const requestData: Record<string, unknown> = {
      script: request.script,
      creatorName: request.creatorName,
      resolution: request.resolution || '4k',
    };

    if (request.webhookId) {
      requestData.webhookId = request.webhookId;
    }

    const response = await mirageAxios.request({
      method: 'POST',
      url: `${MIRAGE_BASE_URL}/creator/submit`,
      headers: {
        'x-api-key': MIRAGE_API_KEY,
        'Content-Type': 'application/json',
      },
      data: requestData,
    });

    const operationId = response.data.operationId;

    logger.info(
      { operationId, creatorName: request.creatorName },
      'Video generation submitted successfully'
    );

    return {
      operationId,
      status: 'pending',
      message: response.data.message || 'Video generation started',
    };
  } catch (error) {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: { message?: string; error?: string; detail?: string };
      };
      message?: string;
    };

    const status = axiosError.response?.status;
    const responseData = axiosError.response?.data;

    let userMessage = 'Failed to submit video generation';

    if (status === 400) {
      const detail = responseData?.detail || responseData?.message || 'Check your parameters';
      userMessage = `Invalid request: ${detail}`;
    } else if (status === 401 || status === 403) {
      userMessage = 'Mirage API authentication failed. Check your MIRAGE_API_KEY.';
    } else if (status === 429) {
      userMessage = 'Rate limit exceeded. Mirage API allows 5 requests per minute.';
    } else if (status && status >= 500) {
      userMessage = 'Mirage API server error. Try again later.';
    } else if (responseData?.message || responseData?.error) {
      userMessage = `${responseData.message || responseData.error}`;
    }

    logger.error(
      { status, responseData, userMessage, creatorName: request.creatorName },
      'Mirage Submit Video Error'
    );

    const enhancedError = new Error(userMessage);
    (enhancedError as Error & { originalError: unknown; status?: number }).originalError = error;
    (enhancedError as Error & { status?: number }).status = status;
    throw enhancedError;
  }
}

/**
 * Map Mirage API state values to internal status format
 */
function mapApiStateToStatus(state: string | undefined): 'pending' | 'processing' | 'completed' | 'failed' {
  if (!state) return 'pending';

  const mapping: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {
    'QUEUED': 'pending',
    'PROCESSING': 'processing',
    'COMPLETED': 'completed',
    'COMPLETE': 'completed', // Mirage returns "COMPLETE" (not "COMPLETED")
    'FAILED': 'failed',
  };

  return mapping[state.toUpperCase()] || 'pending';
}

/**
 * Check the status of a video generation request
 * Poll every 5-10 seconds until status is 'completed' or 'failed'
 */
export async function checkVideoStatus(operationId: string): Promise<VideoStatus> {
  if (!MIRAGE_API_KEY) {
    throw new Error('MIRAGE_API_KEY not set in environment variables');
  }

  try {
    logger.debug({ operationId }, 'Checking video generation status');

    const response = await mirageAxios.request({
      method: 'POST',
      url: `${MIRAGE_BASE_URL}/creator/poll`,
      headers: {
        'x-api-key': MIRAGE_API_KEY,
        'Content-Type': 'application/json',
      },
      data: { operationId },
    });

    if (!response.data) {
      throw new Error('Empty response from Mirage API');
    }

    const apiState = response.data.state;
    const mappedStatus = mapApiStateToStatus(apiState);

    const status: VideoStatus = {
      operationId,
      status: mappedStatus,
      progress: response.data.progress,
      videoUrl: response.data.url,
      thumbnailUrl: response.data.thumbnailUrl,
      duration: response.data.duration,
      error: response.data.error,
      creditsUsed: response.data.creditsUsed,
    };

    if (status.status === 'completed') {
      logger.info({ operationId, duration: status.duration }, 'Video generation completed');
    } else if (status.status === 'failed') {
      logger.error({ operationId, error: status.error }, 'Video generation failed');
    } else {
      logger.debug({ operationId, status: status.status, progress: status.progress }, 'Video in progress');
    }

    return status;
  } catch (error) {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: { message?: string; error?: string; detail?: string };
      };
      message?: string;
    };

    const status = axiosError.response?.status;
    const responseData = axiosError.response?.data;

    let userMessage = 'Failed to check video status';

    if (status === 401 || status === 403) {
      userMessage = 'Mirage API authentication failed. Check your MIRAGE_API_KEY.';
    } else if (status === 404) {
      userMessage = `Video operation not found: ${operationId}`;
    } else if (status && status >= 500) {
      userMessage = 'Mirage API server error. Try again later.';
    } else if (responseData?.detail || responseData?.message || responseData?.error) {
      userMessage = `${responseData.detail || responseData.message || responseData.error}`;
    }

    logger.error({ operationId, status, responseData, userMessage }, 'Mirage Check Status Error');

    const enhancedError = new Error(userMessage);
    (enhancedError as Error & { originalError: unknown; status?: number }).originalError = error;
    (enhancedError as Error & { status?: number }).status = status;
    throw enhancedError;
  }
}

/**
 * Poll video status until completion or failure
 */
export async function pollUntilComplete(
  operationId: string,
  maxAttempts: number = 60,
  pollInterval: number = 5000
): Promise<VideoStatus> {
  logger.info(
    { operationId, maxAttempts, pollInterval, maxDuration: `${(maxAttempts * pollInterval) / 1000}s` },
    'Starting to poll for video completion'
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await checkVideoStatus(operationId);

    if (status.status === 'completed') {
      logger.info({ operationId, attempts: attempt }, 'Video generation completed');
      return status;
    }

    if (status.status === 'failed') {
      logger.error({ operationId, attempts: attempt, error: status.error }, 'Video generation failed');
      throw new Error(`Video generation failed: ${status.error || 'Unknown error'}`);
    }

    // Still processing, wait before next poll
    if (attempt < maxAttempts) {
      logger.debug(
        { operationId, attempt, maxAttempts, status: status.status, progress: status.progress },
        `Video still ${status.status}, waiting ${pollInterval / 1000}s`
      );
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  logger.warn(
    { operationId, maxAttempts, totalSeconds: (maxAttempts * pollInterval) / 1000 },
    'Polling timeout reached'
  );

  throw new Error(
    `Video generation timeout after ${maxAttempts} attempts. Operation ID: ${operationId}`
  );
}

/**
 * Helper: Format creator name for display
 */
function formatCreatorName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Helper: Infer gender from creator name (best effort)
 */
function inferGender(name: string): 'male' | 'female' {
  const lowerName = name.toLowerCase();
  const femaleNames = ['emily', 'sarah', 'jessica', 'amanda', 'lisa', 'maria', 'anna', 'emma', 'olivia', 'sophia', 'kate', 'celine', 'kira'];
  const maleNames = ['john', 'michael', 'david', 'james', 'robert', 'marcus', 'alex', 'sam', 'chris', 'daniel', 'jason', 'jake', 'luke', 'ethan', 'liam'];

  for (const female of femaleNames) {
    if (lowerName.includes(female)) return 'female';
  }
  for (const male of maleNames) {
    if (lowerName.includes(male)) return 'male';
  }
  // Default to female if unknown (most Mirage creators are female)
  return 'female';
}

// Export types
export type {
  MirageCreator,
  SubmitVideoRequest,
  SubmitVideoResponse,
  VideoStatus,
  ListCreatorsResponse,
} from './types';
