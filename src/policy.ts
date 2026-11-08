/**
 * Mandate policy engine.
 *
 * Pure functions only: no I/O, no clock, no network. Everything the engine needs
 * is passed in, so every rule is directly testable.
 */

export type Currency = "USD";

export interface Mandate {
  id: string;
  name: string;
  /** Hard ceiling for all spending under this mandate. */
  budgetCents: number;
  /** Already-settled spend, maintained by the store. */
  spentCents: number;
  /** Single-transaction ceiling, or null for none. */
  perTransactionCapCents: number | null;
  /** Above this amount a human must approve, or null to never require approval. */
  approvalThresholdCents: number | null;
  /** Empty means "any category". */
  allowedCategories: string[];
  /** Empty means "any merchant". */
  allowedMerchants: string[];
  /** Always wins over the allow list. */
  blockedMerchants: string[];
  /** ISO-8601 instant after which the mandate is dead. */
  expiresAt: string;
  currency: Currency;
}

export interface LineItem {
  sku: string;
  name: string;
  merchant: string;
  category: string;
  priceCents: number;
  qty: number;
}

export interface Proposal {
  id: string;
  goal: string;
  items: LineItem[];
  rationale: string;
}

export type Outcome = "allow" | "require_approval" | "deny";

export interface Reason {
  code: string;
  message: string;
  severity: "info" | "warn" | "block";
}

export interface Decision {
  outcome: Outcome;
  reasons: Reason[];
  totalCents: number;
  remainingBeforeCents: number;
  remainingAfterCents: number;
}

export function proposalTotalCents(proposal: Proposal): number {
  return proposal.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
}

/** One merchant per proposal keeps checkout and audit simple. */
export function proposalMerchant(proposal: Proposal): string | null {
  const merchants = new Set(proposal.items.map((item) => item.merchant));
  return merchants.size === 1 ? [...merchants][0] ?? null : null;
}

export function evaluate(
  proposal: Proposal,
  mandate: Mandate,
  now: Date = new Date(),
): Decision {
  const totalCents = proposalTotalCents(proposal);
  const remainingBeforeCents = Math.max(0, mandate.budgetCents - mandate.spentCents);
  const remainingAfterCents = remainingBeforeCents - totalCents;
  const reasons: Reason[] = [];

  if (Number.isNaN(Date.parse(mandate.expiresAt)) || now.getTime() > Date.parse(mandate.expiresAt)) {
    reasons.push({
      code: "mandate_expired",
      message: `Mandate expired at ${mandate.expiresAt}.`,
      severity: "block",
    });
  }

  if (totalCents <= 0) {
    reasons.push({ code: "empty_proposal", message: "Proposal has no costed items.", severity: "block" });
  }

  if (totalCents > remainingBeforeCents) {
    reasons.push({
      code: "over_budget",
      message: `Cart is ${money(totalCents)} but only ${money(remainingBeforeCents)} remains.`,
      severity: "block",
    });
  }

  if (mandate.perTransactionCapCents !== null && totalCents > mandate.perTransactionCapCents) {
    reasons.push({
      code: "over_transaction_cap",
      message: `Cart is ${money(totalCents)}, above the ${money(mandate.perTransactionCapCents)} per-transaction cap.`,
      severity: "block",
    });
  }

  const merchants = new Set(proposal.items.map((item) => item.merchant));
  if (merchants.size > 1) {
    reasons.push({
      code: "split_merchant",
      message: `Proposal spans ${merchants.size} merchants; split it into one checkout per merchant.`,
      severity: "block",
    });
  }

  for (const merchant of merchants) {
    if (mandate.blockedMerchants.includes(merchant)) {
      reasons.push({ code: "merchant_blocked", message: `${merchant} is blocked.`, severity: "block" });
    } else if (mandate.allowedMerchants.length > 0 && !mandate.allowedMerchants.includes(merchant)) {
      reasons.push({
        code: "merchant_not_allowed",
        message: `${merchant} is not on the allow list.`,
        severity: "block",
      });
    }
  }

  if (mandate.allowedCategories.length > 0) {
    for (const item of proposal.items) {
      if (!mandate.allowedCategories.includes(item.category)) {
        reasons.push({
          code: "category_not_allowed",
          message: `${item.name} is in "${item.category}", outside the allowed categories.`,
          severity: "block",
        });
      }
    }
  }

  const blocked = reasons.some((reason) => reason.severity === "block");
  if (blocked) {
    return { outcome: "deny", reasons, totalCents, remainingBeforeCents, remainingAfterCents };
  }

  if (mandate.approvalThresholdCents !== null && totalCents > mandate.approvalThresholdCents) {
    reasons.push({
      code: "approval_required",
      message: `${money(totalCents)} is above the ${money(mandate.approvalThresholdCents)} auto-approve threshold.`,
      severity: "warn",
    });
    return {
      outcome: "require_approval",
      reasons,
      totalCents,
      remainingBeforeCents,
      remainingAfterCents,
    };
  }

  reasons.push({
    code: "within_mandate",
    message: `${money(totalCents)} fits the mandate; ${money(remainingAfterCents)} would remain.`,
    severity: "info",
  });
  return { outcome: "allow", reasons, totalCents, remainingBeforeCents, remainingAfterCents };
}

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
