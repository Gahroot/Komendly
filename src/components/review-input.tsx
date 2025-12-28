"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/star-rating";

export interface ReviewData {
  businessName: string;
  reviewerName: string;
  reviewText: string;
  rating: number;
}

interface ReviewInputProps {
  onReviewSubmit: (review: ReviewData) => void;
  isLoading?: boolean;
}

interface ValidationErrors {
  businessName?: string;
  reviewerName?: string;
  reviewText?: string;
  rating?: string;
}

export function ReviewInput({
  onReviewSubmit,
  isLoading = false,
}: ReviewInputProps) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(0);

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!businessName.trim()) {
      newErrors.businessName = "Business name is required";
    }

    if (!reviewerName.trim()) {
      newErrors.reviewerName = "Reviewer name is required";
    }

    if (!reviewText.trim()) {
      newErrors.reviewText = "Review text is required";
    } else if (reviewText.trim().length < 10) {
      newErrors.reviewText = "Review text must be at least 10 characters";
    }

    if (rating === 0) {
      newErrors.rating = "Please select a rating";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onReviewSubmit({
      businessName: businessName.trim(),
      reviewerName: reviewerName.trim(),
      reviewText: reviewText.trim(),
      rating,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="business-name">Business Name</Label>
        <Input
          id="business-name"
          placeholder="Enter your business name"
          value={businessName}
          onChange={(e) => {
            setBusinessName(e.target.value);
            if (errors.businessName)
              setErrors((prev) => ({ ...prev, businessName: undefined }));
          }}
          disabled={isLoading}
        />
        {errors.businessName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive"
          >
            {errors.businessName}
          </motion.p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewer-name">Reviewer Name</Label>
        <Input
          id="reviewer-name"
          placeholder="Enter the reviewer's name"
          value={reviewerName}
          onChange={(e) => {
            setReviewerName(e.target.value);
            if (errors.reviewerName)
              setErrors((prev) => ({ ...prev, reviewerName: undefined }));
          }}
          disabled={isLoading}
        />
        {errors.reviewerName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive"
          >
            {errors.reviewerName}
          </motion.p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-text">Review Text</Label>
        <Textarea
          id="review-text"
          placeholder="Paste or type the review content..."
          value={reviewText}
          onChange={(e) => {
            setReviewText(e.target.value);
            if (errors.reviewText)
              setErrors((prev) => ({ ...prev, reviewText: undefined }));
          }}
          rows={4}
          disabled={isLoading}
          className="resize-none"
        />
        <div className="flex justify-between">
          {errors.reviewText ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-destructive"
            >
              {errors.reviewText}
            </motion.p>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {reviewText.length} characters
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Rating</Label>
        <StarRating
          value={rating}
          onChange={(newRating) => {
            setRating(newRating);
            if (errors.rating)
              setErrors((prev) => ({ ...prev, rating: undefined }));
          }}
          disabled={isLoading}
          size="lg"
        />
        {errors.rating && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive"
          >
            {errors.rating}
          </motion.p>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isLoading}
        className="w-full mt-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </div>
  );
}
