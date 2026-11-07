"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { User, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FalActorData } from "@/lib/fal-lipsync/types";

interface FalActorCardProps {
  actor: FalActorData;
  isSelected: boolean;
  onSelect: (actorId: string) => void;
  index?: number;
}

const STYLE_GRADIENTS: Record<string, string> = {
  professional: "from-chart-2/80 to-chart-2/40",
  casual: "from-chart-4/80 to-chart-4/40",
  friendly: "from-chart-5/80 to-chart-5/40",
  energetic: "from-chart-4/90 to-chart-5/60",
  calm: "from-chart-2/90 to-chart-1/60",
  bold: "from-chart-1/90 to-chart-1/50",
  warm: "from-chart-5/80 to-chart-4/50",
  corporate: "from-chart-1/70 to-chart-2/40",
};

function getGradientForStyle(style: string): string {
  const lowerStyle = style.toLowerCase();
  if (STYLE_GRADIENTS[lowerStyle]) {
    return STYLE_GRADIENTS[lowerStyle];
  }
  const gradients = Object.values(STYLE_GRADIENTS);
  const hash = style.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function getGenderBadgeColor(gender: FalActorData["gender"]): string {
  return gender === "female"
    ? "bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary"
    : "bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary";
}

export function FalActorCard({ actor, isSelected, onSelect, index = 0 }: FalActorCardProps) {
  const gradient = getGradientForStyle(actor.style);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 overflow-hidden py-0 h-full",
          "hover:shadow-lg dark:hover:shadow-primary/10",
          isSelected
            ? "ring-2 ring-primary border-primary"
            : "border-border hover:border-primary/50"
        )}
        onClick={() => onSelect(actor.id)}
      >
        <CardContent className="p-0 flex flex-col h-full">
          {/* Thumbnail */}
          <div
            className={cn(
              "relative h-48 w-full bg-gradient-to-br flex items-center justify-center flex-shrink-0",
              gradient
            )}
          >
            {actor.thumbnailUrl ? (
              <Image
                src={actor.thumbnailUrl}
                alt={actor.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <User className="h-12 w-12 text-white/80" />
            )}

            {/* Selection Indicator */}
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 bg-primary rounded-full p-1.5 shadow-lg"
              >
                <Check className="h-4 w-4 text-primary-foreground" />
              </motion.div>
            )}

            {/* Style Badge */}
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 text-xs backdrop-blur-sm capitalize"
            >
              {actor.style}
            </Badge>
          </div>

          {/* Actor Info */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground truncate">
                {actor.name}
              </h3>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="outline"
                className={cn("text-xs capitalize", getGenderBadgeColor(actor.gender))}
              >
                {actor.gender}
              </Badge>
            </div>
            {actor.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                {actor.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
