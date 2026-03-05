import { notFound } from "next/navigation";
import TournamentViewClient from "@/components/tournament-view-client";
import { requirePageUser } from "@/lib/auth-server";
import { getTournamentSnapshotForUser, ServiceError } from "@/lib/tournaments-service";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  try {
    const snapshot = await getTournamentSnapshotForUser(user.id, id);
    return (
      <TournamentViewClient
        initialSnapshot={snapshot}
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan ?? "free",
          paypalSubscriptionStatus: user.paypalSubscriptionStatus,
        }}
      />
    );
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
