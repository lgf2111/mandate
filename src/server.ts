import cors from "cors";
import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { agentEngine, proposeWithEngine } from "./agent.js";
import { CATALOG, searchCatalog } from "./catalog.js";
import { createOrder, captureOrder, paypalMode } from "./paypal.js";
import { evaluate, proposalTotalCents, type Mandate, type Proposal } from "./policy.js";
import { store, type Order } from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);

type AsyncHandler = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<unknown>;

/** Express 4 does not await async handlers: an unhandled rejection kills the process
 *  instead of answering the request. Every async route goes through this. */
function wrap(handler: AsyncHandler): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

const mandateSchema = z.object({
  name: z.string().min(1).max(80),
  budgetCents: z.number().int().positive().max(10_000_000),
  perTransactionCapCents: z.number().int().positive().nullable().default(null),
  approvalThresholdCents: z.number().int().nonnegative().nullable().default(null),
  allowedCategories: z.array(z.string()).default([]),
  allowedMerchants: z.array(z.string()).default([]),
  blockedMerchants: z.array(z.string()).default([]),
  expiresAt: z.string().default(() => new Date(Date.now() + 7 * 86_400_000).toISOString()),
});

function seedIfEmpty(): void {
  if (store.listMandates().length > 0) return;
  store.saveMandate({
    id: crypto.randomUUID(),
    name: "Weekend running gear",
    budgetCents: 20_000,
    spentCents: 0,
    perTransactionCapCents: 15_000,
    approvalThresholdCents: 10_000,
    allowedCategories: ["running", "apparel"],
    allowedMerchants: ["RunCo", "TrailSupply"],
    blockedMerchants: ["SketchySports"],
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    currency: "USD",
  });
}

