"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Video, Calendar, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoCard } from "@/components/video-card";
import { VideoModal } from "@/components/video-modal";
import { useVideos, deleteVideo, type Video as VideoType } from "@/hooks/useVideos";
import { useUser } from "@/hooks/useUser";

const stats = [
  {
    title: "Videos Created",
    value: "12",
    icon: Video,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    title: "Videos This Month",
    value: "4",
    icon: Calendar,
    gradient: "from-blue-500 to-cyan-600",
  },
  {
    title: "Current Plan",
    value: "Pro",
    icon: Sparkles,
    gradient: "from-amber-500 to-orange-600",
  },
];


const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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

export default function DashboardPage() {
  const { videos, total, isLoading, refresh } = useVideos(1, 4);
  const { user } = useUser();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  const handleDeleteVideo = async (id: string) => {
    const success = await deleteVideo(id);
    if (success) {
      refresh();
      setSelectedVideo(null);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-6xl space-y-8"
    >
      {/* Welcome Section */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
          Welcome back, {firstName}!
        </h1>
        <p className="text-zinc-400">
          Transform your Google Reviews into engaging video testimonials.
        </p>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={itemVariants}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">
                    {stat.title}
                  </CardTitle>
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${stat.gradient}`}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-zinc-100">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* CTA Button */}
      <motion.div variants={itemVariants}>
        <Link href="/dashboard/create">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-block"
          >
            <Button
              size="lg"
              className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700"
            >
              <Plus className="h-5 w-5" />
              Create New Video
            </Button>
          </motion.div>
        </Link>
      </motion.div>

      {/* Recent Videos Section */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">Recent Videos</h2>
          <Link href="/dashboard/videos">
            <Button
              variant="ghost"
              className="text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              View All ({total})
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Video className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400">No videos yet</p>
            <p className="text-sm text-zinc-500">Create your first video testimonial to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onClick={setSelectedVideo}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Video Modal */}
      <VideoModal
        video={selectedVideo}
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={handleDeleteVideo}
      />
    </motion.div>
  );
}
