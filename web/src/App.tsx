import { useCallback, useEffect, useId, useMemo, useState } from "react";

type Reason = { code: string; message: string; severity: "info" | "warn" | "block" };
type Decision = {
  outcome: "allow" | "require_approval" | "deny";
  reasons: Reason[];
  totalCents: number;
  remainingAfterCents: number;
};
type LineItem = { sku: string; name: string; merchant: string; category: string; priceCents: number; qty: number };
type Proposal = { id: string; goal: string; items: LineItem[]; rationale: string };
type Mandate = {
  id: string;
  name: string;
  budgetCents: number;
  spentCents: number;
  perTransactionCapCents: number | null;
  approvalThresholdCents: number | null;
  allowedCategories: string[];
  allowedMerchants: string[];
  blockedMerchants: string[];
  expiresAt: string;
  currency: "USD";
};
type Order = {
  id: string;
  merchant: string;
  totalCents: number;
  provider: "paypal" | "demo";
  status: string;
  captureId: string | null;
  createdAt: string;
};

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

const OUTCOME_LABEL: Record<Decision["outcome"], string> = {
  allow: "Allow",
  require_approval: "Approval required",
  deny: "Deny",
};

const EXAMPLES = [
  "trail running shoes under the cap",
  "headphones for running",
  "coffee beans",
];

