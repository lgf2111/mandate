import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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

type Toast = { id: number; kind: "error" | "info" | "success"; text: string };

const OFFLINE_TEXT = "Cannot reach the server. Check that it is running, then try again.";

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
  // Checkout and capture speak next to the buttons that caused them. The goal
  // notice lives at the bottom of the other column, ~600px away and below the
  // fold at 1440x900, so a failed capture used to fail silently on screen.
  const [actionNotice, setActionNotice] = useState<string>("");
  // The goal comes first: the app drafts the limits from it and asks for one approval.
  const [draft, setDraft] = useState<Mandate | null>(null);
  const [draftBecause, setDraftBecause] = useState<string>("");
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [paidOrder, setPaidOrder] = useState<{ totalCents: number; merchant: string } | null>(null);
  const lastCaptureAt = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  function toast(kind: Toast["kind"], text: string) {
    const id = ++nextToastId.current;
    // The same sentence twice is noise: replace it, and never stack more than two.
    setToasts((current) => [...current.filter((item) => item.text !== text), { id, kind, text }].slice(-2));
    // Everything clears itself; errors get longer because they carry a next step.
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      kind === "error" ? 12_000 : 5_000,
    );
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  const selected = useMemo(() => mandates.find((m) => m.id === selectedId) ?? null, [mandates, selectedId]);

  /** Server codes are for logs; people get a sentence and the next step. */
  function explanation(error: unknown, fallback: string, detail = ""): string {
    if (detail.includes("ORDER_NOT_APPROVED")) {
      return "PayPal says this order is not approved yet. Approve it there, then retry.";
    }
    const code = typeof error === "string" ? error : "";
    const map: Record<string, string> = {
      approval_required: "That cart needs a human approval above the threshold.",
      denied_by_policy: "The mandate refused that cart. Nothing was charged.",
      invalid_mandate: "Those limits are not valid — check the numbers and try again.",
      invalid_goal: "Describe the purchase in a few more words.",
      no_products_match: "Nothing in the catalogue fits that goal.",
      mandate_not_found: "That mandate no longer exists. Reset the demo data.",
      upstream_failure: "PayPal did not answer. Check the order in PayPal, then retry.",
    };
    return map[code] ?? fallback;
  }

  /** Network errors reject before any response exists, and read as jargon. */
  function offline(error: unknown, fallback: string): string {
    return error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : fallback;
  }

  const refresh = useCallback(async () => {
    try {
      const [healthRes, mandatesRes, ledgerRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/mandates"),
        fetch("/api/ledger"),
      ]);
      if (!healthRes.ok) throw new Error("health");
      const healthBody = await healthRes.json();
      setHealth({ paypal: healthBody.paypal, agent: healthBody.agent });
      const mandateBody = await mandatesRes.json();
      setMandates(mandateBody.mandates);
      setSelectedId((current) => current || mandateBody.mandates[0]?.id || "");
      const ledgerBody = await ledgerRes.json();
      setOrders(ledgerBody.orders);
    } catch {
      setToasts((current) =>
        current.some((item) => item.text === OFFLINE_TEXT)
          ? current
          : [...current, { id: -1, kind: "error" as const, text: OFFLINE_TEXT }],
      );
    }
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
      if (!response.ok) {
        throw Object.assign(new Error(body.error ?? "proposal_failed"), { code: body.error });
      }
      setProposal(body.proposal);
      setDecision(body.decision);
      setEngine(body.engine);
    } catch (error) {
      toast("error", offline(error, explanation((error as { code?: string }).code, "The agent did not answer. Try again.")));
    } finally {
      setBusy(false);
    }
  }

  async function checkout(approved: boolean) {
    if (!selected || !proposal) return;
    setBusy(true);
    setActionNotice("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, mandateId: selected.id, approved }),
      });
      const body = await response.json();
      if (!response.ok) {
        setActionNotice(explanation(body.error, "Checkout failed. Try again."));
        return;
      }
      if (body.approveUrl) {
        setApproveUrl(body.approveUrl);
        setPendingOrderId(body.order.id);
        setActionNotice("Order created. Approve it in PayPal, then capture the payment.");
      } else {
        setPaidOrder({ totalCents: body.order.totalCents, merchant: body.order.merchant });
        setActionNotice("");
      }
      await refresh();
    } catch (error) {
      setActionNotice(offline(error, "Checkout did not complete. Try again."));
    } finally {
      setBusy(false);
    }
  }

  // Returning from PayPal is the approval signal: capture as soon as the window
  // regains focus, once, so nobody has to hunt for a second button.
  useEffect(() => {
    function onFocus() {
      // A person may come back before finishing the approval; retry on the next
      // return instead of burning the attempt, but never twice within 5 s.
      if (!pendingOrderId || Date.now() - lastCaptureAt.current < 5_000) return;
      lastCaptureAt.current = Date.now();
      void capturePending();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pendingOrderId]);

  async function capturePending() {
    if (!pendingOrderId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${pendingOrderId}/capture`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setActionNotice("Payment captured.");
        toast("success", `Paid ${money(body.order?.totalCents ?? 0)} — the ledger has the row.`);
        setApproveUrl(null);
        setPendingOrderId(null);
        await refresh();
      } else {
        const why = explanation(body.error, "Payment capture failed. Check the order in PayPal and try again.", String(body.detail ?? ""));
        setActionNotice(why);
        toast("error", why);
      }
    } catch (error) {
      toast("error", offline(error, "Payment capture failed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function draftRules() {
    if (!goal.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/mandates/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast("error", explanation(body.error, "Could not draft limits from that goal."));
        return;
      }
      setDraft(body.draft);
      setDraftBecause(body.because);
    } catch (error) {
      toast("error", offline(error, "Could not reach the server to draft the limits."));
    } finally {
      setBusy(false);
    }
  }

  async function useDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          budgetCents: draft.budgetCents,
          perTransactionCapCents: draft.perTransactionCapCents,
          approvalThresholdCents: draft.approvalThresholdCents,
          allowedCategories: draft.allowedCategories,
          allowedMerchants: draft.allowedMerchants,
          blockedMerchants: draft.blockedMerchants,
          expiresAt: draft.expiresAt,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast("error", explanation(body.error, "Could not save those limits."));
        return;
      }
      setMandates((current) => [...current, body.mandate]);
      setSelectedId(body.mandate.id);
      setDraft(null);
      setDraftBecause("");
      toast("success", "Limits set. You can adjust any of them below.");
    } catch (error) {
      toast("error", offline(error, "Could not save those limits."));
    } finally {
      setBusy(false);
    }
  }

  async function saveMandate(patch: Partial<Mandate>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    try {
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
      if (!response.ok) {
        toast("error", explanation(body.error, "Those rules were rejected. Check the numbers."));
        return;
      }
      setMandates((current) => [...current, body.mandate]);
      setSelectedId(body.mandate.id);
      toast("success", "Saved as a new mandate version.");
    } catch (error) {
      toast("error", offline(error, "Could not save the rules."));
    }
  }


  async function reset() {
    try {
      await fetch("/api/reset", { method: "POST" });
    } catch (error) {
      toast("error", offline(error, "Could not reset the demo data."));
      return;
    }
    setProposal(null);
    setDecision(null);
    setPaidOrder(null);
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
            PayPal {health?.paypal === "live" ? "sandbox" : "demo"}
          </span>
          <span className="badge">model {health?.agent === "llm" ? "on" : "off"}</span>
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
              <h2><span className="step">1</span> What do you want to buy?</h2>
              <span className="muted mono">{engine ? `planner: ${engine === "llm" ? "model" : "rules"}` : ""}</span>
            </div>
            <label className="sr-only" htmlFor="goal-input">Shopping goal</label>
            <textarea
              id="goal-input"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={2}
              aria-describedby="goal-hint"
            />
            <p id="goal-hint" className="hint">
              One sentence. The app drafts the limits; you approve them before anything is bought.
            </p>
            <div className="chips" role="group" aria-label="Example goals">
              {EXAMPLES.filter((example) => example !== goal).map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setGoal(example)}>{example}</button>
              ))}
            </div>
            <div className="goal-actions">
              <button type="button" className="ghost" disabled={busy} onClick={draftRules}>
                {busy ? "Working…" : "Draft the limits from this goal"}
              </button>
            </div>
            <p className="notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
          </div>

          <div className="card">
            <div className="card-head">
              <h2><span className="step">2</span> Check the limits</h2>
            </div>
            {draft ? (
              <>
                <p className="draft-line mono">
                  {money(draft.budgetCents)} budget · {money(draft.perTransactionCapCents ?? 0)} cap · approval above {money(draft.approvalThresholdCents ?? 0)} · {draft.allowedMerchants.join(", ") || "any merchant"} · {draft.allowedCategories.join(", ") || "any category"}
                </p>
                <p className="hint">{draftBecause}</p>
                <div className="actions">
                  <button type="button" className="primary small" disabled={busy} onClick={useDraft}>
                    Use these limits
                  </button>
                  <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setDraftBecause(""); }}>
                    Dismiss
                  </button>
                </div>
              </>
            ) : selected ? (
              <p className="draft-line mono">
                {money(selected.budgetCents)} budget · {money(selected.perTransactionCapCents ?? 0)} cap · approval above {money(selected.approvalThresholdCents ?? 0)} · {selected.allowedMerchants.join(", ") || "any merchant"} · {selected.allowedCategories.join(", ") || "any category"}
              </p>
            ) : (
              <p className="muted">Describe a goal above; the limits appear here.</p>
            )}
            {selected && (
              <details className="rules">
                <summary>Edit the rules by hand ({7} fields)</summary>
                <MandateEditor mandate={selected} onChange={saveMandate} />
              </details>
            )}
            <div className="goal-actions">
              <button type="button" className="primary" disabled={busy || !selected} onClick={askAgent}>
                {busy ? "Asking the model…" : "Ask the agent"}
              </button>
            </div>
          </div>
        </section>
        <section className="col">
          <div className="card proposal">
            <div className="card-head">
              <h2>Proposal</h2>
              <span className="outcome-slot" role="status" aria-live="polite" aria-atomic="true">
                {paidOrder ? (
                  <>
                    <span className="sr-only">Settled: </span>
                    <span className="outcome allow">Paid</span>
                  </>
                ) : decision && (
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
                  <p className="notice" role="status" aria-live="polite" aria-atomic="true">{actionNotice}</p>
                  {paidOrder ? (
                    <p className="settled-line">
                      Paid {money(paidOrder.totalCents)} to {paidOrder.merchant}. The ledger holds the row.
                    </p>
                  ) : decision?.outcome === "deny" ? (
                    <div className="blocked">Blocked by the mandate. No payment can be made for this cart.</div>
                  ) : approveUrl ? (
                    <>
                      <a className="primary" href={approveUrl} target="_blank" rel="noreferrer">
                        Open PayPal approval
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      <p className="hint">
                        Approve in PayPal, then come back to this tab. The payment is captured
                        automatically.
                      </p>
                      <button type="button" className="ghost" onClick={capturePending} disabled={busy}>
                        {busy ? "Capturing…" : "Capture now"}
                      </button>
                    </>
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

      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            <p className="toast-text">{item.text}</p>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss message"
              onClick={() => dismissToast(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
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
