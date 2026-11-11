import { describe, expect, it } from "vitest";
import { isInternalEmail } from "../internal-email";

describe("isInternalEmail", () => {
  it("flags test, e2e and our own accounts", () => {
    for (const e of ["test@tester.com", "test@gmail.com", "TEST@gmail.com", "e2e-adrdy+1@komendly.com", "e2e+hype1@komendly.com", "e2e-live+1@komendly.com",
      "e2e-studio+1@komendly.com", "e2e-bridge+1@komendly.com", "delivered+k1@resend.dev", "sold@nolangrout.com", "ngrout71@gmail.com", "a@example.com"]) {
      expect(isInternalEmail(e), e).toBe(true);
    }
  });
  it("keeps real customers", () => {
    for (const e of ["julesbp89@gmail.com", "merchman13@yahoo.com", "tester@gmail.com", "chrisdn73@outlook.com", "testimonials@acme.co", null, ""]) {
      expect(isInternalEmail(e), String(e)).toBe(false);
    }
  });
  it("INTERNAL_EMAILS adds exact addresses", () => {
    expect(isInternalEmail("friend@gmail.com", { INTERNAL_EMAILS: " Friend@gmail.com ,x@y.z" })).toBe(true);
  });
});
