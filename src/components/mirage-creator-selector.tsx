"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMirageCreators } from "@/hooks/useMirageGeneration";
import { CreatorGrid, CreatorFilter, type GenderFilter, type TypeFilter } from "./creator";

interface MirageCreatorSelectorProps {
  selectedCreator: string | null;
  onSelect: (creatorName: string) => void;
}

export function MirageCreatorSelector({ selectedCreator, onSelect }: MirageCreatorSelectorProps) {
  const { creators, loading, error, refetch } = useMirageCreators();
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading AI creators...</span>
      </div>
    );
  }

  if (error && creators.length === 0) {
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
          Using cached creators. {error}
        </div>
      )}

      <CreatorFilter
        genderFilter={genderFilter}
        typeFilter={typeFilter}
        onGenderChange={setGenderFilter}
        onTypeChange={setTypeFilter}
      />

      <CreatorGrid
        creators={creators}
        selectedCreator={selectedCreator}
        onSelect={onSelect}
        genderFilter={genderFilter}
        typeFilter={typeFilter}
      />
    </div>
  );
}
