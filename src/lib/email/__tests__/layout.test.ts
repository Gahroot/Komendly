import { describe, expect, it } from "vitest";
import { renderEmailLayout } from "../layout";

describe("renderEmailLayout", () => {
  const html = renderEmailLayout({
    appUrl: "https://komendly.com/",
    preheader: "Confirm",
    heading: "Hi <script>alert(1)</script>",
    paragraphs: ["Tom & \"Jerry\""],
    button: { label: "Confirm my email", href: "https://komendly.com/verify-email?token=abc" },
  });
  it("escapes user content", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("Tom &#38; &#34;Jerry&#34;");
  });
  it("includes link and image URL", () => {
    expect(html).toContain('href="https://komendly.com/verify-email?token=abc"');
    expect(html).toContain('src="https://komendly.com/brand/ozzy-classic-happy@3.png"');
  });
});
