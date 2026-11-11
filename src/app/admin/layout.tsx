"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Loader2, ShieldAlert } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
          router.push("/login");
          return;
        }

        const data = await response.json();
        const user = data.user;

        if (!user.isAdmin) {
          setAccessError("You don't have admin access.");
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
          return;
        }

        setIsChecking(false);
      } catch (error) {
        console.error("Failed to check admin access:", error);
        router.push("/login");
      }
    };

    checkAdminAccess();
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          {accessError ? (
            <>
              <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive">{accessError}</p>
              <p className="text-muted-foreground text-sm mt-2">Redirecting to dashboard...</p>
            </>
          ) : (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Verifying admin access...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar backdrop-blur-xl lg:block">
        <AdminSidebar />
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between sticky top-0 z-30 border-b border-border glass-float px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Image src="/brand/komendly-mark-128.png" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="text-base font-semibold tracking-wide text-foreground">
              ADMIN
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
              <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
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
