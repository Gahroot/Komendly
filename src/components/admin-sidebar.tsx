"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Video,
  CreditCard,
  Settings,
  LogOut,
  User,
  ArrowLeft,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";

const navItems = [
  {
    label: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    label: "Videos",
    href: "/admin/videos",
    icon: Video,
  },
  {
    label: "Revenue",
    href: "/admin/revenue",
    icon: CreditCard,
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
}

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useUser();

  const displayName = user?.name || user?.email?.split("@")[0] || "Admin";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/admin" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Komendly"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="text-xl font-bold tracking-tight">ADMIN</span>
        </Link>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Back to Dashboard Link */}
      <div className="px-3 py-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <motion.div
              key={item.href}
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="adminActiveIndicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-white"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <Separator className="bg-zinc-800" />

      {/* User Section */}
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg bg-zinc-900 p-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src="" alt={displayName} />
            <AvatarFallback className="bg-violet-600 text-white">
              {initials || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-zinc-100">
              {displayName}
            </p>
            <p className="truncate text-xs text-zinc-500">{displayEmail}</p>
          </div>
        </div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-3"
        >
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-zinc-400 hover:bg-zinc-900 hover:text-red-400"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
