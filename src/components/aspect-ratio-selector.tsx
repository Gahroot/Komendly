"use client";

import { motion } from "framer-motion";
import {
  Smartphone,
  Monitor,
  Square,
  RectangleVertical,
  Music2,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ASPECT_RATIOS, type AspectRatioId } from "@/lib/constants";

interface AspectRatioSelectorProps {
  selectedRatio: AspectRatioId;
  onSelect: (ratioId: AspectRatioId) => void;
}

// Icon mapping for ratio types
const RATIO_ICONS = {
  "9:16": Smartphone,
  "16:9": Monitor,
  "1:1": Square,
  "4:5": RectangleVertical,
} as const;

// Icon mapping for platform icons
const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Music2: Music2,
  Instagram: Instagram,
  Youtube: Youtube,
  Facebook: Facebook,
  Linkedin: Linkedin,
};

// Get platform icon component
function getPlatformIcon(iconName: string) {
  return PLATFORM_ICONS[iconName] || Info;
}

export function AspectRatioSelector({ selectedRatio, onSelect }: AspectRatioSelectorProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-3">
        {ASPECT_RATIOS.map((ratio) => {
          const isSelected = selectedRatio === ratio.id;
          const Icon = RATIO_ICONS[ratio.id as keyof typeof RATIO_ICONS];

          return (
            <Tooltip key={ratio.id}>
              <TooltipTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "h-auto flex-col gap-3 p-4 min-w-[140px]",
                      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => onSelect(ratio.id as AspectRatioId)}
                  >
                    {/* Visual Preview */}
                    <div className="relative flex items-center justify-center h-16 w-full">
                      <motion.div
                        className={cn(
                          "border-2 rounded-sm flex items-center justify-center",
                          isSelected
                            ? "border-primary-foreground bg-primary-foreground/20"
                            : "border-current bg-muted"
                        )}
                        style={{
                          width: ratio.width * 4,
                          height: ratio.height * 4,
                        }}
                        animate={isSelected ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <Icon className="h-4 w-4 opacity-50" />
                      </motion.div>
                    </div>

                    {/* Label */}
                    <div className="text-center">
                      <div className="font-semibold text-sm">{ratio.name}</div>
                      <div className={cn(
                        "text-xs mt-0.5",
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {ratio.id}
                      </div>
                    </div>

                    {/* Pixel Dimensions */}
                    <div className={cn(
                      "text-xs font-mono",
                      isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {ratio.pixelWidth}x{ratio.pixelHeight}
                    </div>

                    {/* Platform Icons */}
                    <div className="flex items-center justify-center gap-1.5">
                      {ratio.platforms.slice(0, 3).map((platform, index) => {
                        const PlatformIcon = getPlatformIcon(platform.icon);
                        return (
                          <PlatformIcon
                            key={`${platform.name}-${index}`}
                            className={cn(
                              "h-3.5 w-3.5",
                              isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                            )}
                          />
                        );
                      })}
                    </div>

                    {/* Platform Description */}
                    <div className={cn(
                      "text-xs text-center",
                      isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      {ratio.description}
                    </div>
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-2">
                  <p className="font-medium">{ratio.name} ({ratio.id})</p>
                  <p className="text-xs text-muted-foreground">{ratio.recommendation}</p>
                  <div className="pt-1 border-t">
                    <p className="text-xs font-medium mb-1">Platforms:</p>
                    <div className="space-y-1">
                      {ratio.platforms.map((platform, index) => {
                        const PlatformIcon = getPlatformIcon(platform.icon);
                        return (
                          <div key={`${platform.name}-${index}`} className="flex items-center gap-2 text-xs">
                            <PlatformIcon className="h-3 w-3" />
                            <span>{platform.name}</span>
                            {platform.maxDuration && (
                              <span className="text-muted-foreground">
                                (max {platform.maxDuration}s)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
