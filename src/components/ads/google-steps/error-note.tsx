"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type NextAction = { label: string; onClick?: () => void; href?: string };

/** One plain sentence and one thing to do next. */
export function ErrorNote({ message, action }: { message: string; action?: NextAction }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">{message}</p>
      {action && (action.href ? (
        <Button asChild size="sm" variant="outline">
          {action.href.startsWith("/") ? <Link href={action.href}>{action.label}</Link> : <a href={action.href} target="_blank" rel="noreferrer">{action.label}</a>}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={action.onClick}>{action.label}</Button>
      ))}
    </div>
  );
}
