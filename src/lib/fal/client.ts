import { fal } from "@fal-ai/client";

export function configureFalClient(apiKey: string): void {
  fal.config({ credentials: apiKey });
}

export type QueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

export interface QueueUpdate {
  status: QueueStatus;
  position?: number;
}

export interface FalVideo {
  url: string;
  content_type?: string;
}

export { fal };
