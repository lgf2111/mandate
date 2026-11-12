import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Decision, Mandate, Proposal } from "./policy.js";

// Point the store at a throwaway file and force the deterministic heuristic
// agent plus PayPal demo mode before the server module (and its imports) load.
const stateDir = mkdtempSync(join(tmpdir(), "mandate-api-"));
process.env.MANDATE_STATE_PATH = join(stateDir, "state.json");
process.env.PAYPAL_CLIENT_ID = "";
process.env.PAYPAL_CLIENT_SECRET = "";
process.env.MANDATE_LLM_BASE_URL = "";
process.env.MANDATE_LLM_API_KEY = "";

const { buildApp } = await import("./server.js");
const app = buildApp();

afterAll(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await request(app).post("/api/reset").expect(200);
});

interface ProposalResponse {
  proposal: Proposal;
  decision: Decision;
  engine: "llm" | "heuristic";
}

async function createMandate(overrides: Record<string, unknown> = {}): Promise<Mandate> {
  const response = await request(app)
    .post("/api/mandates")
    .send({ name: "Test mandate", budgetCents: 50_000, ...overrides })
    .expect(201);
  return response.body.mandate as Mandate;
}

async function propose(goal: string, mandateId: string): Promise<ProposalResponse> {
  const response = await request(app)
    .post("/api/proposals")
    .send({ goal, mandateId })
    .expect(200);
  return response.body as ProposalResponse;
}

describe("GET /api/health", () => {
  it("reports demo mode and the heuristic agent", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body).toEqual({ ok: true, paypal: "demo", agent: "heuristic" });
  });
});

describe("POST /api/mandates", () => {
  const invalidPayloads: Array<[string, Record<string, unknown>]> = [
    ["missing name", { budgetCents: 10_000 }],
    ["empty name", { name: "", budgetCents: 10_000 }],
    ["zero budget", { name: "Zero", budgetCents: 0 }],
    ["fractional budget", { name: "Fractional", budgetCents: 100.5 }],
    ["oversized budget", { name: "Oversized", budgetCents: 10_000_001 }],
  ];

  it.each(invalidPayloads)("rejects a mandate with a %s", async (_label, payload) => {
    const response = await request(app).post("/api/mandates").send(payload).expect(400);

    expect(response.body.error).toBe("invalid_mandate");
    expect(response.body.issues.length).toBeGreaterThan(0);
  });

  it("creates a mandate with defaults and lists it", async () => {
    const mandate = await createMandate({ name: "Groceries", budgetCents: 12_345 });

    expect(mandate).toMatchObject({
      name: "Groceries",
      budgetCents: 12_345,
      spentCents: 0,
      perTransactionCapCents: null,
      approvalThresholdCents: null,
      allowedCategories: [],
      allowedMerchants: [],
      blockedMerchants: [],
      currency: "USD",
    });
    expect(mandate.id).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(mandate.expiresAt))).toBe(false);

    const list = await request(app).get("/api/mandates").expect(200);
    expect(list.body.mandates).toContainEqual(mandate);
  });
});

describe("POST /api/proposals", () => {
  const GOAL = "trail running shoes";

  it("allows a proposal that fits the mandate", async () => {
    const mandate = await createMandate({ budgetCents: 50_000, perTransactionCapCents: 20_000 });
    const { proposal, decision, engine } = await propose(GOAL, mandate.id);

    expect(engine).toBe("heuristic");
    expect(proposal.items.length).toBeGreaterThan(0);
    expect(decision.outcome).toBe("allow");
    expect(decision.totalCents).toBe(11_500);
    expect(decision.reasons.map((reason) => reason.code)).toContain("within_mandate");
  });

  it("requires approval above the approval threshold", async () => {
    const mandate = await createMandate({ budgetCents: 50_000, approvalThresholdCents: 5_000 });
    const { decision } = await propose(GOAL, mandate.id);

    expect(decision.outcome).toBe("require_approval");
    expect(decision.totalCents).toBe(11_500);
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: "approval_required", severity: "warn" }),
    );
  });

  it("denies a proposal that exceeds the budget", async () => {
    const mandate = await createMandate({ budgetCents: 5_000 });
    const { decision } = await propose(GOAL, mandate.id);

    expect(decision.outcome).toBe("deny");
    expect(decision.totalCents).toBeGreaterThan(mandate.budgetCents);
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: "over_budget", severity: "block" }),
    );
  });

  it("rejects a proposal for an unknown mandate", async () => {
    const response = await request(app)
      .post("/api/proposals")
      .send({ goal: GOAL, mandateId: "does-not-exist" })
      .expect(404);

    expect(response.body.error).toBe("mandate_not_found");
  });
});

