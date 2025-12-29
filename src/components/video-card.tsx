"use client";

import { motion } from "framer-motion";
import { Play, Star, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoThumbnail } from "@/components/video-thumbnail";
import type { Video } from "@/hooks/useVideos";

interface VideoCardProps {
  video: Video;
  onClick: (video: Video) => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  const formattedDate = new Date(video.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const aspectRatioLabel = {
    "9:16": "Portrait",
    "16:9": "Landscape",
    "1:1": "Square",
  }[video.aspectRatio];

  const aspectRatioColor = {
    "9:16": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "16:9": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "1:1": "bg-green-500/10 text-green-500 border-green-500/20",
  }[video.aspectRatio];

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card
        className="group cursor-pointer overflow-hidden bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors"
        onClick={() => onClick(video)}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-zinc-800 overflow-hidden">
          {/* Placeholder gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900" />

          {/* Video thumbnail - uses first frame of video */}
          <VideoThumbnail
            videoUrl={video.videoUrl}
            thumbnailUrl={video.thumbnailUrl}
            alt={`${video.reviewerName} testimonial`}
          />

          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.div
              initial={{ scale: 0.8 }}
              whileHover={{ scale: 1.1 }}
              className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
            >
              <Play className="w-6 h-6 text-zinc-900 ml-1" fill="currentColor" />
            </motion.div>
          </div>

          {/* Aspect ratio badge */}
          <Badge
            variant="outline"
            className={`absolute top-2 right-2 text-xs font-medium ${aspectRatioColor}`}
          >
            {aspectRatioLabel}
          </Badge>

          {/* Duration badge */}
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
          </div>
        </div>

        <CardContent className="p-4">
          {/* Title */}
          <h3 className="font-semibold text-white truncate mb-1">
            {video.reviewerName}
          </h3>
          <p className="text-sm text-zinc-400 truncate mb-3">
            {video.businessName}
          </p>

          {/* Review snippet */}
          <p className="text-sm text-zinc-500 line-clamp-2 mb-3">
            &ldquo;{video.reviewText}&rdquo;
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            {/* Rating */}
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3.5 h-3.5 ${
                    i < video.rating
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-zinc-600"
                  }`}
                />
              ))}
            </div>

            {/* Date */}
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Calendar className="w-3 h-3" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
