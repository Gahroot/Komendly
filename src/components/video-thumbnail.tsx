"use client";

import { useState } from "react";

interface VideoThumbnailProps {
  videoUrl: string;
  thumbnailUrl?: string;
  alt: string;
  className?: string;
}

export function VideoThumbnail({
  videoUrl,
  thumbnailUrl,
  alt,
  className = "",
}: VideoThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  // If thumbnailUrl exists, use it as an image
  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover ${className}`}
        onError={() => setHasError(true)}
      />
    );
  }

  // Fall back to video element which shows first frame with preload="metadata"
  if (videoUrl && !hasError) {
    return (
      <video
        src={videoUrl}
        preload="metadata"
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${className}`}
        onError={() => setHasError(true)}
        aria-label={alt}
      />
    );
  }

  // No thumbnail available - parent will show fallback gradient
  return null;
}
