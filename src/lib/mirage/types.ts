/**
 * Mirage/Captions.ai API Type Definitions
 *
 * API Documentation: https://help.mirage.app/api-reference
 */

export interface MirageCreator {
  name: string;              // e.g., "emily-professional" or "twin-1-sam"
  displayName: string;       // Human-readable name
  gender: 'male' | 'female';
  thumbnail?: string;        // Preview image URL
  previewVideo?: string;     // Preview video URL
  description?: string;      // Creator description
  type: 'community' | 'twin'; // Community creator or AI Twin
}

export interface SubmitVideoRequest {
  script: string;                     // Max 800 characters
  creatorName: string;                // AI Creator name (e.g., "emily-professional", "twin-1-sam")
  resolution?: 'fhd' | '4k';          // Default: 4k
  webhookId?: string;                 // Optional webhook for completion notification
}

export interface SubmitVideoResponse {
  operationId: string;       // Use this to poll for status
  status: 'pending';
  message: string;
}

export interface VideoStatus {
  operationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;         // 0-100 percentage (if available)
  videoUrl?: string;         // Available when status === 'completed'
  thumbnailUrl?: string;     // Video thumbnail (if available)
  duration?: number;         // Video duration in seconds (if available)
  error?: string;            // Error message if status === 'failed'
  creditsUsed?: number;      // Credits consumed for this video
}

export interface ListCreatorsResponse {
  creators: MirageCreator[];
  total: number;
}

export interface MirageApiError {
  error: string;
  message: string;
  status: number;
}
