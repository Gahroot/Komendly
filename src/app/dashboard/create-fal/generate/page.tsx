"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Download,
  Copy,
  Check,
  Plus,
  Clock,
  User,
  Mic,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  Zap,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VideoPlayer } from "@/components/video-player";
import { useFalGeneration } from "@/hooks/useFalGeneration";
import type { TTSVoice } from "@/lib/fal-lipsync/types";

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [reviewCreated, setReviewCreated] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const {
    status,
    progress,
    currentClip,
    totalClips,
    clips,
    finalVideoUrl,
    thumbnailUrl,
    error,
    compositeVideoId,
    generate,
    cancel,
    reset,
    retry,
  } = useFalGeneration();

  // Get params from URL
  const reviewText = searchParams.get("review") || "";
  const reviewAuthor = searchParams.get("author") || "Anonymous";
  const reviewRating = parseInt(searchParams.get("rating") || "5", 10);
  const businessName = searchParams.get("business") || "My Business";
  const actorId = searchParams.get("actor") || "";
  const targetDuration = parseInt(searchParams.get("duration") || "30", 10);
  const voiceId = (searchParams.get("voice") || "nova") as TTSVoice;

  // Create review and start generation on mount
  useEffect(() => {
    if (reviewCreated || !reviewText || !actorId) return;

    async function createReviewAndGenerate() {
      try {
        // First, create the review in the database
        const reviewResponse = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewText,
            reviewerName: reviewAuthor,
            businessName,
            rating: reviewRating,
            source: "manual",
          }),
        });

        if (!reviewResponse.ok) {
          throw new Error("Failed to create review");
        }

        const reviewData = await reviewResponse.json();
        setReviewId(reviewData.review.id);
        setReviewCreated(true);

        // Now start video generation
        generate({
          reviewId: reviewData.review.id,
          actorId,
          targetDuration,
          aspectRatio: "9:16",
          voiceId,
          useAIScript: true,
        });
      } catch (err) {
        console.error("Failed to start generation:", err);
      }
    }

    createReviewAndGenerate();
  }, [reviewText, actorId, reviewAuthor, reviewRating, businessName, targetDuration, voiceId, generate, reviewCreated]);

  const handleCopyLink = async () => {
    if (finalVideoUrl) {
      await navigator.clipboard.writeText(finalVideoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!finalVideoUrl) return;

    const filename = `testimonial-${compositeVideoId || Date.now()}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(finalVideoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateAnother = () => {
    reset();
    router.push("/dashboard/create-fal");
  };

  const handleRetry = () => {
    if (reviewId) {
      retry();
    }
  };

  const isGenerating = status === "starting" || status === "generating" || status === "stitching";
  const isComplete = status === "complete" && finalVideoUrl;
  const isError = status === "error";

  const getStatusText = (): string => {
    switch (status) {
      case "starting":
        return "Initializing generation...";
      case "generating":
        return `Generating clips (${currentClip}/${totalClips})...`;
      case "stitching":
        return "Stitching clips together...";
      case "complete":
        return "Complete!";
      case "error":
        return "Generation failed";
      default:
        return "Starting...";
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isGenerating
                ? "Creating Your AI Video"
                : isComplete
                ? "Your Video is Ready!"
                : isError
                ? "Generation Failed"
                : "Video Generation"}
            </h1>
            <Badge variant="secondary" className="gap-1">
              <Zap className="w-3 h-3" />
              Beta
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            {isGenerating
              ? "Your AI actor is recording your testimonial with lip-sync..."
              : isComplete
              ? "Preview your video and download or share it."
              : isError
              ? "Something went wrong. Please try again."
              : "Starting video generation..."}
          </p>
        </div>

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Video / Progress Section */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {isComplete ? (
                  <VideoPlayer src={finalVideoUrl} aspectRatio="9:16" poster={thumbnailUrl || undefined} />
                ) : (
                  <div className="flex min-h-[400px] flex-col items-center justify-center bg-muted/30 p-8">
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {getStatusText()}
                        </h3>
                        <p className="text-muted-foreground text-center mb-4">
                          This typically takes 2-5 minutes depending on video length
                        </p>
                        {progress > 0 && (
                          <div className="w-full max-w-xs">
                            <Progress value={progress} className="h-2" />
                            <p className="text-sm text-center mt-2 text-muted-foreground">
                              {progress}% complete
                            </p>
                          </div>
                        )}
                        <Button variant="outline" onClick={cancel} className="mt-4">
                          Cancel
                        </Button>
                      </>
                    ) : isError ? (
                      <>
                        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Generation Failed</h3>
                        <p className="text-muted-foreground text-center mb-4 max-w-sm">
                          {error || "An unexpected error occurred"}
                        </p>
                        <div className="flex gap-3">
                          <Button onClick={handleRetry}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                          </Button>
                          <Button variant="outline" onClick={handleCreateAnother}>
                            Start Over
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">Initializing...</p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-4 flex flex-wrap gap-3"
              >
                <Button onClick={handleDownload} className="flex-1 sm:flex-none">
                  <Download className="mr-2 h-4 w-4" />
                  Download Video
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  className="flex-1 sm:flex-none"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCreateAnother}
                  className="flex-1 sm:flex-none"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Another
                </Button>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Generation Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Generation Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">AI Actor</p>
                    <p className="text-sm text-muted-foreground">
                      Selected actor
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Mic className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Voice</p>
                    <p className="text-sm text-muted-foreground capitalize">{voiceId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Duration</p>
                    <p className="text-sm text-muted-foreground">
                      ~{targetDuration} seconds
                    </p>
                  </div>
                </div>
                {isComplete && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date().toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Review Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Original Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm">{reviewAuthor}</span>
                  <Badge variant="secondary" className="text-xs">
                    {"⭐".repeat(reviewRating)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground italic line-clamp-4">
                  &quot;{reviewText}&quot;
                </p>
              </CardContent>
            </Card>

            {/* Processing Info */}
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Processing Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 rounded-full ${status === "starting" ? "bg-primary animate-pulse" : "bg-green-500"}`} />
                        <span>AI generating UGC script from review</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 rounded-full ${status === "generating" ? "bg-primary animate-pulse" : status === "stitching" ? "bg-green-500" : "bg-muted-foreground"}`} />
                        <span>Generating lip-synced video clips</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 rounded-full ${status === "stitching" ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
                        <span>Stitching clips together</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        <span>Finalizing and preparing download</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Clip Progress */}
            {isGenerating && clips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Film className="h-4 w-4" />
                      Clip Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {clips.map((clip) => (
                        <li key={clip.index} className="flex items-center justify-between text-sm">
                          <span className="capitalize">{clip.type}</span>
                          <Badge
                            variant={
                              clip.status === "completed"
                                ? "default"
                                : clip.status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {clip.status === "completed" ? "Done" : clip.status === "pending" ? "Waiting" : "Processing"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function GenerateLoading() {
  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<GenerateLoading />}>
      <GenerateContent />
    </Suspense>
  );
}
