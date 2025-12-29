"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Sparkles, Star, Mic, Zap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FalActorSelector } from "@/components/fal-actor-selector";
import { DURATIONS, type DurationId } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TTSVoice } from "@/lib/fal-lipsync/types";

const TTS_VOICES: { id: TTSVoice; name: string; description: string }[] = [
  { id: "nova", name: "Nova", description: "Warm, engaging female voice" },
  { id: "alloy", name: "Alloy", description: "Neutral, balanced voice" },
  { id: "echo", name: "Echo", description: "Smooth male voice" },
  { id: "fable", name: "Fable", description: "Expressive, storytelling voice" },
  { id: "onyx", name: "Onyx", description: "Deep, authoritative male voice" },
  { id: "shimmer", name: "Shimmer", description: "Bright, energetic female voice" },
];

function StylePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get review data from URL params
  const reviewText = searchParams.get("review") || "";
  const reviewAuthor = searchParams.get("author") || "Anonymous";
  const reviewRating = parseInt(searchParams.get("rating") || "5", 10);
  const businessName = searchParams.get("business") || "My Business";

  // State for selections
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<DurationId>("30");
  const [selectedVoice, setSelectedVoice] = useState<TTSVoice>("nova");
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate = selectedActor !== null;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);

    // Build query params for the generation page
    const params = new URLSearchParams({
      review: reviewText,
      author: reviewAuthor,
      rating: reviewRating.toString(),
      business: businessName,
      actor: selectedActor,
      duration: selectedDuration,
      voice: selectedVoice,
    });

    // Navigate to generation page
    router.push(`/dashboard/create-fal/generate?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard/create-fal">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Choose Your Actor</h1>
              <Badge variant="secondary" className="gap-1">
                <Zap className="w-3 h-3" />
                Beta
              </Badge>
            </div>
            <p className="text-muted-foreground">Select an AI actor and voice for your testimonial</p>
          </div>
        </div>

        {/* Selected Review Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Selected Review</CardTitle>
                <Badge variant="secondary" className="gap-1">
                  {Array.from({ length: reviewRating }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  ))}
                </Badge>
              </div>
              <CardDescription>by {reviewAuthor} for {businessName}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground italic">&quot;{reviewText}&quot;</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* AI Actor Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-semibold text-foreground">AI Actor</h2>
            {selectedActor && (
              <Badge variant="outline" className="capitalize">
                Selected
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mb-4">
            Select an AI actor to deliver your testimonial. The actor&apos;s mouth will be lip-synced to the generated speech.
          </p>
          <FalActorSelector
            selectedActor={selectedActor}
            onSelect={setSelectedActor}
          />
        </motion.section>

        {/* Voice Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">Voice</h2>
          <p className="text-muted-foreground mb-4">
            Choose a voice for text-to-speech generation.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TTS_VOICES.map((voice) => {
              const isSelected = selectedVoice === voice.id;

              return (
                <motion.div
                  key={voice.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "gap-2 flex-col h-auto py-3 px-4 w-full",
                      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => setSelectedVoice(voice.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      {voice.name}
                    </div>
                    <span className="text-xs opacity-70">{voice.description}</span>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Duration Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-10"
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">Duration</h2>
          <div className="flex flex-wrap gap-3">
            {DURATIONS.map((duration) => {
              const isSelected = selectedDuration === duration.id;

              return (
                <motion.div
                  key={duration.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "gap-2 flex-col h-auto py-3 px-4",
                      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => setSelectedDuration(duration.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {duration.name}
                    </div>
                    <span className="text-xs opacity-70">{duration.description}</span>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Generate Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex justify-center pt-4"
        >
          <Button
            size="lg"
            className="gap-2 px-8 py-6 text-lg"
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-5 w-5" />
                </motion.div>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate Video
              </>
            )}
          </Button>
        </motion.div>

        {!canGenerate && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-muted-foreground mt-4"
          >
            Please select an AI actor to continue
          </motion.p>
        )}
      </div>
    </div>
  );
}

export default function StylePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <StylePageContent />
    </Suspense>
  );
}
