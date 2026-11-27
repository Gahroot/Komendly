"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <MaintenanceBanner />
        {children}
        <Toaster position="bottom-right" />
      </MotionConfig>
    </ThemeProvider>
  );
}
