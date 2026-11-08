import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type PayPalModule = typeof import("./paypal.js");

interface OrderRequestBody {
  purchase_units: Array<{
    reference_id: string;
    description: string;
    amount: { currency_code: string; value: string };
  }>;
}

/** paypalMode is a module-level constant, so the environment must be set before import. */
const ENV_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_BASE_URL"] as const;
const savedEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);

let demo: PayPalModule;

function clearCredentials(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeAll(async () => {
  clearCredentials();
  vi.resetModules();
  demo = await import("./paypal.js");
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("PayPal demo mode", () => {
  it("reports demo mode when credentials are absent", () => {
    expect(demo.paypalMode).toBe("demo");
  });

  it("createOrder mints a DEMO- order with no approval URL", async () => {
    const order = await demo.createOrder({
      totalCents: 1_999,
      currency: "USD",
      description: "Trail Runner 2",
      referenceId: "prop-123",
    });

    expect(order.mode).toBe("demo");
    expect(order.id.startsWith("DEMO-")).toBe(true);
    expect(order.id.length).toBeGreaterThan("DEMO-".length);
    expect(order.approveUrl).toBeNull();

    const second = await demo.createOrder({
      totalCents: 1_999,
      currency: "USD",
      description: "Trail Runner 2",
      referenceId: "prop-123",
    });
    expect(second.id).not.toBe(order.id);
  });

  it("captureOrder completes locally with a DEMO-CAP- capture id", async () => {
    const captured = await demo.captureOrder("DEMO-order-id");

    expect(captured.mode).toBe("demo");
    expect(captured.status).toBe("COMPLETED");
    expect(captured.captureId).not.toBeNull();
    expect(captured.captureId!.startsWith("DEMO-CAP-")).toBe(true);
    expect(captured.captureId!.length).toBeGreaterThan("DEMO-CAP-".length);
  });

  it("never touches the network in demo mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      await demo.createOrder({
        totalCents: 250,
        currency: "USD",
        description: "House Blend 1kg",
        referenceId: "prop-456",
      });
      await demo.captureOrder("DEMO-order-id");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("PayPal live order amounts", () => {
  const orderBodies: OrderRequestBody[] = [];
  let live: PayPalModule;

  beforeAll(async () => {
    process.env.PAYPAL_CLIENT_ID = "test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
    process.env.PAYPAL_BASE_URL = "https://paypal.test";
    orderBodies.length = 0;
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.endsWith("/v1/oauth2/token")) {
          return Response.json({ access_token: "test-token", expires_in: 3_600 });
        }
        if (url.endsWith("/v2/checkout/orders")) {
          orderBodies.push(JSON.parse(String(init?.body)) as OrderRequestBody);
          return Response.json({
            id: "ORDER-1",
            links: [{ rel: "approve", href: "https://paypal.test/approve" }],
          });
        }
        return Response.json({});
      }),
    );
    live = await import("./paypal.js");
  });

  it("sends cents as an exact two-decimal string, never a float", async () => {
    expect(live.paypalMode).toBe("live");

    const cents = [1, 5, 1_999, 100_000];
    for (const totalCents of cents) {
      const order = await live.createOrder({
        totalCents,
        currency: "USD",
        description: "Trail Runner 2",
        referenceId: `prop-${totalCents}`,
      });
      expect(order.id).toBe("ORDER-1");
      expect(order.approveUrl).toBe("https://paypal.test/approve");
      expect(order.mode).toBe("live");
    }

    const values = orderBodies.map((body) => body.purchase_units[0]!.amount.value);
    expect(values).toEqual(["0.01", "0.05", "19.99", "1000.00"]);
    for (const [index, body] of orderBodies.entries()) {
      const unit = body.purchase_units[0]!;
      expect(unit.amount.currency_code).toBe("USD");
      expect(unit.reference_id).toBe(`prop-${cents[index]}`);
      expect(unit.amount.value).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
