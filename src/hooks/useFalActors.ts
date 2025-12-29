"use client";

import { useState, useCallback, useEffect } from "react";
import type { FalActorData } from "@/lib/fal-lipsync/types";

interface UseFalActorsOptions {
  gender?: "male" | "female" | "all";
  style?: string;
}

/**
 * Hook to fetch FAL actors
 */
export function useFalActors(options?: UseFalActorsOptions) {
  const [actors, setActors] = useState<FalActorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options?.gender && options.gender !== "all") {
        params.set("gender", options.gender);
      }
      if (options?.style && options.style !== "all") {
        params.set("style", options.style);
      }

      const url = `/api/fal-generate/actors${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch actors");
      }

      const data = await response.json();
      setActors(data.actors || []);
    } catch (err) {
      console.error("Failed to fetch actors:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch actors");
      setActors([]);
    } finally {
      setLoading(false);
    }
  }, [options?.gender, options?.style]);

  useEffect(() => {
    fetchActors();
  }, [fetchActors]);

  return {
    actors,
    loading,
    error,
    refetch: fetchActors,
  };
}

/**
 * Get a single actor by ID
 */
export function useFalActor(actorId: string | null) {
  const [actor, setActor] = useState<FalActorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) {
      setActor(null);
      return;
    }

    const fetchActor = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/fal-generate/actors");

        if (!response.ok) {
          throw new Error("Failed to fetch actors");
        }

        const data = await response.json();
        const foundActor = data.actors?.find(
          (a: FalActorData) => a.id === actorId
        );

        if (!foundActor) {
          throw new Error("Actor not found");
        }

        setActor(foundActor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch actor");
        setActor(null);
      } finally {
        setLoading(false);
      }
    };

    fetchActor();
  }, [actorId]);

  return { actor, loading, error };
}
