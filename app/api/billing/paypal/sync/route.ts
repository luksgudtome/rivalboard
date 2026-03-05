import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/auth-server";
import { BILLING_DISABLED_MESSAGE, isBillingEnabled } from "@/lib/billing";
import { getPayPalSubscription, isPayPalConfigured } from "@/lib/paypal";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: BILLING_DISABLED_MESSAGE }, { status: 503 });
  }

  try {
    const user = await requireRequestUser(request);

    if (!isPayPalConfigured()) {
      return NextResponse.json({ error: "PayPal billing is not configured." }, { status: 500 });
    }

    if (!user.paypalSubscriptionId) {
      return NextResponse.json({ ok: true, plan: user.plan, status: user.paypalSubscriptionStatus ?? null });
    }

    const subscription = await getPayPalSubscription(user.paypalSubscriptionId);
    const nextPlan = subscription.status === "ACTIVE" ? "pro" : "free";

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: nextPlan,
        paypalSubscriptionStatus: subscription.status,
        paypalPlanId: subscription.planId,
        paypalPayerId: subscription.payerId,
        billingUpdatedAt: new Date(),
      },
      select: {
        plan: true,
        paypalSubscriptionStatus: true,
      },
    });

    return NextResponse.json({
      ok: true,
      plan: updated.plan,
      status: updated.paypalSubscriptionStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
