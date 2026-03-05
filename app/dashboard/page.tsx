import DashboardClient from "@/components/dashboard-client";
import { requirePageUser } from "@/lib/auth-server";
import { listTournamentsForUser } from "@/lib/tournaments-service";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const tournaments = await listTournamentsForUser(user.id);

  return (
    <DashboardClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan ?? "free",
        paypalSubscriptionStatus: user.paypalSubscriptionStatus,
      }}
      initialTournaments={tournaments}
    />
  );
}
