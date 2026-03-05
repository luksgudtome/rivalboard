import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/auth-server";
import { BILLING_DISABLED_MESSAGE, isBillingEnabled } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { createPayPalSubscription, isPayPalConfigured } from "@/lib/paypal";

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: BILLING_DISABLED_MESSAGE }, { status: 503 });
  }

  try {
    const user = await requireRequestUser(request);

    if (!isPayPalConfigured()) {
      return NextResponse.json(
        { error: "PayPal billing is not configured. Set PayPal environment variables first." },
        { status: 500 },
      );
    }

    if ((user.plan ?? "free") === "pro") {
      return NextResponse.json({ error: "Your account is already on Pro." }, { status: 409 });
    }

    const subscription = await createPayPalSubscription({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        paypalSubscriptionId: subscription.id,
        paypalSubscriptionStatus: subscription.status,
        billingUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      approveUrl: subscription.approveUrl,
      subscriptionId: subscription.id,
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
