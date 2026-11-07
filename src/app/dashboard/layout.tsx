"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying subscription...</p>
          {subscriptionError && (
            <p className="text-destructive mt-2 text-sm">{subscriptionError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between sticky top-0 z-30 border-b border-border glass-float px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="text-base font-semibold tracking-wide text-foreground">
              KOMENDLY
            </span>
          </div>

          <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-sidebar-border p-0"
            >
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
