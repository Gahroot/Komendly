// Kly review_gifts <-> engine contract: a $0 animated review-quote video rendered locally by the engine (sharp + ffmpeg,
// no paid provider). Pure TS + zod only (imported by web, engine and kly).
import { z } from "zod";

export const REVIEW_QUOTE_JOB_TYPE = "review_quote_video";

export const ReviewQuotePayloadSchema = z.object({
  giftId: z.string().min(1),
  businessName: z.string().min(1).max(120),
  domain: z.string().min(1).max(253),
  reviewerName: z.string().min(1).max(60),
  /** Verbatim review words (never rewritten). */
  quote: z.string().min(1).max(600),
  rating: z.number().int().min(1).max(5).nullable(),
  /** Brand colour from the business's site (theme-color), hex. */
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
});
export type ReviewQuotePayload = z.infer<typeof ReviewQuotePayloadSchema>;

/** S3 key of a rendered review-quote video. */
export const reviewQuoteKey = (giftId: string) => `kly/review-gifts/${giftId}.mp4`;
