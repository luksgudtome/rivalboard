import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      paypalSubscriptionStatus: user.paypalSubscriptionStatus,
    },
  });
}
