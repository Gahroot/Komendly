"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFalActors } from "@/hooks/useFalActors";
import { FalActorGrid, FalActorFilter, type GenderFilter, type StyleFilter } from "./fal-actor";

interface FalActorSelectorProps {
  selectedActor: string | null;
  onSelect: (actorId: string) => void;
}

export function FalActorSelector({ selectedActor, onSelect }: FalActorSelectorProps) {
  const { actors, loading, error, refetch } = useFalActors();
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("all");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading AI actors...</span>
      </div>
    );
  }

  if (error && actors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={refetch}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Using cached actors. {error}
        </div>
      )}

      <FalActorFilter
        genderFilter={genderFilter}
        styleFilter={styleFilter}
        onGenderChange={setGenderFilter}
        onStyleChange={setStyleFilter}
      />

      <FalActorGrid
        actors={actors}
        selectedActor={selectedActor}
        onSelect={onSelect}
        genderFilter={genderFilter}
        styleFilter={styleFilter}
      />
    </div>
  );
}
