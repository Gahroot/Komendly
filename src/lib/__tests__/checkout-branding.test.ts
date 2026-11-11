import { describe, expect, it } from "vitest";
import { komendlyCheckoutText } from "../checkout-branding";

describe("checkout branding", () => {
  it("brands every Stripe checkout as Komendly with the Ozzy mark", () => {
    const b = komendlyCheckoutText("plan");
    expect(b.branding_settings.display_name).toBe("Komendly");
    expect(b.branding_settings.logo.url).toMatch(/\/brand\/komendly-mark-512\.png$/);
    expect(b.custom_text.submit.message).toMatch(/^Komendly: Ozzy/);
    expect(b.custom_text.submit.message.length).toBeLessThanOrEqual(1200);
    expect(komendlyCheckoutText("pack").custom_text.submit.message).toMatch(/never expire/);
  });
});
