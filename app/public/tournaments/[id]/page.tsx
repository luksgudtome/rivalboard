import { notFound } from "next/navigation";
import TournamentViewClient from "@/components/tournament-view-client";
import { getTournamentSnapshotPublic, ServiceError } from "@/lib/tournaments-service";

export default async function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const snapshot = await getTournamentSnapshotPublic(id);
    return <TournamentViewClient initialSnapshot={snapshot} readOnly />;
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
