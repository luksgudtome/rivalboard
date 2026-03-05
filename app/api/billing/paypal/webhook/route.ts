import { NextResponse } from "next/server";
import { BILLING_DISABLED_MESSAGE, isBillingEnabled } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { isPayPalConfigured, type PayPalWebhookEvent, verifyPayPalWebhookSignature } from "@/lib/paypal";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getResource(event: PayPalWebhookEvent): Record<string, unknown> {
  return (event.resource ?? {}) as Record<string, unknown>;
}

function getSubscriptionId(event: PayPalWebhookEvent): string | null {
  const resource = getResource(event);
  if (event.event_type.startsWith("BILLING.SUBSCRIPTION.")) {
    return asString(resource.id);
  }
  if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    return asString(resource.billing_agreement_id);
  }
  return asString(resource.id) ?? asString(resource.billing_agreement_id);
}

function getCustomUserId(event: PayPalWebhookEvent): string | null {
  const resource = getResource(event);
  return asString(resource.custom_id);
}

function getPlanId(event: PayPalWebhookEvent): string | null {
  const resource = getResource(event);
  return asString(resource.plan_id);
}

function getPayerId(event: PayPalWebhookEvent): string | null {
  const resource = getResource(event);
  const subscriber = (resource.subscriber ?? {}) as Record<string, unknown>;
  const payer = (resource.payer ?? {}) as Record<string, unknown>;
  return asString(subscriber.payer_id) ?? asString(payer.payer_id);
}

function shouldSetPro(event: PayPalWebhookEvent, status: string | null): boolean {
  if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") return true;
  if (event.event_type === "BILLING.SUBSCRIPTION.RE-ACTIVATED") return true;
  if (event.event_type === "PAYMENT.SALE.COMPLETED") return true;
  if (event.event_type === "BILLING.SUBSCRIPTION.UPDATED" && status === "ACTIVE") return true;
  return false;
}

function shouldSetFree(event: PayPalWebhookEvent, status: string | null): boolean {
  if (event.event_type === "BILLING.SUBSCRIPTION.CANCELLED") return true;
  if (event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED") return true;
  if (event.event_type === "BILLING.SUBSCRIPTION.EXPIRED") return true;
  if (event.event_type === "BILLING.SUBSCRIPTION.UPDATED" && status && status !== "ACTIVE") return true;
  return false;
}

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: BILLING_DISABLED_MESSAGE }, { status: 503 });
  }

  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: "PayPal billing is not configured." }, { status: 500 });
  }

  try {
    const raw = await request.text();
    const event = JSON.parse(raw) as PayPalWebhookEvent;
    const isVerified = await verifyPayPalWebhookSignature({
      requestHeaders: request.headers,
      webhookEvent: event,
    });

    if (!isVerified) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }

    const resource = getResource(event);
    const subscriptionId = getSubscriptionId(event);
    const status = asString(resource.status);
    const customUserId = getCustomUserId(event);
    const payerId = getPayerId(event);
    const planId = getPlanId(event);

    let user =
      (subscriptionId
        ? await prisma.user.findUnique({ where: { paypalSubscriptionId: subscriptionId } })
        : null) ??
      (customUserId ? await prisma.user.findUnique({ where: { id: customUserId } }) : null);

    if (!user) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const nextPlan = shouldSetPro(event, status) ? "pro" : shouldSetFree(event, status) ? "free" : (user.plan ?? "free");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: nextPlan,
        paypalSubscriptionId: subscriptionId ?? user.paypalSubscriptionId,
        paypalSubscriptionStatus: status ?? user.paypalSubscriptionStatus,
        paypalPlanId: planId ?? user.paypalPlanId,
        paypalPayerId: payerId ?? user.paypalPayerId,
        billingUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
