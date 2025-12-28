"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PreviewContent } from "./preview-content";

function PreviewLoading() {
  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <PreviewContent />
    </Suspense>
  );
}
