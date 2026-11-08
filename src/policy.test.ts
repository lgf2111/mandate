import { describe, expect, it } from "vitest";
import {
  evaluate,
  money,
  proposalMerchant,
  proposalTotalCents,
  type LineItem,
  type Mandate,
  type Proposal,
} from "./policy.js";

const NOW = new Date("2026-11-08T12:00:00Z");

function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: "m1",
    name: "Running gear",
    budgetCents: 20_000,
    spentCents: 0,
    perTransactionCapCents: 15_000,
    approvalThresholdCents: 10_000,
    allowedCategories: ["running", "apparel"],
    allowedMerchants: ["RunCo", "TrailSupply"],
    blockedMerchants: ["SketchySports"],
    expiresAt: "2026-12-01T00:00:00Z",
    currency: "USD",
    ...overrides,
  };
}

function item(overrides: Partial<LineItem> = {}): LineItem {
  return {
    sku: "shoe-1",
    name: "Trail Runner 2",
    merchant: "RunCo",
    category: "running",
    priceCents: 9_000,
    qty: 1,
    ...overrides,
  };
}

function proposal(items: LineItem[]): Proposal {
  return { id: "p1", goal: "shoes", items, rationale: "test" };
}

describe("proposal helpers", () => {
  it("totals quantity-aware line items", () => {
    expect(proposalTotalCents(proposal([item({ qty: 2, priceCents: 2_500 })]))).toBe(5_000);
  });

  it("reports a merchant only when all items share one", () => {
    expect(proposalMerchant(proposal([item(), item({ sku: "sock-1" })]))).toBe("RunCo");
    expect(proposalMerchant(proposal([item(), item({ merchant: "Other" })]))).toBeNull();
  });
});

describe("evaluate", () => {
  it("allows a cart that fits every rule", () => {
    const decision = evaluate(proposal([item({ priceCents: 4_000 })]), mandate(), NOW);
    expect(decision.outcome).toBe("allow");
    expect(decision.totalCents).toBe(4_000);
    expect(decision.remainingAfterCents).toBe(16_000);
  });

  it("requires approval above the threshold but below the caps", () => {
    const decision = evaluate(proposal([item({ priceCents: 12_000 })]), mandate(), NOW);
    expect(decision.outcome).toBe("require_approval");
    expect(decision.reasons.map((r) => r.code)).toContain("approval_required");
  });

  it("allows spending exactly to the remaining budget", () => {
    const decision = evaluate(proposal([item({ priceCents: 10_000 })]), mandate({ spentCents: 10_000, approvalThresholdCents: null }), NOW);
    expect(decision.outcome).toBe("allow");
    expect(decision.remainingAfterCents).toBe(0);
  });

  it("denies one cent over the remaining budget", () => {
    const decision = evaluate(proposal([item({ priceCents: 10_001 })]), mandate({ spentCents: 10_000 }), NOW);
    expect(decision.outcome).toBe("deny");
    expect(decision.reasons.map((r) => r.code)).toContain("over_budget");
  });

  it("denies over the per-transaction cap", () => {
    const decision = evaluate(proposal([item({ priceCents: 15_001 })]), mandate({ approvalThresholdCents: null }), NOW);
    expect(decision.reasons.map((r) => r.code)).toContain("over_transaction_cap");
  });

  it("allows exactly at the per-transaction cap", () => {
    const decision = evaluate(proposal([item({ priceCents: 15_000 })]), mandate({ approvalThresholdCents: null }), NOW);
    expect(decision.outcome).toBe("allow");
  });

  it("denies an expired mandate", () => {
    const decision = evaluate(proposal([item({ priceCents: 1_000 })]), mandate({ expiresAt: "2026-11-01T00:00:00Z" }), NOW);
    expect(decision.outcome).toBe("deny");
    expect(decision.reasons.map((r) => r.code)).toContain("mandate_expired");
  });

  it("denies a merchant outside the allow list", () => {
    const decision = evaluate(proposal([item({ merchant: "Unlisted" })]), mandate(), NOW);
    expect(decision.reasons.map((r) => r.code)).toContain("merchant_not_allowed");
  });

  it("lets the block list beat the allow list", () => {
    const decision = evaluate(
      proposal([item({ merchant: "SketchySports" })]),
      mandate({ allowedMerchants: ["SketchySports"] }),
      NOW,
    );
    expect(decision.reasons.map((r) => r.code)).toContain("merchant_blocked");
  });

  it("denies categories outside the mandate", () => {
    const decision = evaluate(proposal([item({ category: "gambling" })]), mandate(), NOW);
    expect(decision.reasons.map((r) => r.code)).toContain("category_not_allowed");
  });

  it("denies carts spanning several merchants", () => {
    const decision = evaluate(
      proposal([item(), item({ sku: "b", merchant: "TrailSupply" })]),
      mandate(),
      NOW,
    );
    expect(decision.reasons.map((r) => r.code)).toContain("split_merchant");
  });

  it("reports every blocking reason, not just the first", () => {
    const decision = evaluate(
      proposal([item({ priceCents: 99_000, category: "jewellery", merchant: "SketchySports" })]),
      mandate(),
      NOW,
    );
    const codes = decision.reasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(["over_budget", "over_transaction_cap", "merchant_blocked", "category_not_allowed"]),
    );
  });

  it("treats an unparseable expiry as expired", () => {
    const decision = evaluate(proposal([item()]), mandate({ expiresAt: "not-a-date" }), NOW);
    expect(decision.reasons.map((r) => r.code)).toContain("mandate_expired");
  });

  it("formats money without floating point drift", () => {
    expect(money(1)).toBe("$0.01");
    expect(money(199_999)).toBe("$1999.99");
    expect(money(0)).toBe("$0.00");
  });
});
