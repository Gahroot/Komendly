import type { BrandProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { extractionFromBrand } from "../brand-extraction";

const previous = {
  url: "https://shop.test/", domain: "shop.test", brandName: "Shop", audience: "old audience", mainOffer: "old offer",
  pains: [{ text: "p", sourceUrl: "https://shop.test/" }], proof: [], facts: [], landingPage: "https://shop.test/",
  suggestedGoal: "sales", voice: "plain", colors: [{ hex: "#000", role: "bg" }], fonts: [], logoKey: null, assets: [],
};

function brand(over: Partial<BrandProfile>): BrandProfile {
  return {
    id: "b", workspaceId: "w", domain: "shop.test", url: "https://shop.test/", name: null, colors: [], fonts: [], logoKey: null, assets: [],
    audience: null, mainOffer: null, pains: [], proof: [], facts: [], landingPage: null, voice: null, userEdited: {},
    createdAt: new Date(0), updatedAt: new Date(0), ...over,
  };
}

describe("extractionFromBrand", () => {
  it("brand-profile edits win over the previous extraction", () => {
    const ex = extractionFromBrand(brand({ audience: "edited audience", voice: "wry" }), previous, "https://shop.test/");
    expect(ex?.audience).toBe("edited audience");
    expect(ex?.voice).toBe("wry");
    expect(ex?.mainOffer).toBe("old offer");
    expect(ex?.suggestedGoal).toBe("sales");
    expect(ex?.colors).toEqual(previous.colors);
  });

  it("returns null when there is no usable brief (forces re-extraction)", () => {
    expect(extractionFromBrand(brand({}), null, "https://shop.test/")).toBeNull();
  });
});
