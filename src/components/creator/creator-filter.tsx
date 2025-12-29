"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type GenderFilter = "all" | "male" | "female";
export type TypeFilter = "all" | "community" | "twin";

interface CreatorFilterProps {
  genderFilter: GenderFilter;
  typeFilter: TypeFilter;
  onGenderChange: (gender: GenderFilter) => void;
  onTypeChange: (type: TypeFilter) => void;
  className?: string;
}

export function CreatorFilter({
  genderFilter,
  typeFilter,
  onGenderChange,
  onTypeChange,
  className,
}: CreatorFilterProps) {
  return (
    <div className={cn("flex flex-wrap gap-4", className)}>
      {/* Gender Filter */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Gender
        </span>
        <Tabs value={genderFilter} onValueChange={(v) => onGenderChange(v as GenderFilter)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="female" className="text-xs px-3">
              Female
            </TabsTrigger>
            <TabsTrigger value="male" className="text-xs px-3">
              Male
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Type Filter */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Type
        </span>
        <Tabs value={typeFilter} onValueChange={(v) => onTypeChange(v as TypeFilter)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="community" className="text-xs px-3">
              Community
            </TabsTrigger>
            <TabsTrigger value="twin" className="text-xs px-3">
              AI Twin
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
