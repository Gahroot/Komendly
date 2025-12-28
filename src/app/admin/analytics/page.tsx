"use client";

import { useEffect, useState } from "react";
import {
  Video,
  Users,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalyticsStats {
  totalVideosGenerated: number;
  completedVideos: number;
  failedVideos: number;
  averageGenerationTime: number;
  videosByDay: Array<{
    date: string;
    count: number;
  }>;
  videosByCreator: Array<{
    creator: string;
    count: number;
  }>;
  usersByPlan: Array<{
    plan: string;
    count: number;
  }>;
  usageStats: {
    totalMinutesUsed: number;
    averageMinutesPerUser: number;
  };
}

const chartConfig: ChartConfig = {
  videos: {
    label: "Videos",
    color: "hsl(262, 83%, 58%)",
  },
  users: {
    label: "Users",
    color: "hsl(142, 76%, 36%)",
  },
};

const COLORS = ["#8b5cf6", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/admin/analytics");
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Analytics</h1>
          <p className="text-zinc-400 mt-1">Platform usage insights</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24 bg-zinc-800" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const successRate = stats?.totalVideosGenerated
    ? ((stats.completedVideos / stats.totalVideosGenerated) * 100).toFixed(1)
    : 0;

  const statCards = [
    {
      title: "Total Videos",
      value: stats?.totalVideosGenerated ?? 0,
      icon: Video,
      description: "All time generations",
    },
    {
      title: "Success Rate",
      value: `${successRate}%`,
      icon: TrendingUp,
      description: `${stats?.completedVideos ?? 0} completed`,
    },
    {
      title: "Avg Generation Time",
      value: `${Math.round(stats?.averageGenerationTime ?? 0)}s`,
      icon: Clock,
      description: "Average time per video",
    },
    {
      title: "Total Minutes Used",
      value: `${stats?.usageStats.totalMinutesUsed ?? 0}`,
      icon: Users,
      description: `Avg ${(stats?.usageStats.averageMinutesPerUser ?? 0).toFixed(1)}/user`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Analytics</h1>
        <p className="text-zinc-400 mt-1">Platform usage insights</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card key={stat.title} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-100">{stat.value}</div>
                <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Videos by Day */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Videos Generated (Last 14 Days)</CardTitle>
            <CardDescription className="text-zinc-500">
              Daily video generation activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByDay ?? []}>
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-videos)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Users by Plan */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Users by Plan</CardTitle>
            <CardDescription className="text-zinc-500">
              Distribution of user subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <PieChart>
                <Pie
                  data={stats?.usersByPlan ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="plan"
                  label={({ plan, count }) => `${plan}: ${count}`}
                  labelLine={false}
                >
                  {stats?.usersByPlan?.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top AI Creators */}
        <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-zinc-100">Most Used AI Creators</CardTitle>
            <CardDescription className="text-zinc-500">
              Video generations by AI creator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByCreator ?? []} layout="vertical">
                <XAxis
                  type="number"
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="creator"
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-videos)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
