import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/auth-server";
import { BILLING_DISABLED_MESSAGE, isBillingEnabled } from "@/lib/billing";
import { cancelPayPalSubscription } from "@/lib/paypal";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: BILLING_DISABLED_MESSAGE }, { status: 503 });
  }

  try {
    const user = await requireRequestUser(request);

    if (!user.paypalSubscriptionId) {
      return NextResponse.json({ error: "No active PayPal subscription found." }, { status: 409 });
    }

    await cancelPayPalSubscription(user.paypalSubscriptionId, "User requested cancellation from account settings.");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: "free",
        paypalSubscriptionStatus: "CANCELLED",
        billingUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
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
