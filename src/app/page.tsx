"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Star, Video, Zap, Download, Play, Sparkles, XCircle, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PricingCards } from "@/components/pricing-cards";
import { type Plan, type BillingCycle } from "@/lib/pricing-plans";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VideoShowcase } from "@/components/video-showcase";

const videoIds = ["1149880629", "1149880641", "1149880649", "1149881437"];

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
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
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-black to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Badge */}
            <motion.div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-300"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Sparkles className="h-4 w-4" />
              Your Reviews Deserve to Be Seen
            </motion.div>

            {/* Headline */}
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Turn Reviews Into{" "}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Video Testimonials
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
              Turn your existing 5-star reviews into video testimonials. No filming. No begging customers. No awkward asks.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 text-base font-semibold text-white hover:from-purple-500 hover:to-pink-500"
              >
                <Link href="/register">
                  <Play className="size-5" />
                  Create Your First Video
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 gap-1.5 rounded-full border-zinc-700 bg-transparent px-8 text-base text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={() => setVideoOpen(true)}
              >
                <Play className="size-5" />
                See how it works
              </Button>
            </div>

            {/* Social proof */}
            <motion.p
              className="mt-6 text-sm text-zinc-500"
              initial={{ opacity: 0 }}
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
          <motion.div
            className="text-center"
            {...fadeInUp}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              The Problem With{" "}
              <span className="text-purple-400">Video Testimonials</span>
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              You already know video works. Here&apos;s why you don&apos;t have any.
            </p>
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
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-colors group-hover:bg-red-500/20">
                    <XCircle className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">Customers Say No</CardTitle>
                  <CardDescription className="text-zinc-400">
                    They love you. Left a 5-star review. But ask them to go on camera? &quot;Sorry, I&apos;m too busy.&quot; Every. Single. Time.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Problem 2 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-colors group-hover:bg-red-500/20">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">Actors Cost a Fortune</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Big brands pay thousands for actors to fake testimonials. You shouldn&apos;t have to. Your real reviews are better anyway.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Problem 3 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-colors group-hover:bg-red-500/20">
                    <Clock className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">Reviews Just Sit There</CardTitle>
                  <CardDescription className="text-zinc-400">
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
          <motion.div
            className="text-center"
            {...fadeInUp}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              The Fix Is{" "}
              <span className="text-purple-400">Stupid Simple</span>
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Use your real reviews. Let AI do the video part.
            </p>
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
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 transition-colors group-hover:bg-purple-500/20">
                    <Star className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">Your Real Words</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Paste your actual Google reviews. These are real people saying real things about your business. That&apos;s powerful.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Solution 2 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 transition-colors group-hover:bg-purple-500/20">
                    <Zap className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">AI Brings It To Life</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Pick a realistic avatar. It reads your review naturally. Looks like a real person. Because the words ARE from a real person.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Solution 3 */}
            <motion.div variants={fadeInUp}>
              <Card className="group h-full border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 transition-colors group-hover:bg-purple-500/20">
                    <Download className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl text-white">Post Everywhere</CardTitle>
                  <CardDescription className="text-zinc-400">
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
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            className="text-center"
            {...fadeInUp}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              60 Seconds. That&apos;s It.
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Three clicks. One video. Zero hassle.
            </p>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-8 md:grid-cols-3"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {/* Step 1 */}
            <motion.div variants={fadeInUp} className="relative text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-semibold">Grab Your Review</h3>
              <p className="mt-3 text-zinc-400">
                Copy any 5-star review from Google. The ones your customers already wrote. No new work required.
              </p>
              {/* Connector line (hidden on mobile) */}
              <div className="absolute right-0 top-8 hidden h-0.5 w-1/3 bg-gradient-to-r from-purple-600 to-transparent md:block" />
            </motion.div>

            {/* Step 2 */}
            <motion.div variants={fadeInUp} className="relative text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold">Pick a Face</h3>
              <p className="mt-3 text-zinc-400">
                Choose an AI avatar. They look real. They sound real. Because the words they&apos;re saying are real.
              </p>
              {/* Connector lines (hidden on mobile) */}
              <div className="absolute left-0 top-8 hidden h-0.5 w-1/3 bg-gradient-to-l from-purple-600 to-transparent md:block" />
              <div className="absolute right-0 top-8 hidden h-0.5 w-1/3 bg-gradient-to-r from-purple-600 to-transparent md:block" />
            </motion.div>

            {/* Step 3 */}
            <motion.div variants={fadeInUp} className="relative text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold">Download. Post. Done.</h3>
              <p className="mt-3 text-zinc-400">
                Get your video. Put it on social. Watch people actually stop scrolling. That&apos;s it.
              </p>
              {/* Connector line (hidden on mobile) */}
              <div className="absolute left-0 top-8 hidden h-0.5 w-1/3 bg-gradient-to-l from-purple-600 to-transparent md:block" />
            </motion.div>
          </motion.div>

          <motion.div
            className="mt-12 text-center"
            {...fadeInUp}
          >
            <Button
              asChild
              size="lg"
              className="h-12 gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 text-base font-semibold text-white hover:from-purple-500 hover:to-pink-500"
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
          <motion.div
            className="text-center mb-12"
            {...fadeInUp}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              No Contracts. No Hidden Fees.
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Choose a plan that fits your needs.
            </p>
          </motion.div>

          <PricingCards onSelectPlan={handleSelectPlan} />
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-t from-purple-900/20 to-transparent" />

        <motion.div
          className="relative mx-auto max-w-4xl px-4 text-center sm:px-6"
          {...fadeInUp}
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Your Reviews Are Already Written.
          </h2>
          <p className="mt-4 text-2xl font-semibold text-purple-400">
            Now make them work for you.
          </p>
          <p className="mt-6 text-lg text-zinc-400">
            Every day without video testimonials is a day your competitors look more trustworthy than you. Fix that now.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="h-14 gap-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-10 text-lg font-semibold text-white hover:from-purple-500 hover:to-pink-500"
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
        <DialogContent className="max-w-4xl border-zinc-800 bg-black p-0 overflow-hidden">
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
