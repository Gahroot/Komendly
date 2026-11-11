import type { Metadata } from "next";
import { FIRST_VIDEO_OFFER } from "@/lib/first-video-offer";
import { PLAN_CONFIG } from "@/lib/stripe-config";
const KIT = FIRST_VIDEO_OFFER.priceCents / 100;
const KIT_LINE = `Start with the ${FIRST_VIDEO_OFFER.name}: ${FIRST_VIDEO_OFFER.minutes} videos for $${KIT}, one time.`;
const FROM = PLAN_CONFIG.starter.monthlyPrice;
import { TestiStudio } from "@/components/testimonials/testi-studio";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: true },
  description: `Create your Komendly account and turn a customer review into an AI video testimonial. ${KIT_LINE}`,
  openGraph: {
    title: "Create your account | Komendly",
    description: "Turn a customer review into an AI video testimonial",
    type: "website",
  },
  twitter: {
    title: "Create your account | Komendly",
    description: "Turn a customer review into an AI video testimonial",
    card: "summary_large_image",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TestiStudio>{children}</TestiStudio>;
}
