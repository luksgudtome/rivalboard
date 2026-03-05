import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, unauthorizedJson } from "@/lib/auth-server";
import {
  addStageToTournamentForUser,
  asServiceError,
  confirmNextStageSeedsForTournamentForUser,
  getTournamentStagesForUser,
} from "@/lib/tournaments-service";

const createStageSchema = z.object({
  name: z.string().trim().max(120).optional(),
  type: z.string(),
  seedSource: z.union([z.literal("all_participants"), z.literal("participant_ids")]).optional().default("all_participants"),
  participantIds: z.array(z.number().int().nonnegative()).optional(),
  shuffle: z.boolean().optional().default(false),
  defaultBestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).optional().default(1),
  roundRobinGroupCount: z.number().int().positive().optional(),
});

const confirmSeedsSchema = z.object({
  action: z.literal("confirm_seeds"),
  participantIds: z.array(z.number().int().nonnegative()).min(2),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const structure = await getTournamentStagesForUser(user.id, id);
    return NextResponse.json(structure);
  } catch (error) {
    const serviceError = asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const raw = await request.json();

    if (raw && typeof raw === "object" && "action" in raw && raw.action === "confirm_seeds") {
      const parsed = confirmSeedsSchema.parse(raw);
      const snapshot = await confirmNextStageSeedsForTournamentForUser(user.id, id, {
        participantIds: parsed.participantIds,
      });
      return NextResponse.json(snapshot);
    }

    const parsed = createStageSchema.parse(raw);
    const snapshot = await addStageToTournamentForUser(user.id, id, parsed);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body." }, { status: 422 });
    }

    const serviceError = asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}
