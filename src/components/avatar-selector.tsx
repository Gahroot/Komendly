"use client";

import { motion } from "framer-motion";
import { User, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AVATAR_STYLES, type AvatarStyleId } from "@/lib/constants";

interface AvatarSelectorProps {
  selectedStyle: AvatarStyleId | null;
  onSelect: (styleId: AvatarStyleId) => void;
}

export function AvatarSelector({ selectedStyle, onSelect }: AvatarSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {AVATAR_STYLES.map((style) => {
        const isSelected = selectedStyle === style.id;

        return (
          <motion.div
            key={style.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card
              className={cn(
                "cursor-pointer transition-all duration-200 overflow-hidden py-0",
                "hover:shadow-lg dark:hover:shadow-primary/10",
                isSelected
                  ? "ring-2 ring-primary border-primary"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => onSelect(style.id)}
            >
              <CardContent className="p-0">
                {/* Gradient Thumbnail */}
                <div
                  className={cn(
                    "relative h-32 w-full bg-gradient-to-br flex items-center justify-center",
                    style.gradient
                  )}
                >
                  <User className="h-12 w-12 text-white/80" />

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
                </div>

                {/* Style Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground">
                    {style.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {style.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
