"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Download,
  Share2,
  Copy,
  Check,
  Plus,
  Clock,
  Ratio,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoPlayer } from "@/components/video-player";
import { GenerationProgress } from "@/components/generation-progress";
import { useVideoGeneration } from "@/hooks/useVideoGeneration";

export function PreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const {
    status,
    currentStage,
    stageProgress,
    overallProgress,
    estimatedTimeRemaining,
    videoUrl,
    error,
    generate,
    cancel,
    retry,
  } = useVideoGeneration();

  // Mock video metadata - in production this would come from the API
  const [videoMetadata] = useState({
    duration: "0:30",
    aspectRatio: searchParams.get("aspectRatio") || "16:9",
    createdAt: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

  // Start generation on mount if params are present
  useEffect(() => {
    const reviewText = searchParams.get("reviewText");
    const reviewerName = searchParams.get("reviewerName");
    const businessName = searchParams.get("businessName");
    const style = searchParams.get("style");
    const aspectRatio = searchParams.get("aspectRatio");
    const duration = searchParams.get("duration");

    if (reviewText && reviewerName && businessName && style && aspectRatio && duration) {
      generate({
        reviewText,
        reviewerName,
        businessName,
        style,
        aspectRatio,
        duration,
      });
    }
  }, [searchParams, generate]);

  const handleCopyLink = async () => {
    if (videoUrl) {
      await navigator.clipboard.writeText(window.location.origin + videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!videoUrl) return;

    const reviewerName = searchParams.get("reviewerName") || "customer";
    const businessName = searchParams.get("businessName") || "testimonial";
    const filename = `${reviewerName}-${businessName}-testimonial.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateAnother = () => {
    router.push("/dashboard/create");
  };

  const isGenerating = status === "queued" || status === "generating";
  const isComplete = status === "complete" && videoUrl;

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
            {isGenerating ? "Creating Your Video" : isComplete ? "Your Video is Ready!" : "Video Preview"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isGenerating
              ? "Please wait while we generate your testimonial video..."
              : isComplete
              ? "Preview your video and download or share it."
              : "Something went wrong. Please try again."}
          </p>
        </div>

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Video / Progress Section */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {isGenerating || status === "idle" ? (
                  <div className="flex min-h-[400px] items-center justify-center bg-muted/30">
                    <GenerationProgress
                      status={status}
                      currentStage={currentStage}
                      stageProgress={stageProgress}
                      overallProgress={overallProgress}
                      estimatedTimeRemaining={estimatedTimeRemaining}
                      error={error}
                      onCancel={cancel}
                      onRetry={retry}
                    />
                  </div>
                ) : isComplete ? (
                  <VideoPlayer
                    src={videoUrl}
                    aspectRatio={videoMetadata.aspectRatio as "16:9" | "9:16" | "1:1"}
                  />
                ) : (
                  <div className="flex min-h-[400px] items-center justify-center bg-muted/30">
                    <GenerationProgress
                      status="error"
                      currentStage="error"
                      stageProgress={0}
                      overallProgress={0}
                      error={error}
                      onRetry={retry}
                    />
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

            {/* Error State Actions */}
            {status === "error" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-center"
              >
                <p className="mb-4 text-sm text-destructive">{error}</p>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={handleCreateAnother}>
                    <Plus className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Video Metadata */}
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Video Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Duration</p>
                        <p className="text-sm text-muted-foreground">
                          {videoMetadata.duration}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Ratio className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Aspect Ratio</p>
                        <p className="text-sm text-muted-foreground">
                          {videoMetadata.aspectRatio}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Created</p>
                        <p className="text-sm text-muted-foreground">
                          {videoMetadata.createdAt}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

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
                                window.location.origin + videoUrl
                              )}&text=${encodeURIComponent(
                                "Check out this testimonial video!"
                              )}`,
                              "_blank"
                            );
                          }
                        }}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share on X (Twitter)
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          if (videoUrl) {
                            window.open(
                              `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                                window.location.origin + videoUrl
                              )}`,
                              "_blank"
                            );
                          }
                        }}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share on LinkedIn
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Generating State Sidebar Info */}
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">What&apos;s Happening?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Analyzing your review content</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Selecting the best visual style</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Generating AI voiceover</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Rendering final video</span>
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
