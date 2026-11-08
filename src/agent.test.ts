import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CATALOG } from "./catalog.js";
import { evaluate, proposalMerchant, proposalTotalCents, type Mandate } from "./policy.js";

type AgentModule = typeof import("./agent.js");

const NOW = new Date("2026-11-08T12:00:00Z");
/** The LLM path activates only when these are set, so the suite runs them unset. */
const LLM_ENV = ["MANDATE_LLM_BASE_URL", "MANDATE_LLM_API_KEY", "MANDATE_LLM_MODEL"] as const;

const savedEnv = new Map<string, string | undefined>();
let agent: AgentModule;

beforeAll(async () => {
  for (const key of LLM_ENV) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  vi.resetModules();
  agent = await import("./agent.js");
});

afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

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

describe("proposeItems heuristic fallback", () => {
  it("fills a catalog-matching goal from a single merchant", async () => {
    const proposal = await agent.proposeItems("running shoes", mandate(), "prop-123");

    expect(agent.agentEngine()).toBe("heuristic");
    expect(proposal.items.length).toBeGreaterThan(0);
    expect(proposalMerchant(proposal)).not.toBeNull();
    const merchants = new Set(proposal.items.map((item) => item.merchant));
    expect(merchants.size).toBe(1);
  });

  it("never calls the network unless the LLM is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      await agent.proposeItems("running shoes", mandate(), "prop-123");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("excludes a blocked merchant even when it is the cheapest match", async () => {
    // Mystery Runner (SketchySports, $49) is the cheapest shoe in the catalog.
    const cheapest = CATALOG.filter((product) => product.tags.includes("shoes")).sort(
      (a, b) => a.priceCents - b.priceCents,
    )[0]!;
    expect(cheapest.merchant).toBe("SketchySports");

    const proposal = await agent.proposeItems(
      "running shoes",
      mandate({ allowedMerchants: [], allowedCategories: [], blockedMerchants: ["SketchySports"], perTransactionCapCents: null }),
      "prop-123",
    );

    expect(proposal.items.length).toBeGreaterThan(0);
    expect(proposal.items.map((item) => item.sku)).not.toContain(cheapest.sku);
    for (const item of proposal.items) {
      expect(item.merchant).not.toBe("SketchySports");
    }
  });

  it("keeps every item inside the allow lists and the per-transaction cap", async () => {
    const proposal = await agent.proposeItems(
      "running shoes",
      mandate({
        allowedMerchants: ["RunCo"],
        allowedCategories: ["apparel"],
        blockedMerchants: ["SketchySports"],
        perTransactionCapCents: 5_000,
      }),
      "prop-123",
    );

    expect(proposal.items.length).toBeGreaterThan(0);
    for (const item of proposal.items) {
      expect(item.merchant).toBe("RunCo");
      expect(item.category).toBe("apparel");
      expect(item.priceCents).toBeLessThanOrEqual(5_000);
      expect(item.priceCents).toBeGreaterThan(0);
      expect(Number.isInteger(item.priceCents)).toBe(true);
      expect(item.qty).toBe(1);
    }
  });

  it("returns zero items and a rationale when no catalog item can satisfy the mandate", async () => {
    const proposal = await agent.proposeItems(
      "running shoes",
      mandate({ allowedMerchants: ["NoSuchMerchant"], allowedCategories: [], blockedMerchants: [], perTransactionCapCents: null }),
      "prop-123",
    );

    expect(proposal.items).toHaveLength(0);
    expect(proposalTotalCents(proposal)).toBe(0);
    expect(proposal.rationale.trim().length).toBeGreaterThan(0);
    expect(proposal.rationale).toMatch(/no catalog item satisfies/i);
    expect(proposal.rationale).toMatch(/merchant/i);
    expect(proposal.rationale).toMatch(/category/i);
    expect(proposal.rationale).toMatch(/price/i);
  });

  it("returns the proposal id it was given", async () => {
    const proposalId = "proposal-8f2c1d";
    const proposal = await agent.proposeItems("coffee", mandate({ allowedCategories: ["grocery"], allowedMerchants: [] }), proposalId);

    expect(proposal.id).toBe(proposalId);
    expect(proposal.goal).toBe("coffee");
  });

  it("keeps a multi-item bundle inside the remaining budget", async () => {
    const m = mandate({
      budgetCents: 12_000,
      spentCents: 0,
      perTransactionCapCents: null,
      allowedCategories: [],
      allowedMerchants: [],
      blockedMerchants: [],
    });
    const proposal = await agent.proposeItems("trail running gear", m, "prop-123");
    const total = proposalTotalCents(proposal);

    expect(proposal.items.length).toBeGreaterThan(1);
    expect(total).toBeLessThanOrEqual(m.budgetCents - m.spentCents);
    expect(proposal.rationale).toMatch(/leaves \$/i);
  });

  it("surfaces an over-budget draft instead of silently spending it", async () => {
    const m = mandate({
      budgetCents: 20_000,
      spentCents: 18_000, // only $20 remains
      perTransactionCapCents: null,
      allowedCategories: [],
      allowedMerchants: [],
      blockedMerchants: [],
    });
    const proposal = await agent.proposeItems("trail running gear", m, "prop-123");
    const total = proposalTotalCents(proposal);
    const remaining = m.budgetCents - m.spentCents;

    expect(total).toBeGreaterThan(remaining);
    // Not silent: the rationale names the overrun and the policy engine denies it.
    expect(proposal.rationale).toMatch(/exceeds the remaining budget/i);
    const decision = evaluate(proposal, m, NOW);
    expect(decision.outcome).toBe("deny");
    expect(decision.reasons.map((reason) => reason.code)).toContain("over_budget");
  });
});
