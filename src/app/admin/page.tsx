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
    color: "hsl(262, 83%, 58%)",
  },
  completed: {
    label: "Completed",
    color: "hsl(142, 76%, 36%)",
  },
  pending: {
    label: "Pending",
    color: "hsl(48, 96%, 53%)",
  },
  processing: {
    label: "Processing",
    color: "hsl(217, 91%, 60%)",
  },
  failed: {
    label: "Failed",
    color: "hsl(0, 84%, 60%)",
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
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Overview of your platform</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-400 mt-1">Overview of your platform</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.change >= 0;

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
                {stat.change !== 0 && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                    {isPositive ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-red-500" />
                    )}
                    <span className={isPositive ? "text-green-500" : "text-red-500"}>
                      {Math.abs(stat.change)}%
                    </span>
                    <span className="text-zinc-500">from last month</span>
                  </p>
                )}
                <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenue Chart */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Monthly Revenue</CardTitle>
            <CardDescription className="text-zinc-500">
              Revenue over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={stats?.monthlyRevenue ?? []}>
                <XAxis
                  dataKey="month"
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
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Videos by Status</CardTitle>
            <CardDescription className="text-zinc-500">
              Distribution of video generation status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.videosByStatus ?? []}>
                <XAxis
                  dataKey="status"
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
                <Bar dataKey="count" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Users */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Recent Users</CardTitle>
            <CardDescription className="text-zinc-500">
              Latest user registrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentUsers?.slice(0, 5).map((user) => (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <span className="text-xs font-medium text-zinc-300">
                        {(user.name || user.email)?.[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {user.name || user.email.split("@")[0]}
                      </p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                    {user.plan}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Videos */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Recent Videos</CardTitle>
            <CardDescription className="text-zinc-500">
              Latest video generations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentVideos?.slice(0, 5).map((video) => (
                <div key={video.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Video className="h-4 w-4 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {video.user.email}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(video.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      video.status === "completed"
                        ? "bg-green-500/20 text-green-400"
                        : video.status === "processing"
                        ? "bg-blue-500/20 text-blue-400"
                        : video.status === "pending"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
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
