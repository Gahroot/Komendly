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
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
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
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Video Library</h1>
            <p className="text-zinc-400">
              {videos.length} testimonial{videos.length !== 1 ? "s" : ""}{" "}
              generated
            </p>
          </div>
          <Button
            asChild
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            <a href="/dashboard/create">
              <Plus className="w-4 h-4 mr-2" />
              Create New Video
            </a>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search by business or reviewer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-purple-500"
            />
          </div>
          <Select
            value={sortOrder}
            onValueChange={(value: "desc" | "asc") => setSortOrder(value)}
          >
            <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white">
              <SelectValue placeholder="Sort by date" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem
                value="desc"
                className="text-white focus:bg-zinc-800 focus:text-white"
              >
                <div className="flex items-center gap-2">
                  <SortDesc className="w-4 h-4" />
                  Newest First
                </div>
              </SelectItem>
              <SelectItem
                value="asc"
                className="text-white focus:bg-zinc-800 focus:text-white"
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
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-4" />
              <p className="text-zinc-400">Loading your videos...</p>
            </div>
          ) : error ? (
            // Error State
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                Failed to load videos
              </h3>
              <p className="text-zinc-400 mb-4">
                Something went wrong while fetching your videos.
              </p>
              <Button
                variant="outline"
                onClick={() => refresh()}
                className="border-zinc-700 text-white hover:bg-zinc-800"
              >
                Try Again
              </Button>
            </div>
          ) : filteredVideos.length === 0 ? (
            // Empty State
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-6">
                <Film className="w-10 h-10 text-purple-400" />
              </div>
              {searchQuery ? (
                <>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No videos found
                  </h3>
                  <p className="text-zinc-400 text-center max-w-md mb-6">
                    No videos match your search for &ldquo;{searchQuery}&rdquo;.
                    Try a different search term.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchQuery("")}
                    className="border-zinc-700 text-white hover:bg-zinc-800"
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No videos yet
                  </h3>
                  <p className="text-zinc-400 text-center max-w-md mb-6">
                    You haven&apos;t created any testimonial videos yet.
                    Transform your Google Reviews into engaging video content!
                  </p>
                  <Button
                    asChild
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
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
