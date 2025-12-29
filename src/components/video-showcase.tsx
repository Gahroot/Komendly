"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import Player from "@vimeo/player";
import { cn } from "@/lib/utils";

interface VideoShowcaseProps {
  videoIds: string[];
  className?: string;
}

interface VimeoCardProps {
  id: string;
  isActive: boolean;
  onToggle: (id: string) => void;
  onPlayerReady: (id: string, player: Player) => void;
}

const VimeoCard = memo(function VimeoCard({
  id,
  isActive,
  onToggle,
  onPlayerReady,
}: VimeoCardProps) {
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
    <div className="flex-none w-[200px] sm:w-[240px] snap-center">
      <div
        className={cn(
          "relative rounded-xl overflow-hidden bg-zinc-900 border transition-colors cursor-pointer group",
          isActive ? "border-purple-500" : "border-zinc-800 hover:border-purple-500/50"
        )}
        onClick={() => onToggle(id)}
      >
        <div className="aspect-[9/16]">
          <iframe
            ref={iframeRef}
            src={`https://player.vimeo.com/video/${id}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&loop=1&background=1&muted=1`}
            className="w-full h-full pointer-events-none"
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
            title="Testimonial video"
          />
        </div>
        <div
          className={cn(
            "absolute bottom-3 right-3 p-2 rounded-full transition-all",
            isActive ? "bg-purple-600" : "bg-black/60 group-hover:bg-black/80"
          )}
        >
          {isActive ? (
            <Volume2 className="w-4 h-4 text-white" />
          ) : (
            <VolumeX className="w-4 h-4 text-white" />
          )}
        </div>
      </div>
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
      <p className="text-sm text-zinc-400 mb-4">
        See what AI-generated testimonials look like:
      </p>
      <div className="relative w-full">
        <div
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth justify-center sm:justify-center"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {videoIds.map((id) => (
            <VimeoCard
              key={id}
              id={id}
              isActive={activeVideo === id}
              onToggle={handleToggle}
              onPlayerReady={handlePlayerReady}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-500 text-center mt-2 sm:hidden">
          Swipe to see more
        </p>
      </div>
    </motion.div>
  );
}
