"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { MirageCreator } from "@/lib/mirage/types";

type GenerationStatus = "idle" | "queued" | "generating" | "complete" | "error";

interface MirageGenerationState {
  status: GenerationStatus;
  progress: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  videoId: string | null;
  operationId: string | null;
  duration: number | null;
}

interface GenerateParams {
  reviewId: string;
  creatorName: string;
  targetDuration?: number;
  resolution?: "fhd" | "4k";
  useAIScript?: boolean;
}

const INITIAL_STATE: MirageGenerationState = {
  status: "idle",
  progress: 0,
  videoUrl: null,
  thumbnailUrl: null,
  error: null,
  videoId: null,
  operationId: null,
  duration: null,
};

const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Hook for Mirage video generation with polling
 */
export function useMirageGeneration() {
  const [state, setState] = useState<MirageGenerationState>(INITIAL_STATE);
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

  // Poll for status updates
  const pollStatus = useCallback(async (videoId: string) => {
    try {
      const response = await fetch(`/api/mirage/status?videoId=${videoId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Status check failed");
      }

      const data = await response.json();

      setState(prev => ({
        ...prev,
        status: data.status === "completed" ? "complete" :
                data.status === "failed" ? "error" :
                data.status === "processing" ? "generating" : "queued",
        progress: data.progress || prev.progress,
        videoUrl: data.videoUrl || prev.videoUrl,
        thumbnailUrl: data.thumbnailUrl || prev.thumbnailUrl,
        duration: data.duration || prev.duration,
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
  const startPolling = useCallback((videoId: string) => {
    stopPolling();

    // Initial poll
    pollStatus(videoId);

    // Start interval
    pollingRef.current = setInterval(() => {
      pollStatus(videoId);
    }, POLL_INTERVAL);
  }, [pollStatus, stopPolling]);

  // Generate video
  const generate = useCallback(async (params: GenerateParams) => {
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
      status: "queued",
    });

    try {
      const response = await fetch("/api/mirage/generate", {
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

      if (data.success && data.videoId) {
        setState(prev => ({
          ...prev,
          status: "generating",
          videoId: data.videoId,
          operationId: data.operationId,
        }));

        // Start polling for updates
        startPolling(data.videoId);
      } else {
        throw new Error(data.error || "Invalid response from server");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState(INITIAL_STATE);
        return;
      }

      setState(prev => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error occurred",
      }));
    }
  }, [startPolling, stopPolling]);

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

/**
 * Hook to fetch Mirage creators
 */
export function useMirageCreators() {
  const [creators, setCreators] = useState<MirageCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mirage/creators");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch creators");
      }

      const data = await response.json();
      setCreators(data.creators || []);
    } catch (err) {
      console.error("Failed to fetch creators:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch creators");
      // Set fallback creators
      setCreators(getFallbackCreators());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCreators();
  }, [fetchCreators]);

  return {
    creators,
    loading,
    error,
    refetch: fetchCreators,
  };
}

/**
 * Fallback creators when API is unavailable
 * Note: Returns empty array - real creators must be fetched from the Mirage API
 * Fake names will be rejected by the API with "Creator name is not supported"
 */
function getFallbackCreators(): MirageCreator[] {
  // Return empty array - we cannot use fake creator names
  // The Mirage API only accepts creators returned from /creator/list
  return [];
}
