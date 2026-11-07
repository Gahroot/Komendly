"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Star, Video, Zap, Download, Play, Sparkles, XCircle, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PricingCards } from "@/components/pricing-cards";
import { type Plan, type BillingCycle } from "@/lib/pricing-plans";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VideoShowcase } from "@/components/video-showcase";
import { SectionHeading } from "@/components/section-heading";

const videoIds = ["1150452550", "1150480391", "1150452582", "1150480352", "1150452614"];

const steps = [
  {
    videoId: "1150131353",
    title: "Grab Your Review",
    description: "Copy any 5-star review from Google. The ones your customers already wrote. No new work required.",
  },
  {
    videoId: "1150131333",
    title: "Pick a Face",
    description: "Choose an AI avatar. They look real. They sound real. Because the words they're saying are real.",
  },
  {
    videoId: "1150131316",
    title: "Download. Post. Done.",
    description: "Get your video. Put it on social. Watch people actually stop scrolling. That's it.",
  },
];

const fadeInUp = {
  initial: { opacity: 1, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  initial: {},
  whileInView: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function Home() {
  const router = useRouter();
  const [videoOpen, setVideoOpen] = useState(false);

  const handleSelectPlan = (plan: Plan, billingCycle: BillingCycle) => {
    // Store selected plan info and redirect to register
    const params = new URLSearchParams({
      plan: plan.key,
      billing: billingCycle,
    });
    router.push(`/register?${params.toString()}`);
  };

  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ opacity: 1, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Badge */}
            <motion.div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary"
              initial={{ opacity: 1, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Sparkles className="h-4 w-4" />
              Your Reviews Deserve to Be Seen
            </motion.div>

            {/* Headline */}
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Turn Reviews Into{" "}
              <span className="text-primary">
                Video Testimonials
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Turn your existing 5-star reviews into video testimonials. No filming. No begging customers. No awkward asks.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 gap-1.5 rounded-full bg-brand px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/register">
                  <Play className="size-5" />
                  Create Your First Video
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 gap-1.5 rounded-full border-input bg-transparent px-8 text-base text-foreground/80 hover:bg-secondary hover:text-foreground"
                onClick={() => setVideoOpen(true)}
              >
                <Play className="size-5" />
                See how it works
              </Button>
            </div>

            {/* Social proof */}
            <motion.p
              className="mt-6 text-sm text-muted-foreground"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Join 1,000+ happy creators
            </motion.p>

            {/* Video Testimonials Showcase */}
            <VideoShowcase videoIds={videoIds} />
          </motion.div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeInUp}>
            <SectionHeading
              eyebrow="The problem"
              title={<>The Problem With <span className="text-primary">Video Testimonials</span></>}
              description={<>You already know video works. Here&apos;s why you don&apos;t have any.</>}
            />
          </motion.div>

          <motion.div
            className="mt-16 grid gap-6 md:grid-cols-3"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {/* Problem 1 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/20">
                    <XCircle className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">Customers Say No</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    They love you. Left a 5-star review. But ask them to go on camera? &quot;Sorry, I&apos;m too busy.&quot; Every. Single. Time.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Problem 2 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/20">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">Actors Cost a Fortune</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    Big brands pay thousands for actors to fake testimonials. You shouldn&apos;t have to. Your real reviews are better anyway.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Problem 3 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/20">
                    <Clock className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">Reviews Just Sit There</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    You have dozens of amazing reviews. They&apos;re buried on Google. Nobody sees them. What a waste.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeInUp}>
            <SectionHeading
              eyebrow="The fix"
              title={<>The Fix Is <span className="text-primary">Stupid Simple</span></>}
              description={<>Use your real reviews. Let AI do the video part.</>}
            />
          </motion.div>

          <motion.div
            className="mt-16 grid gap-6 md:grid-cols-3"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {/* Solution 1 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Star className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">Your Real Words</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    Paste your actual Google reviews. These are real people saying real things about your business. That&apos;s powerful.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Solution 2 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Zap className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">AI Brings It To Life</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    Pick a realistic avatar. It reads your review naturally. Looks like a real person. Because the words ARE from a real person.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Solution 3 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader>
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--glass-rim)] bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Download className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg font-semibold text-foreground">Post Everywhere</CardTitle>
                  <CardDescription className="leading-relaxed text-muted-foreground">
                    Download and post to TikTok, Instagram, YouTube, your website. Wherever your customers are scrolling.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/10 to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeInUp}>
            <SectionHeading
              eyebrow="How it works"
              title={<>60 Seconds. That&apos;s It.</>}
              description={<>Three clicks. One video. Zero hassle.</>}
            />
          </motion.div>

          <motion.div
            className="mt-16 grid gap-8 md:grid-cols-3"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {steps.map((step, index) => (
              <motion.div key={step.videoId} variants={fadeInUp} className="relative text-center">
                <div className="glass relative mx-auto mb-6 overflow-hidden rounded-2xl border border-border p-1.5">
                  <span className="glass-float absolute left-4 top-4 z-10 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-primary">
                    0{index + 1}
                  </span>
                  <div className="aspect-video overflow-hidden rounded-xl">
                    <iframe
                      src={`https://player.vimeo.com/video/${step.videoId}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&loop=1&background=1&muted=1`}
                      className="w-full h-full pointer-events-none"
                      frameBorder="0"
                      allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                      title={step.title}
                    />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-muted-foreground">{step.description}</p>
                {index === 0 && (
                  <div className="absolute right-0 top-[90px] hidden h-0.5 w-1/6 bg-gradient-to-r from-primary/90 to-transparent md:block" />
                )}
                {index === 1 && (
                  <>
                    <div className="absolute left-0 top-[90px] hidden h-0.5 w-1/6 bg-gradient-to-l from-primary/90 to-transparent md:block" />
                    <div className="absolute right-0 top-[90px] hidden h-0.5 w-1/6 bg-gradient-to-r from-primary/90 to-transparent md:block" />
                  </>
                )}
                {index === 2 && (
                  <div className="absolute left-0 top-[90px] hidden h-0.5 w-1/6 bg-gradient-to-l from-primary/90 to-transparent md:block" />
                )}
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="mt-12 text-center"
            {...fadeInUp}
          >
            <Button
              asChild
              size="lg"
              className="h-12 gap-1.5 rounded-full bg-brand px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/register">
                <Play className="size-5" />
                Make Your First Video
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div className="mb-12" {...fadeInUp}>
            <SectionHeading
              eyebrow="Pricing"
              title={<>No Contracts. No Hidden Fees.</>}
              description={<>Choose a plan that fits your needs.</>}
            />
          </motion.div>

          <PricingCards onSelectPlan={handleSelectPlan} />
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 sm:py-32">
        
        <motion.div
          className="glass relative isolate mx-4 max-w-4xl overflow-hidden rounded-3xl border border-border px-6 py-14 text-center sm:mx-auto sm:px-12 sm:py-20"
          {...fadeInUp}
        >
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Your Reviews Are Already Written.
          </h2>
          <p className="relative mt-4 text-2xl font-semibold text-primary">
            Now make them work for you.
          </p>
          <p className="mt-6 text-lg text-muted-foreground">
            Every day without video testimonials is a day your competitors look more trustworthy than you. Fix that now.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="h-14 gap-2 rounded-full bg-brand px-10 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/register">
                <Video className="size-6" />
                Create Your First Video
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* How It Works Video Modal */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[90vw] lg:max-w-6xl border-border bg-background p-0 overflow-hidden">
          <DialogTitle className="sr-only">How Komendly Works</DialogTitle>
          <div className="aspect-video w-full">
            {videoOpen && (
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/CY-D_0Yvq08?autoplay=1&controls=0&loop=1&playlist=CY-D_0Yvq08&modestbranding=1&showinfo=0&rel=0&playsinline=1&disablekb=1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}
