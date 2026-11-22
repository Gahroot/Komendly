import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How your details are handled when you answer a business's ad",
  description: "Komendly runs Facebook and Instagram ads for local businesses. Here is what happens to the details you send through one of those ads.",
  alternates: { canonical: "/lead-privacy" },
};

/** Lead-form privacy fallback (prd.md R2/R6): linked from Meta lead forms when the business has no policy of its own. */
export default function LeadPrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-base leading-relaxed sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your details, when you answer a business&apos;s ad</h1>
      <p>
        Komendly runs Facebook and Instagram ads for local businesses. If you filled in a form in one of those ads, this page
        explains what happens to what you sent.
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Who gets your details</h2>
        <p>
          The business whose ad you answered. We email your name, contact details and answers to that business so they can get
          back to you. We don&apos;t sell your details, don&apos;t use them for our own marketing, and never contact you ourselves.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">How long we keep them</h2>
        <p>
          We keep a copy for 180 days so the business can find your request, then delete it automatically. The business keeps
          the email we sent them under its own policy.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Deleting your details</h2>
        <p>
          Write to <a className="text-primary underline underline-offset-4" href="mailto:nolan@komendly.com">nolan@komendly.com</a> and tell us
          the name of the business and the email or phone number you used. We delete our copy and confirm, usually within a few
          working days. To remove the copy the business received, contact the business too.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Who we are</h2>
        <p>
          Komendly, the company behind <Link className="text-primary underline underline-offset-4" href="/">komendly.com</Link>. Questions about
          this notice: <a className="text-primary underline underline-offset-4" href="mailto:nolan@komendly.com">nolan@komendly.com</a>.
        </p>
      </section>
      <p className="text-sm text-muted-foreground">Last updated November 22, 2026.</p>
    </main>
  );
}
