"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Video,
  Filter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface GeneratedVideo {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  avatarStyle: string;
  duration: number | null;
  aspectRatio: string;
  status: string;
  mirageCreatorName: string | null;
  creditsUsed: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  review: {
    businessName: string;
    reviewerName: string;
  };
}

interface VideosResponse {
  videos: GeneratedVideo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function VideosPage() {
  const [data, setData] = useState<VideosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        search,
        ...(status !== "all" && { status }),
      });
      const response = await fetch(`/api/admin/videos?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch videos:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleDelete = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;

    try {
      const response = await fetch(`/api/admin/videos/${videoId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  const getStatusBadgeColor = (videoStatus: string) => {
    switch (videoStatus) {
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "processing":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "pending":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Videos</h1>
        <p className="text-zinc-400 mt-1">Manage generated videos</p>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by user email or business name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-zinc-100">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-zinc-300">
                  All Status
                </SelectItem>
                <SelectItem value="completed" className="text-zinc-300">
                  Completed
                </SelectItem>
                <SelectItem value="processing" className="text-zinc-300">
                  Processing
                </SelectItem>
                <SelectItem value="pending" className="text-zinc-300">
                  Pending
                </SelectItem>
                <SelectItem value="failed" className="text-zinc-300">
                  Failed
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Videos Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">All Videos</CardTitle>
          <CardDescription className="text-zinc-500">
            {data?.total ?? 0} total videos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableHead className="text-zinc-400">Video</TableHead>
                  <TableHead className="text-zinc-400">User</TableHead>
                  <TableHead className="text-zinc-400">Business</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Duration</TableHead>
                  <TableHead className="text-zinc-400">Created</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-zinc-800">
                      <TableCell>
                        <Skeleton className="h-12 w-20 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-zinc-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-zinc-800 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.videos.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                      No videos found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.videos.map((video) => (
                    <TableRow key={video.id} className="border-zinc-800 hover:bg-zinc-800/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {video.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={video.thumbnailUrl}
                              alt="Thumbnail"
                              className="h-12 w-20 rounded object-cover bg-zinc-800"
                            />
                          ) : (
                            <div className="h-12 w-20 rounded bg-zinc-800 flex items-center justify-center">
                              <Video className="h-5 w-5 text-zinc-600" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-zinc-100">
                            {video.user.name || video.user.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-zinc-500">{video.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-zinc-100">{video.review.businessName}</p>
                          <p className="text-xs text-zinc-500">{video.review.reviewerName}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusBadgeColor(video.status)}
                        >
                          {video.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-300">
                        {video.duration ? `${video.duration}s` : "-"}
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {new Date(video.createdAt).toLocaleDateString()}
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
                            {video.url && (
                              <DropdownMenuItem
                                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                                onClick={() => window.open(video.url!, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Video
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-400 focus:bg-zinc-800 focus:text-red-300"
                              onClick={() => handleDelete(video.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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
