"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
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
        <div className="glass-subtle flex flex-col items-center rounded-2xl px-8 py-6 text-center">
          {accessError ? (
            <>
              <OzzyLazy size={72} speech={false} pose={{ form: "classic", expression: "confused", motion: "idle" }} />
              <p className="mt-3 font-medium text-destructive">{accessError}</p>
              <p className="mt-1 text-sm text-muted-foreground">Ozzy HQ is for admins only. Taking you back to your dashboard…</p>
            </>
          ) : (
            <>
              <OzzyLazy size={72} speech={false} pose={{ form: "classic", expression: "happy", motion: "idle" }} />
              <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Ozzy HQ</p>
              <p className="mt-1 text-sm text-muted-foreground">Checking you&apos;re an admin…</p>
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
            <OzzyLazy size={28} speech={false} pose={{ form: "classic", expression: "happy", motion: "idle" }} />
            <span className="text-base font-semibold tracking-tight text-foreground">Ozzy HQ</span>
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
