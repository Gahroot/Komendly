"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Volume2, Video, Sparkles, X, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GenerationStage = "script" | "audio" | "video" | "processing" | "complete" | "error";

export interface GenerationProgressProps {
  status: "idle" | "queued" | "generating" | "complete" | "error";
  currentStage: GenerationStage;
  stageProgress: number; // 0-100 for current stage
  overallProgress: number; // 0-100 for overall
  estimatedTimeRemaining?: number; // in seconds
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

const stages = [
  { id: "script" as const, name: "Generating Script", icon: FileText },
  { id: "audio" as const, name: "Synthesizing Audio", icon: Volume2 },
  { id: "video" as const, name: "Creating Video", icon: Video },
  { id: "processing" as const, name: "Final Processing", icon: Sparkles },
];

const stageOrder: Record<GenerationStage, number> = {
  script: 0,
  audio: 1,
  video: 2,
  processing: 3,
  complete: 4,
  error: -1,
};

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function GenerationProgress({
  status,
  currentStage,
  stageProgress,
  overallProgress,
  estimatedTimeRemaining,
  error,
  onCancel,
  onRetry,
}: GenerationProgressProps) {
  const currentStageIndex = stageOrder[currentStage];
  const isGenerating = status === "queued" || status === "generating";
  const isComplete = status === "complete";
  const isError = status === "error";

  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8">
      {/* Header with Status */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h3 className="text-xl font-semibold text-foreground">
          {isComplete ? "Video Generated!" : isError ? "Generation Failed" : "Generating Your Video"}
        </h3>
        {isGenerating && estimatedTimeRemaining !== undefined && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground"
          >
            Estimated time remaining: {formatTimeRemaining(estimatedTimeRemaining)}
          </motion.p>
        )}
      </motion.div>

      {/* Multi-step Progress Indicator */}
      <div className="w-full max-w-md space-y-4">
        {stages.map((stage, index) => {
          const StageIcon = stage.icon;
          const isCurrentStage = currentStageIndex === index;
          const isCompletedStage = currentStageIndex > index || isComplete;
          const isPendingStage = currentStageIndex < index && !isComplete;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-center gap-4 p-3 rounded-lg transition-colors",
                isCurrentStage && "bg-primary/5 border border-primary/20",
                isCompletedStage && "bg-green-500/5",
                isPendingStage && "opacity-50"
              )}
            >
              {/* Stage Icon */}
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
                  isCompletedStage && "bg-green-500/20",
                  isCurrentStage && "bg-primary/20",
                  isPendingStage && "bg-muted"
                )}
              >
                <AnimatePresence mode="wait">
                  {isCompletedStage ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </motion.div>
                  ) : isCurrentStage ? (
                    <motion.div
                      key="loading"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-5 h-5 text-primary" />
                    </motion.div>
                  ) : (
                    <motion.div key="icon">
                      <StageIcon className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Stage Name and Progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrentStage && "text-primary",
                      isCompletedStage && "text-green-600 dark:text-green-400",
                      isPendingStage && "text-muted-foreground"
                    )}
                  >
                    {stage.name}
                  </span>
                  {isCurrentStage && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-muted-foreground"
                    >
                      {Math.round(stageProgress)}%
                    </motion.span>
                  )}
                  {isCompletedStage && (
                    <span className="text-xs text-green-600 dark:text-green-400">Complete</span>
                  )}
                </div>

                {/* Progress bar for current stage */}
                {isCurrentStage && (
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Progress value={stageProgress} className="h-1.5" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Overall Progress */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-2"
        >
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </motion.div>
      )}

      {/* Error State */}
      <AnimatePresence>
        {isError && error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Error occurred</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex gap-3"
      >
        {isGenerating && onCancel && (
          <Button variant="outline" onClick={onCancel} className="gap-2">
            <X className="w-4 h-4" />
            Cancel
          </Button>
        )}
        {isError && onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        )}
      </motion.div>

      {/* Success Animation */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <motion.svg
                className="h-8 w-8 text-green-500"
                viewBox="0 0 24 24"
              >
                <motion.path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                />
              </motion.svg>
            </div>
            <p className="text-sm text-muted-foreground">Your video is ready to preview!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated dots for processing state */}
      {isGenerating && (
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-2 w-2 rounded-full bg-primary"
              animate={{
                y: [0, -8, 0],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
