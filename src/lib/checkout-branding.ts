// Shared Stripe Checkout copy so every checkout reads as Komendly + Ozzy (not the Stripe account's legal name).
// custom_text renders above the pay button; max 1200 chars each.
import { ADS_GUARANTEE, AUTOPILOT_DISPLAY_NAME, AUTOPILOT_FOUNDING_LINE, AUTOPILOT_PLAN_NAME, AUTOPILOT_PRICE_LOCK, PLAN_USAGE_NOTE, FOUNDING_PRICE_LOCK, FOUNDING_TERMS } from "@/lib/ads/billing-config";

/** Per-session Checkout branding: shows Komendly + the Ozzy mark instead of the Stripe account's legal name/colours. */
function brandingSettings() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const logo = { type: "url" as const, url: `${base}/brand/komendly-mark-512.png` };
  return { display_name: "Komendly", logo, icon: logo, button_color: "#ffcf4a", background_color: "#ffffff", border_style: "rounded" as const };
}

export function komendlyCheckoutText(kind: "plan" | "pack" | "testimonials" | "founding" | "autopilot" = "plan") {
  const line =
    kind === "autopilot"
      ? `${AUTOPILOT_DISPLAY_NAME} (${AUTOPILOT_PLAN_NAME}). ${AUTOPILOT_PRICE_LOCK} ${AUTOPILOT_FOUNDING_LINE} Ad spend is paid by you directly to Meta and never goes over your monthly limit. ${ADS_GUARANTEE}`
      : kind === "founding"
      ? `Ozzy Ad Department, founding member. ${PLAN_USAGE_NOTE} ${FOUNDING_TERMS} ${FOUNDING_PRICE_LOCK} ${ADS_GUARANTEE}`
      : kind === "pack"
      ? "Komendly: Ozzy makes your ads and videos. Credits land in your account right after payment and never expire."
      : kind === "testimonials"
        ? "Komendly: Ozzy turns your real reviews into video testimonials."
        : `Komendly: Ozzy makes your ads and videos. ${ADS_GUARANTEE} Cancel anytime in Billing.`;
  return { custom_text: { submit: { message: line.slice(0, 1200) } }, branding_settings: brandingSettings() };
}
