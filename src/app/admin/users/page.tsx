"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  MoreHorizontal,
  Shield,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  subscriptionStatus: string;
  isAdmin: boolean;
  minutesUsed: number;
  minutesLimit: number;
  createdAt: string;
  _count: {
    generatedVideos: number;
  };
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        search,
      });
      const response = await fetch(`/api/admin/users?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleToggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !isAdmin }),
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to toggle admin:", error);
    }
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "bg-primary/20 text-primary border-primary/30";
      case "pro":
        return "bg-primary/20 text-primary border-primary/30";
      case "starter":
        return "bg-success/20 text-success border-success/30";
      default:
        return "bg-zinc-500/20 text-muted-foreground border-zinc-500/30";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success/20 text-success border-success/30";
      case "trialing":
        return "bg-primary/20 text-primary border-primary/30";
      case "past_due":
        return "bg-warning/20 text-warning border-warning/30";
      case "canceled":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "bg-zinc-500/20 text-muted-foreground border-zinc-500/30";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Users" description="Manage platform users" />

      {/* Search */}
      <Card >
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card >
        <CardHeader>
          <CardTitle className="text-foreground">All Users</CardTitle>
          <CardDescription className="text-muted-foreground">
            {data?.total ?? 0} total users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted">
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Plan</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Usage</TableHead>
                  <TableHead className="text-muted-foreground">Videos</TableHead>
                  <TableHead className="text-muted-foreground">Joined</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-secondary ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.users.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id} className="border-border hover:bg-muted">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                            <span className="text-xs font-medium text-foreground/80">
                              {(user.name || user.email)?.[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">
                                {user.name || user.email.split("@")[0]}
                              </p>
                              {user.isAdmin && (
                                <Shield className="h-3 w-3 text-primary" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getPlanBadgeColor(user.plan)}
                        >
                          {user.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusBadgeColor(user.subscriptionStatus)}
                        >
                          {user.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-foreground/80">
                        {user.minutesUsed} / {user.minutesLimit} min
                      </TableCell>
                      <TableCell className="text-foreground/80">
                        {user._count.generatedVideos}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            
                          >
                            <DropdownMenuLabel className="text-muted-foreground">
                              Actions
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-secondary" />
                            <DropdownMenuItem
                              className="text-foreground/80 focus:bg-secondary focus:text-foreground"
                              onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                            >
                              {user.isAdmin ? (
                                <>
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  Remove Admin
                                </>
                              ) : (
                                <>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Admin
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-input text-foreground/80 hover:bg-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="border-input text-foreground/80 hover:bg-secondary"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
