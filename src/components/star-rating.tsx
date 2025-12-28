"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-5 h-5",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function StarRating({
  value,
  onChange,
  disabled = false,
  size = "md",
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue ?? value;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue;

        return (
          <motion.button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => !disabled && setHoverValue(star)}
            onMouseLeave={() => setHoverValue(null)}
            whileHover={{ scale: disabled ? 1 : 1.15 }}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
            className={cn(
              "relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
          >
            <Star
              className={cn(
                sizeMap[size],
                "transition-all duration-150",
                isFilled
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-transparent text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
            />
            {isFilled && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute inset-0"
              >
                <Star
                  className={cn(
                    sizeMap[size],
                    "fill-yellow-400 text-yellow-400"
                  )}
                />
              </motion.div>
            )}
          </motion.button>
        );
      })}
      <span className="ml-2 text-sm text-muted-foreground">
        {value > 0 ? `${value} star${value !== 1 ? "s" : ""}` : "Select rating"}
      </span>
    </div>
  );
}
