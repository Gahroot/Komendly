"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { User, Check, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMirageCreators } from "@/hooks/useMirageGeneration";
import type { MirageCreator } from "@/lib/mirage/types";

interface MirageCreatorSelectorProps {
  selectedCreator: string | null;
  onSelect: (creatorName: string) => void;
}

// Gradient colors based on creator characteristics
const CREATOR_GRADIENTS: Record<string, string> = {
  professional: "from-slate-600 to-slate-800",
  casual: "from-amber-400 to-orange-500",
  friendly: "from-pink-400 to-rose-500",
  energetic: "from-yellow-400 to-red-500",
  calm: "from-cyan-400 to-blue-500",
  bold: "from-purple-500 to-indigo-600",
  warm: "from-orange-400 to-red-400",
  corporate: "from-blue-600 to-blue-800",
};

function getGradientForCreator(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, gradient] of Object.entries(CREATOR_GRADIENTS)) {
    if (lowerName.includes(key)) {
      return gradient;
    }
  }
  // Default gradient based on hash of name
  const gradients = Object.values(CREATOR_GRADIENTS);
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function getGenderBadgeColor(gender: MirageCreator["gender"]): string {
  return gender === "female"
    ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
}

export function MirageCreatorSelector({ selectedCreator, onSelect }: MirageCreatorSelectorProps) {
  const { creators, loading, error, refetch } = useMirageCreators();

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
    <div className="space-y-4">
      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Using cached creators. {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {creators.map((creator, index) => {
          const isSelected = selectedCreator === creator.name;
          const gradient = getGradientForCreator(creator.name);

          return (
            <motion.div
              key={creator.name}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <Card
                className={cn(
                  "cursor-pointer transition-all duration-200 overflow-hidden py-0",
                  "hover:shadow-lg dark:hover:shadow-primary/10",
                  isSelected
                    ? "ring-2 ring-primary border-primary"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => onSelect(creator.name)}
              >
                <CardContent className="p-0">
                  {/* Thumbnail */}
                  <div
                    className={cn(
                      "relative h-69 w-full bg-gradient-to-br flex items-center justify-center",
                      gradient
                    )}
                  >
                    {creator.thumbnail ? (
                      <Image
                        src={creator.thumbnail}
                        alt={creator.displayName}
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
                        className="absolute top-2 right-2 bg-primary rounded-full p-1"
                      >
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </motion.div>
                    )}

                    {/* Type Badge */}
                    {creator.type === "twin" && (
                      <Badge
                        variant="secondary"
                        className="absolute top-2 left-2 text-xs"
                      >
                        AI Twin
                      </Badge>
                    )}
                  </div>

                  {/* Creator Info */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {creator.displayName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-xs capitalize", getGenderBadgeColor(creator.gender))}
                      >
                        {creator.gender}
                      </Badge>
                    </div>
                    {creator.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {creator.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
