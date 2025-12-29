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
  professional: "from-slate-600 to-slate-800",
  casual: "from-amber-400 to-orange-500",
  friendly: "from-pink-400 to-rose-500",
  energetic: "from-yellow-400 to-red-500",
  calm: "from-cyan-400 to-blue-500",
  bold: "from-purple-500 to-indigo-600",
  warm: "from-orange-400 to-red-400",
  corporate: "from-blue-600 to-blue-800",
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
    ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
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
