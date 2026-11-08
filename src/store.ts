import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Mandate, Proposal } from "./policy.js";

export interface Order {
  id: string;
  mandateId: string;
  proposalId: string;
  merchant: string;
  totalCents: number;
  provider: "paypal" | "demo";
  providerOrderId: string;
  captureId: string | null;
  status: "created" | "captured" | "failed";
  createdAt: string;
}

interface State {
  mandates: Mandate[];
  proposals: Proposal[];
  orders: Order[];
}

const STATE_PATH = process.env.MANDATE_STATE_PATH ?? join(process.cwd(), "data", "state.json");

function emptyState(): State {
  return { mandates: [], proposals: [], orders: [] };
}

function load(): State {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Partial<State>;
    return {
      mandates: parsed.mandates ?? [],
      proposals: parsed.proposals ?? [],
      orders: parsed.orders ?? [],
    };
  } catch {
    return emptyState();
  }
}

let state: State = load();

function persist(): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export const store = {
  listMandates(): Mandate[] {
    return state.mandates;
  },

  getMandate(id: string): Mandate | undefined {
    return state.mandates.find((mandate) => mandate.id === id);
  },

  saveMandate(mandate: Mandate): Mandate {
    const index = state.mandates.findIndex((existing) => existing.id === mandate.id);
    if (index === -1) state.mandates.push(mandate);
    else state.mandates[index] = mandate;
    persist();
    return mandate;
  },

  saveProposal(proposal: Proposal): Proposal {
    state.proposals.unshift(proposal);
    state.proposals = state.proposals.slice(0, 100);
    persist();
    return proposal;
  },

  getProposal(id: string): Proposal | undefined {
    return state.proposals.find((proposal) => proposal.id === id);
  },

  listOrders(): Order[] {
    return [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addOrder(order: Order): Order {
    state.orders.unshift(order);
    persist();
    return order;
  },

  /** Charges the mandate only after a successful capture. */
  recordSettledSpend(mandateId: string, cents: number): void {
    const mandate = state.mandates.find((candidate) => candidate.id === mandateId);
    if (!mandate) return;
    mandate.spentCents += cents;
    persist();
  },

  reset(): void {
    state = emptyState();
    persist();
  },
};
