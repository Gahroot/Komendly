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
import { ThemeToggle } from "@/components/theme-toggle";

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
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm text-foreground/90 transition-colors hover:text-primary"
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60 transition-transform duration-200 group-hover/navitem:rotate-180" />
      </button>
      <div className="invisible absolute bottom-0 left-0 w-max translate-y-full pt-2 opacity-0 transition-all duration-200 group-hover/navitem:visible group-hover/navitem:opacity-100">
        <ul className="flex min-w-[300px] flex-col gap-0.5 rounded-xl border border-border bg-card p-2 shadow-[0px_14px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          {items.map((item) => (
            <li key={item.title} className="group/subitem">
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input bg-muted">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium leading-tight text-foreground">{item.title}</span>
                  <span className="mt-0.5 text-sm font-light leading-tight text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 -rotate-90 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/subitem:opacity-100" />
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
    <header className="absolute left-0 right-0 top-0 z-40 h-16 px-3 pt-3 sm:px-6">
      <div className="glass-float mx-auto flex h-full max-w-6xl items-center justify-between rounded-2xl border border-border px-4 sm:px-5">
        {/* Logo */}
        <Link href="/testimonials" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <span className="sr-only">Komendly</span>
          <Image
            alt="Komendly logo"
            width={24}
            height={24}
            src="/logo.svg"
            className="h-6 w-6"
          />
          <span className="text-lg font-bold tracking-wide text-foreground">KOMENDLY</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:block">
          <ul className="flex items-center">
            <li>
              <Link
                href="/pricing"
                className="inline-flex whitespace-nowrap px-3 py-2 text-sm text-foreground/90 transition-colors hover:text-primary"
              >
                Pricing
              </Link>
            </li>
            <NavDropdown label="Resources" items={resources} />
            <NavDropdown label="Community" items={community} />
            <li>
              <Link
                href="/blog"
                className="inline-flex whitespace-nowrap px-3 py-2 text-sm text-foreground/90 transition-colors hover:text-primary"
              >
                Blog
              </Link>
            </li>
          </ul>
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-4 text-xs font-bold uppercase tracking-wide text-foreground hover:bg-accent hover:text-foreground"
          >
            <Link href="/login">Sign In</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 rounded-md bg-brand px-4 text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/register">Sign Up</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <ThemeToggle className="ml-auto mr-1 md:hidden" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="text-foreground hover:bg-accent">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full border-border bg-background sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <Image src="/logo.svg" alt="Komendly" width={24} height={24} className="h-6 w-6" />
                KOMENDLY
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-8 flex flex-col gap-4">
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="text-lg font-medium text-foreground transition-colors hover:text-primary"
              >
                Pricing
              </Link>
              <Link
                href="/blog"
                onClick={() => setOpen(false)}
                className="text-lg font-medium text-foreground transition-colors hover:text-primary"
              >
                Blog
              </Link>

              {/* Resources Section */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resources
                </p>
                <div className="flex flex-col gap-2">
                  {resources.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-foreground/80 transition-colors hover:bg-card hover:text-foreground"
                    >
                      <item.icon className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Community Section */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Community
                </p>
                <div className="flex flex-col gap-2">
                  {community.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-foreground/80 transition-colors hover:bg-card hover:text-foreground"
                    >
                      <item.icon className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
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
                  className="w-full border-input bg-transparent text-foreground hover:bg-card hover:text-foreground"
                >
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  className="w-full bg-brand text-primary-foreground hover:bg-primary/90"
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