export function buildApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  seedIfEmpty();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, paypal: paypalMode, agent: agentEngine() });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({ products: CATALOG });
  });

  app.get("/api/mandates", (_req, res) => {
    res.json({ mandates: store.listMandates() });
  });

  // The user states a goal; the app drafts the limits and asks for one approval.
  // Authorship moves from the person to the system, and the person keeps the veto.
  app.post("/api/mandates/draft", (req, res) => {
    const parsed = z.object({ goal: z.string().min(3).max(400) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_goal", issues: parsed.error.issues });
      return;
    }
    const matches = searchCatalog(parsed.data.goal, 6);
    const primary = matches[0];
    if (!primary) {
      res.status(400).json({ error: "no_products_match", detail: "No catalogue item fits that goal." });
      return;
    }
    const roundUpTo = (cents: number, step: number) => Math.ceil(cents / step) * step;
    const draft: Mandate = {
      id: "draft",
      name: parsed.data.goal.slice(0, 60),
      budgetCents: roundUpTo(primary.priceCents * 2, 5_000),
      spentCents: 0,
      perTransactionCapCents: roundUpTo(primary.priceCents * 1.5, 5_000),
      approvalThresholdCents: roundUpTo(primary.priceCents, 5_000),
      allowedCategories: [...new Set(matches.map((item) => item.category))],
      allowedMerchants: [...new Set(matches.map((item) => item.merchant))],
      blockedMerchants: [],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      currency: "USD",
    };
    res.json({
      draft,
      because:
        `Drafted from "${parsed.data.goal}" and the catalogue: the main item is ${primary.name} ` +
        `at ${(primary.priceCents / 100).toFixed(2)}, so the budget is twice that, the cap is one ` +
        `and a half, and anything above the item price needs you.`,
    });
  });

  app.post("/api/mandates", (req, res) => {
    const parsed = mandateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_mandate", issues: parsed.error.issues });
      return;
    }
    const mandate: Mandate = {
      id: crypto.randomUUID(),
      spentCents: 0,
      currency: "USD",
      ...parsed.data,
    };
    store.saveMandate(mandate);
    res.status(201).json({ mandate });
  });

  app.post("/api/proposals", wrap(async (req, res) => {
    const schema = z.object({ goal: z.string().min(3).max(400), mandateId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const mandate = store.getMandate(parsed.data.mandateId);
    if (!mandate) {
      res.status(404).json({ error: "mandate_not_found" });
      return;
    }

    // The response reports the engine that actually answered. Reporting the
    // configured one would let a silent fallback look like a model response.
    const { proposal, engine } = await proposeWithEngine(
      parsed.data.goal,
      mandate,
      crypto.randomUUID(),
    );
    const decision = evaluate(proposal, mandate);
    store.saveProposal(proposal);
    res.json({ proposal, decision, engine });
  }));

  app.post("/api/checkout", wrap(async (req, res) => {
    const schema = z.object({
      proposalId: z.string().min(1),
      mandateId: z.string().min(1),
      approved: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const { proposalId, mandateId, approved } = parsed.data;
    const proposal = store.getProposal(proposalId);
    const mandate = store.getMandate(mandateId);
    if (!proposal || !mandate) {
      res.status(404).json({ error: "proposal_or_mandate_not_found" });
      return;
    }

    const decision = evaluate(proposal, mandate);
    if (decision.outcome === "deny") {
      res.status(409).json({ error: "denied_by_policy", decision });
      return;
    }
    if (decision.outcome === "require_approval" && !approved) {
      res.status(409).json({ error: "approval_required", decision });
      return;
    }

    const totalCents = proposalTotalCents(proposal);
    const merchant = proposal.items[0]?.merchant ?? "unknown";

    const created = await createOrder({
      totalCents,
      currency: mandate.currency,
      description: proposal.items.map((item) => item.name).join(", "),
      referenceId: mandate.id,
    });

    const baseOrder: Order = {
      id: crypto.randomUUID(),
      mandateId: mandate.id,
      proposalId: proposal.id,
      merchant,
      totalCents,
      provider: created.mode === "live" ? "paypal" : "demo",
      providerOrderId: created.id,
      captureId: null,
      status: "created",
      createdAt: new Date().toISOString(),
    };

    // Demo mode settles immediately so the flow is always demonstrable.
    if (created.mode === "demo") {
      const captured = await captureOrder(created.id);
      const settled: Order = { ...baseOrder, captureId: captured.captureId, status: "captured" };
      store.addOrder(settled);
      store.recordSettledSpend(mandate.id, totalCents);
      res.json({ order: settled, approveUrl: null, decision });
      return;
    }

    store.addOrder(baseOrder);
    res.json({ order: baseOrder, approveUrl: created.approveUrl, decision });
  }));

  app.post("/api/orders/:id/capture", wrap(async (req, res) => {
    const order = store.listOrders().find((candidate) => candidate.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: "order_not_found" });
      return;
    }
    if (order.status === "captured") {
      res.json({ order });
      return;
    }
    const captured = await captureOrder(order.providerOrderId);
    if (captured.status !== "COMPLETED") {
      res.status(502).json({ error: "capture_failed" });
      return;
    }
    const settled: Order = { ...order, captureId: captured.captureId, status: "captured" };
    store.addOrder(settled);
    store.recordSettledSpend(order.mandateId, order.totalCents);
    res.json({ order: settled });
  }));

  app.get("/api/ledger", (_req, res) => {
    res.json({ orders: store.listOrders() });
  });

  app.post("/api/webhooks/paypal", (req, res) => {
    console.log("[paypal webhook]", JSON.stringify(req.body).slice(0, 500));
    res.sendStatus(200);
  });

  app.post("/api/reset", (_req, res) => {
    store.reset();
    seedIfEmpty();
    res.json({ ok: true });
  });

  const webDist = join(process.cwd(), "web", "dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  // Any rejected promise from a route lands here as a 502 instead of exiting the process.
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[api] upstream failure:", detail);
      if (res.headersSent) return;
      res.status(502).json({ error: "upstream_failure", detail: detail.slice(0, 200) });
    },
  );

  return app;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  buildApp().listen(PORT, () => {
    console.log(`Mandate API on http://localhost:${PORT} · paypal=${paypalMode} · agent=${agentEngine()}`);
  });
}

export type { Proposal };
