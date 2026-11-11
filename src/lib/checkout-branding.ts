// Shared Stripe Checkout copy so every checkout reads as Komendly + Ozzy (not the Stripe account's legal name).
// custom_text renders above the pay button; max 1200 chars each.
import { ADS_GUARANTEE } from "@/lib/ads/billing-config";

/** Per-session Checkout branding: shows Komendly + the Ozzy mark instead of the Stripe account's legal name/colours. */
function brandingSettings() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const logo = { type: "url" as const, url: `${base}/brand/komendly-mark-512.png` };
  return { display_name: "Komendly", logo, icon: logo, button_color: "#ffcf4a", background_color: "#ffffff", border_style: "rounded" as const };
}

export function komendlyCheckoutText(kind: "plan" | "pack" | "testimonials" = "plan") {
  const line =
    kind === "pack"
      ? "Komendly: Ozzy makes your ads and videos. Credits land in your account right after payment and never expire."
      : kind === "testimonials"
        ? "Komendly: Ozzy turns your real reviews into video testimonials."
        : `Komendly: Ozzy makes your ads and videos. ${ADS_GUARANTEE} Cancel anytime in Billing.`;
  return { custom_text: { submit: { message: line.slice(0, 1200) } }, branding_settings: brandingSettings() };
}
