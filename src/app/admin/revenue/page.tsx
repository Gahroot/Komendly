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
import { PageHeader } from "@/components/page-header";

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
    color: "var(--chart-3)",
  },
  purchases: {
    label: "Purchases",
    color: "var(--chart-1)",
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
        <PageHeader eyebrow="Admin" title="Revenue" description="Track platform revenue and purchases" />
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
      <PageHeader eyebrow="Admin" title="Revenue" description="Track platform revenue and purchases" />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;

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
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Revenue Chart */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Revenue Trend</CardTitle>
            <CardDescription className="text-muted-foreground">
              Monthly revenue over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={stats?.revenueByMonth ?? []}>
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

        {/* Purchases by Plan */}
        <Card >
          <CardHeader>
            <CardTitle className="text-foreground">Revenue by Plan</CardTitle>
            <CardDescription className="text-muted-foreground">
              Revenue distribution across plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={stats?.revenueByPlan ?? []}>
                <XAxis
                  dataKey="plan"
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
                <Bar dataKey="revenue" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Purchases Table */}
      <Card >
        <CardHeader>
          <CardTitle className="text-foreground">Recent Purchases</CardTitle>
          <CardDescription className="text-muted-foreground">
            Latest credit purchases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted">
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Minutes</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.recentPurchases?.map((purchase) => (
                  <TableRow key={purchase.id} className="border-border hover:bg-muted">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {purchase.user.name || purchase.user.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-muted-foreground">{purchase.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-secondary text-foreground/80 border-input">
                        {purchase.minutes} min
                      </Badge>
                    </TableCell>
                    <TableCell className="text-success font-medium">
                      ${(purchase.amountPaid / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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
              className="border-input text-foreground/80 hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(stats?.recentPurchases?.length ?? 0) < 10}
              className="border-input text-foreground/80 hover:bg-secondary"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
