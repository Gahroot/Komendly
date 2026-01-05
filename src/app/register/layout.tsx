import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up Free | Komendly",
  description: "Create your free Komendly account and start creating AI-powered video testimonials in minutes. No credit card required.",
  openGraph: {
    title: "Sign Up Free | Komendly",
    description: "Create your free Komendly account and start creating AI video testimonials",
    type: "website",
  },
  twitter: {
    title: "Sign Up Free | Komendly",
    description: "Create your free Komendly account",
    card: "summary_large_image",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