export function App() {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [goal, setGoal] = useState(EXAMPLES[0]!);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [engine, setEngine] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [health, setHealth] = useState<{ paypal: string; agent: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const selected = useMemo(() => mandates.find((m) => m.id === selectedId) ?? null, [mandates, selectedId]);

  const refresh = useCallback(async () => {
    const [healthRes, mandatesRes, ledgerRes] = await Promise.all([
      fetch("/api/health"),
      fetch("/api/mandates"),
      fetch("/api/ledger"),
    ]);
    const healthBody = await healthRes.json();
    setHealth({ paypal: healthBody.paypal, agent: healthBody.agent });
    const mandateBody = await mandatesRes.json();
    setMandates(mandateBody.mandates);
    setSelectedId((current) => current || mandateBody.mandates[0]?.id || "");
    const ledgerBody = await ledgerRes.json();
    setOrders(ledgerBody.orders);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function askAgent() {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    setApproveUrl(null);
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, mandateId: selected.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "proposal failed");
      setProposal(body.proposal);
      setDecision(body.decision);
      setEngine(body.engine);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "proposal failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(approved: boolean) {
    if (!selected || !proposal) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, mandateId: selected.id, approved }),
      });
      const body = await response.json();
      if (!response.ok) {
        setNotice(body.error === "approval_required" ? "Approval is required above the threshold." : (body.error ?? "Checkout failed."));
        return;
      }
      if (body.approveUrl) {
        setApproveUrl(body.approveUrl);
        setPendingOrderId(body.order.id);
        setNotice("Order created. Approve it in PayPal, then capture the payment.");
      } else {
        setNotice(`Paid ${money(body.order.totalCents)} to ${body.order.merchant}.`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function capturePending() {
    if (!pendingOrderId) return;
    setBusy(true);
    const response = await fetch(`/api/orders/${pendingOrderId}/capture`, { method: "POST" });
    if (response.ok) {
      setNotice("Payment captured.");
      setApproveUrl(null);
      setPendingOrderId(null);
      await refresh();
    } else {
      setNotice("Payment capture failed. Check the order in PayPal and try again.");
    }
    setBusy(false);
  }

  async function saveMandate(patch: Partial<Mandate>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    const response = await fetch("/api/mandates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: next.name,
        budgetCents: next.budgetCents,
        perTransactionCapCents: next.perTransactionCapCents,
        approvalThresholdCents: next.approvalThresholdCents,
        allowedCategories: next.allowedCategories,
        allowedMerchants: next.allowedMerchants,
        blockedMerchants: next.blockedMerchants,
        expiresAt: next.expiresAt,
      }),
    });
    const body = await response.json();
    if (response.ok) {
      setMandates((current) => [...current, body.mandate]);
      setSelectedId(body.mandate.id);
      setNotice("Saved as a new mandate version.");
    } else {
      setNotice(body.error === "invalid_mandate" ? "The mandate was rejected. Check the fields and try again." : (body.error ?? "Could not save the mandate."));
    }
  }

  async function reset() {
    await fetch("/api/reset", { method: "POST" });
    setProposal(null);
    setDecision(null);
    setOrders([]);
    setSelectedId("");
    setNotice("");
    await refresh();
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <div className="mark" aria-hidden="true">M</div>
          <div>
            <h1>Mandate</h1>
            <p>Spending guardrails for AI shopping agents, settled with PayPal.</p>
          </div>
        </div>
        <div className="badges">
          <span className={`badge ${health?.paypal === "live" ? "live" : ""}`}>
            PayPal: {health?.paypal ?? "…"}
          </span>
          <span className="badge">agent: {health?.agent ?? "…"}</span>
          <button
            type="button"
            className="ghost"
            onClick={reset}
            title="Clears all mandates and orders, then reseeds the demo"
          >
            Reset demo data
          </button>
        </div>
      </header>

      <main className="grid" aria-busy={busy}>
        <section className="col">
          <div className="card">
            <div className="card-head">
              <h2>Mandate</h2>
              {selected && <span className="muted mono" title={selected.id}>{selected.id.slice(0, 8)}</span>}
            </div>
            {selected ? (
              <MandateEditor mandate={selected} onChange={saveMandate} />
            ) : (
              <p className="muted">Loading…</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Goal</h2>
              <span className="muted mono">{engine ? `engine ${engine}` : "engine pending"}</span>
            </div>
            <label className="sr-only" htmlFor="goal-input">Shopping goal</label>
            <textarea
              id="goal-input"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={3}
              aria-describedby="goal-hint"
            />
            <p id="goal-hint" className="hint">
              Describe the purchase. The agent proposes a cart; the mandate checks it before any money moves.
            </p>
            <div className="chips" role="group" aria-label="Example goals">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setGoal(example)}>{example}</button>
              ))}
            </div>
            <button type="button" className="primary" disabled={busy || !selected} onClick={askAgent}>
              {busy ? "Asking the model…" : "Ask the agent"}
            </button>
            <p className="notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
          </div>
        </section>

        <section className="col">
          <div className="card proposal">
            <div className="card-head">
              <h2>Proposal</h2>
              <span className="outcome-slot" role="status" aria-live="polite" aria-atomic="true">
                {decision && (
                  <>
                    <span className="sr-only">Decision: </span>
                    <span className={`outcome ${decision.outcome}`}>{OUTCOME_LABEL[decision.outcome]}</span>
                  </>
                )}
              </span>
            </div>

            {!proposal && (
              <p className="muted">No proposal yet. Describe a goal and ask the agent; every cart is checked against the mandate before money moves.</p>
            )}

            {proposal && (
              <>
                <ul className="items" aria-label="Proposed items">
                  {proposal.items.map((item) => (
                    <li key={item.sku}>
                      <div>
                        <strong>{item.name}</strong>
                        <div className="muted small">{item.merchant} · {item.category}</div>
                      </div>
                      <span className="mono">{money(item.priceCents * item.qty)}</span>
                    </li>
                  ))}
                  {proposal.items.length === 0 && <li className="muted">The agent did not select any items.</li>}
                </ul>

                <p className="rationale">
                  <span className="sr-only">Agent rationale: </span>
                  “{proposal.rationale}”
                </p>

                {decision && (
                  <div className="decision">
                    <div className="row">
                      <span>Total</span><strong className="mono">{money(decision.totalCents)}</strong>
                    </div>
                    <div className="row">
                      <span>Budget remaining after this order</span><span className="mono">{money(decision.remainingAfterCents)}</span>
                    </div>
                    <ul className="reasons">
                      {decision.reasons.map((reason) => (
                        <li key={reason.code} className={reason.severity}>{reason.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="actions">
                  {decision?.outcome === "deny" ? (
                    <div className="blocked">Blocked by the mandate. No payment can be made for this cart.</div>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !decision}
                      onClick={() => checkout(decision?.outcome === "require_approval")}
                    >
                      {decision?.outcome === "require_approval" ? "Approve and pay" : "Pay with PayPal"}
                    </button>
                  )}
                  {approveUrl && (
                    <a className="link" href={approveUrl} target="_blank" rel="noreferrer">
                      Open PayPal approval<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                  {approveUrl && (
                    <button type="button" className="ghost" onClick={capturePending} disabled={busy}>
                      Capture payment
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Ledger</h2>
              <span className="muted mono">{orders.length} order{orders.length === 1 ? "" : "s"}</span>
            </div>
            <table>
              <caption className="sr-only">Recent settlements</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono small">{new Date(order.createdAt).toLocaleTimeString()}</td>
                    <td>{order.merchant}</td>
                    <td className="mono">{money(order.totalCents)}</td>
                    <td><span className={`pill ${order.status}`}>{order.status}{order.provider === "demo" ? " · demo mode" : ""}</span></td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={4} className="muted">No settlements yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function MandateEditor({ mandate, onChange }: { mandate: Mandate; onChange: (patch: Partial<Mandate>) => void }) {
  const [draft, setDraft] = useState(mandate);
  const baseId = useId();
  useEffect(() => setDraft(mandate), [mandate]);

  const field = (
    key: string,
    label: string,
    value: string,
    onInput: (value: string) => void,
    hint?: string,
    numeric = false,
  ) => {
    const inputId = `${baseId}-${key}`;
    const hintId = `${inputId}-hint`;
    return (
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => onInput(event.target.value)}
          inputMode={numeric ? "decimal" : undefined}
          aria-describedby={hint ? hintId : undefined}
        />
        {hint && <em id={hintId}>{hint}</em>}
      </div>
    );
  };

  return (
    <div className="mandate">
      {field("name", "Name", draft.name, (value) => setDraft({ ...draft, name: value }))}
      <div className="two">
        {field("budget", "Budget", (draft.budgetCents / 100).toString(), (value) =>
          setDraft({ ...draft, budgetCents: Math.round(Number(value || 0) * 100) }),
          "Total budget in USD.", true)}
        {field("per-transaction-cap", "Per-transaction cap", ((draft.perTransactionCapCents ?? 0) / 100).toString(), (value) =>
          setDraft({ ...draft, perTransactionCapCents: value ? Math.round(Number(value) * 100) : null }),
          "Leave empty for no cap.", true)}
      </div>
      {field("approval-threshold", "Approval threshold", ((draft.approvalThresholdCents ?? 0) / 100).toString(), (value) =>
        setDraft({ ...draft, approvalThresholdCents: value ? Math.round(Number(value) * 100) : null }),
        "Orders above this amount need human approval. Leave empty for none.", true)}
      {field("allowed-merchants", "Allowed merchants", draft.allowedMerchants.join(", "), (value) =>
        setDraft({ ...draft, allowedMerchants: split(value) }),
        "Comma-separated. Leave empty to allow any merchant.")}
      {field("blocked-merchants", "Blocked merchants", draft.blockedMerchants.join(", "), (value) =>
        setDraft({ ...draft, blockedMerchants: split(value) }),
        "Comma-separated. Leave empty to block none.")}
      {field("allowed-categories", "Allowed categories", draft.allowedCategories.join(", "), (value) =>
        setDraft({ ...draft, allowedCategories: split(value) }),
        "Comma-separated. Leave empty to allow any category.")}

      <div className="row meta">
        <span className="muted">Spent {money(draft.spentCents)} of {money(draft.budgetCents)}</span>
        <button
          type="button"
          className="primary small"
          onClick={() => onChange(draft)}
          aria-describedby="save-hint"
        >
          Save as new version
        </button>
      </div>
      <p className="hint" id="save-hint">
        Creates a new mandate version with these settings. The current version keeps its own spending history.
      </p>
    </div>
  );
}

function split(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
