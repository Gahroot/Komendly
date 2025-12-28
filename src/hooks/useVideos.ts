import useSWR from "swr";

export interface Video {
  id: string;
  reviewerName: string;
  businessName: string;
  reviewText: string;
  rating: number;
  thumbnailUrl: string;
  videoUrl: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: string;
  duration: number;
  createdAt: string;
}

interface VideosResponse {
  videos: Video[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useVideos(page: number = 1, pageSize: number = 12) {
  const { data, error, isLoading, mutate } = useSWR<VideosResponse>(
    `/api/videos?page=${page}&pageSize=${pageSize}`,
    fetcher
  );

  return {
    videos: data?.videos || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pageSize: data?.pageSize || pageSize,
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useVideo(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ video: Video }>(
    id ? `/api/videos/${id}` : null,
    fetcher
  );

  return {
    video: data?.video || null,
    isLoading,
    error,
    refresh: mutate,
  };
}

export async function deleteVideo(id: string): Promise<boolean> {
  const response = await fetch(`/api/videos/${id}`, {
    method: "DELETE",
  });
  return response.ok;
}
