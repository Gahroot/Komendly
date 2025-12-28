import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: "free" | "pending" | "starter" | "pro" | "enterprise";
  subscriptionStatus: string;
  minutesUsed: number;
  minutesLimit: number;
  bonusMinutes: number;
  createdAt: string;
}

interface UserResponse {
  user: User;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("Not authenticated");
    throw error;
  }
  return res.json();
};

export function useUser() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<UserResponse>(
    "/api/auth/me",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await mutate(undefined, { revalidate: false });
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, [mutate, router]);

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user && !error,
    error,
    refresh: mutate,
    logout,
  };
}
