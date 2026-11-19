import { describe, expect, it } from "vitest";
import { isPasswordGateUrl, productUrl, storeDataFrom, storePages, type StoreDataResponse } from "../store-data";

const resp: StoreDataResponse = {
  shop: { name: "Komendly Test Store", description: "Snowboards for every rider." },
  products: {
    nodes: [
      { title: "The Minimal Snowboard", handle: "the-minimal-snowboard", description: "A  light\nboard.", productType: "snowboard", onlineStoreUrl: null, priceRangeV2: { minVariantPrice: { amount: "885.95", currencyCode: "USD" } }, featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/a.jpg", altText: "board" } } } },
      { title: "Gift Card", handle: "gift-card", description: null, productType: null, onlineStoreUrl: "https://shop.example.com/products/gift-card", priceRangeV2: null, featuredMedia: null },
    ],
  },
};

describe("shopify store data", () => {
  it("falls back to /products/<handle> when the storefront is password-protected", () => {
    expect(productUrl({ handle: "x y", onlineStoreUrl: null }, "https://s.myshopify.com/")).toBe("https://s.myshopify.com/products/x%20y");
    expect(productUrl({ handle: "x", onlineStoreUrl: "https://a.com/products/x" }, "https://s.myshopify.com")).toBe("https://a.com/products/x");
  });
  it("builds clean store data with prices", () => {
    const d = storeDataFrom(resp, "https://komendly-test-store.myshopify.com");
    expect(d.products[0]).toMatchObject({ url: "https://komendly-test-store.myshopify.com/products/the-minimal-snowboard", price: "$885.95", description: "A light board.", imageUrl: "https://cdn.shopify.com/a.jpg" });
    expect(d.products[1]).toMatchObject({ price: null, imageUrl: null, description: "" });
  });
  it("puts the picked product first and the store page with the product list", () => {
    const d = storeDataFrom(resp, "https://komendly-test-store.myshopify.com");
    const home = storePages(d);
    expect(home[0]!.url).toBe(d.storeUrl);
    expect(home[0]!.text).toContain("The Minimal Snowboard (from $885.95) - snowboard");
    const focused = storePages(d, d.products[1]!.url);
    expect(focused[0]!.url).toBe(d.products[1]!.url);
    expect(focused[1]!.url).toBe(d.storeUrl);
  });
  it("detects the password gate", () => {
    expect(isPasswordGateUrl("https://s.myshopify.com/password")).toBe(true);
    expect(isPasswordGateUrl("https://s.myshopify.com/products/password")).toBe(false);
    expect(isPasswordGateUrl("nope")).toBe(false);
  });
});
