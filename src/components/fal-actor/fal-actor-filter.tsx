"use client";

import { motion } from "framer-motion";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GenderFilter = "all" | "male" | "female";
export type StyleFilter = "all" | "professional" | "casual" | "friendly";

interface FalActorFilterProps {
  genderFilter: GenderFilter;
  styleFilter: StyleFilter;
  onGenderChange: (gender: GenderFilter) => void;
  onStyleChange: (style: StyleFilter) => void;
}

const GENDER_OPTIONS: { id: GenderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

const STYLE_OPTIONS: { id: StyleFilter; label: string }[] = [
  { id: "all", label: "All Styles" },
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "friendly", label: "Friendly" },
];

export function FalActorFilter({
  genderFilter,
  styleFilter,
  onGenderChange,
  onStyleChange,
}: FalActorFilterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-4"
    >
      {/* Gender Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Gender:</span>
        <div className="flex gap-1">
          {GENDER_OPTIONS.map((option) => (
            <Button
              key={option.id}
              variant={genderFilter === option.id ? "default" : "outline"}
              size="sm"
              onClick={() => onGenderChange(option.id)}
              className={cn(
                "text-xs h-8",
                genderFilter === option.id && "ring-1 ring-primary"
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Style Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Style:</span>
        <div className="flex gap-1">
          {STYLE_OPTIONS.map((option) => (
            <Button
              key={option.id}
              variant={styleFilter === option.id ? "default" : "outline"}
              size="sm"
              onClick={() => onStyleChange(option.id)}
              className={cn(
                "text-xs h-8",
                styleFilter === option.id && "ring-1 ring-primary"
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
