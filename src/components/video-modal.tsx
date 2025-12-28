"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Trash2,
  Star,
  Calendar,
  Clock,
  Palette,
  Check,
  Copy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { VideoPreview } from "@/components/video-preview";
import type { Video } from "@/hooks/useVideos";

interface VideoModalProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function VideoModal({
  video,
  open,
  onClose,
  onDelete,
}: VideoModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!video) return null;

  const formattedDate = new Date(video.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const aspectRatioLabel = {
    "9:16": "Portrait",
    "16:9": "Landscape",
    "1:1": "Square",
  }[video.aspectRatio];

  const aspectRatioColor = {
    "9:16": "bg-purple-500/10 text-purple-400 border-purple-500/20",
    "16:9": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "1:1": "bg-green-500/10 text-green-400 border-green-500/20",
  }[video.aspectRatio];

  const handleDownload = async () => {
    const filename = `${video.reviewerName}-${video.businessName}-testimonial.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(video.videoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(video.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error("Failed to delete video:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/share/${video.id}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-2xl bg-zinc-950 border-zinc-800 p-0 overflow-hidden max-h-[90vh]"
        showCloseButton={true}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {video.reviewerName} - {video.businessName}
          </DialogTitle>
          <DialogDescription>
            Video testimonial details
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[90vh]">
          <div className="flex flex-col">
            {/* Video Player Section */}
            <div className="relative bg-black">
              <div
                className={`relative mx-auto ${
                  video.aspectRatio === "9:16"
                    ? "max-w-[300px]"
                    : video.aspectRatio === "1:1"
                    ? "max-w-[400px]"
                    : "max-w-full"
                }`}
              >
                <VideoPreview
                  src={video.videoUrl}
                  poster={video.thumbnailUrl}
                  aspectRatio={video.aspectRatio}
                  title={`${video.reviewerName} - ${video.businessName}`}
                  downloadFileName={`${video.reviewerName}-${video.businessName}-testimonial.mp4`}
                  shareUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${video.id}`}
                  onDownload={handleDownload}
                />
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 space-y-5">
              {/* Header with name and badges */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold text-white truncate">
                    {video.reviewerName}
                  </h2>
                  <p className="text-zinc-400 text-sm truncate">
                    {video.businessName}
                  </p>
                </div>
                <Badge variant="outline" className={aspectRatioColor}>
                  {aspectRatioLabel}
                </Badge>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < video.rating
                        ? "text-yellow-500 fill-yellow-500"
                        : "text-zinc-700"
                    }`}
                  />
                ))}
                <span className="text-zinc-500 text-sm ml-2">
                  {video.rating} out of 5
                </span>
              </div>

              <Separator className="bg-zinc-800" />

              {/* Review Text */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">
                  Review
                </h3>
                <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    &ldquo;{video.reviewText}&rdquo;
                  </p>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-500 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Date</span>
                  </div>
                  <p className="text-sm text-zinc-200 font-medium">
                    {formattedDate}
                  </p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-500 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Duration</span>
                  </div>
                  <p className="text-sm text-zinc-200 font-medium">
                    {formatDuration(video.duration)}
                  </p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-500 mb-1">
                    <Palette className="w-4 h-4" />
                    <span className="text-xs">Style</span>
                  </div>
                  <p className="text-sm text-zinc-200 font-medium truncate">
                    {video.style}
                  </p>
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              {/* Actions */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={handleDownload}
                    className="flex-1 bg-white text-zinc-900 hover:bg-zinc-200"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>

                {/* Delete Section */}
                <AnimatePresence mode="wait">
                  {!showDeleteConfirm ? (
                    <motion.div
                      key="delete-button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Button
                        variant="ghost"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Video
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="delete-confirm"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 rounded-lg bg-red-500/10 border border-red-500/20"
                    >
                      <p className="text-sm text-red-400 mb-3 text-center">
                        Are you sure? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                          disabled={isDeleting}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="flex-1 bg-red-600 text-white hover:bg-red-700"
                        >
                          {isDeleting ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                repeat: Infinity,
                                duration: 1,
                                ease: "linear",
                              }}
                              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                            />
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
