import { describe, expect, it } from "vitest";
import { searchCatalog } from "./catalog.js";

describe("searchCatalog", () => {
  it("ranks a name match above a tag match", () => {
    const top = searchCatalog("trail running shoes")[0]!;
    expect(top.name).toBe("Trail Runner 2");
  });

  it("ignores filler words like 'the' and 'under the cap'", () => {
    const top = searchCatalog("trail running shoes under the cap")[0]!;
    expect(top.name).toBe("Trail Runner 2");
  });

  it("does not let the merchant name create relevance", () => {
    // "TrailSupply" sells a cap; searching for trail shoes must not surface it first.
    const top = searchCatalog("running shoes")[0]!;
    expect(top.category).toBe("running");
    expect(top.name).not.toBe("Feather Cap");
  });

  it("falls back to the full catalog when nothing matches", () => {
    const results = searchCatalog("zzzz-unmatched-zzzz");
    expect(results.length).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    expect(searchCatalog("running", 2)).toHaveLength(2);
  });

  it("returns cheap results first on equal relevance", () => {
    const [a, b] = searchCatalog("coffee", 2);
    expect(a!.priceCents).toBeLessThanOrEqual(b!.priceCents);
  });
});
