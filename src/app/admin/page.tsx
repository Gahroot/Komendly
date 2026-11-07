"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Video,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, LineChart, Line } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

interface DashboardStats {
  totalUsers: number;
  activeSubscribers: number;
  totalVideos: number;
  totalRevenue: number;
  userGrowth: number;
  videoGrowth: number;
  recentUsers: Array<{
    id: string;
    email: string;
    name: string | null;
    plan: string;
    createdAt: string;
  }>;
  recentVideos: Array<{
    id: string;
    status: string;
    createdAt: string;
    user: { email: string };
  }>;
  monthlyRevenue: Array<{
    month: string;
    revenue: number;
  }>;
  videosByStatus: Array<{
    status: string;
    count: number;
  }>;
}

const chartConfig: ChartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
  completed: {
    label: "Completed",
    color: "var(--chart-3)",
  },
  pending: {
    label: "Pending",
    color: "var(--chart-4)",
  },
  processing: {
    label: "Processing",
    color: "var(--chart-2)",
  },
  failed: {
    label: "Failed",
    color: "var(--chart-5)",
  },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/admin/stats");
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch admin stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Admin" title="Dashboard" description="Overview of your platform" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

  const statCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      change: stats?.userGrowth ?? 0,
      description: "Total registered users",
    },
    {
      title: "Active Subscribers",
      value: stats?.activeSubscribers ?? 0,
      icon: TrendingUp,
      change: 0,
      description: "Users with active subscriptions",
    },
    {
      title: "Total Videos",
      value: stats?.totalVideos ?? 0,
      icon: Video,
      change: stats?.videoGrowth ?? 0,
      description: "Videos generated",
    },
    {
      title: "Total Revenue",
      value: `$${((stats?.totalRevenue ?? 0) / 100).toLocaleString()}`,
      icon: DollarSign,
      change: 0,
      description: "Lifetime revenue",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Dashboard" description="Overview of your platform" />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.change >= 0;

          return (
            <Card key={stat.title} >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                {stat.change !== 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    {isPositive ? (
                      <ArrowUpRight className="h-3 w-3 text-success" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-destructive" />
                    )}
                    <span className={isPositive ? "text-success" : "text-destructive"}>
                      {Math.abs(stat.change)}%
                    </span>
                    <span className="text-muted-foreground">from last month</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenue Chart */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Revenue</CardTitle>
            <CardDescription className="text-muted-foreground">
              Revenue over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={stats?.monthlyRevenue ?? []}>
                <XAxis
                  dataKey="month"
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
                  tickFormatter={(value) => `$${value}`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-revenue)" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Videos by Status */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Videos by Status</CardTitle>
            <CardDescription className="text-muted-foreground">
              Distribution of video generation status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByStatus ?? []}>
                <XAxis
                  dataKey="status"
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
                <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Users */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Recent Users</CardTitle>
            <CardDescription className="text-muted-foreground">
              Latest user registrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentUsers?.slice(0, 5).map((user) => (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-xs font-medium text-foreground/80">
                        {(user.name || user.email)?.[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {user.name || user.email.split("@")[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                    {user.plan}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Videos */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Recent Videos</CardTitle>
            <CardDescription className="text-muted-foreground">
              Latest video generations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentVideos?.slice(0, 5).map((video) => (
                <div key={video.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <Video className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {video.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(video.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      video.status === "completed"
                        ? "bg-success/20 text-success"
                        : video.status === "processing"
                        ? "bg-primary/20 text-primary"
                        : video.status === "pending"
                        ? "bg-warning/20 text-warning"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {video.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
