"use client";

import { VideoPlayer } from "@/components/video-player";

export default function TestVideoPage() {
  // New video with speech-based trimming (37s instead of 40s)
  const newVideoUrl = "https://v3b.fal.media/files/b/0a8b4b2e/bVdGJT09EmmXOCZJsewxI_1769009103036.mp4";

  // Original video without trimming (40s)
  const originalVideoUrl = "https://v3b.fal.media/files/b/0a8b4a81/_AzYsph2m8G5AyCtTqKqB_1769007371430.mp4";

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Video Comparison</h1>
        <p className="text-muted-foreground mb-8">
          Compare the new speech-based trimming vs the original. Notice how the new version cuts off the creepy staring at the end.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* New Video */}
          <div>
            <h2 className="text-xl font-semibold mb-2 text-green-400">New (37.1s)</h2>
            <p className="text-sm text-muted-foreground mb-4">With speech-based trimming - cuts when person stops talking</p>
            <div className="rounded-xl overflow-hidden border border-border">
              <VideoPlayer src={newVideoUrl} aspectRatio="9:16" />
            </div>
          </div>

          {/* Original Video */}
          <div>
            <h2 className="text-xl font-semibold mb-2 text-red-400">Original (40.0s)</h2>
            <p className="text-sm text-muted-foreground mb-4">Without trimming - awkward staring at end of clips</p>
            <div className="rounded-xl overflow-hidden border border-border">
              <VideoPlayer src={originalVideoUrl} aspectRatio="9:16" />
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-card rounded-lg">
          <h3 className="font-semibold mb-2">Changes Made:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Uses FFmpeg silencedetect to find where speech actually ends</li>
            <li>• -20dB threshold catches background noise as &quot;silence&quot;</li>
            <li>• Trims each clip to end 0.15s after last speech</li>
            <li>• Removed ~3 seconds of dead air total</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
