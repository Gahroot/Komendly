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
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoCard } from "@/components/video-card";
import { VideoModal } from "@/components/video-modal";
import { useVideos, deleteVideo, type Video as VideoType } from "@/hooks/useVideos";
import { PageHeader } from "@/components/page-header";

export default function VideosPage() {
  const { videos, isLoading, error, refresh } = useVideos();
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
          title="Video Library"
          description={`${videos.length} testimonial${videos.length !== 1 ? "s" : ""} generated`}
          actions={
            <Button asChild>
              <a href="/dashboard/create">
                <Plus className="w-4 h-4 mr-2" />
                Create New Video
              </a>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by business or reviewer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <Select
            value={sortOrder}
            onValueChange={(value: "desc" | "asc") => setSortOrder(value)}
          >
            <SelectTrigger className="w-[180px] bg-card border-border text-foreground">
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
        <ScrollArea className="h-[calc(100vh-280px)]">
          {isLoading ? (
            // Loading State
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
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
              <div className="w-20 h-20 rounded-3xl bg-primary/10 shadow-[var(--glass-rim)] flex items-center justify-center mb-6">
                <Film className="w-10 h-10 text-primary" />
              </div>
              {searchQuery ? (
                <>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
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
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    No videos yet
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    You haven&apos;t created any testimonial videos yet.
                    Transform your Google Reviews into engaging video content!
                  </p>
                  <Button
                    asChild
                    className="bg-brand hover:bg-primary/90 text-primary-foreground"
                  >
                    <a href="/dashboard/create">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Video
                    </a>
                  </Button>
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
        </ScrollArea>

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
