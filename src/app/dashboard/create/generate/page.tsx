"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Download,
  Share2,
  Copy,
  Check,
  Plus,
  Clock,
  User,
  Monitor,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VideoPlayer } from "@/components/video-player";
import { useMirageGeneration } from "@/hooks/useMirageGeneration";

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [reviewCreated, setReviewCreated] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const {
    status,
    progress,
    videoUrl,
    thumbnailUrl,
    error,
    videoId,
    duration,
    generate,
    cancel,
    reset,
  } = useMirageGeneration();

  // Get params from URL
  const reviewText = searchParams.get("review") || "";
  const reviewAuthor = searchParams.get("author") || "Anonymous";
  const reviewRating = parseInt(searchParams.get("rating") || "5", 10);
  const creatorName = searchParams.get("creator") || "";
  const targetDuration = parseInt(searchParams.get("duration") || "30", 10);
  const resolution = (searchParams.get("resolution") || "4k") as "fhd" | "4k";

  // Create review and start generation on mount
  useEffect(() => {
    if (reviewCreated || !reviewText || !creatorName) return;

    async function createReviewAndGenerate() {
      try {
        // First, create the review in the database
        const reviewResponse = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewText,
            reviewerName: reviewAuthor,
            businessName: "My Business", // Default or could be passed via URL
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
          creatorName,
          targetDuration,
          resolution,
          useAIScript: true,
        });
      } catch (err) {
        console.error("Failed to start generation:", err);
      }
    }

    createReviewAndGenerate();
  }, [reviewText, creatorName, reviewAuthor, reviewRating, targetDuration, resolution, generate, reviewCreated]);

  const handleCopyLink = async () => {
    if (videoUrl) {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!videoUrl) return;

    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `testimonial-${videoId || Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const handleCreateAnother = () => {
    reset();
    router.push("/dashboard/create");
  };

  const handleRetry = () => {
    if (reviewId) {
      generate({
        reviewId,
        creatorName,
        targetDuration,
        resolution,
        useAIScript: true,
      });
    }
  };

  const isGenerating = status === "queued" || status === "generating";
  const isComplete = status === "complete" && videoUrl;
  const isError = status === "error";

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isGenerating
              ? "Creating Your AI Video"
              : isComplete
              ? "Your Video is Ready!"
              : isError
              ? "Generation Failed"
              : "Video Generation"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isGenerating
              ? "Your AI actor is recording your testimonial..."
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
                  <VideoPlayer src={videoUrl} aspectRatio="9:16" poster={thumbnailUrl || undefined} />
                ) : (
                  <div className="flex min-h-[400px] flex-col items-center justify-center bg-muted/30 p-8">
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {status === "queued" ? "Queued for Processing" : "Generating Video"}
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
                    <p className="text-sm font-medium">AI Creator</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {creatorName.replace(/-/g, " ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Duration</p>
                    <p className="text-sm text-muted-foreground">
                      {isComplete && duration
                        ? formatDuration(duration)
                        : `~${targetDuration} seconds`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Monitor className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Quality</p>
                    <p className="text-sm text-muted-foreground uppercase">{resolution}</p>
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

            {/* Share Section */}
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Share</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={handleCopyLink}
                      >
                        {copied ? (
                          <Check className="mr-2 h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {copied ? "Link Copied!" : "Copy Share Link"}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          if (videoUrl) {
                            window.open(
                              `https://twitter.com/intent/tweet?url=${encodeURIComponent(
                                videoUrl
                              )}&text=${encodeURIComponent(
                                "Check out this AI-generated testimonial video!"
                              )}`,
                              "_blank"
                            );
                          }
                        }}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share on X (Twitter)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

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
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>AI generating UGC script from review</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>AI actor recording video</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Processing and rendering in {resolution.toUpperCase()}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Finalizing and preparing download</span>
                      </li>
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
