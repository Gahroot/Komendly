"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users } from "lucide-react";
import { FalActorCard } from "./fal-actor-card";
import type { FalActorData } from "@/lib/fal-lipsync/types";
import type { GenderFilter, StyleFilter } from "./fal-actor-filter";

interface FalActorGridProps {
  actors: FalActorData[];
  selectedActor: string | null;
  onSelect: (actorId: string) => void;
  genderFilter?: GenderFilter;
  styleFilter?: StyleFilter;
}

export function FalActorGrid({
  actors,
  selectedActor,
  onSelect,
  genderFilter = "all",
  styleFilter = "all",
}: FalActorGridProps) {
  const filteredActors = useMemo(() => {
    return actors.filter((actor) => {
      const matchesGender = genderFilter === "all" || actor.gender === genderFilter;
      const matchesStyle = styleFilter === "all" || actor.style.toLowerCase() === styleFilter;
      return matchesGender && matchesStyle;
    });
  }, [actors, genderFilter, styleFilter]);

  if (filteredActors.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          No actors match your filters. Try adjusting your selection.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <AnimatePresence mode="popLayout">
        {filteredActors.map((actor, index) => (
          <FalActorCard
            key={actor.id}
            actor={actor}
            isSelected={selectedActor === actor.id}
            onSelect={onSelect}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
