import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const siteConfig = {
  name: "Komendly",
  tagline: "Your Customers Won't Go On Camera. We Fixed That.",
  description: "Turn your 5-star Google reviews into professional video testimonials with AI avatars. No filming, no begging customers, no actors needed. Create engaging video testimonials in 60 seconds.",
  url: "https://komendly.com",
  ogImage: "/og-image.png",
  twitterHandle: "@komendly",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} - ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
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
        lowPrice: "0",
        highPrice: "99",
        offerCount: "3",
        offers: [
          {
            "@type": "Offer",
            name: "Free Plan",
            price: "0",
            priceCurrency: "USD",
            description: "1 free video per month",
          },
          {
            "@type": "Offer",
            name: "Pro Plan",
            price: "29",
            priceCurrency: "USD",
            description: "50 video minutes per month",
          },
          {
            "@type": "Offer",
            name: "Business Plan",
            price: "99",
            priceCurrency: "USD",
            description: "200 video minutes per month",
          },
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
      },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteConfig.url}/dashboard/videos?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteConfig.url}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "How do AI video testimonials work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Simply paste your existing Google review text, choose an AI avatar, and our technology generates a professional video testimonial. The AI avatar reads your real customer review naturally, creating authentic-looking video content in under 60 seconds.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need my customers to record videos?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No! That's the whole point of Komendly. Your customers have already left written reviews. We transform those existing reviews into engaging video testimonials using AI avatars - no filming, no asking customers for more, no awkward requests.",
          },
        },
        {
          "@type": "Question",
          name: "Can I use these videos on social media?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Absolutely! Download your video testimonials and post them anywhere - TikTok, Instagram Reels, YouTube Shorts, your website, Facebook ads, LinkedIn, and more. Videos are optimized for vertical social media formats.",
          },
        },
        {
          "@type": "Question",
          name: "How long does it take to create a video testimonial?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "About 60 seconds. Paste your review, pick an avatar, and click generate. That's it. No editing, no production team, no waiting days for a video editor.",
          },
        },
      ],
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
        price: "0",
        priceCurrency: "USD",
        description: "Free plan available",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-THCR5EQWY2"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-THCR5EQWY2');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
