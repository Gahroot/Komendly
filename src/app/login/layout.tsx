import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Komendly",
  description: "Sign in to your Komendly account to create and manage your AI video testimonials.",
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
  return <>{children}</>;
}
