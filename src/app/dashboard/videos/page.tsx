"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  SortDesc,
  SortAsc,
  Video,
  Plus,
  Loader2,
  Film,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoCard } from "@/components/video-card";
import { VideoModal } from "@/components/video-modal";
import { useVideos, deleteVideo, type Video as VideoType } from "@/hooks/useVideos";
import { PageHeader } from "@/components/page-header";
import { LaunchUpsell } from "@/components/testimonials/create/offer-gate";
import { useUser } from "@/hooks/useUser";

export default function VideosPage() {
  const { videos, isLoading, error, refresh } = useVideos();
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (video) =>
          video.businessName.toLowerCase().includes(query) ||
          video.reviewerName.toLowerCase().includes(query)
      );
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [videos, searchQuery, sortOrder]);

  const handleVideoClick = (video: VideoType) => {
    setSelectedVideo(video);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedVideo(null), 300);
  };

  const handleDeleteVideo = async (id: string) => {
    const success = await deleteVideo(id);
    if (success) {
      refresh();
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 1, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 24,
      },
    },
  };

  return (
    <div>
      <div>
        {/* Header */}
        <PageHeader
          className="mb-8"
          eyebrow="Library"
          title="Your videos"
          description={`${videos.length} testimonial${videos.length !== 1 ? "s" : ""} generated`}
          actions={
            <a href="/dashboard/create-fal" className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <Plus aria-hidden className="size-4" />
              Make a video
            </a>
          }
        />

        {videos.length > 0 ? <div className="mb-8"><LaunchUpsell user={user} placement="videos" /></div> : null}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by business or reviewer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-10"
            />
          </div>
          <Select
            value={sortOrder}
            onValueChange={(value: "desc" | "asc") => setSortOrder(value)}
          >
            <SelectTrigger className="h-11 w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by date" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem
                value="desc"
                className="text-foreground focus:bg-secondary focus:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <SortDesc className="w-4 h-4" />
                  Newest First
                </div>
              </SelectItem>
              <SelectItem
                value="asc"
                className="text-foreground focus:bg-secondary focus:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <SortAsc className="w-4 h-4" />
                  Oldest First
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        <div>
          {isLoading ? (
            // Loading State
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 aria-hidden className="w-8 h-8 text-[var(--studio-gold)] animate-spin mb-4" />
              <p className="text-muted-foreground">Loading your videos...</p>
            </div>
          ) : error ? (
            // Error State
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                Failed to load videos
              </h3>
              <p className="text-muted-foreground mb-4">
                Something went wrong while fetching your videos.
              </p>
              <Button
                variant="outline"
                onClick={() => refresh()}
                className="border-input text-foreground hover:bg-secondary"
              >
                Try Again
              </Button>
            </div>
          ) : filteredVideos.length === 0 ? (
            // Empty State
            <motion.div
              initial={{ opacity: 1, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="pixel-frame w-20 h-20 bg-[linear-gradient(160deg,#3a2266,#1c0f36)] flex items-center justify-center mb-6">
                <Film aria-hidden className="w-10 h-10 text-[var(--studio-gold)]" />
              </div>
              {searchQuery ? (
                <>
                  <h3 className="font-display text-2xl font-medium text-foreground mb-2">
                    No videos found
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    No videos match your search for &ldquo;{searchQuery}&rdquo;.
                    Try a different search term.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchQuery("")}
                    className="border-input text-foreground hover:bg-secondary"
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="font-display text-2xl font-medium text-foreground mb-2">
                    No videos yet
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    Paste a customer review, pick a presenter, and your first
                    testimonial lands here in a few minutes.
                  </p>
                  <a href="/dashboard/create-fal" className="spellbar__cta inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold">
                    <Plus aria-hidden className="size-4" />
                    Make my first video
                  </a>
                </>
              )}
            </motion.div>
          ) : (
            // Video Grid
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              <AnimatePresence>
                {filteredVideos.map((video) => (
                  <motion.div key={video.id} variants={itemVariants} layout>
                    <VideoCard video={video} onClick={handleVideoClick} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Video Modal */}
        <VideoModal
          video={selectedVideo}
          open={isModalOpen}
          onClose={handleCloseModal}
          onDelete={handleDeleteVideo}
        />
      </div>
    </div>
  );
}
