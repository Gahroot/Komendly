"use client";

import { useState, useRef, useEffect, useCallback, memo, useId } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import Player from "@vimeo/player";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

interface VideoShowcaseProps {
  videoIds: string[];
  className?: string;
}

interface TestimonialVideoCardProps {
  videoId: string;
  isActive: boolean;
  onToggle: (videoId: string) => void;
  onPlayerReady: (instanceId: string, videoId: string, player: Player) => void;
  onPlayerUnmount: (instanceId: string) => void;
}

const TestimonialVideoCard = memo(function TestimonialVideoCard({
  videoId,
  isActive,
  onToggle,
  onPlayerReady,
  onPlayerUnmount,
}: TestimonialVideoCardProps) {
  const instanceId = useId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || playerRef.current) return;

    const initPlayer = () => {
      const player = new Player(iframe);
      playerRef.current = player;
      onPlayerReady(instanceId, videoId, player);
    };

    const timer = setTimeout(initPlayer, 300);
    return () => {
      clearTimeout(timer);
      onPlayerUnmount(instanceId);
    };
  }, [instanceId, videoId, onPlayerReady, onPlayerUnmount]);

  return (
    <button
      type="button"
      aria-pressed={isActive}
      aria-label={isActive ? "Mute this example" : "Play this example with sound"}
      className={cn(
        "pixel-frame studio-frame relative block w-[180px] shrink-0 cursor-pointer overflow-hidden p-1.5 text-left sm:w-[220px]",
        isActive && "shadow-[0_0_40px_-6px_#ffcf4a99]"
      )}
      onClick={() => onToggle(videoId)}
    >
      <div className="pixel-frame aspect-[9/16] overflow-hidden bg-[var(--studio-ink)]">
        <iframe
          ref={iframeRef}
          src={`https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&loop=1&background=1&muted=1`}
          className="pointer-events-none h-full w-full"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          title="Example AI video testimonial"
          loading="lazy"
        />
      </div>

      {/* Volume indicator */}
      <div
        className={cn(
          "absolute bottom-3 right-3 rounded-full p-2 transition-all duration-200",
          isActive
            ? "bg-[var(--studio-gold)] text-[#2a0f10]"
            : "bg-black/60 text-white"
        )}
      >
        {isActive ? (
          <Volume2 aria-hidden className="h-4 w-4" />
        ) : (
          <VolumeX aria-hidden className="h-4 w-4" />
        )}
      </div>

      {/* Click hint overlay */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 hover:bg-black/20 hover:opacity-100">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            Tap for sound
          </span>
        </div>
      )}
    </button>
  );
});

interface PlayerInfo {
  player: Player;
  videoId: string;
}

export function VideoShowcase({ videoIds, className }: VideoShowcaseProps) {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  // Map from instanceId -> { player, videoId }
  const playersRef = useRef<Map<string, PlayerInfo>>(new Map());

  const handlePlayerReady = useCallback((instanceId: string, videoId: string, player: Player) => {
    playersRef.current.set(instanceId, { player, videoId });
  }, []);

  const handlePlayerUnmount = useCallback((instanceId: string) => {
    playersRef.current.delete(instanceId);
  }, []);

  const handleToggle = useCallback((videoId: string) => {
    setActiveVideo((prev) => (prev === videoId ? null : videoId));
  }, []);

  // Mute all players, then unmute only ONE instance of the active video
  useEffect(() => {
    // First, mute ALL players
    playersRef.current.forEach(({ player }) => {
      player.setMuted(true).catch(() => {
        // Ignore errors if video not ready
      });
    });

    // Then unmute only the FIRST instance of the active video
    if (activeVideo) {
      for (const [, { player, videoId }] of playersRef.current) {
        if (videoId === activeVideo) {
          player.setMuted(false).catch(() => {
            // Ignore errors if video not ready
          });
          break; // Only unmute the first instance found
        }
      }
    }
  }, [activeVideo]);

  return (
    <motion.div
      className={cn("w-full", className)}
      initial={{ opacity: 1, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >

      <div className="relative w-full [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <Marquee
          pauseOnHover
          className="[--duration:30s] [--gap:1rem]"
          repeat={2}
        >
          {videoIds.map((id) => (
            <TestimonialVideoCard
              key={id}
              videoId={id}
              isActive={activeVideo === id}
              onToggle={handleToggle}
              onPlayerReady={handlePlayerReady}
              onPlayerUnmount={handlePlayerUnmount}
            />
          ))}
        </Marquee>
      </div>
    </motion.div>
  );
}
