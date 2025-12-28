import { useState, useCallback, useRef, useEffect } from "react";
import type { GenerationStage } from "@/components/generation-progress";

interface GenerationState {
  status: "idle" | "queued" | "generating" | "complete" | "error";
  currentStage: GenerationStage;
  stageProgress: number;
  overallProgress: number;
  estimatedTimeRemaining?: number;
  videoUrl: string | null;
  error: string | null;
  jobId: string | null;
}

interface GenerateParams {
  reviewText: string;
  reviewerName: string;
  businessName: string;
  style: string;
  aspectRatio: string;
  duration: string;
}

interface SSEProgressData {
  stage: GenerationStage;
  stageProgress: number;
  overallProgress: number;
  estimatedTimeRemaining?: number;
  status: "queued" | "generating" | "complete" | "error";
  videoUrl?: string;
  error?: string;
}

const INITIAL_STATE: GenerationState = {
  status: "idle",
  currentStage: "script",
  stageProgress: 0,
  overallProgress: 0,
  estimatedTimeRemaining: undefined,
  videoUrl: null,
  error: null,
  jobId: null,
};

export function useVideoGeneration() {
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerateParams | null>(null);

  // Cleanup SSE connection
  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Setup SSE listener for real-time updates
  const setupSSEListener = useCallback((jobId: string) => {
    cleanupSSE();

    const eventSource = new EventSource(`/api/generate/status/${jobId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: SSEProgressData = JSON.parse(event.data);

        setState((prev) => ({
          ...prev,
          status: data.status,
          currentStage: data.stage,
          stageProgress: data.stageProgress,
          overallProgress: data.overallProgress,
          estimatedTimeRemaining: data.estimatedTimeRemaining,
          videoUrl: data.videoUrl || prev.videoUrl,
          error: data.error || null,
        }));

        // Close connection when complete or error
        if (data.status === "complete" || data.status === "error") {
          cleanupSSE();
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      cleanupSSE();
      // Don't set error state if we already have a completed state
      setState((prev) => {
        if (prev.status === "complete") return prev;
        return {
          ...prev,
          status: "error",
          error: "Connection lost. Please try again.",
        };
      });
    };

    return eventSource;
  }, [cleanupSSE]);

  // Generate video
  const generate = useCallback(async (params: GenerateParams) => {
    // Cleanup any existing connections
    cleanupSSE();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Store params for potential retry
    lastParamsRef.current = params;

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Set initial state
    setState({
      ...INITIAL_STATE,
      status: "queued",
      currentStage: "script",
    });

    try {
      // Initiate generation
      const response = await fetch("/api/generate", {
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

      // If we get a jobId, setup SSE for real-time updates
      if (data.jobId) {
        setState((prev) => ({
          ...prev,
          status: "generating",
          jobId: data.jobId,
        }));
        setupSSEListener(data.jobId);
      } else if (data.videoUrl) {
        // Immediate response (no streaming)
        setState({
          status: "complete",
          currentStage: "complete",
          stageProgress: 100,
          overallProgress: 100,
          videoUrl: data.videoUrl,
          error: null,
          jobId: null,
          estimatedTimeRemaining: undefined,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was cancelled, reset to idle
        setState(INITIAL_STATE);
        return;
      }

      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error occurred",
      }));
    }
  }, [cleanupSSE, setupSSEListener]);

  // Cancel generation
  const cancel = useCallback(async () => {
    const { jobId } = state;

    // Abort any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Close SSE connection
    cleanupSSE();

    // If we have a jobId, notify server to cancel
    if (jobId) {
      try {
        await fetch(`/api/generate/status/${jobId}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to cancel job:", err);
      }
    }

    // Reset state
    setState(INITIAL_STATE);
  }, [state, cleanupSSE]);

  // Retry generation with last params
  const retry = useCallback(() => {
    if (lastParamsRef.current) {
      generate(lastParamsRef.current);
    }
  }, [generate]);

  // Reset to initial state
  const reset = useCallback(() => {
    cleanupSSE();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    lastParamsRef.current = null;
    setState(INITIAL_STATE);
  }, [cleanupSSE]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSSE();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [cleanupSSE]);

  return {
    ...state,
    generate,
    cancel,
    retry,
    reset,
  };
}
