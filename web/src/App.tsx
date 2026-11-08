import { useCallback, useEffect, useMemo, useState } from "react";

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
        setNotice(body.error === "approval_required" ? "Approval is required above the threshold." : body.error);
        return;
      }
      if (body.approveUrl) {
        setApproveUrl(body.approveUrl);
        setPendingOrderId(body.order.id);
        setNotice("Order created — approve it in PayPal, then capture.");
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
      setNotice("Captured.");
      setApproveUrl(null);
      setPendingOrderId(null);
      await refresh();
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
      setNotice("Mandate saved as a new version.");
    }
  }

  async function reset() {
    await fetch("/api/reset", { method: "POST" });
    setProposal(null);
    setDecision(null);
    setOrders([]);
    setSelectedId("");
    await refresh();
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <div className="mark">M</div>
          <div>
            <h1>Mandate</h1>
            <p>Spending guardrails for AI shopping agents, settled with PayPal.</p>
          </div>
        </div>
        <div className="badges">
          <span className={`badge ${health?.paypal === "live" ? "live" : ""}`}>
            PayPal {health?.paypal ?? "…"}
          </span>
          <span className="badge">agent {health?.agent ?? "…"}</span>
          <button className="ghost" onClick={reset}>Reset demo</button>
        </div>
      </header>

      <main className="grid">
        <section className="col">
          <div className="card">
            <div className="card-head">
              <h2>Mandate</h2>
              {selected && <span className="muted mono">{selected.id.slice(0, 8)}</span>}
            </div>
            {selected ? (
              <MandateEditor mandate={selected} onChange={saveMandate} />
            ) : (
              <p className="muted">Loading…</p>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>Goal</h2><span className="muted mono">{engine || "agent"}</span></div>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} />
            <div className="chips">
              {EXAMPLES.map((example) => (
                <button key={example} className="chip" onClick={() => setGoal(example)}>{example}</button>
              ))}
            </div>
            <button className="primary" disabled={busy || !selected} onClick={askAgent}>
              {busy ? "Working…" : "Ask the agent"}
            </button>
            {notice && <p className="notice">{notice}</p>}
          </div>
        </section>

        <section className="col">
          <div className="card proposal">
            <div className="card-head">
              <h2>Proposal</h2>
              {decision && <span className={`outcome ${decision.outcome}`}>{decision.outcome.replace("_", " ")}</span>}
            </div>

            {!proposal && <p className="muted">Ask the agent to get a cart that is checked against the mandate before any money moves.</p>}

            {proposal && (
              <>
                <ul className="items">
                  {proposal.items.map((item) => (
                    <li key={item.sku}>
                      <div>
                        <strong>{item.name}</strong>
                        <div className="muted small">{item.merchant} · {item.category}</div>
                      </div>
                      <span className="mono">{money(item.priceCents * item.qty)}</span>
                    </li>
                  ))}
                  {proposal.items.length === 0 && <li className="muted">No items selected.</li>}
                </ul>

                <p className="rationale">“{proposal.rationale}”</p>

                {decision && (
                  <div className="decision">
                    <div className="row">
                      <span>Total</span><strong className="mono">{money(decision.totalCents)}</strong>
                    </div>
                    <div className="row">
                      <span>Budget remaining after</span><span className="mono">{money(decision.remainingAfterCents)}</span>
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
                    <div className="blocked">Blocked by the mandate — no payment is possible for this cart.</div>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy || !decision}
                      onClick={() => checkout(decision?.outcome === "require_approval")}
                    >
                      {decision?.outcome === "require_approval" ? "Approve & pay" : "Pay with PayPal"}
                    </button>
                  )}
                  {approveUrl && <a className="link" href={approveUrl} target="_blank" rel="noreferrer">Open PayPal</a>}
                  {approveUrl && <button className="ghost" onClick={capturePending}>Capture</button>}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>Ledger</h2><span className="muted mono">{orders.length} order{orders.length === 1 ? "" : "s"}</span></div>
            <table>
              <thead>
                <tr><th>When</th><th>Merchant</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono small">{new Date(order.createdAt).toLocaleTimeString()}</td>
                    <td>{order.merchant}</td>
                    <td className="mono">{money(order.totalCents)}</td>
                    <td><span className={`pill ${order.status}`}>{order.status}{order.provider === "demo" ? " · demo" : ""}</span></td>
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
  useEffect(() => setDraft(mandate), [mandate]);

  const field = (label: string, value: string, onInput: (value: string) => void, hint?: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onInput(event.target.value)} />
      {hint && <em>{hint}</em>}
    </label>
  );

  return (
    <div className="mandate">
      {field("Name", draft.name, (value) => setDraft({ ...draft, name: value }))}
      <div className="two">
        {field("Budget", (draft.budgetCents / 100).toString(), (value) =>
          setDraft({ ...draft, budgetCents: Math.round(Number(value || 0) * 100) }), "USD")}
        {field("Per-transaction cap", ((draft.perTransactionCapCents ?? 0) / 100).toString(), (value) =>
          setDraft({ ...draft, perTransactionCapCents: value ? Math.round(Number(value) * 100) : null }))}
      </div>
      {field("Approval threshold", ((draft.approvalThresholdCents ?? 0) / 100).toString(), (value) =>
        setDraft({ ...draft, approvalThresholdCents: value ? Math.round(Number(value) * 100) : null }),
        "Above this, a human must approve")}
      {field("Allowed merchants", draft.allowedMerchants.join(", "), (value) =>
        setDraft({ ...draft, allowedMerchants: split(value) }), "empty = any")}
      {field("Blocked merchants", draft.blockedMerchants.join(", "), (value) =>
        setDraft({ ...draft, blockedMerchants: split(value) }))}
      {field("Allowed categories", draft.allowedCategories.join(", "), (value) =>
        setDraft({ ...draft, allowedCategories: split(value) }), "empty = any")}

      <div className="row meta">
        <span className="muted">Spent {money(draft.spentCents)} of {money(draft.budgetCents)}</span>
        <button className="primary small" onClick={() => onChange(draft)}>Save as new mandate</button>
      </div>
    </div>
  );
}

function split(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
