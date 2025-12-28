"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Video, Settings, LogOut, User, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Create Video",
    href: "/dashboard/create",
    icon: Plus,
  },
  {
    label: "My Videos",
    href: "/dashboard/videos",
    icon: Video,
  },
  {
    label: "Billing",
    href: "/dashboard/billing",
    icon: CreditCard,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Komendly"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="text-xl font-bold tracking-tight">KOMENDLY</span>
        </Link>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
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
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500"
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
            <AvatarImage src="" alt="User" />
            <AvatarFallback className="bg-zinc-800 text-zinc-400">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-zinc-100">
              John Doe
            </p>
            <p className="truncate text-xs text-zinc-500">john@example.com</p>
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
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
