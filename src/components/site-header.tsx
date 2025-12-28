"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, ChevronRight, FileText, BookOpen, Twitter, Youtube, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const resources = [
  {
    title: "Blog",
    description: "Read our latest insights",
    href: "/blog",
    icon: FileText,
  },
  {
    title: "Docs",
    description: "Explore our tutorials",
    href: "#",
    icon: BookOpen,
  },
];

const community = [
  {
    title: "Twitter",
    description: "Follow our latest news",
    href: "#",
    icon: Twitter,
  },
  {
    title: "YouTube",
    description: "Watch our tutorials",
    href: "#",
    icon: Youtube,
  },
  {
    title: "GitHub",
    description: "Star us on GitHub",
    href: "#",
    icon: Github,
  },
];

interface DropdownItem {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NavDropdown({ label, items }: { label: string; items: DropdownItem[] }) {
  return (
    <li className="group/navitem relative">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm text-white/90 transition-colors hover:text-purple-400"
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60 transition-transform duration-200 group-hover/navitem:rotate-180" />
      </button>
      <div className="invisible absolute bottom-0 left-0 w-max translate-y-full pt-2 opacity-0 transition-all duration-200 group-hover/navitem:visible group-hover/navitem:opacity-100">
        <ul className="flex min-w-[300px] flex-col gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-[0px_14px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          {items.map((item) => (
            <li key={item.title} className="group/subitem">
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-zinc-800/80"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                  <item.icon className="h-4 w-4 text-zinc-400" />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium leading-tight text-white">{item.title}</span>
                  <span className="mt-0.5 text-sm font-light leading-tight text-zinc-500">
                    {item.description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 -rotate-90 text-zinc-600 opacity-0 transition-opacity duration-200 group-hover/subitem:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="absolute left-0 right-0 top-0 z-40 h-16 bg-transparent">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <span className="sr-only">Komendly</span>
          <Image
            alt="Komendly logo"
            width={24}
            height={24}
            src="/logo.svg"
            className="h-6 w-6"
          />
          <span className="text-lg font-bold tracking-wide text-white">KOMENDLY</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:block">
          <ul className="flex items-center">
            <li>
              <Link
                href="/pricing"
                className="inline-flex whitespace-nowrap px-3 py-2 text-sm text-white/90 transition-colors hover:text-purple-400"
              >
                Pricing
              </Link>
            </li>
            <NavDropdown label="Resources" items={resources} />
            <NavDropdown label="Community" items={community} />
            <li>
              <Link
                href="/blog"
                className="inline-flex whitespace-nowrap px-3 py-2 text-sm text-white/90 transition-colors hover:text-purple-400"
              >
                Blog
              </Link>
            </li>
          </ul>
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden items-center gap-3 md:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">Sign In</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 px-4 text-xs font-bold uppercase tracking-wide text-white hover:from-purple-500 hover:to-pink-500"
          >
            <Link href="/register">Sign Up</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full border-zinc-800 bg-zinc-950 sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-white">
                <Image src="/logo.svg" alt="Komendly" width={24} height={24} className="h-6 w-6" />
                KOMENDLY
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-8 flex flex-col gap-4">
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="text-lg font-medium text-white transition-colors hover:text-purple-400"
              >
                Pricing
              </Link>
              <Link
                href="/blog"
                onClick={() => setOpen(false)}
                className="text-lg font-medium text-white transition-colors hover:text-purple-400"
              >
                Blog
              </Link>

              {/* Resources Section */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Resources
                </p>
                <div className="flex flex-col gap-2">
                  {resources.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-white/80 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      <item.icon className="h-5 w-5 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Community Section */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Community
                </p>
                <div className="flex flex-col gap-2">
                  {community.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-white/80 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      <item.icon className="h-5 w-5 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Auth Buttons */}
              <div className="mt-8 flex flex-col gap-3">
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-900 hover:text-white"
                >
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                >
                  <Link href="/register" onClick={() => setOpen(false)}>
                    Sign Up
                  </Link>
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
