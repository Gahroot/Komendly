"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  useEffect(() => {
    // Check subscription status on mount
    const checkSubscription = async () => {
      try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
          // Not authenticated
          router.push("/login");
          return;
        }

        const data = await response.json();
        const user = data.user;

        // Check if user has an active subscription
        const validStatuses = ["active", "trialing"];
        const hasActiveSubscription = validStatuses.includes(user.subscriptionStatus);
        const hasPaidPlan = user.plan !== "pending" && user.plan !== "free";

        if (!hasActiveSubscription || !hasPaidPlan) {
          // Redirect to pricing if no active subscription
          setSubscriptionError("Please complete your subscription to access the dashboard.");
          router.push(`/pricing?userId=${user.id}&email=${encodeURIComponent(user.email)}`);
          return;
        }

        setIsChecking(false);
      } catch (error) {
        console.error("Failed to check subscription:", error);
        router.push("/login");
      }
    };

    checkSubscription();
  }, [router]);

  // Show loading while checking subscription
  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-zinc-400">Verifying subscription...</p>
          {subscriptionError && (
            <p className="text-red-400 mt-2 text-sm">{subscriptionError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-zinc-800 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <Video className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-zinc-100">
              Komendly
            </span>
          </div>

          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 border-zinc-800 bg-zinc-950 p-0"
            >
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-zinc-950 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
