import { CATALOG, searchCatalog, type Product } from "./catalog.js";
import type { LineItem, Mandate, Proposal } from "./policy.js";

export interface AgentResult {
  items: LineItem[];
  rationale: string;
  engine: "llm" | "heuristic";
}

interface AgentDraft {
  skus: string[];
  rationale: string;
}

const LLM_BASE = process.env.MANDATE_LLM_BASE_URL?.replace(/\/$/, "");
const LLM_KEY = process.env.MANDATE_LLM_API_KEY;
const LLM_MODEL = process.env.MANDATE_LLM_MODEL ?? "deepseek-v4.1-flash";

function toLineItem(product: Product, qty = 1): LineItem {
  return {
    sku: product.sku,
    name: product.name,
    merchant: product.merchant,
    category: product.category,
    priceCents: product.priceCents,
    qty,
  };
}

function permissible(product: Product, mandate: Mandate): boolean {
  if (mandate.blockedMerchants.includes(product.merchant)) return false;
  if (mandate.allowedMerchants.length > 0 && !mandate.allowedMerchants.includes(product.merchant)) return false;
  if (mandate.allowedCategories.length > 0 && !mandate.allowedCategories.includes(product.category)) return false;
  if (mandate.perTransactionCapCents !== null && product.priceCents > mandate.perTransactionCapCents) return false;
  return true;
}

/** Deterministic fallback: keyword match, cheapest sensible bundle, mandate-aware. */
function heuristicDraft(goal: string, mandate: Mandate): AgentDraft {
  const candidates = searchCatalog(goal, 12).filter((product) => permissible(product, mandate));
  if (candidates.length === 0) {
    return { skus: [], rationale: "No catalog item satisfies this mandate's merchant, category and price limits." };
  }

  const primary = candidates[0]!;
  const skus = [primary.sku];
  const budgetLeft = mandate.budgetCents - mandate.spentCents - primary.priceCents;
  const accessory = candidates.find(
    (product) =>
      product.sku !== primary.sku &&
      product.merchant === primary.merchant &&
      product.priceCents <= budgetLeft &&
      product.priceCents <= primary.priceCents / 2,
  );
  if (accessory) skus.push(accessory.sku);

  const total = skus
    .map((sku) => CATALOG.find((product) => product.sku === sku)!.priceCents)
    .reduce((sum, cents) => sum + cents, 0);

  const remaining = mandate.budgetCents - mandate.spentCents - total;
  const budgetNote =
    remaining >= 0
      ? `leaves $${(remaining / 100).toFixed(2)} of the budget`
      : `exceeds the remaining budget by $${(Math.abs(remaining) / 100).toFixed(2)}`;

  const caps: string[] = [];
  if (mandate.allowedMerchants.length > 0) caps.push(`merchants ${mandate.allowedMerchants.join(", ")}`);
  if (mandate.allowedCategories.length > 0) caps.push(`categories ${mandate.allowedCategories.join(", ")}`);
  if (mandate.perTransactionCapCents !== null) {
    caps.push(`per-transaction cap $${(mandate.perTransactionCapCents / 100).toFixed(2)}`);
  }

  return {
    skus,
    rationale:
      `${primary.name} from ${primary.merchant} best matches "${goal}"` +
      (accessory ? `, with ${accessory.name} added from the same store` : "") +
      `. Total $${(total / 100).toFixed(2)} stays inside ` +
      (caps.length > 0 ? caps.join(", ") : "the mandate") +
      ` and ${budgetNote}.`,
  };
}

async function llmDraft(goal: string, mandate: Mandate): Promise<AgentDraft | null> {
  if (!LLM_BASE || !LLM_KEY) return null;

  const candidates = searchCatalog(goal, 12).filter((product) => permissible(product, mandate));
  if (candidates.length === 0) return null;

  const system = [
    "You are a shopping agent operating under a spending mandate.",
    "Choose the fewest items that satisfy the goal without violating the mandate.",
    "Reply with JSON only: {\"skus\": string[], \"rationale\": string}.",
    "Never invent SKUs. Keep one merchant per order. rationale must cite the binding limits.",
  ].join(" ");

  const user = JSON.stringify({
    goal,
    mandate: {
      budgetRemainingCents: mandate.budgetCents - mandate.spentCents,
      perTransactionCapCents: mandate.perTransactionCapCents,
      approvalThresholdCents: mandate.approvalThresholdCents,
      allowedCategories: mandate.allowedCategories,
      allowedMerchants: mandate.allowedMerchants,
      blockedMerchants: mandate.blockedMerchants,
      expiresAt: mandate.expiresAt,
    },
    candidates: candidates.map(({ sku, name, merchant, category, priceCents }) => ({
      sku,
      name,
      merchant,
      category,
      priceCents,
    })),
  });

  const response = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content) as Partial<AgentDraft>;
  const skus = Array.isArray(parsed.skus) ? parsed.skus.filter((sku) => typeof sku === "string") : [];
  const valid = skus.filter((sku) => candidates.some((product) => product.sku === sku));
  if (valid.length === 0) return null;

  return {
    skus: valid,
    rationale: typeof parsed.rationale === "string" && parsed.rationale.trim() ? parsed.rationale.trim() : "Chosen to fit the mandate.",
  };
}

export async function proposeItems(goal: string, mandate: Mandate, proposalId: string): Promise<Proposal> {
  let draft: AgentDraft;
  let engine: AgentResult["engine"] = "heuristic";

  try {
    const fromModel = await llmDraft(goal, mandate);
    if (fromModel) {
      draft = fromModel;
      engine = "llm";
    } else {
      draft = heuristicDraft(goal, mandate);
    }
  } catch {
    draft = heuristicDraft(goal, mandate);
  }

  const items = draft.skus
    .map((sku) => CATALOG.find((product) => product.sku === sku))
    .filter((product): product is Product => Boolean(product))
    .map((product) => toLineItem(product));

  return {
    id: proposalId,
    goal,
    items,
    rationale: engine === "llm" ? draft.rationale : draft.rationale,
  };
}

export function agentEngine(): "llm" | "heuristic" {
  return LLM_BASE && LLM_KEY ? "llm" : "heuristic";
}