describe("POST /api/checkout", () => {
  it("captures a demo order and records the settled spend", async () => {
    const mandate = await createMandate({
      name: "Checkout demo",
      budgetCents: 50_000,
      approvalThresholdCents: 5_000,
    });
    const { proposal, decision } = await propose("trail running shoes", mandate.id);
    expect(decision.outcome).toBe("require_approval");

    const unapproved = await request(app)
      .post("/api/checkout")
      .send({ proposalId: proposal.id, mandateId: mandate.id })
      .expect(409);
    expect(unapproved.body.error).toBe("approval_required");

    const emptyLedger = await request(app).get("/api/ledger").expect(200);
    expect(emptyLedger.body.orders).toHaveLength(0);

    const checkout = await request(app)
      .post("/api/checkout")
      .send({ proposalId: proposal.id, mandateId: mandate.id, approved: true })
      .expect(200);

    expect(checkout.body.approveUrl).toBeNull();
    expect(checkout.body.order).toMatchObject({
      mandateId: mandate.id,
      proposalId: proposal.id,
      merchant: "RunCo",
      totalCents: decision.totalCents,
      provider: "demo",
      status: "captured",
    });
    expect(checkout.body.order.providerOrderId).toMatch(/^DEMO-/);
    expect(checkout.body.order.captureId).toMatch(/^DEMO-CAP-/);

    const ledger = await request(app).get("/api/ledger").expect(200);
    expect(ledger.body.orders).toContainEqual(checkout.body.order);

    const mandates = await request(app).get("/api/mandates").expect(200);
    const settled = mandates.body.mandates.find(
      (candidate: Mandate) => candidate.id === mandate.id,
    );
    expect(settled.spentCents).toBe(decision.totalCents);
  });

  it("refuses to check out a denied proposal", async () => {
    const mandate = await createMandate({ budgetCents: 5_000 });
    const { proposal } = await propose("trail running shoes", mandate.id);

    const response = await request(app)
      .post("/api/checkout")
      .send({ proposalId: proposal.id, mandateId: mandate.id, approved: true })
      .expect(409);

    expect(response.body.error).toBe("denied_by_policy");
    expect(response.body.decision.outcome).toBe("deny");

    const ledger = await request(app).get("/api/ledger").expect(200);
    expect(ledger.body.orders).toHaveLength(0);

    const mandates = await request(app).get("/api/mandates").expect(200);
    const unchanged = mandates.body.mandates.find(
      (candidate: Mandate) => candidate.id === mandate.id,
    );
    expect(unchanged.spentCents).toBe(0);
  });
});

describe("POST /api/mandates/draft", () => {
  it("drafts limits a person would otherwise type, from the goal alone", async () => {
    const response = await request(app)
      .post("/api/mandates/draft")
      .send({ goal: "trail running shoes under the cap" })
      .expect(200);

    const draft = response.body.draft as Mandate;
    // Trail Runner 2 is $94: budget rounds to $200, cap to $150, threshold to $100.
    expect(draft.budgetCents).toBe(20_000);
    expect(draft.perTransactionCapCents).toBe(15_000);
    expect(draft.approvalThresholdCents).toBe(10_000);
    expect(draft.allowedMerchants).toContain("RunCo");
    expect(draft.allowedCategories).toContain("running");
    expect(draft.spentCents).toBe(0);
    expect(response.body.because).toMatch(/Trail Runner 2/);
  });

  it("refuses a goal too short to draft from", async () => {
    const response = await request(app)
      .post("/api/mandates/draft")
      .send({ goal: "hi" })
      .expect(400);
    expect(response.body.error).toBe("invalid_goal");
  });
});
