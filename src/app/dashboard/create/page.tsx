"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReviewInput, ReviewData } from "@/components/review-input";

export default function CreateVideoPage() {
  const router = useRouter();
  const [review, setReview] = useState<ReviewData | null>(null);

  const handleReviewSubmit = (reviewData: ReviewData) => {
    setReview(reviewData);
  };

  const handleContinueToStyle = () => {
    if (!review) return;

    // Pass review data via URL params
    const params = new URLSearchParams({
      review: review.reviewText,
      author: review.reviewerName,
      rating: review.rating.toString(),
      business: review.businessName,
    });

    router.push(`/dashboard/create/style?${params.toString()}`);
  };

  const handleReset = () => {
    setReview(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl py-8 px-4 mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-primary">
              Step 1 of 3
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Create Video Testimonial
          </h1>
          <p className="text-muted-foreground mt-2">
            Paste a review or enter one manually to transform it into a
            stunning video testimonial.
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-8"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              1
            </div>
            <span className="text-sm font-medium">Review</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
              2
            </div>
            <span className="text-sm text-muted-foreground">Style</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
              3
            </div>
            <span className="text-sm text-muted-foreground">Generate</span>
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle>Add Your Review</CardTitle>
              <CardDescription>
                Paste your customer review and we&apos;ll turn it into a
                professional video testimonial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewInput onReviewSubmit={handleReviewSubmit} />

              {/* Review Preview */}
              {review && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-6 p-4 rounded-lg bg-muted/30 border border-border"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {review.businessName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Review by {review.reviewerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-lg ${
                            i < review.rating
                              ? "text-yellow-400"
                              : "text-muted-foreground/30"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    &ldquo;{review.reviewText}&rdquo;
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="mt-3 text-muted-foreground hover:text-foreground"
                  >
                    Clear and start over
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex justify-end"
        >
          <Button
            size="lg"
            onClick={handleContinueToStyle}
            disabled={!review}
            className="gap-2"
          >
            Continue to Style
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
