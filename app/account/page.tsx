import AccountClient from "@/components/account-client";
import { requirePageUser } from "@/lib/auth-server";

export default async function AccountPage() {
  const user = await requirePageUser();

  return (
    <AccountClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan ?? "free",
        paypalSubscriptionStatus: user.paypalSubscriptionStatus,
      }}
    />
  );
}
