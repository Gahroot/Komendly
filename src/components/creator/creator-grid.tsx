"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users } from "lucide-react";
import { CreatorCard } from "./creator-card";
import type { MirageCreator } from "@/lib/mirage/types";
import type { GenderFilter, TypeFilter } from "./creator-filter";

interface CreatorGridProps {
  creators: MirageCreator[];
  selectedCreator: string | null;
  onSelect: (creatorName: string) => void;
  genderFilter?: GenderFilter;
  typeFilter?: TypeFilter;
}

export function CreatorGrid({
  creators,
  selectedCreator,
  onSelect,
  genderFilter = "all",
  typeFilter = "all",
}: CreatorGridProps) {
  const filteredCreators = useMemo(() => {
    return creators.filter((creator) => {
      const matchesGender = genderFilter === "all" || creator.gender === genderFilter;
      const matchesType = typeFilter === "all" || creator.type === typeFilter;
      return matchesGender && matchesType;
    });
  }, [creators, genderFilter, typeFilter]);

  if (filteredCreators.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          No creators match your filters. Try adjusting your selection.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <AnimatePresence mode="popLayout">
        {filteredCreators.map((creator, index) => (
          <CreatorCard
            key={creator.name}
            creator={creator}
            isSelected={selectedCreator === creator.name}
            onSelect={onSelect}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
