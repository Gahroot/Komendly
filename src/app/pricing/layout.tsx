import type { Metadata } from "next";
import { TestiStudio } from "@/components/testimonials/testi-studio";

const DESC = "One Ozzy plan for Ad Packs, Ozzy Studio and AI testimonial videos. Start free, plans from $49/month, 30-day money-back guarantee.";

export const metadata: Metadata = {
  title: "Pricing: Ad Packs, Ozzy Studio and AI testimonials",
  description: DESC,
  openGraph: { title: "Ozzy pricing | Komendly", description: DESC, type: "website", url: "https://www.komendly.com/pricing" },
  alternates: { canonical: "/pricing" },
  twitter: { title: "Ozzy pricing | Komendly", description: DESC, card: "summary_large_image" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <TestiStudio>{children}</TestiStudio>;
}
