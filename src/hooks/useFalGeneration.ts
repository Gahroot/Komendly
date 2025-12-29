"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  CompositeStatus,
  ClipProgress,
  TTSVoice,
} from "@/lib/fal-lipsync/types";

type GenerationStatus = "idle" | "starting" | "generating" | "stitching" | "complete" | "error";

interface FalGenerationState {
  status: GenerationStatus;
  progress: number;
  currentClip: number;
  totalClips: number;
  clips: ClipProgress[];
  finalVideoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  compositeVideoId: string | null;
}

interface GenerateParams {
  reviewId: string;
  actorId: string;
  targetDuration?: number;
  aspectRatio?: "9:16" | "16:9";
  voiceId?: TTSVoice;
  useAIScript?: boolean;
  customScript?: string;
}

const INITIAL_STATE: FalGenerationState = {
  status: "idle",
  progress: 0,
  currentClip: 0,
  totalClips: 0,
  clips: [],
  finalVideoUrl: null,
  thumbnailUrl: null,
  error: null,
  compositeVideoId: null,
};

const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Hook for FAL lip-synced video generation with polling
 */
export function useFalGeneration() {
  const [state, setState] = useState<FalGenerationState>(INITIAL_STATE);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerateParams | null>(null);

  // Cleanup polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Map composite status to generation status
  const mapStatus = (compositeStatus: CompositeStatus): GenerationStatus => {
    switch (compositeStatus) {
      case "pending":
        return "starting";
      case "generating_clips":
        return "generating";
      case "stitching":
        return "stitching";
      case "completed":
        return "complete";
      case "failed":
        return "error";
      default:
        return "idle";
    }
  };

  // Poll for status updates
  const pollStatus = useCallback(async (compositeVideoId: string) => {
    try {
      const response = await fetch(
        `/api/fal-generate/status?id=${compositeVideoId}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Status check failed");
      }

      const data = await response.json();

      setState((prev) => ({
        ...prev,
        status: mapStatus(data.status),
        progress: data.progress || prev.progress,
        currentClip: data.currentClip || prev.currentClip,
        totalClips: data.totalClips || prev.totalClips,
        clips: data.clips || prev.clips,
        finalVideoUrl: data.finalVideoUrl || prev.finalVideoUrl,
        thumbnailUrl: data.thumbnailUrl || prev.thumbnailUrl,
        error: data.error || null,
      }));

      // Stop polling when complete or failed
      if (data.status === "completed" || data.status === "failed") {
        stopPolling();
      }
    } catch (err) {
      console.error("Polling error:", err);
      // Don't stop polling on transient errors
    }
  }, [stopPolling]);

  // Start polling for a video
  const startPolling = useCallback(
    (compositeVideoId: string) => {
      stopPolling();

      // Initial poll
      pollStatus(compositeVideoId);

      // Start interval
      pollingRef.current = setInterval(() => {
        pollStatus(compositeVideoId);
      }, POLL_INTERVAL);
    },
    [pollStatus, stopPolling]
  );

  // Generate video
  const generate = useCallback(
    async (params: GenerateParams) => {
      // Cleanup
      stopPolling();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Store params for retry
      lastParamsRef.current = params;
      abortControllerRef.current = new AbortController();

      // Set initial state
      setState({
        ...INITIAL_STATE,
        status: "starting",
      });

      try {
        const response = await fetch("/api/fal-generate/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Generation failed");
        }

        const data = await response.json();

        if (data.success && data.compositeVideoId) {
          setState((prev) => ({
            ...prev,
            status: "generating",
            compositeVideoId: data.compositeVideoId,
          }));

          // Start polling for updates
          startPolling(data.compositeVideoId);
        } else {
          throw new Error(data.error || "Invalid response from server");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setState(INITIAL_STATE);
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error occurred",
        }));
      }
    },
    [startPolling, stopPolling]
  );

  // Cancel generation
  const cancel = useCallback(() => {
    stopPolling();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(INITIAL_STATE);
  }, [stopPolling]);

  // Retry generation
  const retry = useCallback(() => {
    if (lastParamsRef.current) {
      generate(lastParamsRef.current);
    }
  }, [generate]);

  // Reset state
  const reset = useCallback(() => {
    stopPolling();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    lastParamsRef.current = null;
    setState(INITIAL_STATE);
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [stopPolling]);

  return {
    ...state,
    generate,
    cancel,
    retry,
    reset,
  };
}
