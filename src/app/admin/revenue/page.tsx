"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, LineChart, Line } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueStats {
  totalRevenue: number;
  monthlyRevenue: number;
  averageOrderValue: number;
  totalPurchases: number;
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    purchases: number;
  }>;
  revenueByPlan: Array<{
    plan: string;
    revenue: number;
    count: number;
  }>;
  recentPurchases: Array<{
    id: string;
    minutes: number;
    amountPaid: number;
    createdAt: string;
    user: {
      email: string;
      name: string | null;
    };
  }>;
}

const chartConfig: ChartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(142, 76%, 36%)",
  },
  purchases: {
    label: "Purchases",
    color: "hsl(262, 83%, 58%)",
  },
};

export default function RevenuePage() {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/admin/revenue?page=${page}`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch revenue stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [page]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Revenue</h1>
          <p className="text-zinc-400 mt-1">Track platform revenue and purchases</p>
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

  const statCards = [
    {
      title: "Total Revenue",
      value: `$${((stats?.totalRevenue ?? 0) / 100).toLocaleString()}`,
      icon: DollarSign,
      description: "Lifetime revenue",
    },
    {
      title: "This Month",
      value: `$${((stats?.monthlyRevenue ?? 0) / 100).toLocaleString()}`,
      icon: TrendingUp,
      description: "Current month revenue",
    },
    {
      title: "Avg Order Value",
      value: `$${((stats?.averageOrderValue ?? 0) / 100).toFixed(2)}`,
      icon: CreditCard,
      description: "Average purchase amount",
    },
    {
      title: "Total Purchases",
      value: stats?.totalPurchases ?? 0,
      icon: Users,
      description: "Number of transactions",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Revenue</h1>
        <p className="text-zinc-400 mt-1">Track platform revenue and purchases</p>
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
        {/* Monthly Revenue Chart */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Revenue Trend</CardTitle>
            <CardDescription className="text-zinc-500">
              Monthly revenue over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={stats?.revenueByMonth ?? []}>
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

        {/* Purchases by Plan */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Revenue by Plan</CardTitle>
            <CardDescription className="text-zinc-500">
              Revenue distribution across plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.revenueByPlan ?? []}>
                <XAxis
                  dataKey="plan"
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
                <Bar dataKey="revenue" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Purchases Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Recent Purchases</CardTitle>
          <CardDescription className="text-zinc-500">
            Latest credit purchases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableHead className="text-zinc-400">User</TableHead>
                  <TableHead className="text-zinc-400">Minutes</TableHead>
                  <TableHead className="text-zinc-400">Amount</TableHead>
                  <TableHead className="text-zinc-400">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.recentPurchases?.map((purchase) => (
                  <TableRow key={purchase.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-zinc-100">
                          {purchase.user.name || purchase.user.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-zinc-500">{purchase.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-zinc-800 text-zinc-300 border-zinc-700">
                        {purchase.minutes} min
                      </Badge>
                    </TableCell>
                    <TableCell className="text-green-400 font-medium">
                      ${(purchase.amountPaid / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {new Date(purchase.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Simple Pagination */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-zinc-400">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(stats?.recentPurchases?.length ?? 0) < 10}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
