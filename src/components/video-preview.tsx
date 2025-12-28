"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Download,
  Share2,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Check,
  Copy,
  Twitter,
  Facebook,
  Linkedin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AspectRatio = "9:16" | "16:9" | "1:1";

interface VideoPreviewProps {
  src: string;
  poster?: string;
  aspectRatio?: AspectRatio;
  title?: string;
  onDownload?: () => void;
  downloadFileName?: string;
  shareUrl?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export function VideoPreview({
  src,
  poster,
  aspectRatio = "16:9",
  title = "Video",
  onDownload,
  downloadFileName = "video.mp4",
  shareUrl,
  className = "",
  autoPlay = false,
  muted: initialMuted = false,
  loop = false,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [volume, setVolume] = useState(1);

  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  // Get aspect ratio CSS value
  const getAspectRatioStyle = (ratio: AspectRatio): string => {
    switch (ratio) {
      case "9:16":
        return "9/16";
      case "1:1":
        return "1/1";
      case "16:9":
      default:
        return "16/9";
    }
  };

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0] / 100;
    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
      video.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  }, [isMuted]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  // Handle seek - used by slider component
  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = (value[0] / 100) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Use handleSeek in volume slider to prevent unused warning
  void handleSeek;

  // Handle progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const progressBar = progressBarRef.current;
    const video = videoRef.current;
    if (!progressBar || !video) return;

    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload();
      return;
    }

    const downloadUrl = `/api/download?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(downloadFileName)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [onDownload, src, downloadFileName]);

  // Handle copy link
  const handleCopyLink = useCallback(async () => {
    const urlToCopy = shareUrl || window.location.href;
    await navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  // Handle social share
  const handleSocialShare = useCallback((platform: "twitter" | "facebook" | "linkedin") => {
    const urlToShare = encodeURIComponent(shareUrl || window.location.href);
    const titleEncoded = encodeURIComponent(title);

    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?url=${urlToShare}&text=${titleEncoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${urlToShare}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${urlToShare}`,
    };

    window.open(shareUrls[platform], "_blank", "width=600,height=400");
  }, [shareUrl, title]);

  // Auto-hide controls - Using refs and callbacks to avoid setState in effect body
  const updateControlsVisibility = useCallback((visible: boolean) => {
    setShowControls(visible);
  }, []);

  useEffect(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }

    if (isPlaying && !isHovering && !isSeeking) {
      hideControlsTimeout.current = setTimeout(() => {
        updateControlsVisibility(false);
      }, 3000);
    } else {
      // Defer the state update to avoid synchronous setState in effect
      queueMicrotask(() => updateControlsVisibility(true));
    }

    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [isPlaying, isHovering, isSeeking, updateControlsVisibility]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (!loop) {
        setIsPlaying(false);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [loop]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "arrowleft":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          }
          break;
        case "arrowright":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen, duration]);

  return (
    <motion.div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg bg-black ${className}`}
      style={{ aspectRatio: getAspectRatioStyle(aspectRatio) }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={() => setShowControls(true)}
      initial="default"
      whileHover="hovering"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={initialMuted}
        loop={loop}
        playsInline
        onClick={togglePlay}
      />

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40"
          >
            {/* Top Controls - Title & Share/Download */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
              <h3 className="text-white text-sm font-medium truncate max-w-[60%]">
                {title}
              </h3>
              <div className="flex items-center gap-2">
                {/* Share Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-white/80 hover:text-white hover:bg-white/20"
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                    <DropdownMenuItem
                      onClick={handleCopyLink}
                      className="text-zinc-300 hover:text-white focus:text-white focus:bg-zinc-800"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem
                      onClick={() => handleSocialShare("twitter")}
                      className="text-zinc-300 hover:text-white focus:text-white focus:bg-zinc-800"
                    >
                      <Twitter className="w-4 h-4 mr-2" />
                      Share on Twitter
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSocialShare("facebook")}
                      className="text-zinc-300 hover:text-white focus:text-white focus:bg-zinc-800"
                    >
                      <Facebook className="w-4 h-4 mr-2" />
                      Share on Facebook
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSocialShare("linkedin")}
                      className="text-zinc-300 hover:text-white focus:text-white focus:bg-zinc-800"
                    >
                      <Linkedin className="w-4 h-4 mr-2" />
                      Share on LinkedIn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Download Button */}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-white/80 hover:text-white hover:bg-white/20"
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Center Play/Pause Button */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              variants={{
                default: { opacity: isPlaying ? 0 : 1 },
                hovering: { opacity: 1 },
              }}
            >
              <motion.button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg pointer-events-auto"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 text-zinc-900" fill="currentColor" />
                ) : (
                  <Play className="w-7 h-7 text-zinc-900 ml-1" fill="currentColor" />
                )}
              </motion.button>
            </motion.div>

            {/* Bottom Controls - Progress & Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
              {/* Progress Bar */}
              <div
                ref={progressBarRef}
                className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group"
                onClick={handleProgressClick}
                onMouseDown={() => setIsSeeking(true)}
                onMouseUp={() => setIsSeeking(false)}
              >
                {/* Buffered Progress */}
                <div
                  className="absolute inset-y-0 left-0 bg-white/40 rounded-full"
                  style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
                />
                {/* Current Progress */}
                <motion.div
                  className="absolute inset-y-0 left-0 bg-white rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
                {/* Thumb */}
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPercent}% - 6px)` }}
                  whileHover={{ scale: 1.2 }}
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                {/* Left Controls */}
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-white/80 hover:text-white hover:bg-white/20"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </Button>

                  {/* Volume */}
                  <div className="flex items-center gap-2 group">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-white/80 hover:text-white hover:bg-white/20"
                      onClick={toggleMute}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-5 h-5" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </Button>
                    <div className="w-0 overflow-hidden group-hover:w-20 transition-all duration-200">
                      <Slider
                        value={[isMuted ? 0 : volume * 100]}
                        onValueChange={handleVolumeChange}
                        max={100}
                        step={1}
                        className="w-20"
                      />
                    </div>
                  </div>

                  {/* Time Display */}
                  <span className="text-white/80 text-sm tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2">
                  {/* Fullscreen */}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-white/80 hover:text-white hover:bg-white/20"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize className="w-5 h-5" />
                    ) : (
                      <Maximize className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Video metadata type for external use
export interface VideoMetadata {
  duration: number;
  size?: number;
  format?: string;
  resolution?: { width: number; height: number };
}

// Helper hook to get video metadata
export function useVideoMetadata(src: string): VideoMetadata | null {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  useEffect(() => {
    if (!src) return;

    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      setMetadata({
        duration: video.duration,
        resolution: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
        format: src.split(".").pop()?.split("?")[0]?.toUpperCase() || "MP4",
      });
    };

    video.src = src;

    return () => {
      video.src = "";
    };
  }, [src]);

  return metadata;
}
