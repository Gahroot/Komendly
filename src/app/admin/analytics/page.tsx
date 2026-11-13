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
import { PageHeader } from "@/components/page-header";
import { StatCard } from "../ads/_components/stat-card";

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
    color: "var(--chart-1)",
  },
  users: {
    label: "Users",
    color: "var(--chart-3)",
  },
};

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

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
        <PageHeader eyebrow="Testimonials" title="Analytics" description="How people are using the testimonial video maker." />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} >
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24 bg-secondary" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 bg-secondary" />
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
      <PageHeader eyebrow="Testimonials" title="Analytics" description="How people are using the testimonial video maker." />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.title} label={stat.title} value={String(stat.value)} hint={stat.description} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Videos by Day */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Videos Generated (Last 14 Days)</CardTitle>
            <CardDescription className="text-muted-foreground">
              Daily video generation activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByDay ?? []}>
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
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
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Users by Plan</CardTitle>
            <CardDescription className="text-muted-foreground">
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
        <Card className="bg-card border-border md:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground">Most Used AI Creators</CardTitle>
            <CardDescription className="text-muted-foreground">
              Video generations by AI creator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByCreator ?? []} layout="vertical">
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="creator"
                  stroke="var(--muted-foreground)"
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
