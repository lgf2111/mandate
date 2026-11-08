/**
 * Minimal PayPal Orders v2 client.
 *
 * When credentials are absent the client runs in demo mode: it mints a fake
 * order id and captures without network calls, so the demo always runs. The
 * UI and ledger label demo orders explicitly.
 */

const API_BASE = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? "";

export const paypalMode: "live" | "demo" = CLIENT_ID && CLIENT_SECRET ? "live" : "demo";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface CreatedOrder {
  id: string;
  approveUrl: string | null;
  mode: "live" | "demo";
}

export interface CapturedOrder {
  status: "COMPLETED" | "FAILED";
  captureId: string | null;
  mode: "live" | "demo";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`PayPal auth failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as TokenResponse;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export async function createOrder(input: {
  totalCents: number;
  currency: string;
  description: string;
  referenceId: string;
}): Promise<CreatedOrder> {
  if (paypalMode === "demo") {
    return { id: `DEMO-${crypto.randomUUID()}`, approveUrl: null, mode: "demo" };
  }

  const token = await accessToken();
  const response = await fetch(`${API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: (input.totalCents / 100).toFixed(2),
          },
        },
      ],
      application_context: { user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" },
    }),
  });
  if (!response.ok) throw new Error(`PayPal create failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };
  return {
    id: body.id,
    approveUrl: body.links?.find((link) => link.rel === "approve")?.href ?? null,
    mode: "live",
  };
}

export async function captureOrder(orderId: string): Promise<CapturedOrder> {
  if (paypalMode === "demo") {
    return { status: "COMPLETED", captureId: `DEMO-CAP-${crypto.randomUUID().slice(0, 8)}`, mode: "demo" };
  }

  const token = await accessToken();
  const response = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`PayPal capture failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as {
    status?: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }>;
  };
  return {
    status: body.status === "COMPLETED" ? "COMPLETED" : "FAILED",
    captureId: body.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null,
    mode: "live",
  };
}
