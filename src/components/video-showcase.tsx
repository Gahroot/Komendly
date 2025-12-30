"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import Player from "@vimeo/player";
import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";

interface VideoShowcaseProps {
  videoIds: string[];
  className?: string;
}

interface TestimonialVideoCardProps {
  id: string;
  isActive: boolean;
  onToggle: (id: string) => void;
  onPlayerReady: (id: string, player: Player) => void;
}

const TestimonialVideoCard = memo(function TestimonialVideoCard({
  id,
  isActive,
  onToggle,
  onPlayerReady,
}: TestimonialVideoCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || playerRef.current) return;

    const initPlayer = () => {
      const player = new Player(iframe);
      playerRef.current = player;
      onPlayerReady(id, player);
    };

    const timer = setTimeout(initPlayer, 300);
    return () => clearTimeout(timer);
  }, [id, onPlayerReady]);

  return (
    <div
      className={cn(
        "relative w-[200px] shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-zinc-900 transition-all duration-300 sm:w-[240px]",
        isActive
          ? "border-purple-500 ring-2 ring-purple-500/20"
          : "border-zinc-800 hover:border-purple-500/50 hover:scale-[1.02]"
      )}
      onClick={() => onToggle(id)}
    >
      <div className="aspect-[9/16]">
        <iframe
          ref={iframeRef}
          src={`https://player.vimeo.com/video/${id}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&loop=1&background=1&muted=1`}
          className="pointer-events-none h-full w-full"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          title="Testimonial video"
        />
      </div>

      {/* Volume indicator */}
      <div
        className={cn(
          "absolute bottom-3 right-3 rounded-full p-2 transition-all duration-200",
          isActive
            ? "bg-purple-600 shadow-lg shadow-purple-500/25"
            : "bg-black/60 hover:bg-black/80"
        )}
      >
        {isActive ? (
          <Volume2 className="h-4 w-4 text-white" />
        ) : (
          <VolumeX className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Click hint overlay */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 hover:bg-black/20 hover:opacity-100">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Click to unmute
          </span>
        </div>
      )}
    </div>
  );
});

export function VideoShowcase({ videoIds, className }: VideoShowcaseProps) {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const playersRef = useRef<Map<string, Player>>(new Map());

  const handlePlayerReady = useCallback((id: string, player: Player) => {
    playersRef.current.set(id, player);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setActiveVideo((prev) => (prev === id ? null : id));
  }, []);

  // Mute/unmute videos based on active state
  useEffect(() => {
    playersRef.current.forEach((player, id) => {
      const shouldUnmute = activeVideo === id;
      player.setMuted(!shouldUnmute).catch(() => {
        // Ignore errors if video not ready
      });
    });
  }, [activeVideo]);

  return (
    <motion.div
      className={cn("mt-16 w-full", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <p className="mb-4 text-sm text-zinc-400">
        See what AI-generated testimonials look like:
      </p>

      <div className="relative w-full [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <Marquee
          pauseOnHover
          className="[--duration:30s] [--gap:1rem]"
          repeat={2}
        >
          {videoIds.map((id) => (
            <TestimonialVideoCard
              key={id}
              id={id}
              isActive={activeVideo === id}
              onToggle={handleToggle}
              onPlayerReady={handlePlayerReady}
            />
          ))}
        </Marquee>
      </div>
    </motion.div>
  );
}
