import type { Metadata } from "next";
import { TestiStudio } from "@/components/testimonials/testi-studio";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Komendly: Ozzy makes your ads, videos and testimonials.",
  robots: {
    index: false,
  },
  openGraph: {
    title: "Sign In | Komendly",
    description: "Sign in to your Komendly account",
    type: "website",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TestiStudio>{children}</TestiStudio>;
}
