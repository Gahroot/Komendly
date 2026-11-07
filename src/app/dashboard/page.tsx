"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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
    gradient: "from-primary to-primary/60",
  },
  {
    title: "Videos This Month",
    value: "4",
    icon: Calendar,
    gradient: "from-chart-2 to-chart-2/60",
  },
  {
    title: "Current Plan",
    value: "Pro",
    icon: Sparkles,
    gradient: "from-chart-4 to-chart-4/60",
  },
];


const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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
      className="space-y-8"
    >
      {/* Welcome Section */}
      <motion.div variants={itemVariants}>
        <PageHeader
          eyebrow="Overview"
          title={<>Welcome back, {firstName}!</>}
          description="Transform your Google Reviews into engaging video testimonials."
          actions={
            <Button asChild size="lg" className="gap-2">
              <Link href="/dashboard/create">
                <Plus className="h-5 w-5" />
                Create New Video
              </Link>
            </Button>
          }
        />
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={itemVariants}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title}>
              <Card className="gap-4 transition-colors duration-200 hover:border-primary/30">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-[var(--glass-rim)] ${stat.gradient}`}
                  >
                    <Icon className="h-4 w-4 text-primary-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </motion.div>

      {/* Recent Videos Section */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Recent Videos</h2>
          <Link href="/dashboard/videos">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:bg-card hover:text-foreground"
            >
              View All ({total})
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No videos yet"
            description="Create your first video testimonial to get started"
          />
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
