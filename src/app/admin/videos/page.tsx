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
import { PageHeader } from "@/components/page-header";

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
        return "bg-success/20 text-success border-success/30";
      case "processing":
        return "bg-primary/20 text-primary border-primary/30";
      case "pending":
        return "bg-warning/20 text-warning border-warning/30";
      case "failed":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "bg-zinc-500/20 text-muted-foreground border-zinc-500/30";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Videos" description="Manage generated videos" />

      {/* Filters */}
      <Card >
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user email or business name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40 bg-secondary border-input text-foreground">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent >
                <SelectItem value="all" className="text-foreground/80">
                  All Status
                </SelectItem>
                <SelectItem value="completed" className="text-foreground/80">
                  Completed
                </SelectItem>
                <SelectItem value="processing" className="text-foreground/80">
                  Processing
                </SelectItem>
                <SelectItem value="pending" className="text-foreground/80">
                  Pending
                </SelectItem>
                <SelectItem value="failed" className="text-foreground/80">
                  Failed
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Videos Table */}
      <Card >
        <CardHeader>
          <CardTitle className="text-foreground">All Videos</CardTitle>
          <CardDescription className="text-muted-foreground">
            {data?.total ?? 0} total videos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted">
                  <TableHead className="text-muted-foreground">Video</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Business</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Duration</TableHead>
                  <TableHead className="text-muted-foreground">Created</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell>
                        <Skeleton className="h-12 w-20 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-secondary" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-8 bg-secondary ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.videos.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No videos found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.videos.map((video) => (
                    <TableRow key={video.id} className="border-border hover:bg-muted">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {video.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={video.thumbnailUrl}
                              alt="Thumbnail"
                              className="h-12 w-20 rounded object-cover bg-secondary"
                            />
                          ) : (
                            <div className="h-12 w-20 rounded bg-secondary flex items-center justify-center">
                              <Video className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">
                            {video.user.name || video.user.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-muted-foreground">{video.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-foreground">{video.review.businessName}</p>
                          <p className="text-xs text-muted-foreground">{video.review.reviewerName}</p>
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
                      <TableCell className="text-foreground/80">
                        {video.duration ? `${video.duration}s` : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(video.createdAt).toLocaleDateString()}
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
                            {video.url && (
                              <DropdownMenuItem
                                className="text-foreground/80 focus:bg-secondary focus:text-foreground"
                                onClick={() => window.open(video.url!, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Video
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:bg-secondary focus:text-destructive"
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
