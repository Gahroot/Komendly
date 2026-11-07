import { z } from "zod";

export const PRICING_SURVEY_MAX_USD = 100_000;

const price = z.number().finite().min(0).max(PRICING_SURVEY_MAX_USD);

/** Van Westendorp answers in USD/month; must be ascending. Shared by the client form and API. */
export const pricingSurveySchema = z
  .object({ tooCheap: price, cheap: price, expensive: price, tooExpensive: price })
  .refine((v) => v.tooCheap <= v.cheap && v.cheap <= v.expensive && v.expensive <= v.tooExpensive, {
    message: "Each answer should be the same as or higher than the one before it.",
  });

export type PricingSurveyAnswers = z.infer<typeof pricingSurveySchema>;
