import type { Metadata } from "next";
import { FIRST_VIDEO_OFFER } from "@/lib/first-video-offer";
import { PLAN_CONFIG } from "@/lib/stripe-config";
const KIT = FIRST_VIDEO_OFFER.priceCents / 100;
const KIT_LINE = `Start with the ${FIRST_VIDEO_OFFER.name}: ${FIRST_VIDEO_OFFER.minutes} videos for $${KIT}, one time.`;
const FROM = PLAN_CONFIG.starter.monthlyPrice;
import { TestiStudio } from "@/components/testimonials/testi-studio";
import { TESTIMONIAL_FAQ } from "@/components/testimonials/faq-data";

const siteConfig = {
  name: "Komendly",
  tagline: "Your Customers Won't Go On Camera. We Fixed That.",
  description: `Turn your 5-star Google reviews into professional video testimonials with AI avatars. No filming, no begging customers, no actors needed. ${KIT_LINE}`,
  url: "https://www.komendly.com/testimonials",
  ogImage: "/og-image.png",
  twitterHandle: "@komendly",
};

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} - ${siteConfig.tagline}` },
  description: siteConfig.description,
  keywords: [
    "AI video testimonial generator",
    "turn reviews into video",
    "convert Google reviews to video",
    "AI testimonial video maker",
    "review to video converter",
    "video testimonial software",
    "AI avatar testimonials",
    "customer review videos",
    "automated video testimonials",
    "text to video testimonial",
    "social proof videos",
    "UGC video generator",
    "video testimonials for small business",
    "best AI testimonial tools",
    "video testimonial conversion rates",
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} - ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} - AI Video Testimonial Generator`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
    site: siteConfig.twitterHandle,
  },
  alternates: {
    canonical: siteConfig.url,
  },
  category: "Software",
  classification: "Business Software",
};

// JSON-LD Structured Data
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteConfig.url}/#webapp`,
      name: siteConfig.name,
      description: siteConfig.description,
      url: siteConfig.url,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: String(KIT),
        highPrice: String(PLAN_CONFIG.enterprise.monthlyPrice),
        offerCount: "4",
        offers: [
          { "@type": "Offer", name: FIRST_VIDEO_OFFER.name, price: String(KIT), priceCurrency: "USD", description: `One-time: ${FIRST_VIDEO_OFFER.minutes} videos, up to 60s each` },
          ...Object.values(PLAN_CONFIG).map((p) => ({ "@type": "Offer", name: p.name, price: String(p.monthlyPrice), priceCurrency: "USD", description: `${p.minutesPerMonth} videos per month` })),
        ],
      },
      featureList: [
        "Turn Google reviews into video testimonials",
        "AI-powered realistic avatars",
        "No filming required",
        "Download videos for social media",
        "Multiple avatar styles",
        "Professional voiceovers",
      ],
      screenshot: `${siteConfig.url}/og-image.png`,
    },
    {
      "@type": "Organization",
      "@id": `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        "@type": "ImageObject",
        url: `${siteConfig.url}/logo.svg`,
      },
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      description: siteConfig.description,
      publisher: {
        "@id": `${siteConfig.url}/#organization`,
      }
    },
    {
      "@type": "FAQPage",
      "@id": `${siteConfig.url}/#faq`,
      mainEntity: TESTIMONIAL_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteConfig.url}/#software`,
      name: siteConfig.name,
      applicationCategory: "MultimediaApplication",
      applicationSubCategory: "Video Production Software",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: String(KIT),
        priceCurrency: "USD",
        description: KIT_LINE,
      }
    },
  ],
};

export default function TestimonialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TestiStudio>{children}</TestiStudio>
    </>
  );
}
