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
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "pro":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "starter":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      default:
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "trialing":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "past_due":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "canceled":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Users</h1>
        <p className="text-zinc-400 mt-1">Manage platform users</p>
      </div>

      {/* Search */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">All Users</CardTitle>
          <CardDescription className="text-zinc-500">
            {data?.total ?? 0} total users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableHead className="text-zinc-400">User</TableHead>
                  <TableHead className="text-zinc-400">Plan</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Usage</TableHead>
                  <TableHead className="text-zinc-400">Videos</TableHead>
                  <TableHead className="text-zinc-400">Joined</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-zinc-800">
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-zinc-800 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.users.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id} className="border-zinc-800 hover:bg-zinc-800/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center">
                            <span className="text-xs font-medium text-zinc-300">
                              {(user.name || user.email)?.[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-zinc-100">
                                {user.name || user.email.split("@")[0]}
                              </p>
                              {user.isAdmin && (
                                <Shield className="h-3 w-3 text-violet-400" />
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">{user.email}</p>
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
                      <TableCell className="text-zinc-300">
                        {user.minutesUsed} / {user.minutesLimit} min
                      </TableCell>
                      <TableCell className="text-zinc-300">
                        {user._count.generatedVideos}
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-zinc-900 border-zinc-800"
                          >
                            <DropdownMenuLabel className="text-zinc-400">
                              Actions
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-zinc-800" />
                            <DropdownMenuItem
                              className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
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
              <p className="text-sm text-zinc-500">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
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
