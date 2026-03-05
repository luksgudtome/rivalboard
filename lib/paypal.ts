interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  planId: string;
  webhookId: string;
  appBaseUrl: string;
  apiBaseUrl: string;
}

export interface PayPalCreateSubscriptionResult {
  id: string;
  status: string;
  approveUrl: string;
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: Record<string, unknown>;
}

interface PayPalAccessTokenResponse {
  access_token?: string;
}

interface PayPalCreateSubscriptionResponse {
  id?: string;
  status?: string;
  links?: Array<{ href?: string; rel?: string }>;
}

interface PayPalSubscriptionDetails {
  id?: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  subscriber?: {
    payer_id?: string;
  };
}

function getApiBaseUrl(paypalEnv: string | undefined): string {
  if (paypalEnv === "live") return "https://api-m.paypal.com";
  return "https://api-m.sandbox.paypal.com";
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export function getPayPalConfig(): PayPalConfig {
  const clientId = getRequiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = getRequiredEnv("PAYPAL_CLIENT_SECRET");
  const planId = getRequiredEnv("PAYPAL_PLAN_ID");
  const webhookId = getRequiredEnv("PAYPAL_WEBHOOK_ID");
  const appBaseUrl = getRequiredEnv("APP_BASE_URL");
  const paypalEnv = process.env.PAYPAL_ENV?.trim().toLowerCase();
  const apiBaseUrl = getApiBaseUrl(paypalEnv);

  return { clientId, clientSecret, planId, webhookId, appBaseUrl, apiBaseUrl };
}

export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_PLAN_ID &&
      process.env.PAYPAL_WEBHOOK_ID &&
      process.env.APP_BASE_URL,
  );
}

async function getPayPalAccessToken(config: Pick<PayPalConfig, "clientId" | "clientSecret" | "apiBaseUrl">): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.apiBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch PayPal access token.");
  }

  const payload = (await response.json()) as PayPalAccessTokenResponse;
  if (!payload.access_token) {
    throw new Error("PayPal access token was missing.");
  }

  return payload.access_token;
}

export async function createPayPalSubscription(params: {
  userId: string;
  userEmail: string;
  userName: string;
}): Promise<PayPalCreateSubscriptionResult> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const returnUrl = `${config.appBaseUrl}/account?billing=paypal_success`;
  const cancelUrl = `${config.appBaseUrl}/account?billing=paypal_cancelled`;

  const response = await fetch(`${config.apiBaseUrl}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: config.planId,
      custom_id: params.userId,
      subscriber: {
        email_address: params.userEmail,
        name: {
          given_name: params.userName.slice(0, 140),
        },
      },
      application_context: {
        brand_name: "Rivalboard",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create PayPal subscription.");
  }

  const payload = (await response.json()) as PayPalCreateSubscriptionResponse;
  const approveUrl = payload.links?.find((link) => link.rel === "approve")?.href;
  if (!payload.id || !approveUrl) {
    throw new Error("PayPal subscription response was incomplete.");
  }

  return {
    id: payload.id,
    status: payload.status ?? "APPROVAL_PENDING",
    approveUrl,
  };
}

export async function cancelPayPalSubscription(subscriptionId: string, reason: string): Promise<void> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${config.apiBaseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error("Failed to cancel PayPal subscription.");
  }
}

export async function getPayPalSubscription(subscriptionId: string): Promise<{
  id: string;
  status: string;
  planId: string | null;
  customId: string | null;
  payerId: string | null;
}> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${config.apiBaseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch PayPal subscription details.");
  }

  const payload = (await response.json()) as PayPalSubscriptionDetails;
  if (!payload.id || !payload.status) {
    throw new Error("PayPal subscription details were incomplete.");
  }

  return {
    id: payload.id,
    status: payload.status,
    planId: payload.plan_id ?? null,
    customId: payload.custom_id ?? null,
    payerId: payload.subscriber?.payer_id ?? null,
  };
}

export async function verifyPayPalWebhookSignature(params: {
  requestHeaders: Headers;
  webhookEvent: PayPalWebhookEvent;
}): Promise<boolean> {
  const config = getPayPalConfig();
  const accessToken = await getPayPalAccessToken(config);
  const transmissionId = params.requestHeaders.get("paypal-transmission-id");
  const transmissionTime = params.requestHeaders.get("paypal-transmission-time");
  const transmissionSig = params.requestHeaders.get("paypal-transmission-sig");
  const certUrl = params.requestHeaders.get("paypal-cert-url");
  const authAlgo = params.requestHeaders.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return false;
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: config.webhookId,
      webhook_event: params.webhookEvent,
    }),
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as { verification_status?: string };
  return payload.verification_status === "SUCCESS";
}
